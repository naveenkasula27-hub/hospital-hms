import mongoose from "mongoose";
import { z } from "zod";
import { createRouter } from "../lib/router.js";
import { allowRoles, requireHospital } from "../middleware/auth.js";
import { Doctor } from "../models/Doctor.js";
import { User } from "../models/User.js";
import { isValidTime, toMinutes } from "../lib/opd.js";

export const hmsDoctorsRouter = createRouter();
hmsDoctorsRouter.use(allowRoles("owner", "reception", "doctor"), requireHospital);

const sessionSchema = z
  .object({ start: z.string().refine(isValidTime, "Use 24-hour times like 09:00."), end: z.string().refine(isValidTime, "Use 24-hour times like 13:00.") })
  .refine((s) => toMinutes(s.end) > toMinutes(s.start), "A session must end after it starts.");

const doctorFields = z.object({
  name: z.string().trim().min(2, "Enter the doctor's name.").max(80),
  specialty: z.string().trim().min(2, "Enter the specialty.").max(60),
  qualification: z.string().trim().max(120).optional().default(""),
  regNo: z.string().trim().max(40).optional().default(""),
  phone: z.string().trim().max(20).optional().default(""),
  room: z.string().trim().max(30).optional().default(""),
  consultFee: z.coerce.number().min(0).max(1000000).default(0),
  followUpFee: z.coerce.number().min(0).max(1000000).default(0),
  days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day."),
  sessions: z.array(sessionSchema).min(1, "Add at least one session.").max(4),
  slotMinutes: z.coerce.number().int().min(5).max(120).default(15),
  onlineBooking: z.boolean().default(true),
  active: z.boolean().default(true),
  loginEmail: z.string().trim().toLowerCase().email("That login email does not look right.").optional().or(z.literal("")),
  loginPassword: z.string().max(128).optional().or(z.literal("")),
});

function shape(d, users = {}) {
  return { ...d, loginEmail: d.user ? users[String(d.user)] || "" : "" };
}

hmsDoctorsRouter.get("/", async (req, res) => {
  const doctors = await Doctor.find({ lab: req.labId }).sort({ active: -1, name: 1 }).lean();
  const users = await User.find({ _id: { $in: doctors.map((d) => d.user).filter(Boolean) } }).select("email").lean();
  const byId = Object.fromEntries(users.map((u) => [String(u._id), u.email]));
  res.json({ doctors: doctors.map((d) => shape(d, req.user.role === "owner" ? byId : {})) });
});

/** Creates or updates the doctor's own sign-in, when the owner gave one. */
async function syncLogin(req, doctor, v) {
  if (!v.loginEmail) return null;
  if (doctor.user) {
    const update = { email: v.loginEmail, name: v.name };
    if (v.loginPassword) {
      update.passwordHash = await User.hashPassword(v.loginPassword);
    }
    await User.updateOne(
      { _id: doctor.user, lab: req.labId, role: "doctor" },
      { $set: update, ...(v.loginPassword ? { $inc: { sessionVersion: 1 } } : {}) }
    );
    return doctor.user;
  }
  if (!v.loginPassword || v.loginPassword.length < 12) {
    const err = new Error("Give the doctor's login a password of at least 12 characters.");
    err.status = 400;
    throw err;
  }
  const user = await User.create({
    lab: req.labId,
    name: v.name,
    email: v.loginEmail,
    role: "doctor",
    passwordHash: await User.hashPassword(v.loginPassword),
  });
  return user._id;
}

async function save(req, res, existing) {
  if (req.user.role !== "owner") return res.status(403).json({ error: "Only the owner can manage doctors." });
  const parsed = doctorFields.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
  }
  const { loginEmail, loginPassword, ...fields } = parsed.data;
  if (loginPassword && loginPassword.length < 12) {
    return res.status(400).json({ error: "The login password must be at least 12 characters.", field: "loginPassword" });
  }

  const doctor = existing || new Doctor({ lab: req.labId });
  doctor.set(fields);
  try {
    const userId = await syncLogin(req, doctor, { ...fields, loginEmail, loginPassword });
    if (userId) doctor.user = userId;
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, field: "loginPassword" });
    if (err.code === 11000) return res.status(409).json({ error: "That login email is already used by another account.", field: "loginEmail" });
    throw err;
  }
  await doctor.save();
  res.status(existing ? 200 : 201).json({ doctor: shape(doctor.toObject(), { [String(doctor.user)]: loginEmail || "" }) });
}

hmsDoctorsRouter.post("/", (req, res) => save(req, res, null));

hmsDoctorsRouter.put("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Doctor not found." });
  const doctor = await Doctor.findOne({ _id: req.params.id, lab: req.labId });
  if (!doctor) return res.status(404).json({ error: "Doctor not found." });
  return save(req, res, doctor);
});
