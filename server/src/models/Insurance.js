import mongoose from "mongoose";

export const CLAIM_STATUSES = ["draft", "submitted", "query", "approved", "rejected", "settled"];

const insurerSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["insurance", "tpa"], default: "insurance" },
    contact: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
insurerSchema.index({ lab: 1, name: 1 }, { unique: true });

export const Insurer = mongoose.model("Insurer", insurerSchema);

const policySchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    insurer: { type: mongoose.Schema.Types.ObjectId, ref: "Insurer", required: true },
    policyNumber: { type: String, required: true, trim: true },
    memberId: { type: String, default: "", trim: true },
    validFrom: { type: String, default: "" },
    validTo: { type: String, default: "" },
    sumInsured: { type: Number, default: 0 },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);
policySchema.index({ lab: 1, patient: 1 });

export const Policy = mongoose.model("Policy", policySchema);

const claimSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    bill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    policy: { type: mongoose.Schema.Types.ObjectId, ref: "Policy", required: true },
    insurer: { type: mongoose.Schema.Types.ObjectId, ref: "Insurer", required: true },

    claimNumber: { type: String, default: "", trim: true },
    claimedAmount: { type: Number, required: true, min: 0 },
    approvedAmount: { type: Number, default: 0, min: 0 },
    patientShare: { type: Number, default: 0, min: 0 },
    settledAmount: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: CLAIM_STATUSES, default: "draft", index: true },
    diagnosis: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },

    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    settledAt: { type: Date, default: null },
    settledRef: { type: String, default: "", trim: true },

    log: [
      {
        status: { type: String, enum: CLAIM_STATUSES },
        note: { type: String, default: "" },
        by: { type: String, default: "" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);
claimSchema.index({ lab: 1, bill: 1 });
claimSchema.index({ lab: 1, patient: 1 });
claimSchema.index({ lab: 1, status: 1 });

export const Claim = mongoose.model("Claim", claimSchema);
