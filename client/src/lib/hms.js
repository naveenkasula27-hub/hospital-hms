import { request } from "./dash.js";

const qs = (params = {}) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v !== undefined && v !== null)).toString();

export const getOverview = () => request("/hms/overview");

export const listPatients = (params) => request(`/hms/patients?${qs(params)}`);
export const getPatient = (id) => request(`/hms/patients/${id}`);
export const createPatient = (body) => request("/hms/patients", { method: "POST", body });
export const updatePatient = (id, body) => request(`/hms/patients/${id}`, { method: "PATCH", body });

export const listDoctors = () => request("/hms/doctors");
export const saveDoctor = (id, body) =>
  id ? request(`/hms/doctors/${id}`, { method: "PUT", body }) : request("/hms/doctors", { method: "POST", body });

export const listAppointments = (params) => request(`/hms/appointments?${qs(params)}`);
export const getAppointment = (id) => request(`/hms/appointments/${id}`);
export const getSlots = (doctor, date) => request(`/hms/appointments/slots?${qs({ doctor, date })}`);
export const createAppointment = (body) => request("/hms/appointments", { method: "POST", body });
export const setAppointmentStatus = (id, status) =>
  request(`/hms/appointments/${id}/status`, { method: "PATCH", body: { status } });
export const setPayment = (id, status, method = "") =>
  request(`/hms/appointments/${id}/payment`, { method: "PATCH", body: { status, method } });
export const saveVitals = (id, vitals) => request(`/hms/appointments/${id}/vitals`, { method: "PATCH", body: vitals });
export const saveConsultation = (id, body) =>
  request(`/hms/appointments/${id}/consultation`, { method: "PUT", body });

export const getLabTests = () => request("/dashboard/catalog/tests");

export const listBills = (params) => request(`/hms/billing?${qs(params)}`);
export const getBill = (id) => request(`/hms/billing/${id}`);
export const getUnbilled = (patient) => request(`/hms/billing/unbilled?${qs({ patient })}`);
export const createBill = (body) => request("/hms/billing", { method: "POST", body });
export const addBillPayment = (id, body) => request(`/hms/billing/${id}/payments`, { method: "POST", body });
export const cancelBill = (id, body) => request(`/hms/billing/${id}/cancel`, { method: "POST", body });
export const listServices = () => request("/hms/billing/services");
export const saveService = (id, body) =>
  id ? request(`/hms/billing/services/${id}`, { method: "PUT", body }) : request("/hms/billing/services", { method: "POST", body });
export const getInvoiceSettings = () => request("/hms/billing/settings");
export const saveInvoiceSettings = (body) => request("/hms/billing/settings", { method: "PUT", body });

export const getPharmacySummary = () => request("/hms/pharmacy/summary");
export const getStock = (params) => request(`/hms/pharmacy/stock?${qs(params)}`);
export const getFormulary = () => request("/hms/pharmacy/formulary");
export const getMedicine = (id) => request(`/hms/pharmacy/medicines/${id}`);
export const saveMedicine = (id, body) =>
  id ? request(`/hms/pharmacy/medicines/${id}`, { method: "PUT", body }) : request("/hms/pharmacy/medicines", { method: "POST", body });
export const adjustBatch = (id, body) => request(`/hms/pharmacy/batches/${id}/adjust`, { method: "POST", body });
export const listPurchases = () => request("/hms/pharmacy/purchases");
export const createPurchase = (body) => request("/hms/pharmacy/purchases", { method: "POST", body });
export const getPrescriptions = (patient) => request(`/hms/pharmacy/prescriptions?${qs({ patient })}`);
export const createSale = (body) => request("/hms/pharmacy/sales", { method: "POST", body });
export const listSales = (date) => request(`/hms/pharmacy/sales?${qs({ date })}`);

export const listInsurers = () => request("/hms/insurance/insurers");
export const saveInsurer = (id, body) =>
  id ? request(`/hms/insurance/insurers/${id}`, { method: "PUT", body }) : request("/hms/insurance/insurers", { method: "POST", body });
export const listPolicies = (params) => request(`/hms/insurance/policies?${qs(params)}`);
export const createPolicy = (body) => request("/hms/insurance/policies", { method: "POST", body });
export const updatePolicy = (id, body) => request(`/hms/insurance/policies/${id}`, { method: "PUT", body });
export const deletePolicy = (id) => request(`/hms/insurance/policies/${id}`, { method: "DELETE" });
export const listClaims = (params) => request(`/hms/insurance/claims?${qs(params)}`);
export const getClaim = (id) => request(`/hms/insurance/claims/${id}`);
export const createClaim = (body) => request("/hms/insurance/claims", { method: "POST", body });
export const updateClaim = (id, body) => request(`/hms/insurance/claims/${id}`, { method: "PATCH", body });
export const deleteClaim = (id) => request(`/hms/insurance/claims/${id}`, { method: "DELETE" });

export const listWards = () => request("/hms/ipd/wards");
export const saveWard = (id, body) =>
  id ? request(`/hms/ipd/wards/${id}`, { method: "PUT", body }) : request("/hms/ipd/wards", { method: "POST", body });
