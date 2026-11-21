import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Icon from "../../components/hms/Icon.jsx";
import { initials, ROLE_LABEL } from "../../lib/hms.js";
import { prettyDate, todayForLab } from "../../lib/api.js";
// Every section below is its own chunk: the first thing staff open (usually
// Overview or Appointments) is all that downloads at sign-in — Billing,
// Pharmacy, IPD and the rest only load the moment someone actually clicks
// into them, instead of all twenty pages shipping together on every visit.
import Overview from "./Overview.jsx";
const Appointments = lazy(() => import("./Appointments.jsx"));
const Consultation = lazy(() => import("./Consultation.jsx"));
const Patients = lazy(() => import("./Patients.jsx"));
const PatientProfile = lazy(() => import("./PatientProfile.jsx"));
const Doctors = lazy(() => import("./Doctors.jsx"));
const Billing = lazy(() => import("./Billing.jsx"));
const BillNew = lazy(() => import("./BillNew.jsx"));
const BillView = lazy(() => import("./BillView.jsx"));
const Charges = lazy(() => import("./Charges.jsx"));
const Pharmacy = lazy(() => import("./Pharmacy.jsx"));
const PharmacySale = lazy(() => import("./PharmacySale.jsx"));
const PharmacyReceive = lazy(() => import("./PharmacyReceive.jsx"));
const PharmacyPurchases = lazy(() => import("./PharmacyLists.jsx").then((m) => ({ default: m.PharmacyPurchases })));
const PharmacySales = lazy(() => import("./PharmacyLists.jsx").then((m) => ({ default: m.PharmacySales })));
const Insurance = lazy(() => import("./Insurance.jsx"));
const ClaimNew = lazy(() => import("./ClaimNew.jsx"));
const ClaimView = lazy(() => import("./ClaimView.jsx"));
const BedMap = lazy(() => import("./BedMap.jsx"));
const Admissions = lazy(() => import("./Admissions.jsx"));
const AdmitPatient = lazy(() => import("./AdmitPatient.jsx"));
const AdmissionView = lazy(() => import("./AdmissionView.jsx"));
const Wards = lazy(() => import("./Wards.jsx"));
const BookingsPage = lazy(() => import("../BookingsPage.jsx"));
const PricesPage = lazy(() => import("../PricesPage.jsx"));
const SettingsPage = lazy(() => import("../SettingsPage.jsx"));
import PasswordForm from "../../components/PasswordForm.jsx";

const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);

const NAV = [
  { group: "Hospital", items: [
    { to: "/dashboard", end: true, label: "Overview", icon: "grid", roles: ["owner", "reception"] },
    { to: "/dashboard/appointments", label: "Appointments", icon: "calendar", roles: ["owner", "reception"] },
    { to: "/dashboard/appointments", label: "My queue", icon: "calendar", roles: ["doctor"] },
    { to: "/dashboard/patients", label: "Patients", icon: "users", roles: ["owner", "reception", "doctor"] },
    { to: "/dashboard/doctors", label: "Doctors", icon: "stethoscope", roles: ["owner", "reception"] },
  ] },
  { group: "Billing", items: [
    { to: "/dashboard/billing", end: true, label: "Bills & payments", icon: "wallet", roles: ["owner", "reception"] },
    { to: "/dashboard/billing/charges", label: "Charges & invoice", icon: "file", roles: ["owner"] },
  ] },
  { group: "Insurance", items: [
    { to: "/dashboard/insurance", end: true, label: "Claims", icon: "shield", roles: ["owner", "reception"] },
  ] },
  { group: "In-patient", items: [
    { to: "/dashboard/ipd", end: true, label: "Bed map", icon: "bed", roles: ["owner", "reception", "doctor"] },
    { to: "/dashboard/ipd/admissions", label: "Admissions", icon: "users", roles: ["owner", "reception", "doctor"] },
  ] },
  { group: "Pharmacy", items: [
    { to: "/dashboard/pharmacy", end: true, label: "Stock", icon: "pill", roles: ["owner", "pharmacist", "reception"] },
    { to: "/dashboard/pharmacy/sale", label: "New sale", icon: "plus", roles: ["owner", "pharmacist", "reception"] },
    { to: "/dashboard/pharmacy/sales", label: "Sales", icon: "wallet", roles: ["owner", "pharmacist", "reception"] },
    { to: "/dashboard/pharmacy/purchases", label: "Purchases", icon: "truck", roles: ["owner", "pharmacist"] },
  ] },
  { group: "Laboratory", items: [
    { to: "/dashboard/lab", end: true, label: "Lab bookings", icon: "flask", roles: ["owner", "reception", "staff"] },
    { to: "/dashboard/lab/prices", label: "Tests & prices", icon: "tag", roles: ["owner", "staff"] },
  ] },
  { group: "Account", items: [
    { to: "/dashboard/settings", label: "Settings", icon: "settings", roles: ["owner", "staff", "reception", "doctor", "pharmacist"] },
  ] },
];

const HOME = { owner: "/dashboard", reception: "/dashboard", doctor: "/dashboard/appointments", staff: "/dashboard/lab", pharmacist: "/dashboard/pharmacy" };

