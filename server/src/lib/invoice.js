/**
 * Patient bill arithmetic and invoice numbers. Pure functions, so they are
 * unit tested without a database.
 *
 * Every line is rounded to two decimals on its own and totals add the rounded
 * lines, so the printed invoice always adds up to the last paisa.
 */

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * One line: qty × rate, less its discount, plus tax on what is left.
 * The discount comes off before tax, which is how GST expects it.
 *
 * With taxInclusive (medicines at MRP), the rate already holds the tax: the
 * patient pays qty × rate less discount, and the tax is worked out of that.
 */
export function lineTotals({ qty = 1, rate = 0, discount = 0, taxPct = 0, taxInclusive = false }) {
  const gross = round2(qty * rate);
  const disc = round2(Math.min(Math.max(0, discount), gross));
  if (taxInclusive) {
    const amount = round2(gross - disc);
    const taxable = round2((amount * 100) / (100 + taxPct));
    return { gross, discount: disc, taxable, tax: round2(amount - taxable), amount };
  }
  const taxable = round2(gross - disc);
  const tax = round2((taxable * taxPct) / 100);
  return { gross, discount: disc, taxable, tax, amount: round2(taxable + tax) };
}

/** Expiry is "YYYY-MM" and good to the end of that month. */
export function isExpired(expiry, today) {
  return expiry < today.slice(0, 7);
}

/** True when the batch expires within `months` months of today (and has not already). */
export function expiresWithin(expiry, today, months) {
  const [y, m] = today.split("-").map(Number);
  const t = y * 12 + (m - 1) + months;
  const limit = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  return !isExpired(expiry, today) && expiry <= limit;
}

/**
 * First expiry, first out: which batches to take `qty` units from.
 * Skips expired and empty batches. Returns null when there is not enough.
 */
export function pickBatches(batches, qty, today) {
  const usable = batches
    .filter((b) => b.qty > 0 && !isExpired(b.expiry, today))
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || String(a.batchNo).localeCompare(String(b.batchNo)));
  const picks = [];
  let left = qty;
  for (const b of usable) {
    if (left <= 0) break;
    const take = Math.min(b.qty, left);
    picks.push({ batch: b, qty: take });
    left -= take;
  }
  return left > 0 ? null : picks;
}

/** Totals for a whole bill, with each line's figures filled in. */
export function billTotals(items) {
  const lines = items.map((i) => ({ ...i, ...lineTotals(i) }));
  const sum = (k) => round2(lines.reduce((s, l) => s + l[k], 0));
  return { items: lines, subtotal: sum("gross"), discount: sum("discount"), tax: sum("tax"), total: sum("amount") };
}

/** What has come in, net of refunds. */
export function paidSoFar(payments = []) {
  return round2(payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0));
}

export function billStatus(total, paid, cancelled = false) {
  if (cancelled) return "cancelled";
  if (total <= 0 || paid >= total) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

/**
 * The accounting year an invoice belongs to. India numbers invoices per
 * financial year (April to March), so 2026-11-14 falls in "26-27". Other
 * countries use the calendar year.
 */
export function invoiceYear(dateStr, country = "IN") {
  const [y, m] = dateStr.split("-").map(Number);
  if (String(country).toUpperCase() !== "IN") return String(y);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export function invoicePrefix(slug = "") {
  return slug.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "INV";
}

/** "SUN/26-27/00042" */
export function formatInvoiceNumber(slug, year, seq) {
  return `${invoicePrefix(slug)}/${year}/${String(seq).padStart(5, "0")}`;
}
