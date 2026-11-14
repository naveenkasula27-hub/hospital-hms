/**
 * Insurance and TPA claims. Owner and reception manage insurers, patient
 * policies and claims. A claim is always linked to a bill.
 */
import mongoose from "mongoose";
import { z } from "zod";
import { createRouter } from "../lib/router.js";
import { allowRoles, requireHospital } from "../middleware/auth.js";
import { Insurer, Policy, Claim, CLAIM_STATUSES } from "../models/Insurance.js";
import { Bill } from "../models/Bill.js";
import { Patient } from "../models/Patient.js";
import { round2 } from "../lib/invoice.js";
import { addPayment } from "../services/bills.js";
import { todayInZone } from "../lib/dates.js";

export const hmsInsuranceRouter = createRouter();
hmsInsuranceRouter.use(allowRoles("owner", "reception"), requireHospital);

const objectId = (msg) => z.string().refine(mongoose.isValidObjectId, msg);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isOwner = (req) => req.user.role === "owner";

function bad(res, parsed) {
  const issue = parsed.error.issues[0];
  return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
}

/* ========== Insurers ========== */

const insurerSchema = z.object({
  name: z.string().trim().min(2, "Enter the insurer name.").max(100),
  type: z.enum(["insurance", "tpa"]).default("insurance"),
  contact: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(20).optional().default(""),
  email: z.string().trim().max(80).optional().default(""),
  notes: z.string().trim().max(300).optional().default(""),
  active: z.boolean().default(true),
});

hmsInsuranceRouter.get("/insurers", async (req, res) => {
  const filter = { lab: req.labId };
  if (!isOwner(req)) filter.active = true;
  res.json({ insurers: await Insurer.find(filter).sort({ name: 1 }).lean() });
});

hmsInsuranceRouter.post("/insurers", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can add insurers." });
  const parsed = insurerSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  try {
    res.status(201).json({ insurer: await Insurer.create({ ...parsed.data, lab: req.labId }) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "An insurer with that name already exists.", field: "name" });
    throw err;
  }
});

hmsInsuranceRouter.put("/insurers/:id", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can edit insurers." });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Insurer not found." });
  const parsed = insurerSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  try {
    const insurer = await Insurer.findOneAndUpdate({ _id: req.params.id, lab: req.labId }, { $set: parsed.data }, { new: true }).lean();
    if (!insurer) return res.status(404).json({ error: "Insurer not found." });
    res.json({ insurer });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "An insurer with that name already exists.", field: "name" });
    throw err;
  }
});

/* ========== Patient policies ========== */

const policySchema = z.object({
  patient: objectId("Choose a patient."),
  insurer: objectId("Choose an insurer."),
  policyNumber: z.string().trim().min(1, "Enter the policy number.").max(60),
  memberId: z.string().trim().max(60).optional().default(""),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD).").optional().default(""),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD).").optional().default(""),
  sumInsured: z.coerce.number().min(0).max(100_000_000).optional().default(0),
  notes: z.string().trim().max(300).optional().default(""),
});

hmsInsuranceRouter.get("/policies", async (req, res) => {
  const filter = { lab: req.labId };
  if (mongoose.isValidObjectId(req.query.patient)) filter.patient = req.query.patient;
  const policies = await Policy.find(filter).sort({ createdAt: -1 }).limit(200)
    .populate("patient", "name uhid phone").populate("insurer", "name type").lean();
  res.json({ policies });
});

hmsInsuranceRouter.post("/policies", async (req, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const v = parsed.data;
  const [patient, insurer] = await Promise.all([
    Patient.findOne({ _id: v.patient, lab: req.labId }).lean(),
    Insurer.findOne({ _id: v.insurer, lab: req.labId, active: true }).lean(),
  ]);
  if (!patient) return res.status(404).json({ error: "Patient not found." });
  if (!insurer) return res.status(404).json({ error: "Insurer not found." });
  res.status(201).json({ policy: await Policy.create({ ...v, lab: req.labId }) });
});

