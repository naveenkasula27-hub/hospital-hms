/**
 * OPD appointments, the token queue and the doctor's consultation.
 *
 * A doctor login only ever sees and edits their own appointments; req.doctor
 * comes from requireHospital, never from the request body.
 */
import mongoose from "mongoose";
import { z } from "zod";
import { createRouter } from "../lib/router.js";
import { allowRoles, requireHospital } from "../middleware/auth.js";
import { Appointment, APPOINTMENT_STATUSES } from "../models/Appointment.js";
import { Doctor } from "../models/Doctor.js";
import { Patient } from "../models/Patient.js";
import { Test } from "../models/Test.js";
import { Booking } from "../models/Booking.js";
import { makeReference } from "../lib/reference.js";
import { createBill, BillError } from "../services/bills.js";
import { todayInZone, isValidDateStr } from "../lib/dates.js";
import {
  availability, createAppointment, isValidTime, minutesNowInZone, worksOn, doctorTimes, TRANSITIONS, FREES_TIME,
} from "../lib/opd.js";

export const hmsAppointmentsRouter = createRouter();
hmsAppointmentsRouter.use(allowRoles("owner", "reception", "doctor"), requireHospital);

const isDesk = (req) => ["owner", "reception"].includes(req.user.role);

function scoped(req, extra = {}) {
  const filter = { lab: req.labId, ...extra };
  if (req.doctor) filter.doctor = req.doctor._id;
  return filter;
}

async function loadAppt(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "Appointment not found." });
    return null;
  }
  const appt = await Appointment.findOne(scoped(req, { _id: req.params.id }));
  if (!appt) res.status(404).json({ error: "Appointment not found." });
  return appt;
}

/* ---------- List ---------- */

hmsAppointmentsRouter.get("/", async (req, res) => {
  const date = isValidDateStr(req.query.date) ? req.query.date : todayInZone(req.lab.timezone);
  const filter = scoped(req, { date });
  if (!req.doctor && mongoose.isValidObjectId(req.query.doctor)) filter.doctor = req.query.doctor;
  if (APPOINTMENT_STATUSES.includes(req.query.status)) filter.status = req.query.status;

  const appointments = await Appointment.find(filter)
    .sort({ token: 1 })
    .populate("patient", "name uhid phone age gender")
    .populate("doctor", "name specialty room")
    .select("-statusLog")
    .lean();
  res.json({ date, appointments });
});

/* ---------- Free times for one doctor ---------- */

hmsAppointmentsRouter.get("/slots", async (req, res) => {
  const { doctor: doctorId, date } = req.query;
  if (!mongoose.isValidObjectId(doctorId) || !isValidDateStr(date)) {
    return res.status(400).json({ error: "Pick a doctor and a date." });
  }
  const doctor = await Doctor.findOne({ _id: doctorId, lab: req.labId, active: true }).lean();
  if (!doctor) return res.status(404).json({ error: "Doctor not found." });
  const today = todayInZone(req.lab.timezone);
  res.json(await availability(req.labId, doctor, date, { today, nowMinutes: minutesNowInZone(req.lab.timezone) }));
});

/* ---------- Book from the desk ---------- */

const createSchema = z.object({
  patient: z.string().refine(mongoose.isValidObjectId, "Choose a patient."),
  doctor: z.string().refine(mongoose.isValidObjectId, "Choose a doctor."),
  date: z.string().refine(isValidDateStr, "Choose a date."),
  time: z.string().optional().default(""),
  type: z.enum(["new", "follow_up"]).default("new"),
  source: z.enum(["desk", "phone"]).default("desk"),
  reason: z.string().trim().max(300).optional().default(""),
});

hmsAppointmentsRouter.post("/", async (req, res) => {
  if (!isDesk(req)) return res.status(403).json({ error: "Only reception can book appointments." });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
  }
  const v = parsed.data;
  const today = todayInZone(req.lab.timezone);
  if (v.date < today) return res.status(400).json({ error: "That date has passed.", field: "date" });

  const [patient, doctor] = await Promise.all([
    Patient.findOne({ _id: v.patient, lab: req.labId }).lean(),
    Doctor.findOne({ _id: v.doctor, lab: req.labId, active: true }).lean(),
  ]);
  if (!patient) return res.status(404).json({ error: "Patient not found.", field: "patient" });
  if (!doctor) return res.status(404).json({ error: "Doctor not found.", field: "doctor" });
  if (!worksOn(doctor, v.date)) return res.status(400).json({ error: `${doctor.name} does not sit on that day.`, field: "date" });
  if (v.time && (!isValidTime(v.time) || !doctorTimes(doctor).includes(v.time))) {
    return res.status(400).json({ error: "That time is outside the doctor's sessions.", field: "time" });
  }

  const { appt, taken } = await createAppointment(req.lab, {
    patient: patient._id,
    doctor: doctor._id,
    date: v.date,
    time: v.time,
    type: v.type,
    source: v.source,
    reason: v.reason,
    fee: v.type === "follow_up" ? doctor.followUpFee : doctor.consultFee,
  });
  if (taken) return res.status(409).json({ error: "Someone just booked that time. Pick another.", field: "time" });
  res.status(201).json({ appointment: appt });
});

