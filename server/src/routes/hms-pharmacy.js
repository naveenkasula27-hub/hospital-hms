/**
 * Pharmacy and inventory.
 *
 * Owner and pharmacist run the stock: medicines, purchases, adjustments.
 * Reception may look up stock and sell. A doctor may only read the medicine
 * list, to pick names while prescribing. Every query is scoped to req.labId.
 */
import mongoose from "mongoose";
import { z } from "zod";
import { createRouter } from "../lib/router.js";
import { allowRoles, requireHospital } from "../middleware/auth.js";
import { Medicine, StockBatch, StockMove, Purchase, MEDICINE_FORMS } from "../models/Pharmacy.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";
import { Bill, PAY_METHODS } from "../models/Bill.js";
import { todayInZone, isValidDateStr, addDays } from "../lib/dates.js";
import { isExpired, expiresWithin, round2 } from "../lib/invoice.js";
import { BillError } from "../services/bills.js";
import { receiveStock, sellMedicines, adjustStock, matchMedicine, suggestQty } from "../services/pharmacy.js";

export const hmsPharmacyRouter = createRouter();
hmsPharmacyRouter.use(allowRoles("owner", "pharmacist", "reception", "doctor"), requireHospital);
hmsPharmacyRouter.use((req, res, next) => {
  if (req.user.role === "doctor" && !(req.method === "GET" && req.path === "/formulary")) {
    return res.status(403).json({ error: "Your account does not have access to the pharmacy." });
  }
  next();
});

const runsStock = (req) => ["owner", "pharmacist"].includes(req.user.role);
const objectId = (msg) => z.string().refine(mongoose.isValidObjectId, msg);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EXPIRY = /^\d{4}-(0[1-9]|1[0-2])$/;

function bad(res, parsed) {
  const issue = parsed.error.issues[0];
  return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
}
function fail(res, err) {
  if (err instanceof BillError) return res.status(err.status).json({ error: err.message });
  throw err;
}
function onlyStockRoles(req, res) {
  if (runsStock(req)) return false;
  res.status(403).json({ error: "Only the pharmacist or administrator can change stock." });
  return true;
}

/** Medicines with their usable stock, nearest expiry and selling price, worked out in one pass. */
async function stockView(labId, today, extra = {}) {
  const [meds, batches] = await Promise.all([
    Medicine.find({ lab: labId, ...extra }).sort({ name: 1 }).lean(),
    StockBatch.find({ lab: labId, qty: { $gt: 0 } }).lean(),
  ]);
  const byMed = {};
  for (const b of batches) (byMed[String(b.medicine)] ??= []).push(b);
  return meds.map((m) => {
    const all = byMed[String(m._id)] || [];
    const usable = all.filter((b) => !isExpired(b.expiry, today)).sort((a, b) => a.expiry.localeCompare(b.expiry));
    const inStock = usable.reduce((s, b) => s + b.qty, 0);
    const expiredQty = all.filter((b) => isExpired(b.expiry, today)).reduce((s, b) => s + b.qty, 0);
    const soon = usable.filter((b) => expiresWithin(b.expiry, today, 3));
    return {
      ...m,
      inStock,
      expiredQty,
      expiringQty: soon.reduce((s, b) => s + b.qty, 0),
      nextExpiry: usable[0]?.expiry || "",
      mrp: usable[0]?.mrp ?? null,
      stockValue: round2(usable.reduce((s, b) => s + b.qty * b.purchaseRate, 0)),
      status: inStock === 0 ? "out" : inStock <= m.reorderLevel ? "low" : "ok",
    };
  });
}

/* ---------- For the doctor's prescription pad ---------- */

hmsPharmacyRouter.get("/formulary", async (req, res) => {
  const rows = await stockView(req.labId, todayInZone(req.lab.timezone), { active: true });
  res.json({ medicines: rows.map(({ _id, name, generic, form, inStock }) => ({ _id, name, generic, form, inStock })) });
});

