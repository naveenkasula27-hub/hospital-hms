import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { money, prettyDate } from "../lib/api.js";
import { DAY_SHORT, initials, time12 } from "../lib/hms.js";
import "../experience.css";

const OPD_FAQ = [
  ["Not sure which doctor to choose?", "Use the “Still unsure which doctor?” box above the doctor list — share your name and number and the hospital will call you back to recommend the right specialist."],
  ["What is the token number for?", "It is your place in that doctor's queue for the day you booked. Show it at the reception when you arrive."],
  ["Can I reschedule or cancel my appointment?", "Call the hospital with your reference and token number. They will move or cancel the slot for you."],
  ["Do I pay online when I book?", "No. The consultation fee shown on each doctor's card is paid at the reception on the day of your visit."],
  ["What if I need to see a doctor urgently?", "Online booking is for scheduled visits. For an urgent or emergency need, call the hospital directly instead of booking online."],
];

const BASE = import.meta.env.VITE_API_BASE || "/api";

async function call(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...options });
  } catch {
    throw new Error("Could not reach the hospital's system. Check your internet and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Please try again.");
    err.field = data.field;
    throw err;
  }
  return data;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}

/** The pieces a date card shows: "Sat / 22 / Nov". */
function dayParts(dateStr) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  return {
    dow: DAY_SHORT[dt.getUTCDay()],
    num: dt.getUTCDate(),
    mon: dt.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
  };
}

/**
 * Splits a day's free slots into the parts of the day people actually think
 * in. A long single row of times is hard to scan and hides how much is left
 * in the part of the day someone can actually come in.
 */
function groupSlots(times) {
  const groups = [
    { label: "Morning", items: [] },
    { label: "Afternoon", items: [] },
    { label: "Evening", items: [] },
  ];
  for (const slot of times) {
    const hour = Number(String(slot.time).slice(0, 2));
    const index = hour < 12 ? 0 : hour < 16 ? 1 : 2;
    groups[index].items.push(slot);
  }
  return groups.filter((g) => g.items.length);
}

