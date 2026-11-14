import { Appointment } from "../models/Appointment.js";
import { nextSeq } from "../models/Counter.js";
import { makeReference } from "./reference.js";

const DUPLICATE_KEY = 11000;

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

export const isValidTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""));

export function worksOn(doctor, date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return doctor.days.includes(weekday);
}

/** Every bookable start time in the doctor's sessions, e.g. 09:00, 09:15, … */
export function doctorTimes(doctor) {
  const step = doctor.slotMinutes || 15;
  const times = [];
  for (const s of doctor.sessions || []) {
    for (let t = toMinutes(s.start); t + step <= toMinutes(s.end); t += step) times.push(toHHMM(t));
  }
  return times;
}

/** Times on a date with whether each is free. Past times today come back as taken. */
export async function availability(lab, doctor, date, { today, nowMinutes } = {}) {
  if (!worksOn(doctor, date)) return { open: false, times: [] };
  const taken = await Appointment.find({ lab, doctor: doctor._id, date, holdsTime: true }).select("time").lean();
  const busy = new Set(taken.map((a) => a.time));
  const times = doctorTimes(doctor).map((time) => ({
    time,
    free: !busy.has(time) && !(date === today && toMinutes(time) <= nowMinutes),
  }));
  return { open: true, times };
}

export function minutesNowInZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour").value) % 24;
  const m = Number(parts.find((p) => p.type === "minute").value);
  return h * 60 + m;
}

/**
 * Creates the appointment with the next token for that doctor and day. A
 * clash on the time index means somebody took that time a moment earlier.
 */
export async function createAppointment(lab, fields) {
  const token = await nextSeq(`${lab._id}:token:${fields.doctor}:${fields.date}`);
  try {
    const appt = await Appointment.create({
      ...fields,
      lab: lab._id,
      token,
      reference: makeReference(lab.slug, 6),
      holdsTime: Boolean(fields.time),
      statusLog: [{ status: "booked", by: fields.source || "desk" }],
    });
    return { appt };
  } catch (err) {
    if (err?.code === DUPLICATE_KEY && err.keyPattern?.time) return { taken: true };
    throw err;
  }
}

/** Who may move an appointment from one status to the next. */
export const TRANSITIONS = {
  booked: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_consultation", "cancelled", "no_show"],
  in_consultation: ["completed"],
  completed: [],
  cancelled: ["booked"],
  no_show: ["booked"],
};

export const FREES_TIME = ["cancelled", "no_show"];
