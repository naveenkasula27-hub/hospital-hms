import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import BookingPage from "./pages/BookingPage.jsx";
import "./styles.css";
import "./dashboard.css";
import "./hms.css";

// Everything below is code-split: a patient opening a booking link downloads
// only LandingPage/BookingPage up front. The HMS admin dashboard in
// particular is a large, staff-only app that a patient should never have to
// download just to book a test.
const AudiencePage = lazy(() => import("./pages/AudiencePage.jsx"));
const CheckBookingPage = lazy(() => import("./pages/CheckBookingPage.jsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy.jsx"));
const Terms = lazy(() => import("./pages/Terms.jsx"));
const OpdBookingPage = lazy(() => import("./pages/OpdBookingPage.jsx"));
const AboutPage = lazy(() => import("./pages/HospitalPages.jsx").then((m) => ({ default: m.AboutPage })));
const TreatmentsPage = lazy(() => import("./pages/HospitalPages.jsx").then((m) => ({ default: m.TreatmentsPage })));
const GalleryPage = lazy(() => import("./pages/HospitalPages.jsx").then((m) => ({ default: m.GalleryPage })));
const ContactPage = lazy(() => import("./pages/HospitalPages.jsx").then((m) => ({ default: m.ContactPage })));
const RxPrint = lazy(() => import("./pages/hms/RxPrint.jsx"));
const InvoicePrint = lazy(() => import("./pages/hms/InvoicePrint.jsx"));

function LazyPage({ children }) {
  return (
    <Suspense fallback={<main className="center" style={{ padding: 60 }}><p className="muted">Loading…</p></main>}>
      {children}
    </Suspense>
  );
}

// A single-hospital deployment sets VITE_DEFAULT_SLUG so the bare address
// lands straight on that hospital's booking page, instead of the generic
// marketing page meant for selling this product to new hospitals.
const defaultSlug = import.meta.env.VITE_DEFAULT_SLUG || "";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* The front door. On a shared/demo deployment this is the generic
            marketing page; a single-hospital deployment redirects instead. */}
        <Route path="/" element={defaultSlug ? <Navigate to={`/${defaultSlug}`} replace /> : <LandingPage />} />

        {/* The lab's own screens. Listed before /:slug so "dashboard" is
            not mistaken for a lab's address. */}
        <Route path="/dashboard/*" element={<LazyPage><DashboardPage /></LazyPage>} />
        <Route path="/print/rx/:id" element={<LazyPage><RxPrint /></LazyPage>} />
        <Route path="/print/invoice/:id" element={<LazyPage><InvoicePrint /></LazyPage>} />

        {/* Same reason these sit above /:slug — no lab gets the slug
            "privacy" or "terms". */}
        <Route path="/privacy" element={<LazyPage><PrivacyPolicy /></LazyPage>} />
        <Route path="/terms" element={<LazyPage><Terms /></LazyPage>} />

        {/* Each lab gets its own address: /nandu */}
        <Route path="/:slug/*" element={<BookingPage />} />
        <Route path="/:slug/check" element={<LazyPage><CheckBookingPage /></LazyPage>} />
        <Route path="/:slug/for/:audience" element={<LazyPage><AudiencePage /></LazyPage>} />
        <Route path="/:slug/appointment" element={<LazyPage><OpdBookingPage /></LazyPage>} />

        {/* The hospital's own content pages, around the booking screens. */}
        <Route path="/:slug/about" element={<LazyPage><AboutPage /></LazyPage>} />
        <Route path="/:slug/treatments" element={<LazyPage><TreatmentsPage /></LazyPage>} />
        <Route path="/:slug/gallery" element={<LazyPage><GalleryPage /></LazyPage>} />
        <Route path="/:slug/contact" element={<LazyPage><ContactPage /></LazyPage>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
