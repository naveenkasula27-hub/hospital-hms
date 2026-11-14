import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import { getAppointment, getFormulary, getLabTests, saveConsultation, STATUS, prettyPhone, time12 } from "../../lib/hms.js";
import { money, prettyDate } from "../../lib/api.js";

const VITALS = [
  ["bp", "BP (mmHg)", "120/80"],
  ["pulse", "Pulse (/min)", "72"],
  ["temperature", "Temp (°F)", "98.6"],
  ["spo2", "SpO₂ (%)", "98"],
  ["weight", "Weight (kg)", ""],
  ["height", "Height (cm)", ""],
];

const FREQUENCIES = ["1-0-1", "1-1-1", "1-0-0", "0-0-1", "0-1-0", "1-1-1-1", "As needed"];
const BLANK_RX = { medicine: "", dose: "", frequency: "1-0-1", duration: "5 days", instructions: "After food" };

export default function Consultation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lab, setHeader } = useShell();

  const [appt, setAppt] = useState(null);
  const [history, setHistory] = useState([]);
  const [tests, setTests] = useState([]);
  const [vitals, setVitals] = useState({});
  const [consult, setConsult] = useState({ complaints: "", findings: "", diagnosis: "", advice: "", followUpDate: "" });
  const [rx, setRx] = useState([]);
  const [labCodes, setLabCodes] = useState([]);
  const [labQuery, setLabQuery] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [formulary, setFormulary] = useState([]);

  useEffect(() => {
    let alive = true;
    Promise.all([getAppointment(id), getLabTests()])
      .then(([a, t]) => {
        if (!alive) return;
        const ap = a.appointment;
        setAppt(ap);
        setHistory(a.history);
        setTests(t.tests.filter((x) => x.active));
        setVitals(ap.vitals || {});
        setConsult({ ...ap.consult, complaints: ap.consult?.complaints || ap.reason || "" });
        setRx(ap.prescription?.length ? ap.prescription : [{ ...BLANK_RX }]);
        setLabCodes(ap.labOrders.map((o) => o.code));
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id]);

  // The hospital pharmacy's list, so the doctor picks names the counter can match. Free text still works.
  useEffect(() => { getFormulary().then((d) => setFormulary(d.medicines)).catch(() => {}); }, []);

  useEffect(() => {
    if (appt) setHeader({ title: `Consultation · Token ${appt.token}`, sub: `${appt.doctor.name} · ${prettyDate(appt.date, lab)} · ${time12(appt.time)}` });
  }, [appt, lab, setHeader]);

  const ordered = useMemo(() => new Set(appt?.labOrders.map((o) => o.code) || []), [appt]);
  const matches = useMemo(() => {
    const q = labQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return tests
      .filter((t) => !labCodes.includes(t.code) && (t.name.toLowerCase().includes(q) || t.alias?.toLowerCase().includes(q) || t.code.includes(q)))
      .slice(0, 8);
  }, [labQuery, tests, labCodes]);

  if (error && !appt) return <div className="notice notice-bad">{error}</div>;
  if (!appt) return <div className="panel skeleton" style={{ height: 320 }} />;

  const p = appt.patient;
  const readOnly = appt.status === "completed";
  const setC = (k) => (e) => setConsult((s) => ({ ...s, [k]: e.target.value }));
  const setRxField = (i, k) => (e) => setRx((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));

  async function save(complete) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const { appointment } = await saveConsultation(appt._id, {
        vitals,
        consult,
        prescription: rx.filter((r) => r.medicine.trim()),
        labTestCodes: labCodes,
        complete,
      });
      if (complete) {
        navigate(`/print/rx/${appt._id}?from=queue`);
        return;
      }
      setAppt((a) => ({ ...a, status: appointment.status, labOrders: appointment.labOrders }));
      setSaved("Saved. Lab orders were sent to the lab's queue.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const testName = (code) => tests.find((t) => t.code === code)?.name || appt.labOrders.find((o) => o.code === code)?.name || code;

  return (
    <div className="consult">
      <aside className="consult-side">
        <section className="panel">
          <div className="doc-top" style={{ marginBottom: 14 }}>
            <div className="avatar avatar-lg">{p.name[0]}</div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{p.name}</h2>
              <div className="who-sub">{p.uhid} · {p.age}y · {p.gender}</div>
            </div>
          </div>
          {(p.allergies || p.conditions) && (
            <div className="chip-list" style={{ marginBottom: 12 }}>
              {p.allergies && <span className="alert-chip">Allergy: {p.allergies}</span>}
              {p.conditions && <span className="tag">{p.conditions}</span>}
            </div>
          )}
          <dl className="facts">
            <dt>Mobile</dt><dd>{prettyPhone(p.phone)}</dd>
            <dt>Blood group</dt><dd>{p.bloodGroup || "Not known"}</dd>
            <dt>Visit</dt><dd>{appt.type === "follow_up" ? "Follow-up" : "New"} · {money(appt.fee, lab)}</dd>
            <dt>Status</dt><dd><span className={`badge s-${appt.status}`}>{STATUS[appt.status]}</span></dd>
          </dl>
          <Link className="btn btn-quiet btn-sm btn-block" style={{ marginTop: 14 }} to={`/dashboard/patients/${p._id}`}>Full patient record</Link>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Previous visits</h2></div>
          {history.length === 0 ? (
            <p className="muted small">First visit to this hospital.</p>
          ) : (
            <ul className="timeline">
              {history.map((h) => (
                <li key={h._id}>
                  <strong className="small">{prettyDate(h.date, lab)}</strong> <span className="who-sub">· {h.doctor?.name}</span>
                  {h.consult?.diagnosis && <p><strong>{h.consult.diagnosis}</strong></p>}
                  {h.prescription?.length > 0 && <p className="muted">{h.prescription.map((r) => r.medicine).join(", ")}</p>}
                  {h.labOrders?.length > 0 && <p className="muted">Labs: {h.labOrders.map((o) => o.name).join(", ")}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <section className="panel">
        {error && <div className="notice notice-bad" role="alert">{error}</div>}
        {saved && <div className="notice notice-ok" role="status">{saved}</div>}
        {readOnly && <div className="notice notice-ok">This consultation is complete. Changes you save update the record.</div>}

        <div className="form">
          <div>
            <p className="section-title" style={{ marginBottom: 10 }}>Vitals</p>
            <div className="vitals">
              {VITALS.map(([k, label, ph]) => (
                <div key={k}>
                  <label htmlFor={`v-${k}`}>{label}</label>
                  <input id={`v-${k}`} className="input" placeholder={ph} value={vitals[k] || ""} onChange={(e) => setVitals((s) => ({ ...s, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="two">
            <div>
              <label className="field-label" htmlFor="c-complaints">Chief complaints</label>
              <textarea id="c-complaints" className="textarea" value={consult.complaints} onChange={setC("complaints")} />
            </div>
            <div>
              <label className="field-label" htmlFor="c-findings">Examination findings</label>
              <textarea id="c-findings" className="textarea" value={consult.findings} onChange={setC("findings")} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="c-diagnosis">Diagnosis</label>
            <input id="c-diagnosis" className="input" value={consult.diagnosis} onChange={setC("diagnosis")} placeholder="e.g. Acute viral fever" />
          </div>

          <div>
            <div className="panel-head" style={{ marginBottom: 6 }}>
              <p className="section-title">Prescription</p>
              <button type="button" className="btn btn-soft btn-xs" onClick={() => setRx((r) => [...r, { ...BLANK_RX }])}>
                <Icon name="plus" size={14} /> Add medicine
              </button>
            </div>
            <datalist id="formulary">
              {formulary.map((m) => <option key={m._id} value={m.name}>{m.inStock ? `In pharmacy · ${m.inStock}` : "Out of stock"}</option>)}
            </datalist>
            <div className="table-wrap">
              <table className="table rx-table">
                <thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>Days</th><th>Instructions</th><th /></tr></thead>
                <tbody>
                  {rx.map((r, i) => (
                    <tr key={i}>
                      <td style={{ minWidth: 180 }}><input className="input" aria-label="Medicine" list="formulary" value={r.medicine} onChange={setRxField(i, "medicine")} placeholder="Paracetamol 650 mg" /></td>
                      <td style={{ minWidth: 80 }}><input className="input" aria-label="Dose" value={r.dose} onChange={setRxField(i, "dose")} placeholder="1 tab" /></td>
                      <td style={{ minWidth: 110 }}>
                        <select className="select input" aria-label="Frequency" value={r.frequency} onChange={setRxField(i, "frequency")}>
                          {[...new Set([r.frequency, ...FREQUENCIES])].filter(Boolean).map((f) => <option key={f}>{f}</option>)}
                        </select>
                      </td>
                      <td style={{ minWidth: 90 }}><input className="input" aria-label="Duration" value={r.duration} onChange={setRxField(i, "duration")} /></td>
                      <td style={{ minWidth: 130 }}><input className="input" aria-label="Instructions" value={r.instructions} onChange={setRxField(i, "instructions")} /></td>
                      <td>
                        <button type="button" className="icon-btn" aria-label="Remove medicine" onClick={() => setRx((rows) => rows.filter((_, j) => j !== i))}>
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="section-title" style={{ marginBottom: 8 }}>Lab tests</p>
            <div className="chip-list" style={{ marginBottom: 8 }}>
              {labCodes.map((code) => (
                <span key={code} className="tag">
                  {testName(code)}
                  {ordered.has(code) ? (
                    <Icon name="check" size={14} />
                  ) : (
                    <button type="button" aria-label={`Remove ${testName(code)}`} onClick={() => setLabCodes((c) => c.filter((x) => x !== code))}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </span>
              ))}
              {labCodes.length === 0 && <span className="muted small">No tests ordered.</span>}
            </div>
            <div className="search-box">
              <Icon name="search" size={16} />
              <input className="input" placeholder="Search tests: CBC, sugar, thyroid…" value={labQuery} onChange={(e) => setLabQuery(e.target.value)} aria-label="Search lab tests" />
            </div>
            {matches.length > 0 && (
              <ul className="results">
                {matches.map((t) => (
                  <li key={t.code}>
                    <button type="button" onClick={() => { setLabCodes((c) => [...c, t.code]); setLabQuery(""); }}>
                      <Icon name="flask" size={16} />
                      <div style={{ flex: 1 }}>
                        <div className="who-name">{t.name}</div>
                        <div className="who-sub">{t.category}{t.fasting ? ` · ${t.fasting}` : ""}</div>
                      </div>
                      <span className="small">{t.price != null ? money(t.price, lab) : "Price on request"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {appt.labBooking && <p className="muted tiny" style={{ marginTop: 6 }}>Lab booking {appt.labBooking.reference} · {appt.labBooking.status.replace("_", " ")}</p>}
          </div>

          <div className="two">
            <div>
              <label className="field-label" htmlFor="c-advice">Advice</label>
              <textarea id="c-advice" className="textarea" value={consult.advice} onChange={setC("advice")} />
            </div>
            <div>
              <label className="field-label" htmlFor="c-follow">Follow-up date</label>
              <input id="c-follow" type="date" className="input" min={appt.date} value={consult.followUpDate} onChange={setC("followUpDate")} />
            </div>
          </div>
        </div>

        <div className="sticky-actions">
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => save(false)}>Save draft</button>
          {readOnly ? (
            <a className="btn btn-quiet" href={`/print/rx/${appt._id}`} target="_blank" rel="noopener noreferrer"><Icon name="printer" size={16} /> Print prescription</a>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(true)}>
              <Icon name="check" size={16} /> {busy ? "Saving…" : "Complete & print"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