export default function HmsShell({ session, setSession, onSignOut }) {
  const { user, lab } = session;
  const role = user.role;
  const [header, setHeader] = useState({ title: "", sub: "" });
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setNavOpen(false), [location.pathname]);
  useEffect(() => {
    document.title = header.title ? `${header.title} · ${lab.name}` : lab.name;
  }, [header.title, lab.name]);

  const can = (...roles) => roles.includes(role);
  const guard = (roles, el) => (roles.includes(role) ? el : <Navigate to={HOME[role] || "/dashboard/settings"} replace />);

  return (
    <ShellContext.Provider value={{ session, lab, role, setHeader }}>
      <div className={`hms${navOpen ? " nav-open" : ""}`} onClick={(e) => navOpen && e.target === e.currentTarget && setNavOpen(false)}>
        <aside className="side" aria-label="Main menu">
          <div className="brand">
            <div className="brand-mark">{initials(lab.name) || "H"}</div>
            <div>
              <div className="brand-name">{lab.name}</div>
              <div className="brand-sub">Hospital management</div>
            </div>
          </div>

          <nav className="nav">
            {NAV.map((g) => {
              const items = g.items.filter((i) => i.roles.includes(role));
              if (!items.length) return null;
              return (
                <div key={g.group}>
                  <div className="nav-label">{g.group}</div>
                  {items.map((i) => (
                    <NavLink key={i.label} to={i.to} end={i.end}>
                      <Icon name={i.icon} />
                      {i.label}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="side-foot">
            <div className="me">
              <div className="avatar">{initials(user.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="me-name">{user.name}</div>
                <div className="me-role">{ROLE_LABEL[role] || role}</div>
              </div>
            </div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={onSignOut}>
              <Icon name="logout" size={16} /> Sign out
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button type="button" className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
              <Icon name="menu" />
            </button>
            <div style={{ minWidth: 0 }}>
              <h1>{header.title}</h1>
              {header.sub && <p className="topbar-sub">{header.sub}</p>}
            </div>
            <div className="topbar-right">
              <span className="date-chip">
                <Icon name="calendar" size={15} />
                {prettyDate(todayForLab(lab), lab)}
              </span>
              {can("owner", "reception") && (
                <a className="btn btn-quiet btn-sm" href={`/${lab.slug}/appointment`} target="_blank" rel="noopener noreferrer">
                  <Icon name="external" size={15} /> Booking page
                </a>
              )}
            </div>
          </header>

          {lab.billing?.status === "overdue" && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <div className="notice notice-warn" role="status" style={{ margin: 0 }}>
                Payment is due for this account. Message UnityWebWorks on WhatsApp (77290 69137) to keep the system running without interruption.
              </div>
            </div>
          )}

          <main className="page">
            <Suspense fallback={<p className="muted">Loading…</p>}>
            <Routes>
              <Route index element={guard(["owner", "reception"], <Overview />)} />
              <Route path="appointments" element={guard(["owner", "reception", "doctor"], <Appointments />)} />
              <Route path="consult/:id" element={guard(["owner", "doctor"], <Consultation />)} />
              <Route path="patients" element={guard(["owner", "reception", "doctor"], <Patients />)} />
              <Route path="patients/:id" element={guard(["owner", "reception", "doctor"], <PatientProfile />)} />
              <Route path="doctors" element={guard(["owner", "reception"], <Doctors />)} />
              <Route path="billing" element={guard(["owner", "reception"], <Billing />)} />
              <Route path="billing/new" element={guard(["owner", "reception"], <BillNew />)} />
              <Route path="billing/charges" element={guard(["owner"], <Charges />)} />
              <Route path="billing/:id" element={guard(["owner", "reception", "pharmacist"], <BillView />)} />
              <Route path="insurance" element={guard(["owner", "reception"], <Insurance />)} />
              <Route path="insurance/new" element={guard(["owner", "reception"], <ClaimNew />)} />
              <Route path="insurance/:id" element={guard(["owner", "reception"], <ClaimView />)} />
              <Route path="ipd" element={guard(["owner", "reception", "doctor"], <BedMap />)} />
              <Route path="ipd/admissions" element={guard(["owner", "reception", "doctor"], <Admissions />)} />
              <Route path="ipd/admit" element={guard(["owner", "reception"], <AdmitPatient />)} />
              <Route path="ipd/wards" element={guard(["owner"], <Wards />)} />
              <Route path="ipd/:id" element={guard(["owner", "reception", "doctor"], <AdmissionView />)} />
              <Route path="pharmacy" element={guard(["owner", "pharmacist", "reception"], <Pharmacy />)} />
              <Route path="pharmacy/sale" element={guard(["owner", "pharmacist", "reception"], <PharmacySale />)} />
              <Route path="pharmacy/sales" element={guard(["owner", "pharmacist", "reception"], <PharmacySales />)} />
              <Route path="pharmacy/purchases" element={guard(["owner", "pharmacist"], <PharmacyPurchases />)} />
              <Route path="pharmacy/receive" element={guard(["owner", "pharmacist"], <PharmacyReceive />)} />
              <Route path="lab" element={guard(["owner", "reception", "staff"], <LabSection title="Lab bookings" sub="Tests booked online, at the desk and ordered by doctors"><BookingsPage lab={lab} /></LabSection>)} />
              <Route path="lab/prices" element={guard(["owner", "staff"], <LabSection title="Tests & prices" sub="What the lab offers and what it charges"><PricesPage lab={lab} /></LabSection>)} />
              <Route path="settings" element={
                <LabSection title="Settings" sub="Hospital details and your password">
                  {can("owner", "staff") && (
                    <SettingsPage lab={lab} onSaved={(l) => setSession((s) => ({ ...s, lab: { ...s.lab, ...l } }))} />
                  )}
                  <PasswordForm />
                </LabSection>
              } />
              <Route path="*" element={<Navigate to={HOME[role] || "/dashboard/settings"} replace />} />
            </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}

function LabSection({ title, sub, children }) {
  const { setHeader } = useShell();
  useEffect(() => setHeader({ title, sub }), [title, sub, setHeader]);
  return <div className="panel">{children}</div>;
}
