import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    start: { type: String, required: true },   // "09:00"
    end: { type: String, required: true },     // "13:00"
  },
  { _id: false }
);

const doctorSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    name: { type: String, required: true, trim: true },
    specialty: { type: String, required: true, trim: true },
    qualification: { type: String, default: "", trim: true },
    regNo: { type: String, default: "", trim: true },
    phone: { type: String, default: "" },
    room: { type: String, default: "", trim: true },

    consultFee: { type: Number, default: 0, min: 0 },
    followUpFee: { type: Number, default: 0, min: 0 },

    days: { type: [Number], default: [1, 2, 3, 4, 5, 6] },   // 0 = Sunday
    sessions: { type: [sessionSchema], default: () => [{ start: "09:00", end: "13:00" }] },
    slotMinutes: { type: Number, default: 15, min: 5, max: 120 },

    onlineBooking: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

doctorSchema.index({ lab: 1, user: 1 });

export const Doctor = mongoose.model("Doctor", doctorSchema);
