/**
 * A demo hospital with doctors, patients, a week of OPD visits and the lab catalog.
 *
 *   npm run seed:hospital
 *
 * Re-running wipes and rebuilds the demo hospital's patients, visits and lab bookings.
 * The logins below are for local demos only. Change them before anything goes online.
 */
import { connectDb, disconnectDb } from "../db.js";
import { Lab } from "../models/Lab.js";
import { Test } from "../models/Test.js";
import { Package } from "../models/Package.js";
import { Booking } from "../models/Booking.js";
import { User } from "../models/User.js";
import { Doctor } from "../models/Doctor.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";
import { Counter, nextSeq } from "../models/Counter.js";
import { Bill } from "../models/Bill.js";
import { Service } from "../models/Service.js";
import { Medicine, StockBatch, StockMove, Purchase } from "../models/Pharmacy.js";
import { Insurer, Policy, Claim } from "../models/Insurance.js";
import { Ward, Bed, Admission } from "../models/Inpatient.js";
import { receiveStock, sellMedicines, matchMedicine, suggestQty } from "../services/pharmacy.js";
import { billTotals, billStatus, paidSoFar, invoiceYear, formatInvoiceNumber } from "../lib/invoice.js";
import { CATALOG, PACKAGE_TEMPLATES } from "./catalog.js";
import { DEMO_PRICES, DEMO_PACKAGE_PRICES } from "./prices.js";
import { makeUhid } from "../routes/hms-patients.js";
import { createAppointment, doctorTimes, worksOn } from "../lib/opd.js";
import { makeReference } from "../lib/reference.js";
import { todayInZone, addDays } from "../lib/dates.js";

const HOSPITAL = {
  name: "Sunrise Multispeciality Hospital",
  slug: "sunrise",
  kind: "hospital",
  isDemo: true,
  tagline: "OPD, diagnostics and pharmacy under one roof",
  phone: "040 4000 1234",
  whatsapp: "",
  address: "Plot 12, Main Road, Siddipet, Telangana",
  city: "Siddipet",
  theme: { primary: "#0f766e", accent: "#0ea5e9", cta: "" },
  invoice: { legalName: "", gstin: "", footer: "Thank you for choosing Sunrise. Keep this invoice for your records." },
};

export const DEMO_LOGINS = [
  { role: "owner", name: "Ravi Teja", email: "owner@sunrise.test", password: "sunrise-owner-2026" },
  { role: "reception", name: "Front Desk", email: "reception@sunrise.test", password: "sunrise-desk-2026" },
  { role: "staff", name: "Lab Technician", email: "lab@sunrise.test", password: "sunrise-lab-2026" },
  { role: "pharmacist", name: "Pharmacy Counter", email: "pharmacy@sunrise.test", password: "sunrise-pharmacy-2026" },
];

