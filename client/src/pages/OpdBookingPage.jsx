import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { money, prettyDate } from "../lib/api.js";
import { DAY_SHORT, initials, time12 } from "../lib/hms.js";

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
    setError(null);
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
      window.scrollTo({ top: 0, behavior: "smooth" });
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

            {doctor && (
              <section className="card">
                <h3 className="opd-step"><span>2</span> Choose a day and time</h3>
                <div className="chips" role="group" aria-label="Date">
                  {dates.map((d) => (
                    <button key={d} type="button" className="chip" aria-pressed={date === d} onClick={() => setDate(d)}>
                      {d === info.today ? "Today" : prettyDate(d, h)}
                    </button>
                  ))}
                </div>
                {date && (
                  !slots ? <div className="skeleton" style={{ height: 44, marginTop: 10 }} /> :
                  slots.error ? <p className="err">{slots.error}</p> :
                  slots.times.every((t) => !t.free) ? <p className="muted small">No times left on this day. Try another day.</p> : (
                    <div className="slots" style={{ marginTop: 10 }}>
                      {slots.times.filter((t) => t.free).map((t) => (
                        <button key={t.time} type="button" className="slot" aria-pressed={time === t.time} onClick={() => setTime(t.time)}>{time12(t.time)}</button>
                      ))}
                    </div>
                  )
                )}
              </section>
            )}

            {doctor && time && (
              <section className="card">
                <h3 className="opd-step"><span>3</span> Patient details</h3>
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
                    {busy ? "Booking…" : `Book ${time12(time)}, ${prettyDate(date, h)}`}
                  </button>
                </form>
              </section>
            )}
          </>
        )}

        <p className="muted tiny" style={{ textAlign: "center" }}>
          Need a lab test instead? <Link to={`/${slug}`}>Book a lab test</Link>
        </p>
      </main>
    </div>
  );
}