/* ---------- The numbers at the top of the pharmacy ---------- */

hmsPharmacyRouter.get("/summary", async (req, res) => {
  const today = todayInZone(req.lab.timezone);
  const lab = new mongoose.Types.ObjectId(req.labId);
  const [rows, sales, week] = await Promise.all([
    stockView(req.labId, today, { active: true }),
    Bill.aggregate([
      { $match: { lab, date: today, status: { $ne: "cancelled" }, "items.kind": "pharmacy" } },
      { $unwind: "$items" },
      { $match: { "items.kind": "pharmacy" } },
      { $group: { _id: null, amount: { $sum: "$items.amount" }, bills: { $addToSet: "$_id" } } },
    ]),
    Bill.aggregate([
      { $match: { lab, date: { $gte: addDays(today, -6), $lte: today }, status: { $ne: "cancelled" }, "items.kind": "pharmacy" } },
      { $unwind: "$items" },
      { $match: { "items.kind": "pharmacy" } },
      { $group: { _id: null, amount: { $sum: "$items.amount" } } },
    ]),
  ]);
  res.json({
    medicines: rows.length,
    stockValue: round2(rows.reduce((s, r) => s + r.stockValue, 0)),
    low: rows.filter((r) => r.status === "low").length,
    out: rows.filter((r) => r.status === "out").length,
    expiring: rows.filter((r) => r.expiringQty > 0).length,
    expired: rows.filter((r) => r.expiredQty > 0).length,
    salesToday: round2(sales[0]?.amount || 0),
    billsToday: sales[0]?.bills.length || 0,
    salesWeek: round2(week[0]?.amount || 0),
  });
});

/* ---------- Stock list ---------- */

hmsPharmacyRouter.get("/stock", async (req, res) => {
  const today = todayInZone(req.lab.timezone);
  const extra = {};
  const q = String(req.query.q || "").trim().slice(0, 60);
  if (q) extra.$or = [{ name: { $regex: escapeRegex(q), $options: "i" } }, { generic: { $regex: escapeRegex(q), $options: "i" } }];
  if (req.query.filter !== "inactive") extra.active = true;
  else extra.active = false;
  let rows = await stockView(req.labId, today, extra);
  const f = req.query.filter;
  if (f === "low") rows = rows.filter((r) => r.status !== "ok");
  if (f === "expiring") rows = rows.filter((r) => r.expiringQty > 0);
  if (f === "expired") rows = rows.filter((r) => r.expiredQty > 0);
  res.json({ today, medicines: rows });
});

/* ---------- Medicine list ---------- */

const medicineSchema = z.object({
  name: z.string().trim().min(2, "Enter the medicine name with its strength.").max(100),
  generic: z.string().trim().max(100).optional().default(""),
  form: z.enum(MEDICINE_FORMS).default("Tablet"),
  unit: z.string().trim().min(1, "Say what one unit is, like tablet or bottle.").max(20).default("tablet"),
  manufacturer: z.string().trim().max(80).optional().default(""),
  hsn: z.string().trim().max(10).optional().default("3004"),
  gstPct: z.coerce.number().refine((n) => [0, 5, 12, 18, 28].includes(n), "GST must be 0, 5, 12, 18 or 28%.").default(12),
  reorderLevel: z.coerce.number().int().min(0).max(100000).default(20),
  rxRequired: z.boolean().default(true),
  rack: z.string().trim().max(20).optional().default(""),
  active: z.boolean().default(true),
});

async function saveMedicine(req, res, id) {
  if (onlyStockRoles(req, res)) return;
  const parsed = medicineSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  try {
    const medicine = id
      ? await Medicine.findOneAndUpdate({ _id: id, lab: req.labId }, { $set: parsed.data }, { new: true }).lean()
      : await Medicine.create({ ...parsed.data, lab: req.labId });
    if (!medicine) return res.status(404).json({ error: "Medicine not found." });
    res.status(id ? 200 : 201).json({ medicine });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "A medicine with that name already exists.", field: "name" });
    throw err;
  }
}

