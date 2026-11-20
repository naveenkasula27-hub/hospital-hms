import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { getLab } from "../lib/api.js";
import { initials } from "../lib/hms.js";
import DemoStrip from "../components/DemoStrip.jsx";
import galleryReception from "../assets/gallery/reception.webp";
import gallerySampleCollection from "../assets/gallery/sample-collection.webp";
import galleryConsultationRoom from "../assets/gallery/consultation-room.webp";
import galleryWaitingArea from "../assets/gallery/waiting-area.webp";
import galleryPharmacyCounter from "../assets/gallery/pharmacy-counter.webp";
import galleryEquipment from "../assets/gallery/equipment.webp";
import galleryTeam from "../assets/gallery/team.webp";
import LabIllustration from "../components/LabIllustration.jsx";
import "../hospital-site.css";

/* ------------------------------------------------------------------ *
 * Shared shell
 * ------------------------------------------------------------------ */

const NAV = [
  { to: "", label: "Home", end: true },
  { to: "/about", label: "About Us" },
  { to: "/treatments", label: "Treatments" },
  { to: "/tests", label: "Lab Tests" },
  { to: "/gallery", label: "Gallery" },
  { to: "/contact", label: "Contact Us" },
];

function waLink(lab, text) {
  return `https://wa.me/${lab.whatsapp}?text=${encodeURIComponent(text)}`;
}