/* ---------- One appointment, with the patient's history for the doctor ---------- */

hmsAppointmentsRouter.get("/:id", async (req, res) => {
  const appt = await loadAppt(req, res);
  if (!appt) return;
  await appt.populate([
    { path: "patient" },
    { path: "doctor", select: "name specialty qualification regNo room" },
    { path: "labBooking", select: "reference status" },
  ]);
  const history = await Appointment.find({
    lab: req.labId,
    patient: appt.patient._id,
    _id: { $ne: appt._id },
    status: "completed",
  })
    .sort({ date: -1 })
    .limit(10)
    .populate("doctor", "name specialty")
    .select("date consult prescription vitals doctor labOrders")
    .lean();
  res.json({ appointment: appt.toObject(), history });
});

/* ---------- Move through the queue ---------- */

hmsAppointmentsRouter.patch("/:id/status", async (req, res) => {
  const status = req.body?.status;
  if (!APPOINTMENT_STATUSES.includes(status)) return res.status(400).json({ error: "Unknown status." });
  const appt = await loadAppt(req, res);
  if (!appt) return;

  if (!TRANSITIONS[appt.status].includes(status)) {
    return res.status(400).json({ error: `An appointment that is ${appt.status.replace("_", " ")} cannot move to ${status.replace("_", " ")}.` });
  }
  const doctorStep = ["in_consultation", "completed"].includes(status);
  if (req.user.role === "doctor" && !doctorStep) {
    return res.status(403).json({ error: "Reception handles check-in and cancellations." });
  }
  if (req.user.role === "reception" && doctorStep) {
    return res.status(403).json({ error: "Only the doctor can start or finish a consultation." });
  }

  if (status === "booked" && appt.time) {
    appt.holdsTime = true;   // reinstating takes the time back; the unique index refuses it if gone
  }
  if (FREES_TIME.includes(status)) appt.holdsTime = false;
  appt.status = status;
  appt.statusLog.push({ status, by: req.user.email });
  try {
    await appt.save();
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "That time has been given to someone else. Book a new time instead." });
    throw err;
  }
  res.json({ appointment: appt });
});

/* ---------- Consultation fee ---------- */

