import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import PatientForm from "./PatientForm.jsx";
import {
  BILL_STATUS, INSURER_TYPE, createPolicy, deletePolicy, getPatient, listInsurers, listPolicies, money2, prettyPhone, STATUS, time12, updatePolicy,
} from "../../lib/hms.js";
import { money, prettyDate } from "../../lib/api.js";
import { STATUS_LABELS } from "../../lib/dash.js";

export default function PatientProfile() {
  const { id } = useParams();
  const { lab, role, setHeader } = useShell();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setData(null);
    getPatient(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (data) setHeader({ title: data.patient.name, sub: `Patient record · ${data.patient.uhid}` });
  }, [data, setHeader]);

  if (error) return <div className="notice notice-bad">{error}</div>;
  if (!data) return <div className="panel skeleton" style={{ height: 260 }} />;

  const { patient: p, visits, labBookings, bills } = data;
  const due = (bills || []).filter((b) => b.status !== "cancelled").reduce((s, b) => s + b.due, 0);
  const done = visits.filter((v) => v.status === "completed");
  const canEdit = role === "owner" || role === "reception";

  return (
    <>
      <Link to="/dashboard/patients" className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Icon name="arrowLeft" size={15} /> All patients
      </Link>

      <section className="panel">
        <div className="profile-head">
          <div className="avatar avatar-lg">{p.name[0]}</div>
          <div>
            <h2>{p.name}</h2>
            <div className="who-sub">{p.uhid} · {p.age} years · {p.gender} · Registered {prettyDate(p.registeredOn, lab)}</div>
          </div>
          <div className="stat-row">
            <div><strong>{done.length}</strong><span>Consultations</span></div>
            <div><strong>{labBookings.length}</strong><span>Lab bookings</span></div>
            <div><strong>{visits[0] ? prettyDate(visits[0].date, lab) : "–"}</strong><span>Last visit</span></div>
          </div>
          {canEdit && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Edit</button>
          )}
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Visit history</h2></div>
          {visits.length === 0 ? (
            <p className="muted small">No OPD visits yet.</p>
          ) : (
            <ul className="timeline">
              {visits.map((v) => (
                <li key={v._id}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong className="small">{prettyDate(v.date, lab)} · {time12(v.time)}</strong>
                    <span className={`badge s-${v.status}`}>{STATUS[v.status]}</span>
                    <span className="who-sub">Token {v.token} · {v.doctor?.name}, {v.doctor?.specialty}</span>
                  </div>
                  {v.consult?.diagnosis && <p><strong>Diagnosis:</strong> {v.consult.diagnosis}</p>}
                  {v.consult?.complaints && <p className="muted">{v.consult.complaints}</p>}
                  {v.vitals?.bp && <p className="muted">BP {v.vitals.bp} · Pulse {v.vitals.pulse || "–"} · Temp {v.vitals.temperature || "–"} · SpO₂ {v.vitals.spo2 || "–"}</p>}
                  {v.prescription?.length > 0 && (
                    <p>{v.prescription.map((r) => `${r.medicine} (${r.frequency}, ${r.duration})`).join(" · ")}</p>
                  )}
                  {v.labOrders?.length > 0 && <p className="muted">Lab: {v.labOrders.map((o) => o.name).join(", ")}</p>}
                  {v.status === "completed" && (
                    <a className="small" href={`/print/rx/${v._id}`} target="_blank" rel="noopener noreferrer">Print prescription</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <section className="panel">
            <div className="panel-head"><h2>Details</h2></div>
            {(p.allergies || p.conditions) && (
              <div className="chip-list" style={{ marginBottom: 12 }}>
                {p.allergies && <span className="alert-chip">Allergy: {p.allergies}</span>}
                {p.conditions && <span className="tag">{p.conditions}</span>}
              </div>
            )}
            <dl className="facts">
              <dt>Mobile</dt><dd>{prettyPhone(p.phone)}</dd>
              <dt>Blood group</dt><dd>{p.bloodGroup || "Not known"}</dd>
              <dt>Email</dt><dd>{p.email || "–"}</dd>
              <dt>Address</dt><dd>{p.address || "–"}</dd>
              <dt>Emergency</dt><dd>{p.emergencyName ? `${p.emergencyName}, ${prettyPhone(p.emergencyPhone)}` : "–"}</dd>
              <dt>ABHA ID</dt><dd>{p.abhaId || "–"}</dd>
            </dl>
          </section>

          {bills && (
            <section className="panel">
              <div className="panel-head">
                <h2>Bills</h2>
                <Link className="btn btn-soft btn-xs" to={`/dashboard/billing/new?patient=${p._id}`}><Icon name="plus" size={14} /> New bill</Link>
              </div>
              {bills.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>No bills yet.</p>
              ) : (
                <>
                  {due > 0 && <div className="notice notice-warn" style={{ margin: "0 0 10px" }}>{money2(due, lab)} is due from this patient.</div>}
                  <ul className="list">
                    {bills.map((b) => (
                      <li key={b._id}>
                        <div className="kpi-icon t-green" style={{ width: 36, height: 36 }}><Icon name="file" size={16} /></div>
                        <div className="grow">
                          <Link className="who-name small" to={`/dashboard/billing/${b._id}`}>{b.number}</Link>
                          <div className="who-sub">{prettyDate(b.date, lab)} · {money2(b.total, lab)}{b.due > 0 && b.status !== "cancelled" ? ` · ${money2(b.due, lab)} due` : ""}</div>
                        </div>
                        <span className={`badge b-${b.status}`}>{BILL_STATUS[b.status]}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {canEdit && <PolicySection patient={p} lab={lab} role={role} />}

          <section className="panel">
            <div className="panel-head"><h2>Lab bookings</h2></div>
            {labBookings.length === 0 ? (
              <p className="muted small">No lab tests yet.</p>
            ) : (
              <ul className="list">
                {labBookings.map((b) => (
                  <li key={b._id}>
                    <div className="kpi-icon t-blue" style={{ width: 36, height: 36 }}><Icon name="flask" size={16} /></div>
                    <div className="grow">
                      <div className="who-name small">{b.items.map((i) => i.name).join(", ") || "See notes"}</div>
                      <div className="who-sub">{b.reference} · {prettyDate(b.date, lab)}{b.estimatedTotal != null ? ` · ${money(b.estimatedTotal, lab)}` : ""}</div>
                    </div>
                    <span className={`pill pill-${b.status}`}>{STATUS_LABELS[b.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {editing && (
        <Drawer
          title="Edit patient details"
          onClose={() => setEditing(false)}
          footer={
            <>
              <button className="btn btn-quiet" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit" form="patient-form">Save changes</button>
            </>
          }
        >
          <PatientForm patient={p} onSaved={(saved) => { setData((d) => ({ ...d, patient: saved })); setEditing(false); }} />
        </Drawer>
      )}
    </>
  );
}

function PolicySection({ patient, lab, role }) {
  const [policies, setPolicies] = useState(null);
  const [insurers, setInsurers] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ insurer: "", policyNumber: "", memberId: "", validFrom: "", validTo: "", sumInsured: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => listPolicies({ patient: patient._id }).then((d) => setPolicies(d.policies));
  useEffect(() => { load(); listInsurers().then((d) => setInsurers(d.insurers)); }, [patient._id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await createPolicy({ ...form, patient: patient._id, sumInsured: Number(form.sumInsured) || 0 });
      setAdding(false); setForm({ insurer: "", policyNumber: "", memberId: "", validFrom: "", validTo: "", sumInsured: "", notes: "" });
      load();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function remove(id) {
    if (!confirm("Remove this policy?")) return;
    try { await deletePolicy(id); load(); } catch (err) { alert(err.message); }
  }

  if (!policies) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Insurance policies</h2>
        {!adding && <button className="btn btn-soft btn-xs" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add policy</button>}
      </div>

      {policies.length === 0 && !adding && <p className="muted small" style={{ margin: 0 }}>No insurance on file.</p>}

      {policies.map((p) => (
        <div key={p._id} className="picked" style={{ marginBottom: 8 }}>
          <div className="kpi-icon t-blue" style={{ width: 34, height: 34 }}><Icon name="shield" size={16} /></div>
          <div className="grow">
            <div className="who-name small">{p.insurer?.name} · {p.policyNumber}</div>
            <div className="who-sub">
              {p.memberId ? `Member ${p.memberId} · ` : ""}
              {p.validFrom && p.validTo ? `${prettyDate(p.validFrom, lab)} to ${prettyDate(p.validTo, lab)}` : ""}
              {p.sumInsured > 0 ? ` · Sum ₹${p.sumInsured.toLocaleString("en-IN")}` : ""}
            </div>
          </div>
          {role === "owner" && <button className="btn btn-quiet btn-xs btn-danger" onClick={() => remove(p._id)}>Remove</button>}
        </div>
      ))}

      {adding && (
        <form onSubmit={save} style={{ display: "grid", gap: 10, padding: "10px 0" }}>
          {error && <div className="notice notice-bad">{error}</div>}
          <div>
            <label className="field-label">Insurer</label>
            <select className="input" value={form.insurer} onChange={set("insurer")} required>
              <option value="">Choose</option>
              {insurers.map((i) => <option key={i._id} value={i._id}>{i.name} ({INSURER_TYPE[i.type]})</option>)}
            </select>
            {insurers.length === 0 && <p className="muted tiny">No insurers yet. Add them under Insurance &gt; Insurers &amp; TPAs.</p>}
          </div>
          <div><label className="field-label">Policy number</label><input className="input" value={form.policyNumber} onChange={set("policyNumber")} required maxLength={60} /></div>
          <div><label className="field-label">Member ID (optional)</label><input className="input" value={form.memberId} onChange={set("memberId")} maxLength={60} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label className="field-label">Valid from</label><input className="input" type="date" value={form.validFrom} onChange={set("validFrom")} /></div>
            <div><label className="field-label">Valid to</label><input className="input" type="date" value={form.validTo} onChange={set("validTo")} /></div>
          </div>
          <div><label className="field-label">Sum insured</label><input className="input" type="number" min="0" value={form.sumInsured} onChange={set("sumInsured")} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : "Save policy"}</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
