/**
 * Patient registration and records. Every query is scoped to req.labId from the token.
 */
import mongoose from "mongoose";
import { z } from "zod";
import { createRouter } from "../lib/router.js";
import { allowRoles, requireHospital } from "../middleware/auth.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";
import { Booking } from "../models/Booking.js";
import { Bill } from "../models/Bill.js";
import { nextSeq } from "../models/Counter.js";
import { normalisePhone } from "../lib/phone.js";
import { todayInZone } from "../lib/dates.js";

export const hmsPatientsRouter = createRouter();
hmsPatientsRouter.use(allowRoles("owner", "reception", "doctor", "pharmacist"), requireHospital);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const canEdit = (req) => ["owner", "reception"].includes(req.user.role);
// The pharmacy counter registers walk-in customers too.
const canRegister = (req) => ["owner", "reception", "pharmacist"].includes(req.user.role);

export async function makeUhid(lab) {
  const seq = await nextSeq(`${lab._id}:uhid`);
  const prefix = lab.slug.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "HSP";
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

const optional = (max) => z.string().trim().max(max).optional().default("");

export const patientFields = z.object({
  name: z.string().trim().min(2, "Enter the patient's name.").max(80),
  phone: z.string().trim().min(6, "Enter a mobile number.").max(20),
  age: z.coerce.number({ invalid_type_error: "Enter the age." }).int().min(0).max(130),
  gender: z.enum(["Male", "Female", "Other"], { errorMap: () => ({ message: "Choose a gender." }) }),
  email: z.string().trim().email("That email does not look right.").optional().or(z.literal("")).default(""),
  address: optional(300),
  bloodGroup: z.enum(["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional().default(""),
  allergies: optional(300),
  conditions: optional(300),
  emergencyName: optional(80),
  emergencyPhone: optional(20),
  abhaId: optional(40),
});

hmsPatientsRouter.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 60);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const filter = { lab: req.labId };
  if (q) {
    const digits = q.replace(/\D/g, "");
    filter.$or = [
      { name: { $regex: escapeRegex(q), $options: "i" } },
      { uhid: { $regex: escapeRegex(q), $options: "i" } },
      ...(digits.length >= 4 ? [{ phone: { $regex: escapeRegex(digits) } }] : []),
    ];
  }
  const [patients, total] = await Promise.all([
    Patient.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Patient.countDocuments(filter),
  ]);

  const ids = patients.map((p) => p._id);
  const last = await Appointment.aggregate([
    { $match: { lab: new mongoose.Types.ObjectId(req.labId), patient: { $in: ids }, status: { $ne: "cancelled" } } },
    { $sort: { date: -1 } },
    { $group: { _id: "$patient", lastVisit: { $first: "$date" }, visits: { $sum: 1 } } },
  ]);
  const byId = Object.fromEntries(last.map((l) => [String(l._id), l]));

  res.json({
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    patients: patients.map((p) => ({ ...p, lastVisit: byId[p._id]?.lastVisit || "", visits: byId[p._id]?.visits || 0 })),
  });
});

hmsPatientsRouter.post("/", async (req, res) => {
  if (!canRegister(req)) return res.status(403).json({ error: "Only reception can register patients." });
  const parsed = patientFields.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
  }
  const v = parsed.data;
  const phone = normalisePhone(v.phone, req.lab.country);
  if (!phone) return res.status(400).json({ error: "That mobile number does not look right.", field: "phone" });

  const patient = await Patient.create({
    ...v,
    phone,
    emergencyPhone: v.emergencyPhone ? normalisePhone(v.emergencyPhone, req.lab.country) || "" : "",
    lab: req.labId,
    uhid: await makeUhid(req.lab),
    registeredOn: todayInZone(req.lab.timezone),
  });
  res.status(201).json({ patient });
});

hmsPatientsRouter.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Patient not found." });
  const patient = await Patient.findOne({ _id: req.params.id, lab: req.labId }).lean();
  if (!patient) return res.status(404).json({ error: "Patient not found." });

  const [visits, labBookings] = await Promise.all([
    Appointment.find({ lab: req.labId, patient: patient._id })
      .sort({ date: -1, token: -1 })
      .limit(50)
      .populate("doctor", "name specialty")
      .lean(),
    Booking.find({
      lab: req.labId,
      $or: [{ patientRecord: patient._id }, { "patient.phone": patient.phone, "patient.name": patient.name }],
    })
      .select("reference date status items estimatedTotal createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  // Money stays with the desk; a doctor's view of the record leaves bills out.
  const bills = canEdit(req)
    ? await Bill.find({ lab: req.labId, patient: patient._id })
      .sort({ date: -1, createdAt: -1 }).limit(50).select("number date total paid due status").lean()
    : undefined;

  res.json({ patient, visits, labBookings, bills });
});

hmsPatientsRouter.patch("/:id", async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: "Only reception can edit patient details." });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Patient not found." });
  const parsed = patientFields.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
  }
  const v = parsed.data;
  const phone = normalisePhone(v.phone, req.lab.country);
  if (!phone) return res.status(400).json({ error: "That mobile number does not look right.", field: "phone" });

  const patient = await Patient.findOneAndUpdate(
    { _id: req.params.id, lab: req.labId },
    { $set: { ...v, phone, emergencyPhone: v.emergencyPhone ? normalisePhone(v.emergencyPhone, req.lab.country) || "" : "" } },
    { new: true }
  ).lean();
  if (!patient) return res.status(404).json({ error: "Patient not found." });
  res.json({ patient });
});
