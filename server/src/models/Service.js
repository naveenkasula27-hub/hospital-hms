import mongoose from "mongoose";

/**
 * The hospital's own price list for things that are not a consultation or a
 * lab test: dressings, injections, procedures, bed charges. Reception picks
 * from it when making a bill.
 */
const serviceSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["procedure", "room", "other"], default: "procedure" },
    price: { type: Number, default: 0, min: 0 },
    taxPct: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ lab: 1, name: 1 }, { unique: true });

export const Service = mongoose.model("Service", serviceSchema);