hmsPharmacyRouter.post("/medicines", (req, res) => saveMedicine(req, res, null));
hmsPharmacyRouter.put("/medicines/:id", (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Medicine not found." });
  return saveMedicine(req, res, req.params.id);
});

hmsPharmacyRouter.get("/medicines/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Medicine not found." });
  const today = todayInZone(req.lab.timezone);
  const medicine = await Medicine.findOne({ _id: req.params.id, lab: req.labId }).lean();
  if (!medicine) return res.status(404).json({ error: "Medicine not found." });
  const [batches, moves] = await Promise.all([
    StockBatch.find({ lab: req.labId, medicine: medicine._id }).sort({ expiry: 1 }).lean(),
    StockMove.find({ lab: req.labId, medicine: medicine._id }).sort({ createdAt: -1 }).limit(40)
      .populate("batch", "batchNo").lean(),
  ]);
  res.json({
    medicine,
    batches: batches
      .filter((b) => b.qty > 0 || b.updatedAt > new Date(Date.now() - 90 * 864e5))
      .map((b) => ({ ...b, expired: isExpired(b.expiry, today), expiringSoon: expiresWithin(b.expiry, today, 3) })),
    moves,
  });
});

/* ---------- Count corrections ---------- */

hmsPharmacyRouter.post("/batches/:id/adjust", async (req, res) => {
  if (onlyStockRoles(req, res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Batch not found." });
  const parsed = z.object({
    qty: z.coerce.number().int("Whole units only.").refine((n) => n !== 0, "Enter how many units to add or remove."),
    reason: z.string().trim().min(3, "Say why the stock is being changed.").max(200),
  }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  try {
    res.json({ batch: await adjustStock(req.lab, req.params.id, { ...parsed.data, by: req.user.email }) });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------- Receiving from suppliers ---------- */

hmsPharmacyRouter.get("/purchases", async (req, res) => {
  if (onlyStockRoles(req, res)) return;
  const purchases = await Purchase.find({ lab: req.labId }).sort({ date: -1, createdAt: -1 }).limit(100).lean();
  const suppliers = await Purchase.distinct("supplier", { lab: req.labId });
  res.json({ purchases, suppliers: suppliers.sort() });
});

const purchaseSchema = z.object({
  supplier: z.string().trim().min(2, "Enter the supplier's name.").max(100),
  invoiceNo: z.string().trim().max(40).optional().default(""),
  date: z.string().refine(isValidDateStr, "Pick the invoice date."),
  notes: z.string().trim().max(300).optional().default(""),
  items: z.array(z.object({
    medicine: objectId("Choose the medicine."),
    batchNo: z.string().trim().min(1, "Every line needs a batch number.").max(30),
    expiry: z.string().regex(EXPIRY, "Expiry must be a month, like 2027-03."),
    qty: z.coerce.number().int("Whole units only.").min(1, "Quantity must be at least 1.").max(100000),
    freeQty: z.coerce.number().int().min(0).max(100000).default(0),
    purchaseRate: z.coerce.number().min(0).max(1000000),
    mrp: z.coerce.number().positive("Enter the MRP per unit.").max(1000000),
    gstPct: z.coerce.number().refine((n) => [0, 5, 12, 18, 28].includes(n), "GST must be 0, 5, 12, 18 or 28%."),
  })).min(1, "Add at least one medicine.").max(100),
});

hmsPharmacyRouter.post("/purchases", async (req, res) => {
  if (onlyStockRoles(req, res)) return;
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const v = parsed.data;
  const today = todayInZone(req.lab.timezone);
  if (v.date > today) return res.status(400).json({ error: "The invoice date cannot be in the future.", field: "date" });
  const stale = v.items.find((i) => isExpired(i.expiry, today));
  if (stale) return res.status(400).json({ error: `Batch ${stale.batchNo} has already expired. Do not take it in.` });
  const cheap = v.items.find((i) => i.purchaseRate > i.mrp);
  if (cheap) return res.status(400).json({ error: `Batch ${cheap.batchNo} costs more than its MRP. Check the rates.` });
  try {
    res.status(201).json({ purchase: await receiveStock(req.lab, { ...v, by: req.user.email }) });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------- A patient's prescriptions, matched to what is on the shelf ---------- */

hmsPharmacyRouter.get("/prescriptions", async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.patient)) return res.status(400).json({ error: "Choose a patient." });
  const today = todayInZone(req.lab.timezone);
  const [visits, stock] = await Promise.all([
    Appointment.find({
      lab: req.labId, patient: req.query.patient, status: "completed",
      date: { $gte: addDays(today, -30) }, "prescription.0": { $exists: true },
    }).sort({ date: -1 }).limit(5).populate("doctor", "name").select("date doctor prescription reference pharmacyBill").lean(),
    stockView(req.labId, today, { active: true }),
  ]);
  res.json({
    prescriptions: visits.map((v) => ({
      appointment: v._id,
      date: v.date,
      reference: v.reference,
      doctor: v.doctor?.name || "",
      dispensed: Boolean(v.pharmacyBill),
      lines: v.prescription.map((r) => {
        const m = matchMedicine(r.medicine, stock);
        return {
          text: r.medicine, dose: r.dose, frequency: r.frequency, duration: r.duration,
          match: m ? { _id: m._id, name: m.name, unit: m.unit, inStock: m.inStock, mrp: m.mrp, gstPct: m.gstPct } : null,
          qty: suggestQty(r.frequency, r.duration, m?.form),
        };
      }),
    })),
  });
});

/* ---------- Selling ---------- */

const saleSchema = z.object({
  patient: objectId("Choose the patient."),
  appointment: objectId("Bad visit.").nullish(),
  lines: z.array(z.object({
    medicine: objectId("Choose the medicine."),
    qty: z.coerce.number().int("Whole units only.").min(1, "Quantity must be at least 1.").max(5000),
    discountPct: z.coerce.number().min(0).max(100).default(0),
  })).min(1, "Add at least one medicine.").max(40)
    .refine((ls) => new Set(ls.map((l) => l.medicine)).size === ls.length, "The same medicine is on the sale twice. Change the quantity instead."),
  // { full: true } takes the bill's exact total, which only the server knows once batches are picked.
  payment: z.object({
    full: z.boolean().default(false),
    amount: z.coerce.number().min(0).max(10_000_000).default(0),
    method: z.enum(PAY_METHODS, { errorMap: () => ({ message: "Choose how it was paid." }) }),
    ref: z.string().trim().max(60).optional().default(""),
  }).nullish(),
  notes: z.string().trim().max(300).optional().default(""),
});

hmsPharmacyRouter.post("/sales", async (req, res) => {
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const v = parsed.data;
  const patient = await Patient.findOne({ _id: v.patient, lab: req.labId }).lean();
  if (!patient) return res.status(404).json({ error: "Patient not found." });
  try {
    const bill = await sellMedicines(req.lab, {
      patient, appointment: v.appointment || null, lines: v.lines, payment: v.payment || null, notes: v.notes, by: req.user.email,
    });
    res.status(201).json({ bill });
  } catch (err) {
    fail(res, err);
  }
});

hmsPharmacyRouter.get("/sales", async (req, res) => {
  const today = todayInZone(req.lab.timezone);
  const date = isValidDateStr(req.query.date) ? req.query.date : today;
  const bills = await Bill.find({ lab: req.labId, date, "items.kind": "pharmacy" })
    .sort({ createdAt: -1 }).limit(200).populate("patient", "name uhid").select("number date total paid due status items.name items.qty createdBy").lean();
  res.json({ date, bills });
});
