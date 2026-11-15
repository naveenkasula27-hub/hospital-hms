import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import BookingPage from "./pages/BookingPage.jsx";
import CheckBookingPage from "./pages/CheckBookingPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";
import Terms from "./pages/Terms.jsx";
import OpdBookingPage from "./pages/OpdBookingPage.jsx";
import RxPrint from "./pages/hms/RxPrint.jsx";
import InvoicePrint from "./pages/hms/InvoicePrint.jsx";
import "./styles.css";
import "./dashboard.css";
import "./hms.css";

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
        <Route path="/dashboard/*" element={<DashboardPage />} />
        <Route path="/print/rx/:id" element={<RxPrint />} />
        <Route path="/print/invoice/:id" element={<InvoicePrint />} />

        {/* Same reason these sit above /:slug — no lab gets the slug
            "privacy" or "terms". */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Each lab gets its own address: /nandu */}
        <Route path="/:slug" element={<BookingPage />} />
        <Route path="/:slug/check" element={<CheckBookingPage />} />
        <Route path="/:slug/appointment" element={<OpdBookingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
