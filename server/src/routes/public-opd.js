/**
 * Online OPD booking for patients. No login: /api/public/<slug>/opd/...
 */
import mongoose from "mongoose";
import { z } from "zod";
import { createRouter } from "../lib/router.js";
import { sharedLimit } from "../middleware/rate-limit.js";
import { Lab } from "../models/Lab.js";
import { Doctor } from "../models/Doctor.js";
import { Patient } from "../models/Patient.js";
import { normalisePhone, looksLikeMobile } from "../lib/phone.js";
import { todayInZone, isValidDateStr, addDays } from "../lib/dates.js";
import { availability, createAppointment, doctorTimes, minutesNowInZone, worksOn } from "../lib/opd.js";
import { makeUhid } from "./hms-patients.js";
import { confirmOpdAppointment } from "../services/whatsapp.js";
import { config } from "../config.js";

export const publicOpdRouter = createRouter();

const BOOK_AHEAD_DAYS = 30;

async function loadHospital(req, res, next) {
  const lab = await Lab.findOne({ slug: String(req.params.slug).toLowerCase(), active: true, kind: "hospital" });
  if (!lab) return res.status(404).json({ error: "No hospital found at this address." });
  req.lab = lab;
  next();
}

const publicDoctor = (d) => ({
  _id: d._id,
  name: d.name,
  specialty: d.specialty,
  qualification: d.qualification,
  consultFee: d.consultFee,
  days: d.days,
});

publicOpdRouter.get("/:slug/opd", loadHospital, async (req, res) => {
  const doctors = await Doctor.find({ lab: req.lab._id, active: true, onlineBooking: true }).sort({ specialty: 1, name: 1 }).lean();
  const l = req.lab;
  res.json({
    hospital: {
      name: l.name, slug: l.slug, tagline: l.tagline, phone: l.phone, address: l.address, city: l.city,
      currency: l.currency, locale: l.locale, timezone: l.timezone, country: l.country, theme: l.theme, logoUrl: l.logoUrl,
      isDemo: Boolean(l.isDemo),
    },
    today: todayInZone(l.timezone),
    bookAheadDays: BOOK_AHEAD_DAYS,
    doctors: doctors.map(publicDoctor),
  });
});

async function bookableDoctor(req, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Doctor.findOne({ _id: id, lab: req.lab._id, active: true, onlineBooking: true }).lean();
}

function dateProblem(req, date) {
  const today = todayInZone(req.lab.timezone);
  if (!isValidDateStr(date)) return "Choose a date.";
  if (date < today) return "That date has passed.";
  if (date > addDays(today, BOOK_AHEAD_DAYS)) return `Bookings open ${BOOK_AHEAD_DAYS} days ahead.`;
  return null;
}

publicOpdRouter.get("/:slug/opd/slots", loadHospital, async (req, res) => {
  const doctor = await bookableDoctor(req, req.query.doctor);
  if (!doctor) return res.status(404).json({ error: "Doctor not found." });
  const problem = dateProblem(req, req.query.date);
  if (problem) return res.status(400).json({ error: problem });
  const today = todayInZone(req.lab.timezone);
  res.json(await availability(req.lab._id, doctor, req.query.date, { today, nowMinutes: minutesNowInZone(req.lab.timezone) }));
});

const bookingLimiter = sharedLimit("opd-booking", config.bookingRateLimit, 10 * 60 * 1000,
  "Too many bookings from this device. Please try again in a few minutes.");

const bookSchema = z.object({
  doctor: z.string(),
  date: z.string(),
  time: z.string(),
  name: z.string().trim().min(2, "Enter the patient's name.").max(80),
  age: z.coerce.number({ invalid_type_error: "Enter the age." }).int().min(0).max(130),
  gender: z.enum(["Male", "Female", "Other"], { errorMap: () => ({ message: "Choose a gender." }) }),
  phone: z.string().trim().min(6, "Enter a mobile number.").max(20),
  reason: z.string().trim().max(300).optional().default(""),
  consent: z.literal(true, { errorMap: () => ({ message: "Tick the consent box so the hospital can contact you." }) }),
});

publicOpdRouter.post("/:slug/opd/book", bookingLimiter, loadHospital, async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
  }
  const v = parsed.data;
  const lab = req.lab;

  const doctor = await bookableDoctor(req, v.doctor);
  if (!doctor) return res.status(404).json({ error: "Doctor not found.", field: "doctor" });
  const problem = dateProblem(req, v.date);
  if (problem) return res.status(400).json({ error: problem, field: "date" });
  if (!worksOn(doctor, v.date)) return res.status(400).json({ error: `${doctor.name} is not available that day.`, field: "date" });
  if (!doctorTimes(doctor).includes(v.time)) return res.status(400).json({ error: "Choose a time.", field: "time" });
  const { times } = await availability(lab._id, doctor, v.date, { today: todayInZone(lab.timezone), nowMinutes: minutesNowInZone(lab.timezone) });
  if (!times.find((t) => t.time === v.time)?.free) return res.status(409).json({ error: "That time was just taken. Pick another.", field: "time" });

  const phone = normalisePhone(v.phone, lab.country);
  if (!phone || !looksLikeMobile(phone, lab.country)) {
    return res.status(400).json({ error: "That mobile number does not look right.", field: "phone" });
  }

  // A returning patient keeps one record: same phone and same name.
  const nameRegex = new RegExp(`^${v.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  let patient = await Patient.findOne({ lab: lab._id, phone, name: nameRegex }).lean();
  const returning = Boolean(patient);
  if (!patient) {
    patient = await Patient.create({
      lab: lab._id, uhid: await makeUhid(lab), name: v.name, phone, age: v.age, gender: v.gender,
      registeredOn: todayInZone(lab.timezone), source: "web",
    });
  }

  const { appt, taken } = await createAppointment(lab, {
    patient: patient._id,
    doctor: doctor._id,
    date: v.date,
    time: v.time,
    type: returning ? "follow_up" : "new",
    source: "web",
    reason: v.reason,
    fee: returning ? doctor.followUpFee : doctor.consultFee,
  });
  if (taken) return res.status(409).json({ error: "That time was just taken. Pick another.", field: "time" });

  confirmOpdAppointment(lab, appt, patient, doctor).catch((err) => console.error("OPD confirmation:", err.message));

  res.status(201).json({
    reference: appt.reference,
    token: appt.token,
    date: appt.date,
    time: appt.time,
    doctor: { name: doctor.name, specialty: doctor.specialty },
    uhid: patient.uhid,
    fee: appt.fee,
  });
});
