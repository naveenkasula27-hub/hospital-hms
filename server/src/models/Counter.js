import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model("Counter", counterSchema);

/** Atomically hands out 1, 2, 3… per key, so two receptionists never get the same number. */
export async function nextSeq(key) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const row = await Counter.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      return row.seq;
    } catch (err) {
      // Two first-ever upserts on the same key: the loser retries as a plain increment.
      if (err?.code !== 11000 || attempt === 1) throw err;
    }
  }
}