export default function OpdBookingPage() {
  const { slug } = useParams();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [doctor, setDoctor] = useState(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState("");
  const [form, setForm] = useState({ name: "", age: "", gender: "", phone: "", reason: "", consent: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const [unsureOpen, setUnsureOpen] = useState(false);
  const [unsureName, setUnsureName] = useState("");
  const [unsurePhone, setUnsurePhone] = useState("");
  const unsureDialog = useRef(null);
  useEffect(() => {
    const dialog = unsureDialog.current;
    if (!dialog) return;
    if (unsureOpen && !dialog.open) dialog.showModal();
    if (!unsureOpen && dialog.open) dialog.close();
  }, [unsureOpen]);

  // Choosing a doctor opens the whole booking flow in one panel, instead of
  // unrolling a thin row of date chips further down the page.
  const [bookingOpen, setBookingOpen] = useState(false);
  const bookingDialog = useRef(null);
  useEffect(() => {
    const dialog = bookingDialog.current;
    if (!dialog) return;
    if (bookingOpen && !dialog.open) dialog.showModal();
    if (!bookingOpen && dialog.open) dialog.close();
  }, [bookingOpen]);

  useEffect(() => {
    call(`/public/${slug}/opd`)
      .then((d) => {
        setInfo(d);
        document.title = `Book a doctor · ${d.hospital.name}`;
        const t = d.hospital.theme || {};
        if (t.primary) document.documentElement.style.setProperty("--primary", t.primary);
        if (t.primary) document.documentElement.style.setProperty("--cta", t.cta || t.primary);
      })
      .catch((e) => setLoadError(e.message));
  }, [slug]);

  const specialties = useMemo(() => [...new Set((info?.doctors || []).map((d) => d.specialty))], [info]);
  const doctors = (info?.doctors || []).filter((d) => !specialty || d.specialty === specialty);

  const dates = useMemo(() => {
    if (!info || !doctor) return [];
    const out = [];
    for (let i = 0; i < 14 && out.length < 8; i++) {
      const d = addDays(info.today, i);
      if (doctor.days.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) out.push(d);
    }
    return out;
  }, [info, doctor]);

  useEffect(() => {
    setTime("");
    setSlots(null);
    if (!doctor || !date) return;
    call(`/public/${slug}/opd/slots?doctor=${doctor._id}&date=${date}`)
      .then(setSlots)
      .catch((e) => setSlots({ open: false, times: [], error: e.message }));
  }, [slug, doctor, date]);

  function pickDoctor(d) {
    setDoctor(d);
    setDate("");
    setTime("");
    setError(null);
    setBookingOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!time) return setError({ message: "Pick a time first.", field: "time" });
    setBusy(true);
    try {
      const r = await call(`/public/${slug}/opd/book`, {
        method: "POST",
        body: JSON.stringify({ ...form, doctor: doctor._id, date, time }),
      });
      setDone(r);
      setBookingOpen(false);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError({ message: err.message, field: err.field });
      if (err.field === "time") {
        call(`/public/${slug}/opd/slots?doctor=${doctor._id}&date=${date}`).then(setSlots).catch(() => {});
        setTime("");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <main className="center"><h1>Not found</h1><p className="muted">{loadError}</p></main>;
  if (!info) return <main className="center"><p className="muted">Loading…</p></main>;

  const h = info.hospital;
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const bad = (k) => (error?.field === k ? " invalid" : "");

  return (
    <div className="opd">
      <header className="opd-hero">
        <div className="wrap">
          <div className="opd-brand">
            <div className="brand-mark">{initials(h.name)}</div>
            <div>
              <h1>{h.name}</h1>
              <p>{h.tagline || [h.address, h.city].filter(Boolean).join(", ")}</p>
            </div>
            <Link to={`/${slug}`} className="opd-switch">Need a lab test instead?</Link>
          </div>
          <h2 className="opd-title">Book a doctor's appointment</h2>
          <p className="opd-lead">Pick a doctor and a time. You get a token number straight away.</p>
        </div>
      </header>

      <main className="wrap opd-main">
        {h.isDemo && (
          <div className="notice notice-warn">This is a sample hospital for demonstration. Please do not enter real patient details.</div>
        )}

        {done ? (
          <section className="card done">
            <h2 style={{ marginTop: 0 }}>Appointment booked</h2>
            <p className="muted small" style={{ margin: 0 }}>Your token number</p>
            <div className="ref">#{done.token}</div>
            <dl>
              <dt>Doctor</dt><dd>{done.doctor.name}, {done.doctor.specialty}</dd>
              <dt>When</dt><dd>{prettyDate(done.date, h)}, {time12(done.time)}</dd>
              <dt>Reference</dt><dd className="mono">{done.reference}</dd>
              <dt>Patient ID</dt><dd className="mono">{done.uhid}</dd>
              <dt>Fee</dt><dd>{money(done.fee, h)}, pay at the reception</dd>
            </dl>
            <p className="small">Please arrive 10 minutes early. Call {h.phone} if you need to change the time.</p>
            <button type="button" className="btn btn-ghost" onClick={() => { setDone(null); setDoctor(null); setDate(""); setForm({ name: "", age: "", gender: "", phone: "", reason: "", consent: false }); }}>
              Book another appointment
            </button>
          </section>
        ) : (
          <>
            <section className="card">
              <h3 className="opd-step"><span>1</span> Choose a doctor</h3>
              <button type="button" className="opd-unsure-prompt" onClick={() => setUnsureOpen(true)}>
                <strong>Still unsure which doctor?</strong>
                <span>Share your name and number — the hospital will guide you to the right specialist.</span>
              </button>
              {specialties.length > 1 && (
                <div className="chips" role="group" aria-label="Specialty">
                  <button type="button" className="chip" aria-pressed={!specialty} onClick={() => setSpecialty("")}>All</button>
                  {specialties.map((s) => (
                    <button key={s} type="button" className="chip" aria-pressed={specialty === s} onClick={() => setSpecialty(s)}>{s}</button>
                  ))}
                </div>
              )}
              {doctors.length === 0 ? (
                <p className="muted">No doctors take online bookings right now. Please call {h.phone}.</p>
              ) : (
                <ul className="opd-doctors">
                  {doctors.map((d) => (
                    <li key={d._id}>
                      <button type="button" className="opd-doctor-card" aria-pressed={doctor?._id === d._id} onClick={() => pickDoctor(d)}>
                        <span className="opd-doc-avatar">{initials(d.name)}</span>
                        <strong className="opd-doc-name">{d.name}</strong>
                        <span className="opd-doc-specialty">{d.specialty}</span>
                        {d.qualification && <span className="opd-doc-qual">{d.qualification}</span>}
                        <span className="opd-doc-days">{d.days.map((x) => DAY_SHORT[x]).join(", ")}</span>
                        <span className="opd-doc-confirm">⚡ Instant confirmation</span>
                        <span className="opd-doc-bottom">
                          <span className="opd-doc-fee-block">
                            <span className="opd-doc-fee-label">Consultation fee</span>
                            <span className="opd-doc-fee">{money(d.consultFee, h)}</span>
                          </span>
                          <span className="opd-doc-cta">{doctor?._id === d._id ? "Selected ✓" : "Book appointment"}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

          </>
        )}

        <section className="lb-faq" aria-labelledby="opd-faq-title">
          <div>
            <p className="lb-eyebrow">{h.name}</p>
            <h2 id="opd-faq-title">A few questions, made simple.</h2>
            <p>The practical details you need before you book a doctor.</p>
          </div>
          <div>
            {OPD_FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="muted tiny" style={{ textAlign: "center" }}>
          Need a lab test instead? <Link to={`/${slug}`}>Book a lab test</Link>
        </p>
      </main>

      <dialog
        ref={bookingDialog}
        className="opd-book-dialog"
        aria-labelledby="opd-book-title"
        onCancel={(e) => { e.preventDefault(); setBookingOpen(false); }}
        onClick={(e) => { if (e.target === e.currentTarget) setBookingOpen(false); }}
      >
        <button type="button" className="lb-dialog-close" onClick={() => setBookingOpen(false)} aria-label="Close">×</button>
        {doctor && (
          <>
            <header className="opd-book-head">
              <span className="opd-doc-avatar">{initials(doctor.name)}</span>
              <div>
                <h2 id="opd-book-title">{doctor.name}</h2>
                <p className="opd-book-specialty">{doctor.specialty}{doctor.qualification ? ` · ${doctor.qualification}` : ""}</p>
                <p className="opd-book-fee">{money(doctor.consultFee, h)} <span>consultation, paid at reception</span></p>
              </div>
            </header>

            <section className="opd-book-step">
              <h3><span>1</span> Pick a date</h3>
              {dates.length === 0 ? (
                <p className="muted small">This doctor has no open days in the next two weeks. Please call {h.phone}.</p>
              ) : (
                <div className="opd-date-grid" role="group" aria-label="Date">
                  {dates.map((d) => {
                    const p = dayParts(d);
                    return (
                      <button key={d} type="button" className="opd-date-card" aria-pressed={date === d} onClick={() => setDate(d)}>
                        <span className="opd-date-dow">{d === info.today ? "Today" : p.dow}</span>
                        <span className="opd-date-num">{p.num}</span>
                        <span className="opd-date-mon">{p.mon}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {date && (
              <section className="opd-book-step">
                <h3><span>2</span> Pick a time</h3>
                {!slots ? (
                  <div className="skeleton" style={{ height: 64 }} />
                ) : slots.error ? (
                  <p className="err">{slots.error}</p>
                ) : slots.times.every((t) => !t.free) ? (
                  <p className="muted small">No times left on this day. Try another date above.</p>
                ) : (
                  groupSlots(slots.times.filter((t) => t.free)).map((group) => (
                    <div className="opd-slot-group" key={group.label}>
                      <p className="opd-slot-label">{group.label} <span>{group.items.length} available</span></p>
                      <div className="opd-slot-grid">
                        {group.items.map((t) => (
                          <button key={t.time} type="button" className="opd-slot" aria-pressed={time === t.time} onClick={() => setTime(t.time)}>
                            {time12(t.time)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}

            {time && (
              <section className="opd-book-step">
                <h3><span>3</span> Patient details</h3>
                <form className="form" onSubmit={submit} noValidate>
                  {error && <div className="notice notice-bad" role="alert">{error.message}</div>}
                  <div>
                    <label className="field-label" htmlFor="o-name">Patient's full name</label>
                    <input id="o-name" className={`input${bad("name")}`} value={form.name} onChange={set("name")} autoComplete="name" />
                  </div>
                  <div className="two">
                    <div>
                      <label className="field-label" htmlFor="o-age">Age</label>
                      <input id="o-age" className={`input${bad("age")}`} inputMode="numeric" value={form.age} onChange={set("age")} />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="o-gender">Gender</label>
                      <select id="o-gender" className={`select${bad("gender")}`} value={form.gender} onChange={set("gender")}>
                        <option value="">Choose</option><option>Male</option><option>Female</option><option>Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="o-phone">WhatsApp mobile number</label>
                    <input id="o-phone" className={`input${bad("phone")}`} inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="o-reason">Reason for visit (optional)</label>
                    <input id="o-reason" className="input" value={form.reason} onChange={set("reason")} placeholder="e.g. Fever since 2 days" />
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={form.consent} onChange={set("consent")} />
                    <span className="small">The hospital may contact me on this number about this appointment.</span>
                  </label>
                  <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                    {busy ? "Booking…" : `Confirm ${time12(time)}, ${prettyDate(date, h)}`}
                  </button>
                </form>
              </section>
            )}
          </>
        )}
      </dialog>

      <dialog
        ref={unsureDialog}
        className="lb-appointment-request opd-unsure-dialog"
        aria-labelledby="unsure-title"
        onCancel={(e) => { e.preventDefault(); setUnsureOpen(false); }}
        onClick={(e) => { if (e.target === e.currentTarget) setUnsureOpen(false); }}
      >
        <button type="button" className="lb-dialog-close" onClick={() => setUnsureOpen(false)} aria-label="Close">×</button>
        <header>
          <p className="lb-eyebrow">{h.name}</p>
          <h2 id="unsure-title">Still unsure about which doctor to choose?</h2>
          <p>Share a few details and the hospital will guide you to the right specialist.</p>
        </header>
        <form
          className="lb-request-form"
          onSubmit={(e) => {
            e.preventDefault();
            const text = `Hello ${h.name}, I'm not sure which doctor to see.\nName: ${unsureName}\nPhone: ${unsurePhone}\nPlease help me pick the right specialist.`;
            if (h.whatsapp) {
              window.open(`https://wa.me/${h.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
            } else {
              window.location.href = `tel:${h.phone.replace(/\s/g, "")}`;
            }
            setUnsureOpen(false);
            setUnsureName("");
            setUnsurePhone("");
          }}
        >
          <div className="lb-request-fields">
            <label htmlFor="unsure-name">Full name*
              <input id="unsure-name" required minLength={2} maxLength={80} value={unsureName} onChange={(e) => setUnsureName(e.target.value)} />
            </label>
            <label htmlFor="unsure-phone">Phone number*
              <input id="unsure-phone" type="tel" required minLength={6} maxLength={30} value={unsurePhone} onChange={(e) => setUnsurePhone(e.target.value)} />
            </label>
          </div>
          <button type="submit" className="lb-request-submit">Submit</button>
        </form>
      </dialog>
    </div>
  );
}
