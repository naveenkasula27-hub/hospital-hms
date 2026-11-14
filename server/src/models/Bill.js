import mongoose from "mongoose";

export const BILL_STATUSES = ["unpaid", "partial", "paid", "cancelled"];
export const ITEM_KINDS = ["consultation", "lab", "procedure", "room", "pharmacy", "other"];
export const PAY_METHODS = ["cash", "upi", "card", "bank", "insurance", "other"];

const itemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ITEM_KINDS, default: "other" },
    name: { type: String, required: true, trim: true },   // copied in, so a later rename leaves old bills alone
    qty: { type: Number, default: 1, min: 0 },
    rate: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    taxPct: { type: Number, default: 0, min: 0 },
    // Medicines sell at MRP, which already includes GST; the tax is worked out of the price.
    taxInclusive: { type: Boolean, default: false },
    hsn: { type: String, default: "" },
    gross: { type: Number, default: 0 },
    taxable: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    // Where the line came from, so the same visit or lab booking is never billed twice.
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", default: null },
    // Pharmacy lines: which batch the units came out of, so a cancelled bill puts them back.
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", default: null },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "StockBatch", default: null },
    batchNo: { type: String, default: "" },
    expiry: { type: String, default: "" },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["payment", "refund"], default: "payment" },
    method: { type: String, enum: PAY_METHODS, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    ref: { type: String, default: "", trim: true },   // UPI transaction id, card slip number
    date: { type: String, required: true },           // hospital's local date, for the day's takings
    at: { type: Date, default: Date.now },
    by: { type: String, default: "" },
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    number: { type: String, required: true },        // "SUN/26-27/00042"
    date: { type: String, required: true },          // YYYY-MM-DD, hospital's zone
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },

    items: { type: [itemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    due: { type: Number, default: 0 },

    payments: { type: [paymentSchema], default: [] },
    status: { type: String, enum: BILL_STATUSES, default: "unpaid", index: true },
    notes: { type: String, default: "", trim: true },

    createdBy: { type: String, default: "" },
    cancelled: {
      at: { type: Date, default: null },
      by: { type: String, default: "" },
      reason: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

billSchema.index({ lab: 1, number: 1 }, { unique: true });
billSchema.index({ lab: 1, date: -1 });
billSchema.index({ lab: 1, patient: 1, date: -1 });
billSchema.index({ lab: 1, "payments.date": 1 });

export const Bill = mongoose.model("Bill", billSchema);