function SiteNav({ lab, slug }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="hs-nav">
      <div className="hs-wrap hs-nav-inner">
        <Link to={`/${slug}`} className="hs-brand">
          <span className="hs-brand-mark">{initials(lab.name)}</span>
          <span className="hs-brand-text">
            <strong>{lab.name}</strong>
            {lab.tagline && <small>{lab.tagline}</small>}
          </span>
        </Link>

        <button
          type="button"
          className="hs-burger"
          aria-expanded={open}
          aria-label="Menu"
          onClick={() => setOpen(!open)}
        >
          <span /><span /><span />
        </button>

        <nav className={`hs-links${open ? " is-open" : ""}`} onClick={() => setOpen(false)}>
          {NAV.map((item) => (
            <NavLink key={item.label} to={`/${slug}${item.to}`} end={item.end}>
              {item.label}
            </NavLink>
          ))}
          {lab.kind === "hospital" && (
            <Link className="hs-nav-cta" to={`/${slug}/appointment`}>Book Appointment</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function FloatingActions({ lab }) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const onScroll = () => setUp(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="hs-float">
      {up && (
        <button type="button" className="hs-float-btn hs-float-top" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0 })}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      )}
      {lab.whatsapp && (
        <a className="hs-float-btn hs-float-wa" href={waLink(lab, `Hello ${lab.name}, I have a question.`)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp us">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Zm5.6 14.2c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.6-.6-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5.2.6.7 1.9.8 2 .1.2.1.4 0 .6-.1.2-.1.3-.3.5l-.4.5c-.1.2-.3.3-.1.6.2.3.9 1.4 1.8 2.3 1.3 1.1 2.3 1.5 2.6 1.7.3.2.5.1.7-.1l.7-.8c.2-.3.4-.2.7-.1l1.8.9c.2.1.4.2.5.3.1.2.1.9-.1 1.5Z" /></svg>
        </a>
      )}
      <a className="hs-float-btn hs-float-call" href={`tel:${lab.phone.replace(/\s/g, "")}`} aria-label={`Call ${lab.phone}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.2c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2 2Z" /></svg>
      </a>
    </div>
  );
}

function SiteFooter({ lab, slug }) {
  return (
    <footer className="hs-foot">
      <div className="hs-wrap hs-foot-grid">
        <div>
          <p className="hs-foot-brand">{lab.name}</p>
          {lab.tagline && <p className="hs-foot-tag">{lab.tagline}</p>}
          {lab.address && <p className="hs-foot-tag">{lab.address}</p>}
        </div>
        <div>
          <p className="hs-foot-head">Explore</p>
          {NAV.map((item) => (
            <Link key={item.label} to={`/${slug}${item.to}`}>{item.label}</Link>
          ))}
        </div>
        <div>
          <p className="hs-foot-head">Book</p>
          {lab.kind === "hospital" && <Link to={`/${slug}/appointment`}>Doctor appointment</Link>}
          <Link to={`/${slug}/tests`}>Lab test</Link>
          <Link to={`/${slug}/checkups`}>Health checkup</Link>
          <Link to={`/${slug}/check`}>Track a booking</Link>
        </div>
        <div>
          <p className="hs-foot-head">Reach us</p>
          <a href={`tel:${lab.phone.replace(/\s/g, "")}`}>{lab.phone}</a>
          {lab.whatsapp && <a href={waLink(lab, `Hello ${lab.name}.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {lab.mapsUrl && <a href={lab.mapsUrl} target="_blank" rel="noopener noreferrer">Directions</a>}
        </div>
      </div>
      <div className="hs-wrap hs-foot-base">
        <span>© {new Date().getFullYear()} {lab.name}</span>
        <span><Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link></span>
      </div>
    </footer>
  );
}

/**
 * Every content page shares the same chrome and the same one lab fetch, so
 * moving between About, Treatments and Contact does not re-flash the header.
 */
function HospitalLayout({ eyebrow, title, lead, children }) {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getLab(slug)
      .then((d) => alive && (d?.lab ? setData(d) : setError("This page could not be loaded.")))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (data?.lab) document.title = `${title} · ${data.lab.name}`;
  }, [data, title]);

  if (error) return <main className="center"><h1>Not available</h1><p className="muted">{error}</p></main>;
  if (!data) return <main className="center" style={{ padding: 60 }}><p className="muted">Loading…</p></main>;

  const { lab } = data;
  return (
    <div className="hs">
      {lab.isDemo && <DemoStrip labName={lab.name} />}
      <SiteNav lab={lab} slug={slug} />
      <section className="hs-page-head">
        <div className="hs-wrap">
          <p className="hs-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {lead && <p className="hs-page-lead">{lead}</p>}
        </div>
      </section>
      {children({ lab, data, slug })}
      <SiteFooter lab={lab} slug={slug} />
      <FloatingActions lab={lab} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * About Us
 * ------------------------------------------------------------------ */

export function AboutPage() {
  return (
    <HospitalLayout
      eyebrow="ABOUT US"
      title="Care you can trust, close to home"
      lead="Who we are, what we treat, and how we look after the people who walk through our doors."
    >
      {({ lab, data, slug }) => (
        <>
          <section className="hs-wrap hs-about">
            <div className="hs-about-art" aria-hidden="true">
              <span className="hs-about-mark">{initials(lab.name)}</span>
            </div>
            <div className="hs-about-copy">
              <p className="hs-eyebrow">WHO WE ARE</p>
              <h2>About {lab.name}</h2>
              {lab.about ? (
                <p>{lab.about}</p>
              ) : (
                <p>
                  {lab.name} brings diagnostics, outpatient consultation and pharmacy together under
                  one roof{lab.city ? ` in ${lab.city}` : ""}. The same team handles your test, your
                  doctor visit and your medicines, so nothing is repeated and nothing gets lost
                  between departments.
                </p>
              )}
              <p>
                Bookings made here reach the front desk the moment you submit them. You get a
                reference on WhatsApp, a reminder before your visit, and your reports online as soon
                as they are released.
              </p>
              <div className="hs-about-actions">
                <Link className="hs-btn hs-btn-primary" to={`/${slug}/contact`}>Contact us</Link>
                <a className="hs-btn hs-btn-ghost" href={`tel:${lab.phone.replace(/\s/g, "")}`}>Call {lab.phone}</a>
              </div>
            </div>
          </section>

          <section className="hs-statband">
            <div className="hs-wrap hs-statband-grid">
              <div><strong>{data.tests.length}</strong><span>Lab tests offered</span></div>
              <div><strong>{data.packages.length}</strong><span>Health checkup packages</span></div>
              <div><strong>{data.categories.length}</strong><span>Health categories</span></div>
              <div><strong>Same day</strong><span>Reports on most tests</span></div>
            </div>
          </section>

          <section className="hs-wrap hs-values">
            <p className="hs-eyebrow">WHAT YOU CAN EXPECT</p>
            <h2>How we work</h2>
            <div className="hs-value-grid">
              {[
                ["Clear prices before you book", "Every test and checkup shows its price up front. No surprises at the counter."],
                ["One reference for everything", "Your booking reference tracks the visit, the status and the released report."],
                ["Updates you don't have to chase", "Confirmation, reminders and report alerts arrive on WhatsApp."],
                ["Care for every stage", "Panels built for men, women, children and seniors, not one generic list."],
              ].map(([head, body]) => (
                <div className="hs-value-card" key={head}>
                  <h3>{head}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </HospitalLayout>
  );
}

/* ------------------------------------------------------------------ *
 * Treatments
 * ------------------------------------------------------------------ */

export function TreatmentsPage() {
  return (
    <HospitalLayout
      eyebrow="OUR SERVICES"
      title="Complete care under one roof"
      lead="From a routine blood test to an outpatient consultation, here is everything you can arrange here."
    >
      {({ lab, data, slug }) => (
        <>
          <section className="hs-wrap hs-treat">
            <div className="hs-treat-grid">
              {lab.kind === "hospital" && (
                <Link className="hs-treat-card" to={`/${slug}/appointment`}>
                  <span className="hs-treat-tag">OPD</span>
                  <h3>Doctor consultation</h3>
                  <p>Pick a specialist and a time that suits you, and get a token number straight away.</p>
                  <b>Book a doctor →</b>
                </Link>
              )}
              <Link className="hs-treat-card" to={`/${slug}/tests`}>
                <span className="hs-treat-tag">DIAGNOSTICS</span>
                <h3>Laboratory tests</h3>
                <p>{data.tests.length} tests with clear sample, preparation and report details for each one.</p>
                <b>Find a test →</b>
              </Link>
              <Link className="hs-treat-card" to={`/${slug}/checkups`}>
                <span className="hs-treat-tag">PREVENTIVE</span>
                <h3>Health checkups</h3>
                <p>{data.packages.length} packages that bundle related tests at a single price.</p>
                <b>View checkups →</b>
              </Link>
              {lab.homeCollection && (
                <Link className="hs-treat-card" to={`/${slug}/tests`}>
                  <span className="hs-treat-tag">AT HOME</span>
                  <h3>Home sample collection</h3>
                  <p>Choose home collection in the booking form for tests that allow it.</p>
                  <b>Choose collection →</b>
                </Link>
              )}
              <Link className="hs-treat-card" to={`/${slug}/check`}>
                <span className="hs-treat-tag">REPORTS</span>
                <h3>Track your booking</h3>
                <p>Follow progress and open released reports with your reference and phone number.</p>
                <b>Track a booking →</b>
              </Link>
            </div>
          </section>

          <section className="hs-wrap hs-cats">
            <p className="hs-eyebrow">BY HEALTH CATEGORY</p>
            <h2>What we test for</h2>
            <div className="hs-cat-chips">
              {data.categories.map((name) => (
                <Link key={name} to={`/${slug}/tests?category=${encodeURIComponent(name)}`}>{name}</Link>
              ))}
            </div>
          </section>
        </>
      )}
    </HospitalLayout>
  );
}

/* ------------------------------------------------------------------ *
 * Gallery
 * ------------------------------------------------------------------ */

const GALLERY_SLOTS = [
  { caption: "Reception", photo: galleryReception },
  { caption: "Sample collection room", photo: gallerySampleCollection },
  { caption: "Laboratory", photo: null, illustrated: true },
  { caption: "Consultation room", photo: galleryConsultationRoom },
  { caption: "Waiting area", photo: galleryWaitingArea },
  { caption: "Pharmacy counter", photo: galleryPharmacyCounter },
  { caption: "Equipment", photo: galleryEquipment },
  { caption: "Our team", photo: galleryTeam },
];

function GalleryPlaceholder() {
  return (
    <div className="hs-gallery-ph" aria-hidden="true">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="8.5" cy="9.5" r="1.8" />
        <path d="m4 17 5-4.5 4 3.3 3-2.4 4 3.6" />
      </svg>
    </div>
  );
}

export function GalleryPage() {
  const illustrated = GALLERY_SLOTS.filter((s) => s.illustrated);
  return (
    <HospitalLayout
      eyebrow="GALLERY"
      title="A look inside"
      lead="Photographs of the hospital, the lab and the team."
    >
      {({ lab }) => (
        <section className="hs-wrap hs-gallery">
          {illustrated.length > 0 && (
            <p className="hs-gallery-note">
              {illustrated.map((s) => s.caption).join(", ")} {illustrated.length === 1 ? "is" : "are"} shown
              as an illustration for now — send a real photo and it replaces it.
            </p>
          )}
          <div className="hs-gallery-grid">
            {GALLERY_SLOTS.map(({ caption, photo, illustrated }) => (
              <figure className="hs-gallery-card" key={caption}>
                {photo ? (
                  <img className="hs-gallery-photo" src={photo} alt={caption} loading="lazy" />
                ) : illustrated ? (
                  <div className="hs-gallery-ph hs-gallery-illustration" aria-hidden="true">
                    <LabIllustration size={120} />
                  </div>
                ) : (
                  <GalleryPlaceholder />
                )}
                <figcaption>{caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </HospitalLayout>
  );
}

/* ------------------------------------------------------------------ *
 * Contact
 * ------------------------------------------------------------------ */

export function ContactPage() {
  const [sent, setSent] = useState(false);
  const form = useRef({ name: "", phone: "", email: "", service: "", date: "", time: "", message: "" });
  const [, bump] = useState(0);
  const set = (key) => (e) => { form.current[key] = e.target.value; bump((n) => n + 1); };

  return (
    <HospitalLayout
      eyebrow="CONTACT US"
      title="Schedule your visit today"
      lead="Send your details and the team will call you back to confirm. For anything urgent, please call directly."
    >
      {({ lab }) => (
        <section className="hs-wrap hs-contact">
          <div className="hs-contact-side">
            <p className="hs-eyebrow">REACH US</p>
            <h2>We're here to help</h2>
            <a className="hs-contact-row" href={`tel:${lab.phone.replace(/\s/g, "")}`}>
              <span className="hs-contact-ico">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.2c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2 2Z" /></svg>
              </span>
              <span><strong>{lab.phone}</strong><small>Call us to book directly</small></span>
            </a>
            {lab.whatsapp && (
              <a className="hs-contact-row" href={waLink(lab, `Hello ${lab.name}, I have a question.`)} target="_blank" rel="noopener noreferrer">
                <span className="hs-contact-ico hs-contact-ico-wa">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Zm5.6 14.2c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.6-.6-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5.2.6.7 1.9.8 2 .1.2.1.4 0 .6-.1.2-.1.3-.3.5l-.4.5c-.1.2-.3.3-.1.6.2.3.9 1.4 1.8 2.3 1.3 1.1 2.3 1.5 2.6 1.7.3.2.5.1.7-.1l.7-.8c.2-.3.4-.2.7-.1l1.8.9c.2.1.4.2.5.3.1.2.1.9-.1 1.5Z" /></svg>
                </span>
                <span><strong>WhatsApp</strong><small>Message us any time</small></span>
              </a>
            )}
            {lab.address && (
              <div className="hs-contact-row">
                <span className="hs-contact-ico">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" /></svg>
                </span>
                <span><strong>{lab.address}</strong><small>{[lab.city].filter(Boolean).join("")}</small></span>
              </div>
            )}
            {lab.mapsUrl && (
              <a className="hs-btn hs-btn-ghost" href={lab.mapsUrl} target="_blank" rel="noopener noreferrer">Get directions</a>
            )}
          </div>

          <div className="hs-contact-form">
            {sent ? (
              <div className="hs-sent" role="status">
                <h3>Your request is on its way</h3>
                <p>
                  WhatsApp has opened with your details filled in — send that message and the team
                  will call you back to confirm.
                </p>
                <button type="button" className="hs-btn hs-btn-ghost" onClick={() => setSent(false)}>Send another</button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = form.current;
                  const lines = [
                    `Hello ${lab.name}, I would like to request a visit.`,
                    `Name: ${f.name}`,
                    `Phone: ${f.phone}`,
                    f.email ? `Email: ${f.email}` : "",
                    f.service ? `Service: ${f.service}` : "",
                    f.date ? `Preferred date: ${f.date}` : "",
                    f.time ? `Preferred time: ${f.time}` : "",
                    f.message ? `Message: ${f.message}` : "",
                  ].filter(Boolean);
                  if (lab.whatsapp) {
                    window.open(waLink(lab, lines.join("\n")), "_blank", "noopener");
                  } else {
                    window.location.href = `tel:${lab.phone.replace(/\s/g, "")}`;
                  }
                  setSent(true);
                }}
              >
                <p className="hs-eyebrow">BOOK AN APPOINTMENT</p>
                <h2>Request your visit</h2>
                <p className="hs-form-lead">Fill in your details and our team will call you to confirm.</p>

                <div className="hs-field-grid">
                  <label>Full Name
                    <input required minLength={2} maxLength={80} placeholder="Your name" value={form.current.name} onChange={set("name")} />
                  </label>
                  <label>Phone Number
                    <input required type="tel" minLength={6} maxLength={20} placeholder="10-digit mobile" value={form.current.phone} onChange={set("phone")} />
                  </label>
                  <label>Email Address
                    <input type="email" maxLength={160} placeholder="you@email.com" value={form.current.email} onChange={set("email")} />
                  </label>
                  <label>Service
                    <select value={form.current.service} onChange={set("service")}>
                      <option value="">Select a service</option>
                      {lab.kind === "hospital" && <option>Doctor consultation</option>}
                      <option>Lab test</option>
                      <option>Health checkup</option>
                      {lab.homeCollection && <option>Home sample collection</option>}
                      <option>Something else</option>
                    </select>
                  </label>
                  <label>Preferred Date
                    <input type="date" value={form.current.date} onChange={set("date")} />
                  </label>
                  <label>Preferred Time
                    <input type="time" value={form.current.time} onChange={set("time")} />
                  </label>
                  <label className="hs-field-wide">Message (optional)
                    <textarea rows={4} maxLength={400} placeholder="Briefly describe your concern" value={form.current.message} onChange={set("message")} />
                  </label>
                </div>

                <button type="submit" className="hs-btn hs-btn-primary hs-btn-block">Submit Request</button>
                <p className="hs-form-fine">
                  This opens WhatsApp with your details ready to send. Nothing is booked until the
                  team confirms with you.
                </p>
              </form>
            )}
          </div>
        </section>
      )}
    </HospitalLayout>
  );
}
