import { useEffect, useState } from "react";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import { DAY_SHORT, initials, listDoctors, saveDoctor, time12 } from "../../lib/hms.js";
import { money } from "../../lib/api.js";

export default function Doctors() {
  const { lab, role, setHeader } = useShell();
  const [doctors, setDoctors] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const isOwner = role === "owner";

  useEffect(() => setHeader({ title: "Doctors", sub: "Specialties, OPD timings and consultation fees" }), [setHeader]);

  const load = () => listDoctors().then((d) => setDoctors(d.doctors)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      {isOwner && (
        <div className="toolbar">
          <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setEditing({})}>
            <Icon name="plus" size={16} /> Add doctor
          </button>
        </div>
      )}
      {error && <div className="notice notice-bad">{error}</div>}
      {!doctors ? (
        <div className="doc-grid">{[0, 1, 2].map((i) => <div key={i} className="panel skeleton" style={{ height: 220 }} />)}</div>
      ) : doctors.length === 0 ? (
        <div className="panel empty-state"><Icon name="stethoscope" size={30} /><p>No doctors added yet.</p></div>
      ) : (
        <div className="doc-grid">
          {doctors.map((d) => (
            <article key={d._id} className="panel doc-card" style={d.active ? undefined : { opacity: 0.6 }}>
              <div className="doc-top">
                <div className="avatar avatar-lg t-teal">{initials(d.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <h3>{d.name}</h3>
                  <div className="who-sub">{d.specialty}</div>
                  <div className="who-sub">{d.qualification}</div>
                </div>
              </div>
              <div className="days">
                {DAY_SHORT.map((day, i) => <span key={day} className={`day${d.days.includes(i) ? " on" : ""}`}>{day.slice(0, 2)}</span>)}
              </div>
              <dl className="doc-meta">
                <dt>Timings</dt><dd>{d.sessions.map((s) => `${time12(s.start)} – ${time12(s.end)}`).join(", ")}</dd>
                <dt>Fee</dt><dd>{money(d.consultFee, lab)} new · {money(d.followUpFee, lab)} follow-up</dd>
                <dt>Room</dt><dd>{d.room || "–"}</dd>
                <dt>Online</dt><dd>{d.onlineBooking ? "Patients can book online" : "Desk bookings only"}</dd>
                {isOwner && <><dt>Login</dt><dd>{d.loginEmail || "No login yet"}</dd></>}
              </dl>
              {isOwner && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(d)}><Icon name="edit" size={15} /> Edit</button>
              )}
            </article>
          ))}
        </div>
      )}
      {editing && <DoctorForm doctor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function DoctorForm({ doctor, onClose, onSaved }) {
  const [v, setV] = useState({
    name: "", specialty: "", qualification: "", regNo: "", phone: "", room: "",
    consultFee: 500, followUpFee: 300, days: [1, 2, 3, 4, 5, 6],
    sessions: [{ start: "09:00", end: "13:00" }], slotMinutes: 15, onlineBooking: true, active: true,
    loginEmail: "", loginPassword: "",
    ...doctor,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const bad = (k) => (error?.field?.startsWith(k) ? " invalid" : "");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: v.name, specialty: v.specialty, qualification: v.qualification, regNo: v.regNo, phone: v.phone, room: v.room,
        consultFee: Number(v.consultFee), followUpFee: Number(v.followUpFee), days: v.days, sessions: v.sessions,
        slotMinutes: Number(v.slotMinutes), onlineBooking: v.onlineBooking, active: v.active,
        loginEmail: v.loginEmail, loginPassword: v.loginPassword,
      };
      await saveDoctor(doctor._id, body);
      onSaved();
    } catch (err) {
      setError({ message: err.message, field: err.field || "" });
      setBusy(false);
    }
  }

  const toggleDay = (i) => setV((s) => ({ ...s, days: s.days.includes(i) ? s.days.filter((d) => d !== i) : [...s.days, i].sort() }));
  const setSession = (i, k) => (e) => setV((s) => ({ ...s, sessions: s.sessions.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }));

  return (
    <Drawer
      title={doctor._id ? `Edit ${doctor.name}` : "Add doctor"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="doctor-form" disabled={busy}>{busy ? "Saving…" : "Save doctor"}</button>
        </>
      }
    >
      <form id="doctor-form" className="form" onSubmit={submit} noValidate>
        {error && <div className="notice notice-bad" role="alert" style={{ margin: 0 }}>{error.message}</div>}
        <div className="two">
          <div><label className="field-label" htmlFor="d-name">Name</label><input id="d-name" className={`input${bad("name")}`} value={v.name} onChange={set("name")} placeholder="Dr. Full Name" /></div>
          <div><label className="field-label" htmlFor="d-spec">Specialty</label><input id="d-spec" className={`input${bad("specialty")}`} value={v.specialty} onChange={set("specialty")} placeholder="General Medicine" /></div>
        </div>
        <div className="two">
          <div><label className="field-label" htmlFor="d-qual">Qualification</label><input id="d-qual" className="input" value={v.qualification} onChange={set("qualification")} placeholder="MBBS, MD" /></div>
          <div><label className="field-label" htmlFor="d-reg">Registration no.</label><input id="d-reg" className="input" value={v.regNo} onChange={set("regNo")} /></div>
        </div>
        <div className="three">
          <div><label className="field-label" htmlFor="d-fee">New visit fee</label><input id="d-fee" className="input" inputMode="numeric" value={v.consultFee} onChange={set("consultFee")} /></div>
          <div><label className="field-label" htmlFor="d-ffee">Follow-up fee</label><input id="d-ffee" className="input" inputMode="numeric" value={v.followUpFee} onChange={set("followUpFee")} /></div>
          <div><label className="field-label" htmlFor="d-room">Room</label><input id="d-room" className="input" value={v.room} onChange={set("room")} placeholder="OPD 1" /></div>
        </div>

        <p className="section-title">OPD days</p>
        <div className="days" role="group" aria-label="Working days">
          {DAY_SHORT.map((d, i) => (
            <button key={d} type="button" className={`day${v.days.includes(i) ? " on" : ""}`} aria-pressed={v.days.includes(i)} onClick={() => toggleDay(i)}>{d}</button>
          ))}
        </div>

        <p className="section-title">Sessions</p>
        {v.sessions.map((s, i) => (
          <div key={i} className="toolbar">
            <input type="time" className={`input${bad("sessions")}`} value={s.start} onChange={setSession(i, "start")} aria-label="Session start" />
            <span className="muted">to</span>
            <input type="time" className={`input${bad("sessions")}`} value={s.end} onChange={setSession(i, "end")} aria-label="Session end" />
            {v.sessions.length > 1 && (
              <button type="button" className="icon-btn" aria-label="Remove session" onClick={() => setV((x) => ({ ...x, sessions: x.sessions.filter((_, j) => j !== i) }))}><Icon name="trash" size={16} /></button>
            )}
          </div>
        ))}
        <div className="toolbar">
          {v.sessions.length < 4 && (
            <button type="button" className="btn btn-soft btn-xs" onClick={() => setV((x) => ({ ...x, sessions: [...x.sessions, { start: "17:00", end: "20:00" }] }))}>
              <Icon name="plus" size={14} /> Add session
            </button>
          )}
          <label className="small" htmlFor="d-slot">Minutes per patient</label>
          <select id="d-slot" className="select" value={v.slotMinutes} onChange={set("slotMinutes")}>
            {[5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <label className="check"><input type="checkbox" checked={v.onlineBooking} onChange={set("onlineBooking")} /> Patients can book this doctor online</label>
        <label className="check"><input type="checkbox" checked={v.active} onChange={set("active")} /> Active (untick when the doctor leaves)</label>

        <p className="section-title">Doctor's own login (optional)</p>
        <p className="muted tiny" style={{ margin: 0 }}>Lets the doctor see their queue and write prescriptions. Leave the password blank to keep the current one.</p>
        <div className="two">
          <div><label className="field-label" htmlFor="d-email">Login email</label><input id="d-email" className={`input${bad("loginEmail")}`} type="email" value={v.loginEmail} onChange={set("loginEmail")} autoComplete="off" /></div>
          <div><label className="field-label" htmlFor="d-pass">Password (12+ characters)</label><input id="d-pass" className={`input${bad("loginPassword")}`} type="password" value={v.loginPassword} onChange={set("loginPassword")} autoComplete="new-password" /></div>
        </div>
      </form>
    </Drawer>
  );
}
