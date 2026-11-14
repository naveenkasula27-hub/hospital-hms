/**
 * In-patient: wards, beds, admissions and discharges.
 * Owner manages wards and beds. Owner + reception admit patients.
 * Owner + doctor discharge. Everyone with access can view.
 */
import mongoose from "mongoose";
import { z } from "zod";
import { createRouter } from "../lib/router.js";
import { allowRoles, requireHospital } from "../middleware/auth.js";
import { Ward, Bed, Admission, WARD_TYPES, BED_STATUSES } from "../models/Inpatient.js";
import { Patient } from "../models/Patient.js";
import { Doctor } from "../models/Doctor.js";
import { nextSeq } from "../models/Counter.js";
import { todayInZone } from "../lib/dates.js";

export const hmsInpatientRouter = createRouter();
hmsInpatientRouter.use(allowRoles("owner", "reception", "doctor"), requireHospital);

const objectId = (msg) => z.string().refine(mongoose.isValidObjectId, msg);
const isOwner = (req) => req.user.role === "owner";

function bad(res, parsed) {
  const issue = parsed.error.issues[0];
  return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
}

/* ========== Wards ========== */

const wardSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  floor: z.string().trim().max(30).default(""),
  type: z.enum(WARD_TYPES).default("general"),
  dailyRate: z.coerce.number().min(0).default(0),
  active: z.boolean().default(true),
});

hmsInpatientRouter.get("/wards", async (req, res) => {
  const wards = await Ward.find({ lab: req.labId }).sort({ name: 1 }).lean();
  const beds = await Bed.find({ lab: req.labId }).lean();
  const bedsByWard = {};
  for (const b of beds) {
    const wid = String(b.ward);
    if (!bedsByWard[wid]) bedsByWard[wid] = { total: 0, available: 0, occupied: 0, maintenance: 0 };
    bedsByWard[wid].total++;
    bedsByWard[wid][b.status]++;
  }
  res.json({ wards: wards.map((w) => ({ ...w, beds: bedsByWard[String(w._id)] || { total: 0, available: 0, occupied: 0, maintenance: 0 } })) });
});

hmsInpatientRouter.post("/wards", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the owner can add wards" });
  const parsed = wardSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const exists = await Ward.findOne({ lab: req.labId, name: parsed.data.name });
  if (exists) return res.status(409).json({ error: "A ward with that name already exists" });
  const ward = await Ward.create({ lab: req.labId, ...parsed.data });
  res.status(201).json({ ward });
});

hmsInpatientRouter.put("/wards/:id", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the owner can edit wards" });
  const parsed = wardSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const dup = await Ward.findOne({ lab: req.labId, name: parsed.data.name, _id: { $ne: req.params.id } });
  if (dup) return res.status(409).json({ error: "Another ward with that name exists" });
  const ward = await Ward.findOneAndUpdate({ _id: req.params.id, lab: req.labId }, parsed.data, { new: true });
  if (!ward) return res.status(404).json({ error: "Ward not found" });
  res.json({ ward });
});

/* ========== Beds ========== */

const bedCreateSchema = z.object({
  ward: objectId("Invalid ward"),
  number: z.string().trim().min(1, "Bed number is required").max(20),
  notes: z.string().trim().max(200).default(""),
});

const bedUpdateSchema = z.object({
  status: z.enum(BED_STATUSES).optional(),
  notes: z.string().trim().max(200).optional(),
});

hmsInpatientRouter.get("/beds", async (req, res) => {
  const filter = { lab: req.labId };
  if (req.query.ward) filter.ward = req.query.ward;
  if (req.query.status) filter.status = req.query.status;
  const beds = await Bed.find(filter).populate("ward", "name type floor dailyRate").populate("currentAdmission").sort({ number: 1 }).lean();
  res.json({ beds });
});