// [name, generic, form, unit, gst%, cost per unit, MRP per unit, reorder at, rack, units in stock]
const MEDICINES = [
  ["Paracetamol 650 mg", "Paracetamol", "Tablet", "tablet", 12, 1.1, 2.2, 100, "A1", 600],
  ["Paracetamol 500 mg", "Paracetamol", "Tablet", "tablet", 12, 0.8, 1.5, 100, "A1", 400],
  ["Cetirizine 10 mg", "Cetirizine", "Tablet", "tablet", 12, 0.9, 2, 60, "A2", 300],
  ["Amoxicillin 500 mg", "Amoxicillin", "Capsule", "capsule", 12, 4.2, 8.5, 60, "B1", 240],
  ["Azithromycin 500 mg", "Azithromycin", "Tablet", "tablet", 12, 11, 23.5, 30, "B1", 90],
  ["Metformin 500 mg", "Metformin", "Tablet", "tablet", 12, 1.2, 2.6, 120, "C1", 900],
  ["Glimepiride 2 mg", "Glimepiride", "Tablet", "tablet", 12, 3.1, 6.8, 60, "C1", 40],
  ["Amlodipine 5 mg", "Amlodipine", "Tablet", "tablet", 12, 1.4, 3.2, 90, "C2", 450],
  ["Telmisartan 40 mg", "Telmisartan", "Tablet", "tablet", 12, 3.6, 7.9, 60, "C2", 0],
  ["Atorvastatin 10 mg", "Atorvastatin", "Tablet", "tablet", 12, 3.2, 6.9, 60, "C3", 210],
  ["Aceclofenac 100 mg", "Aceclofenac", "Tablet", "tablet", 12, 2.4, 5.4, 60, "D1", 180],
  ["Pantoprazole 40 mg", "Pantoprazole", "Tablet", "tablet", 12, 2.8, 6.4, 90, "D2", 360],
  ["Ondansetron 4 mg", "Ondansetron", "Tablet", "tablet", 12, 2.1, 4.8, 30, "D2", 25],
  ["Vitamin D3 60000 IU", "Cholecalciferol", "Capsule", "capsule", 12, 14, 29, 20, "E1", 64],
  ["Calcium + Vitamin D3", "Calcium carbonate", "Tablet", "tablet", 12, 3, 6.5, 60, "E1", 300],
  ["ORS sachet", "Oral rehydration salts", "Sachet", "sachet", 12, 9, 21, 40, "F1", 120],
  ["Cough syrup 100 ml", "Dextromethorphan", "Syrup", "bottle", 12, 52, 110, 15, "F2", 18],
  ["Paracetamol suspension 60 ml", "Paracetamol", "Suspension", "bottle", 12, 18, 38, 15, "F2", 30],
  ["Betadine ointment 15 g", "Povidone iodine", "Ointment", "tube", 12, 48, 98, 10, "G1", 22],
  ["Diclofenac gel 30 g", "Diclofenac", "Gel", "tube", 12, 58, 125, 10, "G1", 6],
  ["Salbutamol inhaler", "Salbutamol", "Inhaler", "inhaler", 12, 98, 175, 5, "G2", 9],
  ["Insulin glargine 3 ml pen", "Insulin glargine", "Injection", "pen", 5, 480, 760, 5, "Fridge", 7],
  ["Ceftriaxone 1 g injection", "Ceftriaxone", "Injection", "vial", 12, 28, 62, 20, "H1", 45],
  ["Eye drops (lubricant) 10 ml", "Carboxymethylcellulose", "Drops", "bottle", 12, 75, 155, 8, "G2", 14],
];

const DOCTORS = [
  { name: "Dr. Ananya Rao", specialty: "General Medicine", qualification: "MBBS, MD (Medicine)", regNo: "TSMC 41822", room: "OPD 1", consultFee: 500, followUpFee: 300, days: [1, 2, 3, 4, 5, 6], sessions: [{ start: "09:00", end: "13:00" }, { start: "17:00", end: "20:00" }], login: { email: "dr.ananya@sunrise.test", password: "sunrise-doctor-2026" } },
  { name: "Dr. Kiran Reddy", specialty: "Paediatrics", qualification: "MBBS, DCH", regNo: "TSMC 38410", room: "OPD 2", consultFee: 400, followUpFee: 250, days: [1, 2, 3, 4, 5, 6], sessions: [{ start: "10:00", end: "14:00" }] },
  { name: "Dr. Sravani Goud", specialty: "Obstetrics & Gynaecology", qualification: "MBBS, MS (OBG)", regNo: "TSMC 45231", room: "OPD 3", consultFee: 600, followUpFee: 350, days: [1, 3, 5, 6], sessions: [{ start: "10:00", end: "13:00" }] },
  { name: "Dr. Mohammed Arif", specialty: "Orthopaedics", qualification: "MBBS, MS (Ortho)", regNo: "TSMC 39907", room: "OPD 4", consultFee: 600, followUpFee: 400, days: [2, 4, 6], sessions: [{ start: "16:00", end: "19:00" }] },
  { name: "Dr. Venkat Naidu", specialty: "Cardiology", qualification: "MBBS, MD, DM (Cardiology)", regNo: "TSMC 33018", room: "OPD 5", consultFee: 800, followUpFee: 500, days: [1, 2, 3, 4, 5], sessions: [{ start: "11:00", end: "14:00" }] },
];

