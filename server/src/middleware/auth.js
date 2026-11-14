import { verifyToken } from "../lib/jwt.js";
import { Lab } from "../models/Lab.js";
import { User } from "../models/User.js";
import { Doctor } from "../models/Doctor.js";

/**
 * Reads the "Authorization: Bearer <token>" header, checks it, and loads the
 * user. Puts req.user (the Mongoose doc) and req.labId (string, or null for
 * an admin) on the request. Every dashboard route needs this before it runs.
 */
export async function requireAuth(req, res, next) {
  if (req.user) return next();

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in." });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }

  const user = await User.findById(payload.sub).lean();
  if (!user || !user.active || (payload.version || 0) !== (user.sessionVersion || 0)) {
    return res.status(401).json({ error: "This account is no longer active." });
  }

  req.user = user;
  req.labId = user.lab ? String(user.lab) : null;
  next();
}

/**
 * Must run after requireAuth. Blocks anyone without a lab attached — an
 * "admin" user with no lab should use separate admin routes, not these.
 */
export async function requireLab(req, res, next) {
  if (!req.labId) return res.status(403).json({ error: "This account is not attached to a lab." });
  const lab = await Lab.findById(req.labId).lean();
  if (!lab || !lab.active) return res.status(403).json({ error: "This lab account is not active." });
  req.lab = lab;
  next();
}

/** Only these roles get past. Runs requireAuth itself, so it can sit in front of any router. */
export function allowRoles(...roles) {
  return (req, res, next) =>
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Your account does not have access to this section." });
      }
      next();
    }).catch(next);
}

/**
 * Hospital-only routes. Also loads the Doctor row for a doctor login, so
 * routes can limit a doctor to their own patients without trusting the browser.
 */
export async function requireHospital(req, res, next) {
  if (!req.labId) return res.status(403).json({ error: "This account is not attached to a hospital." });
  const lab = await Lab.findById(req.labId).lean();
  if (!lab || !lab.active) return res.status(403).json({ error: "This hospital account is not active." });
  if (lab.kind !== "hospital") return res.status(403).json({ error: "Hospital modules are not enabled for this account." });
  req.lab = lab;

  if (req.user.role === "doctor") {
    const doctor = await Doctor.findOne({ lab: lab._id, user: req.user._id, active: true }).lean();
    if (!doctor) return res.status(403).json({ error: "This login is not linked to a doctor profile yet." });
    req.doctor = doctor;
  }
  next();
}