export const listBeds = (params) => request(`/hms/ipd/beds?${qs(params)}`);
export const getBedMap = () => request("/hms/ipd/beds/map");
export const saveBed = (body) => request("/hms/ipd/beds", { method: "POST", body });
export const bulkBeds = (body) => request("/hms/ipd/beds/bulk", { method: "POST", body });
export const updateBed = (id, body) => request(`/hms/ipd/beds/${id}`, { method: "PUT", body });
export const listAdmissions = (params) => request(`/hms/ipd/admissions?${qs(params)}`);
export const getAdmission = (id) => request(`/hms/ipd/admissions/${id}`);
export const createAdmission = (body) => request("/hms/ipd/admissions", { method: "POST", body });
export const updateAdmission = (id, body) => request(`/hms/ipd/admissions/${id}`, { method: "PATCH", body });
export const dischargeAdmission = (id, body) => request(`/hms/ipd/admissions/${id}/discharge`, { method: "POST", body });

export const WARD_TYPE = { general: "General", semi_private: "Semi-private", private: "Private", icu: "ICU", nicu: "NICU", hdu: "HDU" };
export const BED_STATUS = { available: "Available", occupied: "Occupied", maintenance: "Maintenance" };
export const ADMISSION_STATUS = { admitted: "Admitted", discharged: "Discharged" };

export const CLAIM_STATUS = {
  draft: "Draft", submitted: "Submitted", query: "Query raised", approved: "Approved", rejected: "Rejected", settled: "Settled",
};
export const INSURER_TYPE = { insurance: "Insurance", tpa: "TPA" };

export const MEDICINE_FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Injection", "Drops", "Ointment", "Cream", "Gel", "Inhaler", "Sachet", "Other"];
export const STOCK_STATUS = { ok: "In stock", low: "Low", out: "Out of stock" };

/** "2027-03" -> "Mar 2027" */
export function prettyExpiry(ym) {
  if (!ym) return "–";
  const [y, m] = ym.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}

export const BILL_STATUS ={ unpaid: "Unpaid", partial: "Part paid", paid: "Paid", cancelled: "Cancelled" };
export const PAY_METHOD = { cash: "Cash", upi: "UPI", card: "Card", bank: "Bank transfer", insurance: "Insurance", other: "Other" };
export const ITEM_KIND = {
  consultation: "Consultation", lab: "Lab", procedure: "Procedure", room: "Room", pharmacy: "Pharmacy", other: "Other",
};

/** Same arithmetic as the server (server/src/lib/invoice.js), so the screen shows what will be saved. */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export function lineTotals({ qty = 1, rate = 0, discount = 0, taxPct = 0, taxInclusive = false }) {
  const gross = round2((Number(qty) || 0) * (Number(rate) || 0));
  const disc = round2(Math.min(Math.max(0, Number(discount) || 0), gross));
  if (taxInclusive) {
    const amount = round2(gross - disc);
    const taxable = round2((amount * 100) / (100 + (Number(taxPct) || 0)));
    return { gross, discount: disc, taxable, tax: round2(amount - taxable), amount };
  }
  const taxable = round2(gross - disc);
  const tax = round2((taxable * (Number(taxPct) || 0)) / 100);
  return { gross, discount: disc, taxable, tax, amount: round2(taxable + tax) };
}

/** GST added on top of prices, and GST already inside MRPs, kept apart so the totals read right. */
export function taxSplit(bill) {
  const sum = (inc) => round2(bill.items.filter((i) => Boolean(i.taxInclusive) === inc).reduce((s, i) => s + (i.tax || 0), 0));
  return { added: sum(false), included: sum(true) };
}

/** Money with paise when there are any: ₹1,250 or ₹1,250.50. */
export function money2(amount, lab) {
  if (amount === null || amount === undefined) return "";
  const whole = Math.round(amount * 100) % 100 === 0;
  try {
    return new Intl.NumberFormat(lab?.locale || "en-IN", {
      style: "currency", currency: lab?.currency || "INR",
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", rest].filter(Boolean).join(" ");
}

/** Indian style: 125050.5 -> "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only". */
export function rupeesInWords(amount) {
  const total = Math.round(Math.abs(amount) * 100);
  let n = Math.floor(total / 100);
  const paise = total % 100;
  if (n === 0 && paise === 0) return "Rupees Zero Only";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${under1000(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (n) parts.push(under1000(n));
  const rupees = parts.length ? `Rupees ${parts.join(" ")}` : "Rupees Zero";
  return `${rupees}${paise ? ` and ${under1000(paise)} Paise` : ""} Only`;
}

export const STATUS = {
  booked: "Booked",
  checked_in: "Waiting",
  in_consultation: "With doctor",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const ROLE_LABEL = { owner: "Administrator", reception: "Reception", doctor: "Doctor", staff: "Lab staff", pharmacist: "Pharmacist" };

/** "2026-11-14" + n days, without time zone surprises. */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const DAY_SHORT =["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function initials(name = "") {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** "+91 98480 00000" from stored digits, for Indian numbers. */
export function prettyPhone(digits = "") {
  if (/^91\d{10}$/.test(digits)) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return digits ? `+${digits}` : "";
}

export function time12(hhmm) {
  if (!hhmm) return "Walk-in";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