const PEOPLE = [
  ["Ramesh Kumar", 46, "Male"], ["Lakshmi Devi", 38, "Female"], ["Srinivas Rao", 61, "Male"], ["Anjali Sharma", 27, "Female"],
  ["Mahesh Goud", 52, "Male"], ["Padma Reddy", 44, "Female"], ["Arjun Varma", 8, "Male"], ["Sneha Patel", 31, "Female"],
  ["Venkatesh Yadav", 57, "Male"], ["Kavitha Naik", 35, "Female"], ["Rahul Mehta", 29, "Male"], ["Swathi Chary", 24, "Female"],
  ["Narsimha Swamy", 68, "Male"], ["Divya Teja", 5, "Female"], ["Prakash Jain", 49, "Male"], ["Bhavani Shankar", 41, "Female"],
  ["Imran Khan", 36, "Male"], ["Saritha Rani", 33, "Female"], ["Gopal Krishna", 72, "Male"], ["Meghana Rao", 19, "Female"],
  ["Suresh Babu", 55, "Male"], ["Farhana Begum", 39, "Female"], ["Harish Chandra", 63, "Male"], ["Pooja Iyer", 28, "Female"],
];

const CASES = [
  { complaints: "Fever with body pains for 3 days", diagnosis: "Acute viral fever", advice: "Plenty of fluids, rest. Return if fever persists beyond 3 days.", rx: [["Paracetamol 650 mg", "1 tab", "1-1-1", "3 days", "After food"], ["ORS sachet", "1 sachet", "As needed", "3 days", "In 1 litre water"]], labs: ["cbc", "crp"] },
  { complaints: "Increased thirst and frequent urination", diagnosis: "Type 2 diabetes mellitus, uncontrolled", advice: "Diabetic diet, 30 minutes walk daily.", rx: [["Metformin 500 mg", "1 tab", "1-0-1", "30 days", "After food"]], labs: ["fbs", "ppbs", "hba1c"] },
  { complaints: "Headache and giddiness", diagnosis: "Essential hypertension", advice: "Reduce salt. Check BP weekly.", rx: [["Amlodipine 5 mg", "1 tab", "1-0-0", "30 days", "Morning"]], labs: ["lipid"] },
  { complaints: "Cough and cold for one week", diagnosis: "Upper respiratory tract infection", advice: "Steam inhalation twice daily.", rx: [["Cetirizine 10 mg", "1 tab", "0-0-1", "5 days", "At night"], ["Amoxicillin 500 mg", "1 cap", "1-1-1", "5 days", "After food"]], labs: [] },
  { complaints: "Knee pain while climbing stairs", diagnosis: "Osteoarthritis, right knee", advice: "Physiotherapy, avoid squatting.", rx: [["Aceclofenac 100 mg", "1 tab", "1-0-1", "7 days", "After food"]], labs: ["vit_d"] },
  { complaints: "Tiredness and hair fall", diagnosis: "Suspected hypothyroidism", advice: "Review with reports.", rx: [], labs: ["tsh", "cbc"] },
];

const SERVICES = [
  { name: "Registration fee", kind: "other", price: 100 },
  { name: "Dressing (small)", kind: "procedure", price: 150 },
  { name: "Dressing (large)", kind: "procedure", price: 300 },
  { name: "Injection charge", kind: "procedure", price: 50 },
  { name: "IV cannulation", kind: "procedure", price: 200 },
  { name: "Nebulisation", kind: "procedure", price: 150 },
  { name: "Suture removal", kind: "procedure", price: 200 },
  { name: "Plaster of Paris cast", kind: "procedure", price: 1200 },
  { name: "Day care bed (per 6 hours)", kind: "room", price: 800 },
  { name: "Medical certificate", kind: "other", price: 200 },
];

function pick(list, i) {
  return list[i % list.length];
}

