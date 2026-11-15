import mongoose from "mongoose";

export const APPOINTMENT_STATUSES = [
  "booked",
  "checked_in",
  "in_consultation",
  "completed",
  "cancelled",
  "no_show",
];

const rxSchema = new mongoose.Schema(
  {
    medicine: { type: String, required: true, trim: true },
    dose: { type: String, default: "", trim: true },          // "500 mg"
    frequency: { type: String, default: "", trim: true },     // "1-0-1"
    duration: { type: String, default: "", trim: true },      // "5 days"
    instructions: { type: String, default: "", trim: true },  // "After food"
  },
  { _id: false }
);

const appointmentSchema = new mongoose.Schema(
  {
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
    reference: { type: String, required: true, unique: true },

    date: { type: String, required: true },     // YYYY-MM-DD, hospital's zone
    time: { type: String, default: "" },        // "09:15"; empty for a walk-in
    token: { type: Number, required: true },    // queue number for that doctor on that date

    // Whether this appointment occupies its time. Cancelling frees it; walk-ins never hold one.
    holdsTime: { type: Boolean, default: false },

    type: { type: String, enum: ["new", "follow_up"], default: "new" },
    source: { type: String, enum: ["desk", "web", "phone"], default: "desk" },
    reason: { type: String, default: "", trim: true },

    // Set once the day-before WhatsApp reminder has gone out, so it is never sent twice.
    reminderSent: { type: Boolean, default: false },

    status: { type: String, enum: APPOINTMENT_STATUSES, default: "booked", index: true },
    statusLog: {
      type: [
        {
          status: { type: String, enum: APPOINTMENT_STATUSES },
          at: { type: Date, default: Date.now },
          by: { type: String, default: "system" },
          _id: false,
        },
      ],
      default: [],
    },

    fee: { type: Number, default: 0 },
    payment: {
      status: { type: String, enum: ["unpaid", "paid", "waived"], default: "unpaid" },
      method: { type: String, enum: ["", "cash", "upi", "card"], default: "" },
      amount: { type: Number, default: 0 },
      paidOn: { type: String, default: "" },
    },
    // The bill this visit's fee is on. Set once billed, so it is never billed twice.
    bill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
    // The pharmacy bill the prescription was dispensed on, if it was.
    pharmacyBill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },

    vitals: {
      bp: { type: String, default: "" },
      pulse: { type: String, default: "" },
      temperature: { type: String, default: "" },
      spo2: { type: String, default: "" },
      weight: { type: String, default: "" },
      height: { type: String, default: "" },
    },

    consult: {
      complaints: { type: String, default: "" },
      findings: { type: String, default: "" },
      diagnosis: { type: String, default: "" },
      advice: { type: String, default: "" },
      followUpDate: { type: String, default: "" },
    },
    prescription: { type: [rxSchema], default: [] },

    labOrders: { type: [{ code: String, name: String, _id: false }], default: [] },
    labBooking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
  },
  { timestamps: true }
);

appointmentSchema.index({ lab: 1, date: 1, doctor: 1 });
appointmentSchema.index({ lab: 1, patient: 1, date: -1 });
appointmentSchema.index({ lab: 1, doctor: 1, date: 1, token: 1 }, { unique: true });

// The database itself refuses a second booking for the same doctor at the same time.
appointmentSchema.index(
  { lab: 1, doctor: 1, date: 1, time: 1 },
  { unique: true, partialFilterExpression: { holdsTime: true } }
);

export const Appointment = mongoose.model("Appointment", appointmentSchema);