hmsInsuranceRouter.put("/policies/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Policy not found." });
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const policy = await Policy.findOneAndUpdate({ _id: req.params.id, lab: req.labId }, { $set: parsed.data }, { new: true })
    .populate("patient", "name uhid phone").populate("insurer", "name type").lean();
  if (!policy) return res.status(404).json({ error: "Policy not found." });
  res.json({ policy });
});

hmsInsuranceRouter.delete("/policies/:id", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can remove policies." });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Policy not found." });
  const claims = await Claim.countDocuments({ lab: req.labId, policy: req.params.id, status: { $nin: ["draft"] } });
  if (claims) return res.status(409).json({ error: "This policy has claims. Remove them first." });
  const r = await Policy.deleteOne({ _id: req.params.id, lab: req.labId });
  if (!r.deletedCount) return res.status(404).json({ error: "Policy not found." });
  await Claim.deleteMany({ lab: req.labId, policy: req.params.id });
  res.json({ ok: true });
});

/* ========== Claims ========== */

const createClaimSchema = z.object({
  bill: objectId("Choose a bill."),
  policy: objectId("Choose a policy."),
  claimedAmount: z.coerce.number().positive("Enter the claimed amount.").max(100_000_000),
  diagnosis: z.string().trim().max(300).optional().default(""),
  notes: z.string().trim().max(300).optional().default(""),
});

hmsInsuranceRouter.get("/claims", async (req, res) => {
  const filter = { lab: req.labId };
  if (CLAIM_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.status === "pending") filter.status = { $in: ["submitted", "query"] };
  if (mongoose.isValidObjectId(req.query.patient)) filter.patient = req.query.patient;
  if (mongoose.isValidObjectId(req.query.bill)) filter.bill = req.query.bill;
  const q = String(req.query.q || "").trim().slice(0, 60);
  if (q) filter.$or = [{ claimNumber: { $regex: escapeRegex(q), $options: "i" } }];

  const claims = await Claim.find(filter).sort({ createdAt: -1 }).limit(200)
    .populate("patient", "name uhid").populate("insurer", "name type")
    .populate("bill", "number total due status").lean();

  const summary = await Claim.aggregate([
    { $match: { lab: new mongoose.Types.ObjectId(req.labId), status: { $ne: "rejected" } } },
    { $group: {
      _id: "$status",
      count: { $sum: 1 },
      amount: { $sum: "$claimedAmount" },
      approved: { $sum: "$approvedAmount" },
      settled: { $sum: "$settledAmount" },
    } },
  ]);

  res.json({ claims, summary });
});

hmsInsuranceRouter.post("/claims", async (req, res) => {
  const parsed = createClaimSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const v = parsed.data;

  const [bill, policy] = await Promise.all([
    Bill.findOne({ _id: v.bill, lab: req.labId, status: { $ne: "cancelled" } }).lean(),
    Policy.findOne({ _id: v.policy, lab: req.labId }).populate("insurer").lean(),
  ]);
  if (!bill) return res.status(404).json({ error: "Bill not found or already cancelled." });
  if (!policy) return res.status(404).json({ error: "Policy not found." });
  if (String(bill.patient) !== String(policy.patient)) return res.status(400).json({ error: "The policy does not belong to this bill's patient." });

  const existing = await Claim.findOne({ lab: req.labId, bill: bill._id, status: { $nin: ["rejected"] } }).lean();
  if (existing) return res.status(409).json({ error: "This bill already has an active insurance claim." });

  if (v.claimedAmount > bill.total) return res.status(400).json({ error: "The claimed amount is more than the bill total." });

  const claim = await Claim.create({
    lab: req.labId,
    bill: bill._id,
    patient: bill.patient,
    policy: policy._id,
    insurer: policy.insurer._id,
    claimedAmount: round2(v.claimedAmount),
    patientShare: round2(bill.total - v.claimedAmount),
    diagnosis: v.diagnosis,
    notes: v.notes,
    status: "draft",
    log: [{ status: "draft", note: "Claim created", by: req.user.email }],
  });
  res.status(201).json({ claim });
});

