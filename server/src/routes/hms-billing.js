/**
 * Patient bills, payments, the hospital's charge list and invoice settings.
 *
 * Owner and reception make bills and take payments. Only the owner cancels a
 * bill or changes the charge list. Every query is scoped to req.labId.
 */
import mongoose from "mongoose";
import { z } from "zod";
import { createRouter } from "../lib/router.js";
import { allowRoles, requireHospital } from "../middleware/auth.js";
import { Bill, BILL_STATUSES, ITEM_KINDS, PAY_METHODS } from "../models/Bill.js";
import { Service } from "../models/Service.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";
import { Booking } from "../models/Booking.js";
import { Lab } from "../models/Lab.js";
import { isValidDateStr, todayInZone } from "../lib/dates.js";
import { round2 } from "../lib/invoice.js";
import { createBill, addPayment, cancelBill, BillError } from "../services/bills.js";

export const hmsBillingRouter = createRouter();
hmsBillingRouter.use(allowRoles("owner", "reception", "pharmacist"), requireHospital);

// The pharmacist sees only pharmacy bills: open one, print it, take the balance.
const PHARMACIST_ROUTES = [["GET", /^\/[^/]+$/], ["POST", /^\/[^/]+\/payments$/]];
hmsBillingRouter.use((req, res, next) => {
  if (req.user.role !== "pharmacist") return next();
  const ok = PHARMACIST_ROUTES.some(([m, re]) => m === req.method && re.test(req.path))
    && !["/unbilled", "/services", "/settings"].includes(req.path);
  if (!ok) return res.status(403).json({ error: "Your account does not have access to this section." });
  next();
});

const isOwner = (req) => req.user.role === "owner";
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const objectId = (msg) => z.string().refine(mongoose.isValidObjectId, msg);

function fail(res, err) {
  if (err instanceof BillError) return res.status(err.status).json({ error: err.message });
  throw err;
}

function bad(res, parsed) {
  const issue = parsed.error.issues[0];
  return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
}

/* ---------- List, with the takings for the period ---------- */

