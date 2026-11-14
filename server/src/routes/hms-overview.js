import mongoose from "mongoose";
import { createRouter } from "../lib/router.js";
import { allowRoles, requireHospital } from "../middleware/auth.js";
import { Appointment } from "../models/Appointment.js";
import { Patient } from "../models/Patient.js";
import { Doctor } from "../models/Doctor.js";
import { Booking } from "../models/Booking.js";
import { Bill } from "../models/Bill.js";
import { todayInZone, addDays } from "../lib/dates.js";

export const hmsOverviewRouter = createRouter();
hmsOverviewRouter.use(allowRoles("owner", "reception"), requireHospital);

hmsOverviewRouter.get("/", async (req, res) => {
  const lab = new mongoose.Types.ObjectId(req.labId);
  const today = todayInZone(req.lab.timezone);
  const weekStart = addDays(today, -6);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

  const [byStatus, week, newPatients, totalPatients, collected, labToday, labPending, doctors, perDoctor, queue, dues] =
    await Promise.all([
      Appointment.aggregate([{ $match: { lab, date: today } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
      Appointment.aggregate([
        { $match: { lab, date: { $gte: weekStart, $lte: today }, status: { $nin: ["cancelled"] } } },
        { $group: { _id: "$date", n: { $sum: 1 } } },
      ]),
      Patient.countDocuments({ lab, registeredOn: today }),
      Patient.countDocuments({ lab }),
      // Everything taken at the counter today, net of refunds: fees, lab, charges.
      Bill.aggregate([
        { $match: { lab, "payments.date": today } },
        { $unwind: "$payments" },
        { $match: { "payments.date": today } },
        { $group: {
          _id: null,
          total: { $sum: { $cond: [{ $eq: ["$payments.kind", "refund"] }, { $multiply: ["$payments.amount", -1] }, "$payments.amount"] } },
        } },
      ]),
      Booking.countDocuments({ lab, date: today, status: { $nin: ["cancelled", "no_show"] } }),
      Booking.countDocuments({ lab, status: { $in: ["confirmed", "sample_collected"] } }),
      Doctor.find({ lab, active: true, days: weekday }).select("name specialty room").sort({ name: 1 }).lean(),
      Appointment.aggregate([
        { $match: { lab, date: today } },
        { $group: { _id: { doctor: "$doctor", status: "$status" }, n: { $sum: 1 } } },
      ]),
      Appointment.find({ lab, date: today, status: { $in: ["booked", "checked_in", "in_consultation"] } })
        .sort({ token: 1 })
        .limit(8)
        .populate("patient", "name uhid")
        .populate("doctor", "name")
        .select("token time status patient doctor type")
        .lean(),
      Bill.aggregate([
        { $match: { lab, status: { $in: ["unpaid", "partial"] } } },
        { $group: { _id: null, due: { $sum: "$due" }, count: { $sum: 1 } } },
      ]),
    ]);

  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekMap = Object.fromEntries(week.map((w) => [w._id, w.n]));

  const doctorStats = {};
  for (const row of perDoctor) {
    const id = String(row._id.doctor);
    doctorStats[id] ??= { waiting: 0, done: 0, total: 0 };
    if (["booked", "checked_in", "in_consultation"].includes(row._id.status)) doctorStats[id].waiting += row.n;
    if (row._id.status === "completed") doctorStats[id].done += row.n;
    if (!["cancelled"].includes(row._id.status)) doctorStats[id].total += row.n;
  }

  res.json({
    today,
    appointments: {
      total: Object.entries(counts).filter(([s]) => s !== "cancelled").reduce((a, [, n]) => a + n, 0),
      waiting: (counts.booked || 0) + (counts.checked_in || 0),
      inConsultation: counts.in_consultation || 0,
      completed: counts.completed || 0,
      noShow: counts.no_show || 0,
    },
    patients: { newToday: newPatients, total: totalPatients },
    collectedToday: Math.round((collected[0]?.total || 0) * 100) / 100,
    dues: { amount: Math.round((dues[0]?.due || 0) * 100) / 100, bills: dues[0]?.count || 0 },
    lab: { today: labToday, pending: labPending },
    week: days.map((d) => ({ date: d, count: weekMap[d] || 0 })),
    doctors: doctors.map((d) => ({ ...d, ...(doctorStats[String(d._id)] || { waiting: 0, done: 0, total: 0 }) })),
    queue,
  });
});