hmsAppointmentsRouter.patch("/:id/payment", async (req, res) => {
  if (!isDesk(req)) return res.status(403).json({ error: "Only reception can record payments." });
  const parsed = z
    .object({ status: z.enum(["unpaid", "paid", "waived"]), method: z.enum(["", "cash", "upi", "card"]).default("") })
    .refine((p) => p.status !== "paid" || p.method, "Choose cash, UPI or card.")
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const appt = await loadAppt(req, res);
  if (!appt) return;

  const { status, method } = parsed.data;
  if (appt.bill) {
    return res.status(409).json({ error: "This visit is already on a bill. Take the payment from Billing." });
  }

  if (status === "paid") {
    // Every rupee collected gets an invoice, so the fee goes through a bill.
    if (["cancelled", "no_show"].includes(appt.status)) return res.status(400).json({ error: "This appointment is closed." });
    const [patient, doctor] = await Promise.all([
      Patient.findOne({ _id: appt.patient, lab: req.labId }).lean(),
      Doctor.findById(appt.doctor).select("name").lean(),
    ]);
    try {
      const bill = await createBill(req.lab, {
        patient,
        items: [{
          kind: "consultation",
          name: `Consultation · ${doctor?.name || "Doctor"} (${appt.type === "follow_up" ? "follow-up" : "new visit"})`,
          qty: 1, rate: appt.fee, discount: 0, taxPct: 0, appointment: appt._id,
        }],
        payment: { amount: appt.fee, method },
        by: req.user.email,
      });
      const fresh = await Appointment.findById(appt._id).lean();
      return res.json({ appointment: fresh, bill: { _id: bill._id, number: bill.number } });
    } catch (err) {
      if (err instanceof BillError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }

  appt.payment = { status, method: "", amount: 0, paidOn: "" };
  await appt.save();
  res.json({ appointment: appt });
});

/* ---------- Vitals, taken at the desk or by the doctor ---------- */

const short = z.string().trim().max(20).optional().default("");
const vitalsSchema = z.object({ bp: short, pulse: short, temperature: short, spo2: short, weight: short, height: short });

hmsAppointmentsRouter.patch("/:id/vitals", async (req, res) => {
  const parsed = vitalsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Each vital must be 20 characters or fewer." });
  const appt = await loadAppt(req, res);
  if (!appt) return;
  if (["cancelled", "no_show"].includes(appt.status)) return res.status(400).json({ error: "This appointment is closed." });
  appt.vitals = parsed.data;
  await appt.save();
  res.json({ appointment: appt });
});

/* ---------- The doctor's notes, prescription and lab orders ---------- */

const text = (max) => z.string().trim().max(max).optional().default("");
const consultSchema = z.object({
  vitals: vitalsSchema.optional(),
  consult: z.object({
    complaints: text(2000),
    findings: text(2000),
    diagnosis: text(500),
    advice: text(2000),
    followUpDate: z.string().optional().default("").refine((d) => !d || isValidDateStr(d), "Pick a valid follow-up date."),
  }),
  prescription: z
    .array(z.object({ medicine: z.string().trim().min(1).max(120), dose: text(40), frequency: text(40), duration: text(40), instructions: text(120) }))
    .max(30),
  labTestCodes: z.array(z.string().trim().max(40)).max(40).default([]),
  complete: z.boolean().default(false),
});

hmsAppointmentsRouter.put("/:id/consultation", async (req, res) => {
  if (!["doctor", "owner"].includes(req.user.role)) {
    return res.status(403).json({ error: "Only the doctor can write the consultation." });
  }
  const parsed = consultSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue.message, field: issue.path.join(".") });
  }
  const v = parsed.data;
  const appt = await loadAppt(req, res);
  if (!appt) return;
  if (!["checked_in", "in_consultation", "completed"].includes(appt.status)) {
    return res.status(400).json({ error: "Check the patient in before starting the consultation." });
  }

  const codes = [...new Set(v.labTestCodes)];
  const tests = codes.length ? await Test.find({ lab: req.labId, code: { $in: codes }, active: true }).lean() : [];
  if (tests.length !== codes.length) return res.status(400).json({ error: "Some lab tests are no longer offered. Refresh and try again." });

  if (v.vitals) appt.vitals = v.vitals;
  appt.consult = v.consult;
  appt.prescription = v.prescription;

  const already = new Set(appt.labOrders.map((o) => o.code));
  const added = tests.filter((t) => !already.has(t.code));
  appt.labOrders = [...appt.labOrders, ...added.map((t) => ({ code: t.code, name: t.name }))];

  // New lab orders land in the lab's own queue as a confirmed booking for today.
  if (added.length) {
    const patient = await Patient.findOne({ _id: appt.patient, lab: req.labId }).lean();
    const items = added.map((t) => ({ kind: "test", code: t.code, name: t.name, price: t.price }));
    const doctor = await Doctor.findById(appt.doctor).select("name").lean();
    const note = `Ordered by ${doctor?.name || "doctor"} during OPD visit ${appt.reference}.`;
    if (appt.labBooking) {
      const booking = await Booking.findOne({ _id: appt.labBooking, lab: req.labId });
      if (booking) {
        booking.items.push(...items);
        booking.estimatedTotal = booking.items.every((i) => i.price != null) ? booking.items.reduce((s, i) => s + i.price, 0) : null;
        await booking.save();
      }
    } else {
      const booking = await Booking.create({
        lab: req.labId,
        reference: makeReference(req.lab.slug),
        patient: { name: patient.name, age: patient.age, gender: patient.gender, phone: patient.phone, email: patient.email },
        patientRecord: patient._id,
        appointment: appt._id,
        visitType: "lab",
        items,
        notes: note,
        estimatedTotal: items.every((i) => i.price != null) ? items.reduce((s, i) => s + i.price, 0) : null,
        currency: req.lab.currency,
        date: todayInZone(req.lab.timezone),
        status: "confirmed",
        statusLog: [{ status: "confirmed", by: req.user.email }],
        source: "walkin",
        consent: true,
      });
      appt.labBooking = booking._id;
    }
  }

  if (appt.status === "checked_in") {
    appt.status = "in_consultation";
    appt.statusLog.push({ status: "in_consultation", by: req.user.email });
  }
  if (v.complete && appt.status === "in_consultation") {
    appt.status = "completed";
    appt.statusLog.push({ status: "completed", by: req.user.email });
  }
  await appt.save();
  res.json({ appointment: appt });
});