hmsInpatientRouter.get("/beds/map", async (req, res) => {
  const wards = await Ward.find({ lab: req.labId, active: true }).sort({ name: 1 }).lean();
  const beds = await Bed.find({ lab: req.labId })
    .populate({ path: "currentAdmission", populate: { path: "patient", select: "name uhid" } })
    .sort({ number: 1 })
    .lean();
  const wardMap = wards.map((w) => ({
    ...w,
    beds: beds.filter((b) => String(b.ward) === String(w._id)),
  }));
  const totals = { total: beds.length, available: 0, occupied: 0, maintenance: 0 };
  for (const b of beds) totals[b.status]++;
  res.json({ wards: wardMap, totals });
});

hmsInpatientRouter.post("/beds", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the owner can add beds" });
  const parsed = bedCreateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const ward = await Ward.findOne({ _id: parsed.data.ward, lab: req.labId });
  if (!ward) return res.status(404).json({ error: "Ward not found" });
  const dup = await Bed.findOne({ lab: req.labId, number: parsed.data.number });
  if (dup) return res.status(409).json({ error: "A bed with that number already exists" });
  const bed = await Bed.create({ lab: req.labId, ...parsed.data });
  res.status(201).json({ bed });
});

hmsInpatientRouter.post("/beds/bulk", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the owner can add beds" });
  const schema = z.object({ ward: objectId("Invalid ward"), prefix: z.string().trim().max(10), from: z.coerce.number().int().min(1), to: z.coerce.number().int().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const { ward: wardId, prefix, from, to } = parsed.data;
  if (to < from || to - from > 50) return res.status(400).json({ error: "Range must be 1–50 beds" });
  const ward = await Ward.findOne({ _id: wardId, lab: req.labId });
  if (!ward) return res.status(404).json({ error: "Ward not found" });
  const beds = [];
  const skipped = [];
  for (let n = from; n <= to; n++) {
    const number = `${prefix}${String(n).padStart(String(to).length, "0")}`;
    const exists = await Bed.findOne({ lab: req.labId, number });
    if (exists) { skipped.push(number); continue; }
    beds.push(await Bed.create({ lab: req.labId, ward: wardId, number }));
  }
  res.status(201).json({ beds, skipped });
});

hmsInpatientRouter.put("/beds/:id", async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: "Only the owner can edit beds" });
  const parsed = bedUpdateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const bed = await Bed.findOne({ _id: req.params.id, lab: req.labId });
  if (!bed) return res.status(404).json({ error: "Bed not found" });
  if (parsed.data.status && bed.status === "occupied" && parsed.data.status !== "occupied") {
    return res.status(400).json({ error: "Discharge the patient first" });
  }
  if (parsed.data.status) bed.status = parsed.data.status;
  if (parsed.data.notes !== undefined) bed.notes = parsed.data.notes;
  await bed.save();
  res.json({ bed });
});

/* ========== Admissions ========== */

const admitSchema = z.object({
  patient: objectId("Invalid patient"),
  doctor: objectId("Invalid doctor"),
  bed: objectId("Invalid bed"),
  diagnosis: z.string().trim().max(500).default(""),
  reason: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(1000).default(""),
  expectedDischarge: z.string().optional().default(""),
  vitals: z.object({
    bp: z.string().max(20).default(""),
    pulse: z.string().max(20).default(""),
    temperature: z.string().max(20).default(""),
    spo2: z.string().max(20).default(""),
    weight: z.string().max(20).default(""),
  }).default({}),
});

