import mongoose from "mongoose";

export const WARD_TYPES = ["general", "semi_private", "private", "icu", "nicu", "hdu"];
export const BED_STATUSES = ["available", "occupied", "maintenance"];
export const ADMISSION_STATUSES = ["admitted", "discharged"];

const wardSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    name: { type: String, required: true, trim: true },
    floor: { type: String, default: "", trim: true },
    type: { type: String, enum: WARD_TYPES, default: "general" },
    dailyRate: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
wardSchema.index({ lab: 1, name: 1 }, { unique: true });

export const Ward = mongoose.model("Ward", wardSchema);

const bedSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    ward: { type: mongoose.Schema.Types.ObjectId, ref: "Ward", required: true },
    number: { type: String, required: true, trim: true },
    status: { type: String, enum: BED_STATUSES, default: "available" },
    currentAdmission: { type: mongoose.Schema.Types.ObjectId, ref: "Admission", default: null },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);
bedSchema.index({ lab: 1, ward: 1 });
bedSchema.index({ lab: 1, number: 1 }, { unique: true });

export const Bed = mongoose.model("Bed", bedSchema);

const admissionSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    admissionNumber: { type: String, required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
    bed: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", required: true },
    ward: { type: mongoose.Schema.Types.ObjectId, ref: "Ward", required: true },

    admittedAt: { type: Date, required: true },
    expectedDischarge: { type: Date, default: null },
    dischargedAt: { type: Date, default: null },

    status: { type: String, enum: ADMISSION_STATUSES, default: "admitted" },
    diagnosis: { type: String, default: "", trim: true },
    reason: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },

    vitals: {
      bp: { type: String, default: "" },
      pulse: { type: String, default: "" },
      temperature: { type: String, default: "" },
      spo2: { type: String, default: "" },
      weight: { type: String, default: "" },
    },

    dischargeSummary: { type: String, default: "", trim: true },
    dischargedBy: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);
admissionSchema.index({ lab: 1, status: 1 });
admissionSchema.index({ lab: 1, patient: 1 });
admissionSchema.index({ lab: 1, bed: 1 });

export const Admission = mongoose.model("Admission", admissionSchema);
