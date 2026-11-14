import mongoose from "mongoose";

/** One person, registered once. Every visit, prescription and lab booking points back here. */
const patientSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    uhid: { type: String, required: true },

    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },          // digits only, international
    age: { type: Number, required: true, min: 0, max: 130 },
    gender: { type: String, enum: ["Male", "Female", "Other"], required: true },
    email: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    bloodGroup: { type: String, default: "" },

    allergies: { type: String, default: "", trim: true },
    conditions: { type: String, default: "", trim: true },   // diabetes, BP, etc.

    emergencyName: { type: String, default: "", trim: true },
    emergencyPhone: { type: String, default: "" },
    abhaId: { type: String, default: "", trim: true },

    registeredOn: { type: String, required: true },   // YYYY-MM-DD in the hospital's zone
    source: { type: String, enum: ["desk", "web"], default: "desk" },
  },
  { timestamps: true }
);

patientSchema.index({ lab: 1, uhid: 1 }, { unique: true });
patientSchema.index({ lab: 1, phone: 1 });
patientSchema.index({ lab: 1, registeredOn: 1 });

export const Patient = mongoose.model("Patient", patientSchema);