hmsBillingRouter.get("/", async (req, res) => {
  const today = todayInZone(req.lab.timezone);
  const from = isValidDateStr(req.query.from) ? req.query.from : today;
  const to = isValidDateStr(req.query.to) && req.query.to >= from ? req.query.to : from;
  const lab = new mongoose.Types.ObjectId(req.labId);

  const filter = { lab, date: { $gte: from, $lte: to } };
  if (BILL_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.status === "due") filter.status = { $in: ["unpaid", "partial"] };

  const q = String(req.query.q || "").trim().slice(0, 60);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const patients = await Patient.find({
      lab,
      $or: [
        { name: { $regex: escapeRegex(q), $options: "i" } },
        { uhid: { $regex: escapeRegex(q), $options: "i" } },
        ...(digits.length >= 4 ? [{ phone: { $regex: escapeRegex(digits) } }] : []),
      ],
    }).select("_id").limit(200).lean();
    // A bill number search ignores the date range: people quote it weeks later.
    delete filter.date;
    filter.$or = [{ number: { $regex: escapeRegex(q), $options: "i" } }, { patient: { $in: patients.map((p) => p._id) } }];
  }

  const [bills, billed, takings, outstanding] = await Promise.all([
    Bill.find(filter).sort({ date: -1, createdAt: -1 }).limit(200)
      .populate("patient", "name uhid phone").select("-payments.by").lean(),
    Bill.aggregate([
      { $match: { lab, date: { $gte: from, $lte: to }, status: { $ne: "cancelled" } } },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
    Bill.aggregate([
      { $match: { lab, "payments.date": { $gte: from, $lte: to } } },
      { $unwind: "$payments" },
      { $match: { "payments.date": { $gte: from, $lte: to } } },
      { $group: {
        _id: "$payments.method",
        net: { $sum: { $cond: [{ $eq: ["$payments.kind", "refund"] }, { $multiply: ["$payments.amount", -1] }, "$payments.amount"] } },
      } },
    ]),
    Bill.aggregate([
      { $match: { lab, status: { $in: ["unpaid", "partial"] } } },
      { $group: { _id: null, due: { $sum: "$due" }, count: { $sum: 1 } } },
    ]),
  ]);

  const byMethod = Object.fromEntries(takings.map((t) => [t._id, round2(t.net)]));
  res.json({
    from,
    to,
    bills,
    summary: {
      billed: round2(billed[0]?.total || 0),
      bills: billed[0]?.count || 0,
      collected: round2(takings.reduce((s, t) => s + t.net, 0)),
      byMethod,
      due: round2(outstanding[0]?.due || 0),
      dueBills: outstanding[0]?.count || 0,
    },
  });
});

/* ---------- What a patient owes but has not been billed for yet ---------- */

hmsBillingRouter.get("/unbilled", async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.patient)) return res.status(400).json({ error: "Choose a patient." });
  const patient = await Patient.findOne({ _id: req.query.patient, lab: req.labId }).lean();
  if (!patient) return res.status(404).json({ error: "Patient not found." });

  const [visits, bookings] = await Promise.all([
    Appointment.find({
      lab: req.labId, patient: patient._id, bill: null, "payment.status": "unpaid",
      status: { $nin: ["cancelled", "no_show"] }, fee: { $gt: 0 },
    }).sort({ date: -1 }).limit(10).populate("doctor", "name").select("date type fee doctor reference").lean(),
    Booking.find({
      lab: req.labId, bill: null, status: { $nin: ["cancelled", "no_show"] },
      $or: [{ patientRecord: patient._id }, { "patient.phone": patient.phone, "patient.name": patient.name }],
    }).sort({ createdAt: -1 }).limit(10).select("reference date items visitType").lean(),
  ]);

  const items = [];
  for (const v of visits) {
    items.push({
      kind: "consultation",
      name: `Consultation · ${v.doctor?.name || "Doctor"} (${v.type === "follow_up" ? "follow-up" : "new visit"})`,
      qty: 1, rate: v.fee, discount: 0, taxPct: 0,
      appointment: v._id, source: `Visit ${v.reference} · ${v.date}`,
    });
  }
  for (const b of bookings) {
    for (const t of b.items) {
      items.push({
        kind: "lab", name: t.name, qty: 1, rate: t.price ?? 0, discount: 0, taxPct: 0,
        booking: b._id, unpriced: t.price == null, source: `Lab ${b.reference} · ${b.date}`,
      });
    }
    if (b.visitType === "home" && req.lab.homeCollectionFee > 0) {
      items.push({
        kind: "lab", name: "Home sample collection", qty: 1, rate: req.lab.homeCollectionFee, discount: 0, taxPct: 0,
        booking: b._id, source: `Lab ${b.reference} · ${b.date}`,
      });
    }
  }
  res.json({ patient, items });
});

/* ---------- The charge list ---------- */

const serviceSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  kind: z.enum(["procedure", "room", "other"]).default("procedure"),
  price: z.coerce.number().min(0, "The price cannot be negative.").max(10_000_000),
  taxPct: z.coerce.number().min(0).max(28).default(0),
  active: z.boolean().default(true),
});

hmsBillingRouter.get("/services", async (req, res) => {
  const filter = { lab: req.labId };
  if (!isOwner(req)) filter.active = true;
  res.json({ services: await Service.find(filter).sort({ kind: 1, name: 1 }).lean() });
});

hmsBillingRouter.post("/services", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can change the charge list." });
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  try {
    res.status(201).json({ service: await Service.create({ ...parsed.data, lab: req.labId }) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "A charge with that name already exists.", field: "name" });
    throw err;
  }
});

hmsBillingRouter.put("/services/:id", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can change the charge list." });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Charge not found." });
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  try {
    const service = await Service.findOneAndUpdate({ _id: req.params.id, lab: req.labId }, { $set: parsed.data }, { new: true }).lean();
    if (!service) return res.status(404).json({ error: "Charge not found." });
    res.json({ service });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "A charge with that name already exists.", field: "name" });
    throw err;
  }
});

/* ---------- What prints on the invoice ---------- */

hmsBillingRouter.get("/settings", async (req, res) => {
  res.json({ invoice: req.lab.invoice || { legalName: "", gstin: "", footer: "" } });
});

