/**
 * Moving pharmacy stock: receiving from suppliers, selling to patients,
 * adjusting after a count, and putting stock back when a bill is cancelled.
 *
 * Every decrement is a conditional update (the batch must still hold enough),
 * so two counters selling the last strip at the same moment cannot both win.
 */
import { Medicine, StockBatch, StockMove, Purchase } from "../models/Pharmacy.js";
import { Appointment } from "../models/Appointment.js";
import { todayInZone } from "../lib/dates.js";
import { pickBatches, billTotals, round2 } from "../lib/invoice.js";
import { createBill, BillError } from "./bills.js";

/* ---------- Receiving stock ---------- */

export async function receiveStock(lab, { supplier, invoiceNo, date, items, notes, by }) {
  const ids = [...new Set(items.map((i) => String(i.medicine)))];
  const meds = await Medicine.find({ lab: lab._id, _id: { $in: ids } }).lean();
  if (meds.length !== ids.length) throw new BillError("A medicine on this entry no longer exists.");
  const byId = Object.fromEntries(meds.map((m) => [String(m._id), m]));
  const receivedOn = date || todayInZone(lab.timezone);

  const lines = [];
  for (const i of items) {
    const units = i.qty + (i.freeQty || 0);
    const batch = await StockBatch.findOneAndUpdate(
      { lab: lab._id, medicine: i.medicine, batchNo: i.batchNo.trim().toUpperCase() },
      {
        $inc: { qty: units },
        $set: { expiry: i.expiry, purchaseRate: i.purchaseRate, mrp: i.mrp, supplier, receivedOn },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    lines.push({
      medicine: i.medicine, name: byId[String(i.medicine)].name, batch: batch._id, batchNo: batch.batchNo,
      expiry: i.expiry, qty: i.qty, freeQty: i.freeQty || 0, purchaseRate: i.purchaseRate, mrp: i.mrp, gstPct: i.gstPct,
      amount: round2(i.qty * i.purchaseRate * (1 + i.gstPct / 100)),
    });
  }

  const purchase = await Purchase.create({
    lab: lab._id, supplier, invoiceNo, date: receivedOn, items: lines,
    total: round2(lines.reduce((s, l) => s + l.amount, 0)), notes, by,
  });
  await StockMove.insertMany(lines.map((l) => ({
    lab: lab._id, medicine: l.medicine, batch: l.batch, type: "purchase", qty: l.qty + l.freeQty,
    date: receivedOn, purchase: purchase._id, note: `${supplier}${invoiceNo ? ` · inv ${invoiceNo}` : ""}`, by,
  })));
  return purchase;
}

/* ---------- Selling ---------- */

async function giveBack(lab, taken) {
  for (const t of taken) await StockBatch.updateOne({ _id: t.batch._id, lab: lab._id }, { $inc: { qty: t.qty } });
}

/**
 * Sells medicines to a patient and makes the bill.
 * lines: [{ medicine, qty, discountPct }]
 */
export async function sellMedicines(lab, { patient, appointment, lines, payment, notes = "", by }) {
  const today = todayInZone(lab.timezone);
  const taken = [];   // what has already come off the shelf, in case we must put it back
  const items = [];

  try {
    for (const line of lines) {
      const med = await Medicine.findOne({ _id: line.medicine, lab: lab._id, active: true }).lean();
      if (!med) throw new BillError("A medicine on this sale is no longer stocked.");
      const batches = await StockBatch.find({ lab: lab._id, medicine: med._id, qty: { $gt: 0 } }).lean();
      const picks = pickBatches(batches, line.qty, today);
      if (!picks) {
        const have = batches.filter((b) => b.expiry >= today.slice(0, 7)).reduce((s, b) => s + b.qty, 0);
        throw new BillError(`Only ${have} ${med.unit}${have === 1 ? "" : "s"} of ${med.name} in stock.`, 409);
      }
      for (const pick of picks) {
        const r = await StockBatch.updateOne({ _id: pick.batch._id, lab: lab._id, qty: { $gte: pick.qty } }, { $inc: { qty: -pick.qty } });
        if (!r.modifiedCount) throw new BillError(`${med.name} was just sold at another counter. Check the stock and try again.`, 409);
        taken.push(pick);
        const gross = pick.qty * pick.batch.mrp;
        items.push({
          kind: "pharmacy", name: med.name, qty: pick.qty, rate: pick.batch.mrp,
          discount: round2((gross * (line.discountPct || 0)) / 100),
          taxPct: med.gstPct, taxInclusive: true, hsn: med.hsn,
          medicine: med._id, batch: pick.batch._id, batchNo: pick.batch.batchNo, expiry: pick.batch.expiry,
        });
      }
    }

    const pay = payment?.full ? { ...payment, amount: billTotals(items).total } : payment;
    const bill = await createBill(lab, { patient, items, payment: pay, notes, by });
    await StockMove.insertMany(items.map((i) => ({
      lab: lab._id, medicine: i.medicine, batch: i.batch, type: "sale", qty: -i.qty, date: today, bill: bill._id, note: bill.number, by,
    })));
    if (appointment) {
      await Appointment.updateOne({ _id: appointment, lab: lab._id, patient: patient._id }, { $set: { pharmacyBill: bill._id } });
    }
    return bill;
  } catch (err) {
    await giveBack(lab, taken);
    throw err;
  }
}

/** A cancelled pharmacy bill puts its units back on the shelf they came from. */
export async function returnStock(lab, bill, by) {
  const lines = bill.items.filter((i) => i.batch);
  if (!lines.length) return;
  const date = todayInZone(lab.timezone);
  for (const l of lines) await StockBatch.updateOne({ _id: l.batch, lab: lab._id }, { $inc: { qty: l.qty } });
  await StockMove.insertMany(lines.map((l) => ({
    lab: lab._id, medicine: l.medicine, batch: l.batch, type: "return", qty: l.qty, date, bill: bill._id, note: `Bill ${bill.number} cancelled`, by,
  })));
  await Appointment.updateMany({ lab: lab._id, pharmacyBill: bill._id }, { $set: { pharmacyBill: null } });
}

/* ---------- Counting ---------- */

export async function adjustStock(lab, batchId, { qty, reason, by }) {
  const filter = { _id: batchId, lab: lab._id };
  if (qty < 0) filter.qty = { $gte: -qty };
  const batch = await StockBatch.findOneAndUpdate(filter, { $inc: { qty } }, { new: true });
  if (!batch) throw new BillError("There are not that many units in this batch.", 409);
  await StockMove.create({
    lab: lab._id, medicine: batch.medicine, batch: batch._id, type: "adjust", qty, date: todayInZone(lab.timezone), note: reason, by,
  });
  return batch;
}

/* ---------- Reading a prescription ---------- */

const words = (s) => s.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

/** Finds the stocked medicine a doctor's free-text line most likely means. */
export function matchMedicine(text, medicines) {
  const t = words(text);
  if (!t) return null;
  const first = t.split(" ")[0];
  const nums = t.match(/\d+(\.\d+)?/g) || [];
  const scored = medicines.map((m) => {
    const n = words(m.name);
    let score = 0;
    if (n === t) score = 100;
    else if (t.includes(n) || n.includes(t)) score = 80;
    else if (n.split(" ")[0] === first || words(m.generic || "").split(" ")[0] === first) {
      const mNums = n.match(/\d+(\.\d+)?/g) || [];
      score = nums.length && nums.every((x) => mNums.includes(x)) ? 60 : 30;
    }
    return { m, score };
  }).filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score || (b.m.inStock || 0) - (a.m.inStock || 0));
  return scored[0]?.m || null;
}

/** "1-0-1" for "5 days" is 10 tablets. Returns 1 when it cannot tell. */
export function suggestQty(frequency = "", duration = "", form = "Tablet") {
  if (!["Tablet", "Capsule"].includes(form)) return 1;
  const perDay = /^\d(-\d){1,3}$/.test(frequency.trim()) ? frequency.split("-").reduce((s, x) => s + Number(x), 0) : 0;
  const d = duration.toLowerCase().match(/(\d+)\s*(day|week|month)/);
  if (!perDay || !d) return 1;
  const days = Number(d[1]) * (d[2] === "week" ? 7 : d[2] === "month" ? 30 : 1);
  return Math.min(perDay * days, 500);
}
