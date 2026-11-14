/**
 * Login for the lab dashboard.
 *
 * There is no public sign-up yet: labs and their owner accounts are created by
 * the seed script. That comes in a later stage.
 */
import { createRouter } from "../lib/router.js";
import { sharedLimit } from "../middleware/rate-limit.js";
import { z } from "zod";
import { User } from "../models/User.js";
import { Lab } from "../models/Lab.js";
import { Doctor } from "../models/Doctor.js";
import { signToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { billingStatus } from "../lib/billing.js";

export const authRouter = createRouter();

// Password guessing protection. Counted per IP, not per email, so someone
// cannot lock a real owner out of their own account by guessing at it.
const loginLimiter = sharedLimit("login", 20, 15 * 60 * 1000, "Too many login attempts. Please wait a few minutes.");

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(128),
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  const user = await User.findOne({ email });

  // Same message whether the email is unknown or the password is wrong, so
  // this cannot be used to find out which emails exist.
  const WRONG = { error: "Email or password is not correct." };

  if (!user || !user.active) return res.status(401).json(WRONG);
  if (!(await user.checkPassword(password))) return res.status(401).json(WRONG);

  const lab = user.lab ? await Lab.findById(user.lab).lean() : null;
  if (user.lab && (!lab || !lab.active)) {
    return res.status(403).json({ error: "This lab account is not active." });
  }

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  res.json({ token: signToken(user), ...(await sessionInfo(user, lab)) });
});

async function sessionInfo(user, lab) {
  const doctor = user.role === "doctor" && lab
    ? await Doctor.findOne({ lab: lab._id, user: user._id }).select("name specialty").lean()
    : null;
  return {
    user: { name: user.name, email: user.email, role: user.role, doctor },
    lab: lab
      ? {
          name: lab.name, slug: lab.slug, kind: lab.kind || "lab", currency: lab.currency, locale: lab.locale,
          timezone: lab.timezone, phone: lab.phone, address: lab.address, city: lab.city, billing: billingStatus(lab),
        }
      : null,
  };
}

/** Lets the dashboard check on load whether a stored token is still good. */
authRouter.get("/me", requireAuth, async (req, res) => {
  const lab = req.labId ? await Lab.findById(req.labId).lean() : null;
  res.json(await sessionInfo(req.user, lab));
});

const passwordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128).refine(v => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes.") });
authRouter.post("/password", requireAuth, sharedLimit("password", 10, 15 * 60 * 1000, "Too many password attempts. Try again later."), async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your current password and a new password of at least 12 characters and at most 72 UTF-8 bytes." });
  const user = await User.findById(req.user._id);
  if (!(await user.checkPassword(parsed.data.currentPassword))) return res.status(400).json({ error: "Your current password is incorrect." });
  const hash = await User.hashPassword(parsed.data.newPassword);
  const updated = await User.findOneAndUpdate(
    { _id: user._id, passwordHash: user.passwordHash },
    { $set: { passwordHash: hash }, $inc: { sessionVersion: 1 } }, { new: true });
  if (!updated) return res.status(409).json({ error: "The password changed in another session. Please sign in again." });
  res.json({ token: signToken(updated) });
});