/** Months from today as "YYYY-MM"; negative is in the past. */
function monthFrom(today, n) {
  const [y, m] = today.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/**
 * Medicines, two supplier deliveries, and a few of today's prescriptions
 * dispensed through the same code the counter uses. Some stock is low, some
 * runs out, some expires soon and one batch has already expired, so every
 * warning on the pharmacy screen has something to show.
 */
async function seedPharmacy(lab, today, patients) {
  const meds = [];
  for (const [name, generic, form, unit, gstPct, , , reorderLevel, rack] of MEDICINES) {
    meds.push(await Medicine.create({
      lab: lab._id, name, generic, form, unit, gstPct, reorderLevel, rack,
      manufacturer: pick(["Cipla", "Sun Pharma", "Dr. Reddy's", "Lupin", "Alkem", "Mankind"], meds.length),
      rxRequired: !["ORS sachet", "Betadine ointment 15 g", "Eye drops (lubricant) 10 ml", "Calcium + Vitamin D3"].includes(name),
    }));
  }

  const lines = (rows, share, expiryFor) => rows.flatMap(([, , , , gstPct, cost, mrp, , , units], i) => {
    const qty = Math.round(units * share);
    if (!qty) return [];
    return [{ medicine: meds[i]._id, batchNo: `${["SP", "CP", "DR", "LP"][i % 4]}${String(24100 + i * 37 + Math.round(share * 10))}`, expiry: expiryFor(i), qty, freeQty: 0, purchaseRate: cost, mrp, gstPct }];
  });
  const by = DEMO_LOGINS.find((l) => l.role === "pharmacist").email;

  // Older delivery: some of it expires soon, one batch is already past expiry.
  await receiveStock(lab, {
    supplier: "Sri Sai Pharma Distributors", invoiceNo: "SSP/4412", date: addDays(today, -40), notes: "", by,
    items: lines(MEDICINES, 0.4, (i) => (i === 12 ? monthFrom(today, -1) : i % 5 === 0 ? monthFrom(today, 2) : monthFrom(today, 10 + (i % 9)))),
  });
  // Recent delivery, long expiry.
  await receiveStock(lab, {
    supplier: "Telangana Medical Agencies", invoiceNo: "TMA-88213", date: addDays(today, -6), notes: "", by,
    items: lines(MEDICINES, 0.6, (i) => monthFrom(today, 14 + (i % 12))),
  });

  // Dispense today's finished prescriptions the way the counter would.
  const visits = await Appointment.find({ lab: lab._id, date: today, status: "completed", "prescription.0": { $exists: true } })
    .populate("patient").lean();
  const stock = await Medicine.find({ lab: lab._id }).lean();
  let sold = 0;
  for (const [n, v] of visits.entries()) {
    const sale = v.prescription
      .map((r) => {
        const m = matchMedicine(r.medicine, stock);
        return { m, qty: m ? suggestQty(r.frequency, r.duration, m.form) : 0 };
      })
      .filter((x) => x.m);
    if (!sale.length) continue;
    await sellMedicines(lab, {
      patient: v.patient, appointment: v._id,
      lines: sale.map((x) => ({ medicine: x.m._id, qty: x.qty, discountPct: n % 2 ? 5 : 0 })),
      payment: { full: true, method: pick(["cash", "upi"], n) }, by,
    });
    sold++;
  }
  // A walk-in buying over the counter.
  const walkIn = patients[3];
  const ors = meds.find((m) => m.name === "ORS sachet");
  const para = meds.find((m) => m.name === "Paracetamol 500 mg");
  await sellMedicines(lab, {
    patient: walkIn, appointment: null,
    lines: [{ medicine: ors._id, qty: 4, discountPct: 0 }, { medicine: para._id, qty: 10, discountPct: 0 }],
    payment: { full: true, method: "upi" }, by,
  });

  console.log(`Pharmacy: ${meds.length} medicines, 2 deliveries, ${sold + 1} sales today`);
}

/** A bill dated in the past, for the demo. The live app makes bills through services/bills.js. */
async function seedBill(lab, date, patient, items, payments) {
  const totals = billTotals(items);
  const pays = payments.map((pm) => ({ kind: "payment", method: pm.method, amount: pm.amount, date, by: "seed" }));
  const paid = paidSoFar(pays);
  const year = invoiceYear(date, lab.country);
  return Bill.create({
    lab: lab._id,
    number: formatInvoiceNumber(lab.slug, year, await nextSeq(`${lab._id}:invoice:${year}`)),
    date,
    patient: patient._id,
    ...totals,
    paid,
    due: totals.total - paid,
    payments: pays,
    status: billStatus(totals.total, paid),
    createdBy: DEMO_LOGINS[1].email,
  });
}

async function seedInsurance(lab, today, patients) {
  const insurers = await Promise.all([
    Insurer.create({ lab: lab._id, name: "Star Health Insurance", type: "insurance", contact: "Branch Manager, Siddipet", phone: "1800 102 4477", email: "claims@starhealth.in" }),
    Insurer.create({ lab: lab._id, name: "Medi Assist (TPA)", type: "tpa", contact: "Hyderabad desk", phone: "040 6620 0700", email: "preauth@mediassist.in" }),
    Insurer.create({ lab: lab._id, name: "ICICI Lombard", type: "insurance", contact: "Claims dept", phone: "1800 266 9725", email: "claims@icicilombard.com" }),
  ]);

  const policies = [];
  const policyData = [
    { patient: 0, insurer: 0, policyNumber: "SH-TEL-2026-44821", memberId: "M44821", validFrom: addDays(today, -180), validTo: addDays(today, 185), sumInsured: 500000 },
    { patient: 2, insurer: 1, policyNumber: "MA-HYD-2025-91003", memberId: "", validFrom: addDays(today, -365), validTo: addDays(today, 0), sumInsured: 300000 },
    { patient: 4, insurer: 2, policyNumber: "IL-TG-2026-72318", memberId: "F72318-01", validFrom: addDays(today, -90), validTo: addDays(today, 275), sumInsured: 1000000 },
    { patient: 7, insurer: 0, policyNumber: "SH-TEL-2026-55120", memberId: "M55120", validFrom: addDays(today, -60), validTo: addDays(today, 305), sumInsured: 500000 },
  ];
  for (const pd of policyData) {
    policies.push(await Policy.create({
      lab: lab._id, patient: patients[pd.patient]._id, insurer: insurers[pd.insurer]._id,
      policyNumber: pd.policyNumber, memberId: pd.memberId, validFrom: pd.validFrom, validTo: pd.validTo, sumInsured: pd.sumInsured,
    }));
  }

  const bills = await Bill.find({ lab: lab._id, status: { $ne: "cancelled" } }).sort({ date: -1 }).limit(50).lean();
  const claimData = [
    { patientIdx: 0, policyIdx: 0, status: "approved", approvedAmount: 400 },
    { patientIdx: 2, policyIdx: 1, status: "submitted" },
    { patientIdx: 4, policyIdx: 2, status: "settled", approvedAmount: 500, settledAmount: 500 },
  ];
  let claimsMade = 0;
  for (const cd of claimData) {
    const patientId = String(patients[cd.patientIdx]._id);
    const bill = bills.find((b) => String(b.patient) === patientId);
    if (!bill) continue;
    const policy = policies[cd.policyIdx];
    const claimed = Math.min(cd.approvedAmount || bill.total, bill.total);
    const log = [{ status: "draft", note: "Claim created", by: DEMO_LOGINS[0].email, at: new Date(bill.date + "T10:00:00Z") }];
    const claim = {
      lab: lab._id, bill: bill._id, patient: bill.patient, policy: policy._id, insurer: policy.insurer,
      claimNumber: `CLM-${today.slice(2, 4)}-${String(10000 + claimsMade * 111)}`,
      claimedAmount: claimed, patientShare: Math.max(0, bill.total - claimed), status: "draft", diagnosis: "OPD consultation and tests", log,
    };
    if (cd.status === "submitted" || cd.status === "approved" || cd.status === "settled") {
      claim.status = "submitted";
      claim.submittedAt = new Date(bill.date + "T11:00:00Z");
      log.push({ status: "submitted", note: "Submitted to insurer", by: DEMO_LOGINS[0].email, at: claim.submittedAt });
    }
    if (cd.status === "approved" || cd.status === "settled") {
      claim.status = "approved";
      claim.approvedAmount = Math.min(cd.approvedAmount, bill.total);
      claim.patientShare = Math.max(0, bill.total - cd.approvedAmount);
      claim.approvedAt = new Date(bill.date + "T14:00:00Z");
      log.push({ status: "approved", note: `Approved ₹${cd.approvedAmount}`, by: DEMO_LOGINS[0].email, at: claim.approvedAt });
    }
    if (cd.status === "settled") {
      claim.status = "settled";
      claim.settledAmount = cd.settledAmount;
      claim.settledAt = new Date();
      claim.settledRef = "UTR" + String(2026000 + claimsMade);
      log.push({ status: "settled", note: `Settled ₹${cd.settledAmount}`, by: DEMO_LOGINS[0].email, at: claim.settledAt });
    }
    await Claim.create(claim);
    claimsMade++;
  }
  console.log(`Insurance: ${insurers.length} insurers, ${policies.length} policies, ${claimsMade} claims`);
}

async function seedInpatient(lab, today, patients, doctors) {
  const wardData = [
    { name: "General Ward", floor: "Ground", type: "general", dailyRate: 800, beds: 6 },
    { name: "Semi-Private Ward", floor: "1st", type: "semi_private", dailyRate: 1800, beds: 4 },
    { name: "Private Rooms", floor: "2nd", type: "private", dailyRate: 3500, beds: 3 },
    { name: "ICU", floor: "2nd", type: "icu", dailyRate: 6000, beds: 4 },
  ];

  const wards = [];
  const beds = [];
  for (const wd of wardData) {
    const ward = await Ward.create({ lab: lab._id, name: wd.name, floor: wd.floor, type: wd.type, dailyRate: wd.dailyRate });
    wards.push(ward);
    const prefix = { general: "GW", semi_private: "SP", private: "PR", icu: "ICU" }[wd.type];
    for (let n = 1; n <= wd.beds; n++) {
      beds.push(await Bed.create({ lab: lab._id, ward: ward._id, number: `${prefix}-${String(n).padStart(2, "0")}` }));
    }
  }

  // Three current admissions and one past (discharged) stay.
  const admissionData = [
    { patient: 9, doctor: 0, bed: 0, daysAgo: 2, diagnosis: "Dengue fever, under observation", reason: "High fever with low platelet count" },
    { patient: 12, doctor: 4, bed: 7, daysAgo: 1, diagnosis: "Unstable angina", reason: "Chest pain, ECG changes" },
    { patient: 15, doctor: 3, bed: 10, daysAgo: 4, diagnosis: "Post-operative, fracture fixation", reason: "Road traffic accident, tibia fracture" },
  ];
  let made = 0;
  for (const [i, ad] of admissionData.entries()) {
    const bed = beds[ad.bed];
    const seq = await nextSeq(`ipd-${lab._id}`);
    const admission = await Admission.create({
      lab: lab._id,
      admissionNumber: `IPD-${today.slice(2, 4)}-${String(seq).padStart(5, "0")}`,
      patient: patients[ad.patient]._id,
      doctor: doctors[ad.doctor]._id,
      bed: bed._id,
      ward: bed.ward,
      admittedAt: new Date(`${addDays(today, -ad.daysAgo)}T09:00:00Z`),
      diagnosis: ad.diagnosis,
      reason: ad.reason,
      vitals: { bp: pick(["128/84", "140/90", "118/76"], i), pulse: String(78 + i * 4), temperature: pick(["99.2", "98.6", "100.1"], i), spo2: String(95 + i), weight: String(60 + i * 8) },
    });
    bed.status = "occupied";
    bed.currentAdmission = admission._id;
    await bed.save();
    made++;
  }

  // One completed stay, discharged yesterday.
  const pastBed = beds[1];
  const seq = await nextSeq(`ipd-${lab._id}`);
  await Admission.create({
    lab: lab._id,
    admissionNumber: `IPD-${today.slice(2, 4)}-${String(seq).padStart(5, "0")}`,
    patient: patients[6]._id,
    doctor: doctors[1]._id,
    bed: pastBed._id,
    ward: pastBed.ward,
    admittedAt: new Date(`${addDays(today, -4)}T08:00:00Z`),
    dischargedAt: new Date(`${addDays(today, -1)}T12:00:00Z`),
    status: "discharged",
    diagnosis: "Acute gastroenteritis with dehydration",
    reason: "Vomiting and loose stools for 2 days",
    dischargedBy: DEMO_LOGINS[0].email,
    dischargeSummary: "Rehydrated with IV fluids, symptoms resolved. Advised oral rehydration and light diet for 3 days.",
  });
  made++;

  console.log(`In-patient: ${wards.length} wards, ${beds.length} beds, ${made} admissions`);
}

async function run() {
  await connectDb();

  const lab = await Lab.findOneAndUpdate({ slug: HOSPITAL.slug }, { $set: HOSPITAL }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const today = todayInZone(lab.timezone);
  console.log(`Hospital: ${lab.name} (/${lab.slug})`);

  await Promise.all([
    Doctor.deleteMany({ lab: lab._id }),
    Patient.deleteMany({ lab: lab._id }),
    Appointment.deleteMany({ lab: lab._id }),
    Booking.deleteMany({ lab: lab._id }),
    Counter.deleteMany({ _id: { $regex: `^${lab._id}:` } }),
    User.deleteMany({ lab: lab._id }),
    Bill.deleteMany({ lab: lab._id }),
    Service.deleteMany({ lab: lab._id }),
    Medicine.deleteMany({ lab: lab._id }),
    StockBatch.deleteMany({ lab: lab._id }),
    StockMove.deleteMany({ lab: lab._id }),
    Purchase.deleteMany({ lab: lab._id }),
    Insurer.deleteMany({ lab: lab._id }),
    Policy.deleteMany({ lab: lab._id }),
    Claim.deleteMany({ lab: lab._id }),
    Ward.deleteMany({ lab: lab._id }),
    Bed.deleteMany({ lab: lab._id }),
    Admission.deleteMany({ lab: lab._id }),
  ]);

  for (const [i, t] of CATALOG.entries()) {
    await Test.findOneAndUpdate(
      { lab: lab._id, code: t.code },
      { $set: { ...t, lab: lab._id, alias: t.alias || "", fasting: t.fasting || "", reportTime: t.reportTime || "", homeCollectable: t.homeCollectable !== false, price: DEMO_PRICES[t.code] ?? null, sort: i, active: true } },
      { upsert: true }
    );
  }
  for (const [i, p] of PACKAGE_TEMPLATES.entries()) {
    await Package.findOneAndUpdate(
      { lab: lab._id, code: p.code },
      { $set: { ...p, lab: lab._id, price: DEMO_PACKAGE_PRICES[p.code] ?? null, sort: i, active: true } },
      { upsert: true }
    );
  }
  console.log(`Lab catalog: ${CATALOG.length} tests, ${PACKAGE_TEMPLATES.length} packages`);

  for (const l of DEMO_LOGINS) {
    await User.create({ lab: lab._id, name: l.name, email: l.email, role: l.role, passwordHash: await User.hashPassword(l.password) });
  }

  const doctors = [];
  for (const { login, ...d } of DOCTORS) {
    const doctor = await Doctor.create({ ...d, lab: lab._id, slotMinutes: 15 });
    if (login) {
      const user = await User.create({ lab: lab._id, name: d.name, email: login.email, role: "doctor", passwordHash: await User.hashPassword(login.password) });
      doctor.user = user._id;
      await doctor.save();
    }
    doctors.push(doctor);
  }
  console.log(`Doctors: ${doctors.length}`);

  const patients = [];
  for (const [i, [name, age, gender]] of PEOPLE.entries()) {
    patients.push(await Patient.create({
      lab: lab._id,
      uhid: await makeUhid(lab),
      name, age, gender,
      phone: `9198${String(48000000 + i * 7919).padStart(8, "0")}`,
      bloodGroup: pick(["O+", "B+", "A+", "AB+", "O-"], i),
      allergies: i % 5 === 0 ? "Penicillin" : "",
      conditions: age > 50 ? pick(["Diabetes", "Hypertension", "Diabetes, Hypertension"], i) : "",
      address: `${pick(["Siddipet", "Gajwel", "Dubbak", "Husnabad"], i)}, Telangana`,
      registeredOn: addDays(today, -(i % 7)),
    }));
  }
  console.log(`Patients: ${patients.length}`);

  const tests = Object.fromEntries((await Test.find({ lab: lab._id }).lean()).map((t) => [t.code, t]));
  let visits = 0;
  let bills = 0;
  let p = 0;

  for (const s of SERVICES) await Service.create({ ...s, lab: lab._id });
  console.log(`Hospital charges: ${SERVICES.length}`);

  for (let back = 6; back >= 0; back--) {
    const date = addDays(today, -back);
    for (const doctor of doctors) {
      if (!worksOn(doctor, date)) continue;
      const times = doctorTimes(doctor);
      const count = back === 0 ? 5 : 2 + ((back + doctor.consultFee) % 3);
      for (let k = 0; k < count && k < times.length; k++) {
        const patient = patients[p++ % patients.length];
        const c = pick(CASES, p);
        const { appt } = await createAppointment(lab, {
          patient: patient._id, doctor: doctor._id, date, time: times[k * 2] || "",
          type: k % 3 === 2 ? "follow_up" : "new", source: k % 2 ? "web" : "desk",
          reason: c.complaints,
          fee: k % 3 === 2 ? doctor.followUpFee : doctor.consultFee,
        });

        // Today: the first two are done, one is with the doctor, two are waiting.
        const status = back > 0 ? (k === count - 1 && back % 3 === 0 ? "no_show" : "completed") : ["completed", "completed", "in_consultation", "checked_in", "booked"][k];
        if (status === "no_show") appt.holdsTime = false;
        appt.status = status;
        appt.statusLog.push({ status, by: "seed" });

        if (status !== "booked" && status !== "no_show") {
          const method = pick(["cash", "upi", "card"], p);
          const bill = await seedBill(lab, date, patient, [{
            kind: "consultation",
            name: `Consultation · ${doctor.name} (${appt.type === "follow_up" ? "follow-up" : "new visit"})`,
            qty: 1, rate: appt.fee, discount: 0, taxPct: 0, appointment: appt._id,
          }], [{ method, amount: appt.fee }]);
          appt.bill = bill._id;
          appt.payment = { status: "paid", method, amount: appt.fee, paidOn: date };
          appt.vitals = { bp: pick(["120/80", "138/88", "150/94", "118/76"], p), pulse: String(72 + (p % 18)), temperature: pick(["98.4", "99.1", "100.8"], p), spo2: String(96 + (p % 4)), weight: String(45 + (p % 40)), height: "" };
        }
        if (status === "completed") {
          appt.consult = { complaints: c.complaints, findings: "", diagnosis: c.diagnosis, advice: c.advice, followUpDate: addDays(date, 14) };
          appt.prescription = c.rx.map(([medicine, dose, frequency, duration, instructions]) => ({ medicine, dose, frequency, duration, instructions }));
          const ordered = c.labs.filter((code) => tests[code]);
          if (ordered.length) {
            appt.labOrders = ordered.map((code) => ({ code, name: tests[code].name }));
            const items = ordered.map((code) => ({ kind: "test", code, name: tests[code].name, price: tests[code].price }));
            const booking = await Booking.create({
              lab: lab._id, reference: makeReference(lab.slug),
              patient: { name: patient.name, age: patient.age, gender: patient.gender, phone: patient.phone },
              patientRecord: patient._id, appointment: appt._id, visitType: "lab", items,
              notes: `Ordered by ${doctor.name} during OPD visit ${appt.reference}.`,
              estimatedTotal: items.every((i) => i.price != null) ? items.reduce((s, i) => s + i.price, 0) : null,
              date, status: back > 1 ? "completed" : back === 1 ? "report_ready" : "sample_collected",
              source: "walkin", consent: true,
            });
            appt.labBooking = booking._id;

            // Older lab work is billed and paid; yesterday's is part paid; today's waits for the desk.
            if (back >= 1) {
              const lines = items.map((i) => ({ kind: "lab", name: i.name, qty: 1, rate: i.price ?? 0, discount: 0, taxPct: 0, booking: booking._id }));
              const total = lines.reduce((s, l) => s + l.rate, 0);
              const paid = back === 1 ? Math.round(total / 2) : total;
              const bill = await seedBill(lab, date, patient, lines, paid ? [{ method: pick(["upi", "cash"], p), amount: paid }] : []);
              booking.bill = bill._id;
              await booking.save();
              bills++;
            }
          }
        }
        await appt.save();
        visits++;
      }
    }
  }
  console.log(`OPD visits: ${visits}`);
  console.log(`Bills: ${await Bill.countDocuments({ lab: lab._id })} (${bills} for lab work)`);

  await seedPharmacy(lab, today, patients);
  await seedInsurance(lab, today, patients);
  await seedInpatient(lab, today, patients, doctors);
  console.log("\nLogins (local demo only) are listed in DEMO_LOGINS and DOCTORS in src/seed/seed-hospital.js.");

  await disconnectDb();
}

run().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
