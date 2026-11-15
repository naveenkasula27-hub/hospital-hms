/**
 * Tests that need no database.
 *
 *   node --test test/
 *
 * These cover the parts most likely to break quietly: phone numbers from
 * different countries, dates across time zones, and the test catalog.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { normalisePhone, looksLikeMobile, callingCode, maskPhone } from "../src/lib/phone.js";
import { todayInZone, dateInZone, addDays, isValidDateStr, prettyDate } from "../src/lib/dates.js";
import { makeReference } from "../src/lib/reference.js";
import {
  lineTotals, billTotals, paidSoFar, billStatus, invoiceYear, formatInvoiceNumber, round2, isExpired, expiresWithin, pickBatches,
} from "../src/lib/invoice.js";
import { matchMedicine, suggestQty } from "../src/services/pharmacy.js";
import { CATALOG, PACKAGE_TEMPLATES, CATEGORY_ORDER } from "../src/seed/catalog.js";

test("phone — Indian numbers", () => {
  assert.equal(normalisePhone("9949070916", "IN"), "919949070916");
  assert.equal(normalisePhone("09949070916", "IN"), "919949070916");
  assert.equal(normalisePhone("99490-70916", "IN"), "919949070916");
  assert.equal(normalisePhone("99490 70916", "IN"), "919949070916");
  assert.equal(normalisePhone("+91 99490 70916", "IN"), "919949070916");
  assert.equal(normalisePhone("919949070916", "IN"), "919949070916");
});

test("phone — a 10-digit Indian mobile starting with 91 is still local", () => {
  assert.equal(normalisePhone("9123456780", "IN"), "919123456780");
  assert.equal(normalisePhone("919123456780", "IN"), "919123456780");
  assert.equal(normalisePhone("+91 91234 56780", "IN"), "919123456780");
});

test("phone — rejects nonsense", () => {
  assert.equal(normalisePhone("", "IN"), null);
  assert.equal(normalisePhone("abc", "IN"), null);
  assert.equal(normalisePhone("12345", "IN"), null);
  assert.equal(normalisePhone(null, "IN"), null);
});

test("phone — Indian mobile rule", () => {
  assert.ok(looksLikeMobile("919949070916", "IN"));
  assert.ok(looksLikeMobile("916000000000", "IN"));
  // Landlines and old series are not mobiles.
  assert.ok(!looksLikeMobile("914023456789", "IN"));
  assert.ok(!looksLikeMobile("915949070916", "IN"));
  assert.ok(!looksLikeMobile("91994907091", "IN"));   // one digit short
  assert.ok(!looksLikeMobile("9199490709166", "IN")); // one too many
});

test("phone — other countries pass through", () => {
  assert.equal(normalisePhone("+971 50 123 4567", "AE"), "971501234567");
  assert.equal(normalisePhone("501234567", "AE"), "971501234567");
  assert.equal(normalisePhone("4155551234", "US"), "14155551234");
  assert.equal(normalisePhone("+44 7700 900123", "GB"), "447700900123");
  assert.ok(looksLikeMobile("14155551234", "US"));
  assert.ok(looksLikeMobile("971501234567", "AE"));
  assert.equal(callingCode("AE"), "971");
  assert.equal(callingCode("IN"), "91");
});

test("phone — unknown country does not crash", () => {
  const out = normalisePhone("12345678901", "ZZ");
  assert.equal(typeof out, "string");
  assert.equal(callingCode("ZZ"), "");
});

test("phone — masking hides the middle", () => {
  assert.equal(maskPhone("919949070916"), "919******916");
  assert.equal(maskPhone("123"), "");
});

test("dates — today is a valid date string", () => {
  assert.match(todayInZone("Asia/Kolkata"), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(todayInZone("America/New_York"), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(todayInZone("Not/AZone"), /^\d{4}-\d{2}-\d{2}$/); // falls back, no throw
});

test("dates — the time zone actually matters", () => {
  // 20:00 UTC on the 14th is already the 15th in India, still the 14th in New York.
  const instant = new Date("2026-10-14T20:00:00Z");
  assert.equal(dateInZone(instant, "Asia/Kolkata"), "2026-10-15");
  assert.equal(dateInZone(instant, "America/New_York"), "2026-10-14");
});

test("dates — adding days rolls over correctly", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // leap year
  assert.equal(addDays("2026-02-28", 1), "2026-03-01"); // not a leap year
  assert.equal(addDays("2026-10-15", 30), "2026-11-14");
});

test("dates — validation", () => {
  assert.ok(isValidDateStr("2026-10-15"));
  assert.ok(!isValidDateStr("2026-02-30"));
  assert.ok(!isValidDateStr("2026-13-01"));
  assert.ok(!isValidDateStr("2026-00-10"));
  assert.ok(!isValidDateStr("15-10-2026"));
  assert.ok(!isValidDateStr(""));
  assert.ok(!isValidDateStr(null));
});

test("dates — pretty printing per locale", () => {
  assert.match(prettyDate("2026-10-15", "en-IN", "Asia/Kolkata"), /15/);
  assert.match(prettyDate("2026-10-15", "en-IN", "Asia/Kolkata"), /Oct/);
  assert.equal(prettyDate("garbage"), "garbage");
});

test("reference — shape and uniqueness", () => {
  const r = makeReference("nandu");
  assert.match(r, /^NAN-[2-9A-HJ-NP-Z]{5}$/);
  assert.match(makeReference("x"), /^X-/);
  assert.match(makeReference(""), /^LAB-/);

  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(makeReference("nandu"));
  // 31^5 is about 28.6 million, so 5000 draws should almost never collide.
  assert.ok(seen.size > 4990, `too many collisions: ${5000 - seen.size}`);
});

test("reference — no letters that get misheard", () => {
  const joined = Array.from({ length: 400 }, () => makeReference("nandu").split("-")[1]).join("");
  for (const bad of ["0", "O", "1", "I", "L"]) {
    assert.ok(!joined.includes(bad), `reference contains ${bad}, which is easy to mishear`);
  }
});

test("invoice — a line takes the discount off before tax", () => {
  assert.deepEqual(lineTotals({ qty: 2, rate: 500, discount: 100, taxPct: 18 }), {
    gross: 1000, discount: 100, taxable: 900, tax: 162, amount: 1062,
  });
  // A discount bigger than the line cannot push it below zero.
  assert.equal(lineTotals({ qty: 1, rate: 200, discount: 500 }).amount, 0);
  assert.equal(lineTotals({ qty: 1, rate: 200, discount: -50 }).amount, 200);
});

test("invoice — totals add the rounded lines, so the paper adds up", () => {
  const t = billTotals([
    { qty: 1, rate: 333.33, taxPct: 5 },
    { qty: 3, rate: 0.1 },
    { qty: 1, rate: 500, discount: 50 },
  ]);
  assert.equal(t.subtotal, 833.63);
  assert.equal(t.discount, 50);
  assert.equal(t.tax, 16.67);
  assert.equal(t.total, round2(t.items.reduce((s, l) => s + l.amount, 0)));
  assert.equal(t.total, 800.3);
});

test("invoice — payments, refunds and status", () => {
  assert.equal(paidSoFar([{ amount: 300 }, { amount: 200 }, { kind: "refund", amount: 100 }]), 400);
  assert.equal(billStatus(1000, 0), "unpaid");
  assert.equal(billStatus(1000, 400), "partial");
  assert.equal(billStatus(1000, 1000), "paid");
  assert.equal(billStatus(0, 0), "paid");           // fully discounted
  assert.equal(billStatus(1000, 1000, true), "cancelled");
});

test("invoice — numbering follows India's April-to-March year", () => {
  assert.equal(invoiceYear("2026-11-14", "IN"), "26-27");
  assert.equal(invoiceYear("2027-03-31", "IN"), "26-27");
  assert.equal(invoiceYear("2027-04-01", "IN"), "27-28");
  assert.equal(invoiceYear("2026-11-14", "AE"), "2026");
  assert.equal(formatInvoiceNumber("np", "26-27", 42), "NP/26-27/00042");
  assert.equal(formatInvoiceNumber("", "2026", 1), "INV/2026/00001");
});

test("invoice — MRP already includes GST, so the patient pays the MRP", () => {
  const l = lineTotals({ qty: 10, rate: 2.2, taxPct: 12, taxInclusive: true });
  assert.equal(l.amount, 22);
  assert.equal(l.taxable, 19.64);
  assert.equal(l.tax, 2.36);
  const d = lineTotals({ qty: 10, rate: 2.2, discount: 2.2, taxPct: 12, taxInclusive: true });
  assert.equal(d.amount, 19.8);
  assert.equal(round2(d.taxable + d.tax), 19.8);
});

test("pharmacy — expiry is good to the end of the month", () => {
  assert.ok(!isExpired("2026-11", "2026-11-30"));
  assert.ok(isExpired("2026-10", "2026-11-01"));
  assert.ok(expiresWithin("2027-02", "2026-11-14", 3));
  assert.ok(!expiresWithin("2027-03", "2026-11-14", 3));
  assert.ok(!expiresWithin("2026-10", "2026-11-14", 3));   // already expired, not "expiring"
});

test("pharmacy — first expiry first out, skipping expired and empty batches", () => {
  const batches = [
    { batchNo: "LATE", expiry: "2028-01", qty: 100 },
    { batchNo: "OLD", expiry: "2026-09", qty: 50 },     // expired
    { batchNo: "SOON", expiry: "2027-01", qty: 8 },
    { batchNo: "EMPTY", expiry: "2026-12", qty: 0 },
  ];
  const picks = pickBatches(batches, 20, "2026-11-14");
  assert.deepEqual(picks.map((p) => [p.batch.batchNo, p.qty]), [["SOON", 8], ["LATE", 12]]);
  assert.equal(pickBatches(batches, 109, "2026-11-14"), null);   // only 108 usable
});

test("pharmacy — reading the doctor's prescription", () => {
  const stock = [
    { name: "Paracetamol 500 mg", generic: "Paracetamol", inStock: 10 },
    { name: "Paracetamol 650 mg", generic: "Paracetamol", inStock: 600 },
    { name: "Amoxicillin 500 mg", generic: "Amoxicillin", inStock: 0 },
  ];
  assert.equal(matchMedicine("Paracetamol 650 mg", stock).name, "Paracetamol 650 mg");
  assert.equal(matchMedicine("PARACETAMOL 650MG tab", stock).name, "Paracetamol 650 mg");
  assert.equal(matchMedicine("Amoxicillin 500 mg", stock).name, "Amoxicillin 500 mg");
  assert.equal(matchMedicine("Dolo", stock), null);
  assert.equal(suggestQty("1-0-1", "5 days", "Tablet"), 10);
  assert.equal(suggestQty("1-1-1", "1 week", "Capsule"), 21);
  assert.equal(suggestQty("1-0-1", "5 days", "Syrup"), 1);
  assert.equal(suggestQty("As needed", "3 days", "Tablet"), 1);
});

test("catalog — no duplicate test codes", () => {
  const codes = CATALOG.map((t) => t.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("catalog — every entry is complete", () => {
  for (const t of CATALOG) {
    assert.ok(t.code && /^[a-z0-9_]+$/.test(t.code), `bad code: ${t.code}`);
    assert.ok(t.name && t.name.length > 2, `bad name: ${t.code}`);
    assert.ok(t.category, `no category: ${t.code}`);
    assert.ok(
      ["Blood", "Urine", "Stool", "Swab", "Sputum", "Scan", "Other"].includes(t.sample),
      `bad sample type on ${t.code}: ${t.sample}`
    );
  }
});

test("catalog — package test codes all exist", () => {
  const codes = new Set(CATALOG.map((t) => t.code));
  for (const p of PACKAGE_TEMPLATES) {
    assert.ok(p.testCodes.length > 0, `empty package: ${p.code}`);
    for (const c of p.testCodes) {
      assert.ok(codes.has(c), `package ${p.code} points at missing test ${c}`);
    }
  }
});

test("catalog — no duplicate package codes", () => {
  const codes = PACKAGE_TEMPLATES.map((p) => p.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("catalog — every category is in the display order", () => {
  for (const t of CATALOG) {
    assert.ok(CATEGORY_ORDER.includes(t.category), `category missing from order list: ${t.category}`);
  }
});

test("catalog — scans and ECG are not offered for home collection", () => {
  for (const code of ["xray_chest", "usg_abdomen", "ecg", "echo", "tmt"]) {
    const t = CATALOG.find((x) => x.code === code);
    assert.ok(t, `missing ${code}`);
    assert.equal(t.homeCollectable, false, `${code} should not be home collectable`);
  }
});

test("catalog — no prices are shipped", () => {
  for (const t of CATALOG) {
    assert.ok(!("price" in t), `${t.code} ships a price; labs must set their own`);
  }
});