hmsInsuranceRouter.get("/claims/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Claim not found." });
  const claim = await Claim.findOne({ _id: req.params.id, lab: req.labId })
    .populate("patient", "name uhid phone age gender address")
    .populate("insurer", "name type contact phone email")
    .populate("policy", "policyNumber memberId validFrom validTo sumInsured")
    .populate("bill", "number date total paid due status items payments")
    .lean();
  if (!claim) return res.status(404).json({ error: "Claim not found." });
  res.json({ claim });
});

/* ---------- Status transitions ---------- */

const TRANSITIONS = {
  draft: ["submitted", "rejected"],
  submitted: ["query", "approved", "rejected"],
  query: ["submitted", "approved", "rejected"],
  approved: ["settled", "rejected"],
};

const updateClaimSchema = z.object({
  status: z.enum(CLAIM_STATUSES),
  claimNumber: z.string().trim().max(60).optional(),
  approvedAmount: z.coerce.number().min(0).max(100_000_000).optional(),
  settledAmount: z.coerce.number().min(0).max(100_000_000).optional(),
  settledRef: z.string().trim().max(60).optional(),
  patientShare: z.coerce.number().min(0).max(100_000_000).optional(),
  note: z.string().trim().max(300).optional().default(""),
  recordPayment: z.boolean().optional().default(false),
});

hmsInsuranceRouter.patch("/claims/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Claim not found." });
  const parsed = updateClaimSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const v = parsed.data;

  const claim = await Claim.findOne({ _id: req.params.id, lab: req.labId });
  if (!claim) return res.status(404).json({ error: "Claim not found." });

  const allowed = TRANSITIONS[claim.status];
  if (!allowed || !allowed.includes(v.status)) {
    return res.status(400).json({ error: `Cannot move a ${claim.status} claim to ${v.status}.` });
  }

  if (v.status === "submitted") {
    claim.submittedAt = claim.submittedAt || new Date();
  }

  if (v.status === "approved") {
    if (!v.approvedAmount && v.approvedAmount !== 0) return res.status(400).json({ error: "Enter the approved amount." });
    claim.approvedAmount = round2(v.approvedAmount);
    claim.approvedAt = new Date();
    if (v.patientShare !== undefined) claim.patientShare = round2(v.patientShare);
    else claim.patientShare = round2(claim.claimedAmount - claim.approvedAmount);
  }

  if (v.status === "settled") {
    if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can settle claims." });
    claim.settledAmount = round2(v.settledAmount ?? claim.approvedAmount);
    claim.settledAt = new Date();
    claim.settledRef = v.settledRef || "";

    if (v.recordPayment) {
      const bill = await Bill.findOne({ _id: claim.bill, lab: req.labId });
      if (bill && bill.due > 0 && claim.settledAmount > 0) {
        const payAmount = Math.min(round2(claim.settledAmount), bill.due);
        await addPayment(req.lab, bill, { amount: payAmount, method: "insurance", ref: claim.settledRef || claim.claimNumber || "", by: req.user.email });
      }
    }
  }

  if (v.claimNumber !== undefined) claim.claimNumber = v.claimNumber;
  claim.status = v.status;
  if (v.note) claim.notes = v.note;
  claim.log.push({ status: v.status, note: v.note, by: req.user.email });
  await claim.save();

  res.json({ claim });
});

hmsInsuranceRouter.delete("/claims/:id", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the administrator can delete claims." });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Claim not found." });
  const claim = await Claim.findOne({ _id: req.params.id, lab: req.labId });
  if (!claim) return res.status(404).json({ error: "Claim not found." });
  if (claim.status === "settled") return res.status(400).json({ error: "A settled claim cannot be deleted." });
  await claim.deleteOne();
  res.json({ ok: true });
});
