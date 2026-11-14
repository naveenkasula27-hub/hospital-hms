import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import PatientForm from "./PatientForm.jsx";
import {
  createAppointment, getSlots, listAppointments, listDoctors, listPatients, setAppointmentStatus, setPayment,
  STATUS, time12, prettyPhone,
} from "../../lib/hms.js";
import { money, prettyDate, todayForLab } from "../../lib/api.js";

const FILTERS = [
  { key: "", label: "All" },
  { key: "booked", label: "Booked" },
  { key: "checked_in", label: "Waiting" },
  { key: "in_consultation", label: "With doctor" },
  { key: "completed", label: "Completed" },
];

export default function Appointments() {
  const { lab, role, session, setHeader } = useShell();
  const navigate = useNavigate();
  const isDoctor = role === "doctor";
  const isDesk = role === "owner" || role === "reception";
  const canConsult = role === "owner" || role === "doctor";

  const [date, setDate] = useState(todayForLab(lab));
  const [doctor, setDoctor] = useState("");
  const [status, setStatus] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [booking, setBooking] = useState(false);
  const [paying, setPaying] = useState(null);

  useEffect(() => {
    setHeader(isDoctor
      ? { title: "My queue", sub: session.user.doctor ? `${session.user.doctor.name} · ${session.user.doctor.specialty}` : "" }
      : { title: "Appointments", sub: "OPD bookings, check-in and the token queue" });
  }, [isDoctor, session.user.doctor, setHeader]);

  useEffect(() => {
    if (!isDoctor) listDoctors().then((d) => setDoctors(d.doctors.filter((x) => x.active))).catch(() => {});
  }, [isDoctor]);

  const load = useCallback(() => {
    setError("");
    return listAppointments({ date, doctor })
      .then((d) => setRows(d.appointments))
      .catch((e) => setError(e.message));
  }, [date, doctor]);

  useEffect(() => {
    setRows(null);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => {
    const c = {};
    for (const r of rows || []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);
  // By time of day; walk-ins have no time and follow in token order.
  const shown = (rows || [])
    .filter((r) => !status || r.status === status)
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99") || a.token - b.token);

  async function move(appt, next) {
    if (next === "cancelled" && !window.confirm(`Cancel ${appt.patient?.name}'s appointment?`)) return;
    setBusyId(appt._id);
    try {
      await setAppointmentStatus(appt._id, next);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <div className="panel" style={{ padding: "14px 16px" }}>
        <div className="toolbar">
          <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          {!isDoctor && (
            <select className="select" value={doctor} onChange={(e) => setDoctor(e.target.value)} aria-label="Doctor">
              <option value="">All doctors</option>
              {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          )}
          <div className="segmented" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={status === f.key} onClick={() => setStatus(f.key)}>
                {f.label}<span className="n">{f.key ? counts[f.key] || 0 : rows?.length || 0}</span>
              </button>
            ))}
          </div>
          {isDesk && (
            <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setBooking(true)}>
              <Icon name="plus" size={16} /> New appointment
            </button>
          )}
        </div>
      </div>

      {error && <div className="notice notice-bad" role="alert">{error}</div>}

      <section className="panel panel-flush">
        {!rows ? (
          <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 180 }} /></div>
        ) : shown.length === 0 ? (
          <div className="empty-state">
            <Icon name="calendar" size={30} />
            <p>No appointments{status ? ` marked ${STATUS[status].toLowerCase()}` : ""} on {prettyDate(date, lab)}.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Token</th><th>Patient</th>{!isDoctor && <th>Doctor</th>}<th>Time</th><th>Visit</th>
                  {isDesk && <th>Fee</th>}<th>Status</th><th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r._id}>
                    <td><span className="token">{r.token}</span></td>
                    <td className="cell-patient">
                      <Link className="who-name" to={`/dashboard/patients/${r.patient?._id}`}>{r.patient?.name}</Link>
                      <div className="who-sub">{r.patient?.uhid} · {r.patient?.age}y {r.patient?.gender?.[0]}</div>
                      <div className="who-sub">{prettyPhone(r.patient?.phone)}</div>
                    </td>
                    {!isDoctor && <td>{r.doctor?.name}<div className="who-sub">{r.doctor?.specialty}</div></td>}
                    <td style={{ whiteSpace: "nowrap" }}>{time12(r.time)}</td>
                    <td>
                      {r.type === "follow_up" ? "Follow-up" : "New"}
                      <div className="who-sub">{r.source === "web" ? "Online" : r.source === "phone" ? "Phone" : "Desk"}</div>
                    </td>
                    {isDesk && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        {money(r.fee, lab)}
                        <div><span className={`badge s-${r.payment?.status || "unpaid"}`}>{r.payment?.status === "paid" ? `Paid${r.payment.method ? ` · ${r.payment.method.toUpperCase()}` : ""}` : r.payment?.status === "waived" ? "Waived" : r.bill ? "On bill" : "Unpaid"}</span></div>
                        {r.bill && <Link className="tiny" to={`/dashboard/billing/${r.bill}`}>View bill</Link>}
                      </td>
                    )}
                    <td><span className={`badge s-${r.status}`}>{STATUS[r.status]}</span></td>
                    <td>
                      <div className="actions">
                        {isDesk && r.status === "booked" && (
                          <button className="btn btn-soft btn-xs" disabled={busyId === r._id} onClick={() => move(r, "checked_in")}>Check in</button>
                        )}
                        {isDesk && !r.bill && r.payment?.status === "unpaid" && r.fee > 0 && !["cancelled", "no_show"].includes(r.status) && (
                          <button className="btn btn-quiet btn-xs" onClick={() => setPaying(r)}>Collect fee</button>
                        )}
                        {isDesk && r.status === "completed" && (
                          <Link className="btn btn-soft btn-xs" to={`/dashboard/billing/new?patient=${r.patient?._id}`}>Bill visit</Link>
                        )}
                        {canConsult && ["checked_in", "in_consultation"].includes(r.status) && (
                          <button className="btn btn-primary btn-xs" onClick={() => navigate(`/dashboard/consult/${r._id}`)}>
                            {r.status === "checked_in" ? "Start consultation" : "Continue"}
                          </button>
                        )}
                        {r.status === "completed" && (
                          <>
                            {canConsult && <button className="btn btn-quiet btn-xs" onClick={() => navigate(`/dashboard/consult/${r._id}`)}>Open</button>}
                            <a className="btn btn-quiet btn-xs" href={`/print/rx/${r._id}`} target="_blank" rel="noopener noreferrer"><Icon name="printer" size={14} /> Rx</a>
                          </>
                        )}
                        {isDesk && ["booked", "checked_in"].includes(r.status) && (
                          <>
                            <button className="btn btn-quiet btn-xs" disabled={busyId === r._id} onClick={() => move(r, "no_show")}>No-show</button>
                            <button className="btn btn-quiet btn-xs btn-danger" disabled={busyId === r._id} onClick={() => move(r, "cancelled")}>Cancel</button>
                          </>
                        )}
                        {isDesk && ["cancelled", "no_show"].includes(r.status) && (
                          <button className="btn btn-quiet btn-xs" disabled={busyId === r._id} onClick={() => move(r, "booked")}>Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {booking && (
        <NewAppointment
          doctors={doctors}
          defaultDate={date}
          onClose={() => setBooking(false)}
          onBooked={(appt) => {
            setBooking(false);
            setStatus("");
            if (appt.date !== date) setDate(appt.date);
            else load();
          }}
        />
      )}
      {paying && <CollectFee appt={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />}
    </>
  );
}

function CollectFee({ appt, onClose, onDone }) {
  const { lab } = useShell();
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(status) {
    setBusy(true);
    setError("");
    try {
      await setPayment(appt._id, status, status === "paid" ? method : "");
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Collect consultation fee"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" disabled={busy} onClick={() => save("waived")}>Waive fee</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => save("paid")}>Mark {money(appt.fee, lab)} paid</button>
        </>
      }
    >
      {error && <div className="notice notice-bad">{error}</div>}
      <p className="muted small" style={{ margin: 0 }}>Marking it paid makes an invoice for the fee. Lab tests and other charges can be billed later from Billing.</p>
      <div className="picked">
        <div className="avatar">{appt.token}</div>
        <div>
          <div className="who-name">{appt.patient?.name}</div>
          <div className="who-sub">{appt.doctor?.name} · {appt.type === "follow_up" ? "Follow-up" : "New visit"}</div>
        </div>
        <div className="kpi-value" style={{ marginLeft: "auto", fontSize: "1.3rem" }}>{money(appt.fee, lab)}</div>
      </div>
      <div>
        <p className="field-label">Paid by</p>
        <div className="radios">
          {[["cash", "Cash"], ["upi", "UPI"], ["card", "Card"]].map(([k, l]) => (
            <label key={k} className="radio">
              <input type="radio" name="method" checked={method === k} onChange={() => setMethod(k)} /> {l}
            </label>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

function NewAppointment({ doctors, defaultDate, onClose, onBooked }) {
  const { lab } = useShell();
  const today = todayForLab(lab);
  const [patient, setPatient] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [doctorId, setDoctorId] = useState(doctors[0]?._id || "");
  const [date, setDate] = useState(defaultDate < today ? today : defaultDate);
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState("");
  const [type, setType] = useState("new");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => listPatients({ q }).then((d) => setResults(d.patients)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setTime("");
    setSlots(null);
    if (!doctorId || !date) return;
    getSlots(doctorId, date).then(setSlots).catch((e) => setSlots({ open: false, error: e.message, times: [] }));
  }, [doctorId, date]);

  useEffect(() => {
    if (patient?.lastVisit || patient?.visits) setType("follow_up");
  }, [patient]);

  useEffect(() => {
    if (!doctorId && doctors[0]) setDoctorId(doctors[0]._id);
  }, [doctors, doctorId]);

  const doctor = doctors.find((d) => d._id === doctorId);

  async function book(walkIn) {
    setError("");
    if (!patient) return setError("Choose or register the patient first.");
    if (!walkIn && !time) return setError("Pick a time, or book as a walk-in.");
    setBusy(true);
    try {
      const { appointment } = await createAppointment({
        patient: patient._id, doctor: doctorId, date, time: walkIn ? "" : time, type, reason, source: "desk",
      });
      onBooked(appointment);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="New appointment"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" disabled={busy || !patient} onClick={() => book(true)}>Add as walk-in</button>
          <button className="btn btn-primary" disabled={busy || !patient || !time} onClick={() => book(false)}>
            {busy ? "Booking…" : time ? `Book ${time12(time)}` : "Book"}
          </button>
        </>
      }
    >
      {error && <div className="notice notice-bad" role="alert" style={{ margin: 0 }}>{error}</div>}

      <p className="section-title">1. Patient</p>
      {patient ? (
        <div className="picked">
          <div className="avatar">{patient.name[0]}</div>
          <div>
            <div className="who-name">{patient.name}</div>
            <div className="who-sub">{patient.uhid} · {patient.age}y {patient.gender} · {prettyPhone(patient.phone)}</div>
          </div>
          <button type="button" className="btn btn-quiet btn-xs" style={{ marginLeft: "auto" }} onClick={() => { setPatient(null); setType("new"); }}>Change</button>
        </div>
      ) : registering ? (
        <div className="panel" style={{ background: "#fafbfd" }}>
          <PatientForm compact onSaved={(p) => { setPatient(p); setRegistering(false); }} formId="quick-patient" />
          <button type="button" className="btn btn-quiet btn-sm" style={{ marginTop: 10 }} onClick={() => setRegistering(false)}>Back to search</button>
        </div>
      ) : (
        <div>
          <div className="search-box">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search by name, mobile or UHID" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search patients" />
          </div>
          {results.length > 0 && (
            <ul className="results">
              {results.map((p) => (
                <li key={p._id}>
                  <button type="button" onClick={() => setPatient(p)}>
                    <div className="avatar">{p.name[0]}</div>
                    <div>
                      <div className="who-name">{p.name}</div>
                      <div className="who-sub">{p.uhid} · {p.age}y {p.gender} · {prettyPhone(p.phone)}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && results.length === 0 && <p className="muted small">No patient found.</p>}
          <button type="button" className="btn btn-soft btn-sm" style={{ marginTop: 10 }} onClick={() => setRegistering(true)}>
            <Icon name="userPlus" size={16} /> Register a new patient
          </button>
        </div>
      )}

      <p className="section-title">2. Doctor and date</p>
      <div className="two">
        <div>
          <label className="field-label" htmlFor="a-doctor">Doctor</label>
          <select id="a-doctor" className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => <option key={d._id} value={d._id}>{d.name} · {d.specialty}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="a-date">Date</label>
          <input id="a-date" type="date" className="input" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="two">
        <div>
          <label className="field-label" htmlFor="a-type">Visit type</label>
          <select id="a-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="new">New visit · {money(doctor?.consultFee ?? 0, lab)}</option>
            <option value="follow_up">Follow-up · {money(doctor?.followUpFee ?? 0, lab)}</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="a-reason">Reason (optional)</label>
          <input id="a-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever, follow-up" />
        </div>
      </div>

      <p className="section-title">3. Time</p>
      {!slots ? (
        <div className="skeleton" style={{ height: 44 }} />
      ) : slots.error ? (
        <p className="err">{slots.error}</p>
      ) : !slots.open ? (
        <p className="muted small">{doctor?.name} does not sit on {prettyDate(date, lab)}.</p>
      ) : (
        <div className="slots">
          {slots.times.map((s) => (
            <button key={s.time} type="button" className="slot" disabled={!s.free} aria-pressed={time === s.time} onClick={() => setTime(s.time)}>
              {time12(s.time)}
            </button>
          ))}
        </div>
      )}
    </Drawer>
  );
}