hmsBillingRouter.put("/settings", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can change invoice details." });
  const parsed = z.object({
    legalName: z.string().trim().max(120).default(""),
    gstin: z.string().trim().toUpperCase()
      .refine((g) => !g || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g), "That GSTIN does not look right. It has 15 characters, like 36ABCDE1234F1Z5.")
      .default(""),
    footer: z.string().trim().max(300).default(""),
  }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const lab = await Lab.findByIdAndUpdate(req.labId, { $set: { invoice: parsed.data } }, { new: true }).lean();
  res.json({ invoice: lab.invoice });
});

/* ---------- Make a bill ---------- */

const money = z.coerce.number().min(0).max(10_000_000);
const paymentSchema = z.object({
  amount: money,
  method: z.enum(PAY_METHODS, { errorMap: () => ({ message: "Choose how it was paid." }) }),
  ref: z.string().trim().max(60).optional().default(""),
});

const createSchema = z.object({
  patient: objectId("Choose a patient."),
  items: z.array(z.object({
    // Medicines are sold from the pharmacy, which takes them off the shelf; never typed in here.
    kind: z.enum(ITEM_KINDS).refine((k) => k !== "pharmacy", "Sell medicines from the Pharmacy so stock comes off the shelf.").default("other"),
    name: z.string().trim().min(1, "Every line needs a name.").max(120),
    qty: z.coerce.number().positive("Quantity must be more than zero.").max(1000),
    rate: money,
    discount: money.default(0),
    taxPct: z.coerce.number().min(0).max(28).default(0),
    appointment: objectId("Bad visit.").nullish(),
    booking: objectId("Bad lab booking.").nullish(),
    service: objectId("Bad charge.").nullish(),
  })).min(1, "Add at least one item to the bill.").max(60),
  payment: paymentSchema.nullish(),
  notes: z.string().trim().max(300).optional().default(""),
});

hmsBillingRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const v = parsed.data;
  const patient = await Patient.findOne({ _id: v.patient, lab: req.labId }).lean();
  if (!patient) return res.status(404).json({ error: "Patient not found." });

  // A line linked to the charge list must point at this hospital's own charge.
  const serviceIds = v.items.filter((i) => i.service).map((i) => i.service);
  if (serviceIds.length) {
    const n = await Service.countDocuments({ lab: req.labId, _id: { $in: serviceIds } });
    if (n !== new Set(serviceIds.map(String)).size) return res.status(400).json({ error: "A charge on this bill no longer exists." });
  }

  try {
    const bill = await createBill(req.lab, {
      patient,
      items: v.items.map((i) => ({ ...i, appointment: i.appointment || null, booking: i.booking || null, service: i.service || null })),
      payment: v.payment || null,
      notes: v.notes,
      by: req.user.email,
    });
    res.status(201).json({ bill });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------- One bill ---------- */

async function loadBill(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "Bill not found." });
    return null;
  }
  const filter = { _id: req.params.id, lab: req.labId };
  if (req.user.role === "pharmacist") filter["items.kind"] = "pharmacy";
  const bill = await Bill.findOne(filter);
  if (!bill) res.status(404).json({ error: "Bill not found." });
  return bill;
}

hmsBillingRouter.get("/:id", async (req, res) => {
  const bill = await loadBill(req, res);
  if (!bill) return;
  await bill.populate("patient", "name uhid phone age gender address");
  res.json({ bill, invoice: req.lab.invoice || {} });
});

hmsBillingRouter.post("/:id/payments", async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const bill = await loadBill(req, res);
  if (!bill) return;
  try {
    res.json({ bill: await addPayment(req.lab, bill, { ...parsed.data, by: req.user.email }) });
  } catch (err) {
    fail(res, err);
  }
});

hmsBillingRouter.post("/:id/cancel", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can cancel a bill." });
  const parsed = z.object({
    reason: z.string().trim().min(3, "Say why the bill is being cancelled.").max(200),
    refundMethod: z.enum(PAY_METHODS).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const bill = await loadBill(req, res);
  if (!bill) return;
  try {
    res.json({ bill: await cancelBill(req.lab, bill, { ...parsed.data, by: req.user.email }) });
  } catch (err) {
    fail(res, err);
  }
});
