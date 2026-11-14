/**
 * Making bills and keeping the visits and lab bookings on them in step.
 *
 * A visit's fee or a lab booking can sit on one live bill only. Each is
 * claimed with a conditional update (bill must still be empty), so two
 * receptionists billing the same patient at the same moment cannot both win.
 */
import mongoose from "mongoose";
import { Bill } from "../models/Bill.js";
import { Appointment } from "../models/Appointment.js";
import { Booking } from "../models/Booking.js";
import { nextSeq } from "../models/Counter.js";
import { todayInZone } from "../lib/dates.js";
import { billTotals, billStatus, paidSoFar, invoiceYear, formatInvoiceNumber, round2 } from "../lib/invoice.js";
import { returnStock } from "./pharmacy.js";

export class BillError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function nextInvoiceNumber(lab, date) {
  const year = invoiceYear(date, lab.country);
  const seq = await nextSeq(`${lab._id}:invoice:${year}`);
  return formatInvoiceNumber(lab.slug, year, seq);
}

/** Puts the bill's state back onto the visits and lab bookings it covers. */
export async function syncLinks(bill) {
  const apptIds = bill.items.filter((i) => i.appointment).map((i) => i.appointment);
  const bookingIds = bill.items.filter((i) => i.booking).map((i) => i.booking);

  if (bill.status === "cancelled") {
    await Promise.all([
      apptIds.length && Appointment.updateMany(
        { lab: bill.lab, _id: { $in: apptIds }, bill: bill._id },
        { $set: { bill: null, payment: { status: "unpaid", method: "", amount: 0, paidOn: "" } } }
      ),
      bookingIds.length && Booking.updateMany({ lab: bill.lab, _id: { $in: bookingIds }, bill: bill._id }, { $set: { bill: null } }),
    ]);
    return;
  }

  if (!apptIds.length) return;
  const last = [...bill.payments].reverse().find((p) => p.kind === "payment");
  for (const item of bill.items.filter((i) => i.appointment)) {
    let payment = { status: "unpaid", method: "", amount: 0, paidOn: "" };
    if (bill.status === "paid") {
      payment = bill.paid > 0
        ? { status: "paid", method: ["cash", "upi", "card"].includes(last?.method) ? last.method : "", amount: item.amount, paidOn: last?.date || bill.date }
        : { status: "waived", method: "", amount: 0, paidOn: "" };
    }
    await Appointment.updateOne({ lab: bill.lab, _id: item.appointment, bill: bill._id }, { $set: { payment } });
  }
}

/**
 * Creates a bill.
 *
 * items: [{ kind, name, qty, rate, discount, taxPct, appointment?, booking?, service? }]
 * payment: { amount, method, ref } or null
 */
export async function createBill(lab, { patient, items, payment, notes = "", by }) {
  if (!items.length) throw new BillError("Add at least one item to the bill.");
  const billId = new mongoose.Types.ObjectId();
  const date = todayInZone(lab.timezone);
  const claimedAppts = [];
  const claimedBookings = [];

  const release = () => Promise.all([
    claimedAppts.length && Appointment.updateMany({ _id: { $in: claimedAppts }, bill: billId }, { $set: { bill: null } }),
    claimedBookings.length && Booking.updateMany({ _id: { $in: claimedBookings }, bill: billId }, { $set: { bill: null } }),
  ]);

  // One visit can appear once; one lab booking can spread over several test lines.
  const apptIds = items.filter((i) => i.appointment).map((i) => String(i.appointment));
  if (new Set(apptIds).size !== apptIds.length) throw new BillError("The same consultation is on the bill twice.");
  const bookingIds = [...new Set(items.filter((i) => i.booking).map((i) => String(i.booking)))];

  try {
    for (const id of apptIds) {
      const r = await Appointment.updateOne(
        { _id: id, lab: lab._id, patient: patient._id, bill: null, "payment.status": "unpaid", status: { $nin: ["cancelled", "no_show"] } },
        { $set: { bill: billId } }
      );
      if (!r.modifiedCount) throw new BillError("A consultation on this bill has already been billed or paid. Refresh and try again.", 409);
      claimedAppts.push(id);
    }
    for (const id of bookingIds) {
      const r = await Booking.updateOne(
        {
          _id: id, lab: lab._id, bill: null, status: { $nin: ["cancelled", "no_show"] },
          $or: [{ patientRecord: patient._id }, { "patient.phone": patient.phone }],
        },
        { $set: { bill: billId } }
      );
      if (!r.modifiedCount) throw new BillError("A lab booking on this bill has already been billed. Refresh and try again.", 409);
      claimedBookings.push(id);
    }

    const totals = billTotals(items);
    const payments = [];
    if (payment && payment.amount > 0) {
      if (round2(payment.amount) > totals.total) throw new BillError(`The payment is more than the bill total.`);
      payments.push({ kind: "payment", method: payment.method, amount: round2(payment.amount), ref: payment.ref || "", date, by });
    }
    const paid = paidSoFar(payments);

    const bill = await Bill.create({
      _id: billId,
      lab: lab._id,
      number: await nextInvoiceNumber(lab, date),
      date,
      patient: patient._id,
      ...totals,
      paid,
      due: round2(totals.total - paid),
      payments,
      status: billStatus(totals.total, paid),
      notes,
      createdBy: by,
    });
    await syncLinks(bill);
    return bill;
  } catch (err) {
    await release();
    throw err;
  }
}

export async function addPayment(lab, bill, { amount, method, ref = "", by }) {
  if (bill.status === "cancelled") throw new BillError("This bill is cancelled.");
  const amt = round2(amount);
  if (amt <= 0) throw new BillError("Enter the amount received.");
  if (amt > bill.due) throw new BillError(`Only ${bill.due} is due on this bill.`);
  bill.payments.push({ kind: "payment", method, amount: amt, ref, date: todayInZone(lab.timezone), by });
  bill.paid = paidSoFar(bill.payments);
  bill.due = round2(bill.total - bill.paid);
  bill.status = billStatus(bill.total, bill.paid);
  await bill.save();
  await syncLinks(bill);
  return bill;
}

/** Cancels a bill. Money already taken is recorded as refunded the same day. */
export async function cancelBill(lab, bill, { reason, refundMethod, by }) {
  if (bill.status === "cancelled") throw new BillError("This bill is already cancelled.");
  if (bill.paid > 0) {
    bill.payments.push({ kind: "refund", method: refundMethod || "cash", amount: bill.paid, date: todayInZone(lab.timezone), by });
  }
  bill.paid = paidSoFar(bill.payments);
  bill.due = 0;
  bill.status = "cancelled";
  bill.cancelled = { at: new Date(), by, reason };
  await bill.save();
  await syncLinks(bill);
  await returnStock(lab, bill, by);
  return bill;
}
