/**
 * Pharmacy stock: the medicine list, batches on the shelf, every movement in
 * and out, and purchase entries from suppliers.
 *
 * Quantities are in the unit the pharmacy sells (one tablet, one bottle).
 * Prices are per that unit. MRP in India already includes GST.
 */
import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const MEDICINE_FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Injection", "Drops", "Ointment", "Cream", "Gel", "Inhaler", "Sachet", "Other"];

const medicineSchema = new mongoose.Schema(
  {
    lab: { type: ObjectId, ref: "Lab", required: true, index: true },
    name: { type: String, required: true, trim: true },          // "Paracetamol 650 mg"
    generic: { type: String, default: "", trim: true },          // "Paracetamol"
    form: { type: String, enum: MEDICINE_FORMS, default: "Tablet" },
    unit: { type: String, default: "tablet", trim: true },       // what one quantity means
    manufacturer: { type: String, default: "", trim: true },
    hsn: { type: String, default: "3004", trim: true },
    gstPct: { type: Number, default: 12, min: 0, max: 28 },
    reorderLevel: { type: Number, default: 20, min: 0 },          // warn at or below this many units
    rxRequired: { type: Boolean, default: true },                 // Schedule H and similar
    rack: { type: String, default: "", trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
medicineSchema.index({ lab: 1, name: 1 }, { unique: true });

const batchSchema = new mongoose.Schema(
  {
    lab: { type: ObjectId, ref: "Lab", required: true, index: true },
    medicine: { type: ObjectId, ref: "Medicine", required: true },
    batchNo: { type: String, required: true, trim: true, uppercase: true },
    expiry: { type: String, required: true },          // "2027-03": usable to the end of that month
    qty: { type: Number, default: 0, min: 0 },         // units on the shelf now
    purchaseRate: { type: Number, default: 0, min: 0 }, // cost per unit, before GST
    mrp: { type: Number, default: 0, min: 0 },          // selling price per unit, GST included
    supplier: { type: String, default: "", trim: true },
    receivedOn: { type: String, default: "" },
  },
  { timestamps: true }
);
batchSchema.index({ lab: 1, medicine: 1, batchNo: 1 }, { unique: true });
batchSchema.index({ lab: 1, medicine: 1, expiry: 1 });

export const MOVE_TYPES = ["purchase", "sale", "return", "adjust"];

/** The stock ledger. Nothing changes a batch's quantity without a row here. */
const moveSchema = new mongoose.Schema(
  {
    lab: { type: ObjectId, ref: "Lab", required: true, index: true },
    medicine: { type: ObjectId, ref: "Medicine", required: true },
    batch: { type: ObjectId, ref: "StockBatch", required: true },
    type: { type: String, enum: MOVE_TYPES, required: true },
    qty: { type: Number, required: true },              // + in, − out
    date: { type: String, required: true },
    bill: { type: ObjectId, ref: "Bill", default: null },
    purchase: { type: ObjectId, ref: "Purchase", default: null },
    note: { type: String, default: "" },
    by: { type: String, default: "" },
  },
  { timestamps: true }
);
moveSchema.index({ lab: 1, medicine: 1, createdAt: -1 });
moveSchema.index({ lab: 1, type: 1, date: 1 });

const purchaseLineSchema = new mongoose.Schema(
  {
    medicine: { type: ObjectId, ref: "Medicine", required: true },
    name: { type: String, required: true },
    batch: { type: ObjectId, ref: "StockBatch" },
    batchNo: { type: String, required: true },
    expiry: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    freeQty: { type: Number, default: 0, min: 0 },
    purchaseRate: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    gstPct: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0 },                // qty × rate + GST
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    lab: { type: ObjectId, ref: "Lab", required: true, index: true },
    supplier: { type: String, required: true, trim: true },
    invoiceNo: { type: String, default: "", trim: true },
    date: { type: String, required: true },
    items: { type: [purchaseLineSchema], default: [] },
    total: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    by: { type: String, default: "" },
  },
  { timestamps: true }
);
purchaseSchema.index({ lab: 1, date: -1 });

export const Medicine = mongoose.model("Medicine", medicineSchema);
export const StockBatch = mongoose.model("StockBatch", batchSchema);
export const StockMove = mongoose.model("StockMove", moveSchema);
export const Purchase = mongoose.model("Purchase", purchaseSchema);