hmsInpatientRouter.get("/admissions", async (req, res) => {
  const filter = { lab: req.labId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.patient) filter.patient = req.query.patient;
  const admissions = await Admission.find(filter)
    .populate("patient", "name uhid age gender phone")
    .populate("doctor", "name specialty")
    .populate("bed", "number")
    .populate("ward", "name type dailyRate")
    .sort({ admittedAt: -1 })
    .limit(200)
    .lean();
  const summary = await Admission.aggregate([
    { $match: { lab: new mongoose.Types.ObjectId(req.labId) } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  res.json({ admissions, summary });
});

hmsInpatientRouter.post("/admissions", async (req, res) => {
  if (req.user.role === "doctor") return res.status(403).json({ error: "Only owner or reception can admit patients" });
  const parsed = admitSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const { patient: patientId, doctor: doctorId, bed: bedId, ...rest } = parsed.data;

  const [patient, doctor, bed] = await Promise.all([
    Patient.findOne({ _id: patientId, lab: req.labId }),
    Doctor.findOne({ _id: doctorId, lab: req.labId }),
    Bed.findOne({ _id: bedId, lab: req.labId }).populate("ward"),
  ]);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });
  if (!bed) return res.status(404).json({ error: "Bed not found" });
  if (bed.status !== "available") return res.status(400).json({ error: "This bed is not available" });

  const seq = await nextSeq(`ipd-${req.labId}`);
  const yy = new Date().getFullYear() % 100;
  const admissionNumber = `IPD-${yy}-${String(seq).padStart(5, "0")}`;

  const admission = await Admission.create({
    lab: req.labId,
    admissionNumber,
    patient: patientId,
    doctor: doctorId,
    bed: bedId,
    ward: bed.ward._id,
    admittedAt: new Date(),
    expectedDischarge: rest.expectedDischarge ? new Date(rest.expectedDischarge) : null,
    ...rest,
  });

  bed.status = "occupied";
  bed.currentAdmission = admission._id;
  await bed.save();

  res.status(201).json({ admission });
});

hmsInpatientRouter.get("/admissions/:id", async (req, res) => {
  const admission = await Admission.findOne({ _id: req.params.id, lab: req.labId })
    .populate("patient", "name uhid age gender phone")
    .populate("doctor", "name specialty phone")
    .populate("bed", "number status")
    .populate("ward", "name type floor dailyRate")
    .lean();
  if (!admission) return res.status(404).json({ error: "Admission not found" });
  res.json({ admission });
});

hmsInpatientRouter.post("/admissions/:id/discharge", async (req, res) => {
  if (req.user.role === "reception") return res.status(403).json({ error: "Only owner or doctor can discharge" });
  const schema = z.object({
    dischargeSummary: z.string().trim().max(2000).default(""),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);

  const admission = await Admission.findOne({ _id: req.params.id, lab: req.labId });
  if (!admission) return res.status(404).json({ error: "Admission not found" });
  if (admission.status === "discharged") return res.status(400).json({ error: "Already discharged" });

  admission.status = "discharged";
  admission.dischargedAt = new Date();
  admission.dischargedBy = req.user.email;
  admission.dischargeSummary = parsed.data.dischargeSummary;
  await admission.save();

  await Bed.findByIdAndUpdate(admission.bed, { status: "available", currentAdmission: null });

  const populated = await Admission.findById(admission._id)
    .populate("patient", "name uhid age gender phone")
    .populate("doctor", "name specialty")
    .populate("bed", "number")
    .populate("ward", "name type floor dailyRate")
    .lean();
  res.json({ admission: populated });
});

hmsInpatientRouter.patch("/admissions/:id", async (req, res) => {
  const schema = z.object({
    notes: z.string().trim().max(1000).optional(),
    diagnosis: z.string().trim().max(500).optional(),
    expectedDischarge: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const admission = await Admission.findOne({ _id: req.params.id, lab: req.labId });
  if (!admission) return res.status(404).json({ error: "Admission not found" });
  if (parsed.data.notes !== undefined) admission.notes = parsed.data.notes;
  if (parsed.data.diagnosis !== undefined) admission.diagnosis = parsed.data.diagnosis;
  if (parsed.data.expectedDischarge !== undefined) admission.expectedDischarge = parsed.data.expectedDischarge ? new Date(parsed.data.expectedDischarge) : null;
  await admission.save();
  res.json({ admission });
});
