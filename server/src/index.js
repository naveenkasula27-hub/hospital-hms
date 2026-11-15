import express from "express";
import cors from "cors";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { connectDb, cachedConnect } from "./db.js";
import { publicRouter } from "./routes/public.js";
import { authRouter } from "./routes/auth.js";
import { dashboardBookingsRouter } from "./routes/dashboard-bookings.js";
import { dashboardCatalogRouter } from "./routes/dashboard-catalog.js";
import { reportsRouter } from "./routes/reports.js";
import { adminRouter } from "./routes/admin.js";
import { cronRouter } from "./routes/cron.js";
import { publicOpdRouter } from "./routes/public-opd.js";
import { hmsOverviewRouter } from "./routes/hms-overview.js";
import { hmsPatientsRouter } from "./routes/hms-patients.js";
import { hmsDoctorsRouter } from "./routes/hms-doctors.js";
import { hmsAppointmentsRouter } from "./routes/hms-appointments.js";
import { hmsBillingRouter } from "./routes/hms-billing.js";
import { hmsPharmacyRouter } from "./routes/hms-pharmacy.js";
import { hmsInsuranceRouter } from "./routes/hms-insurance.js";
import { hmsInpatientRouter } from "./routes/hms-inpatient.js";
import { allowRoles } from "./middleware/auth.js";

/**
 * Decides which websites may call this API.
 *
 * A request with no Origin header is allowed: that is curl, a health check, or
 * another server, none of which the browser's same-origin rules apply to.
 * Blocking those would break the health check without making anything safer.
 *
 * Vercel also gives every deployment its own address, so an entry ending in
 * ".vercel.app" is matched as a suffix rather than exactly.
 */
function allowedOrigin(origin, callback) {
  if (!origin) return callback(null, true);

  const allowed = config.clientOrigin.split(",").map((s) => s.trim()).filter(Boolean);

  const ok = allowed.some((entry) => {
    if (entry === origin) return true;
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1); // "*.vercel.app" -> ".vercel.app"
      try {
        return new URL(origin).hostname.endsWith(suffix);
      } catch {
        return false;
      }
    }
    return false;
  });

  if (ok) return callback(null, true);
  return callback(new Error(`This website is not allowed to use this API: ${origin}`));
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);           // behind Vercel / nginx, so rate limiting sees the real IP
  app.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.use(express.json({ limit: "100kb" }));
  app.use(cors({ origin: allowedOrigin, credentials: true }));

  // The API has no pages. Someone who opens the address in a browser should
  // get a plain answer rather than a crash.
  app.get("/", (req, res) => res.json({ service: "LabBook API" }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, env: config.env, whatsapp: config.whatsapp.enabled });
  });

  app.use("/api/public", publicOpdRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/dashboard/bookings", allowRoles("owner", "staff", "reception"), dashboardBookingsRouter);
  // Doctors may read the test list to order labs, and nothing else here.
  app.use("/api/dashboard/catalog", allowRoles("owner", "staff", "doctor"), (req, res, next) => {
    if (req.user.role === "doctor" && !(req.method === "GET" && req.path === "/tests")) {
      return res.status(403).json({ error: "Your account does not have access to this section." });
    }
    next();
  }, dashboardCatalogRouter);
  app.use("/api/cron", cronRouter);
  app.use("/api/reports/dashboard", allowRoles("owner", "staff", "reception"));
  app.use("/api/reports", reportsRouter);
  app.use("/api/hms/overview", hmsOverviewRouter);
  app.use("/api/hms/patients", hmsPatientsRouter);
  app.use("/api/hms/doctors", hmsDoctorsRouter);
  app.use("/api/hms/appointments", hmsAppointmentsRouter);
  app.use("/api/hms/billing", hmsBillingRouter);
  app.use("/api/hms/pharmacy", hmsPharmacyRouter);
  app.use("/api/hms/insurance", hmsInsuranceRouter);
  app.use("/api/hms/ipd", hmsInpatientRouter);
  app.use("/api/admin", adminRouter);

  app.use((req, res) => res.status(404).json({ error: "Not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "The file or request is too large." });
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "The request body was not valid JSON." });
    }
    res.status(500).json({ error: "Something went wrong on our side." });
  });

  return app;
}

// What Vercel calls for each request: there is no long-running server there, so
// connect to the database first (cached between calls), then use the same app.
// Vercel's Express detection looks for this default export in this file.
let serverlessApp;
export default async function handler(req, res) {
  try {
    await cachedConnect();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "The system is temporarily unavailable. Please try again in a moment." }));
    return;
  }
  serverlessApp ??= createApp();
  return serverlessApp(req, res);
}

// Only start listening when run directly, so tests can import createApp().
const runDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  connectDb()
    .then(() => {
      createApp().listen(config.port, () => {
        console.log(`API on http://localhost:${config.port}`);
        if (!config.whatsapp.enabled) {
          console.log("WhatsApp is off (no token in .env). Bookings still save and are logged.");
        }
      });
    })
    .catch((err) => {
      console.error("Could not start:", err.message);
      process.exit(1);
    });
}
