import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import { ADMISSION_STATUS, WARD_TYPE, getAdmission, dischargeAdmission, money2, prettyPhone } from "../../lib/hms.js";

function daysBetween(a, b) {
  const ms = new Date(b) - new Date(a);
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

function dateFmt(d, lab) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(lab?.locale || "en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function AdmissionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lab, role, setHeader } = useShell();
  const [adm, setAdm] = useState(null);
  const [error, setError] = useState("");
  const [discharging, setDischarging] = useState(false);

  useEffect(() => {
    getAdmission(id).then((d) => setAdm(d.admission)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (adm) setHeader({ title: `Admission ${adm.admissionNumber}`, sub: `${adm.patient?.name} · ${adm.ward?.name}` });
  }, [adm, setHeader]);

  if (error && !adm) return <div className="notice notice-bad">{error}</div>;
  if (!adm) return <div className="panel skeleton" style={{ height: 300 }} />;

  const p = adm.patient;
  const days = daysBetween(adm.admittedAt, adm.dischargedAt || new Date());
  const charges = days * (adm.ward?.dailyRate || 0);
  const canDischarge = (role === "owner" || role === "doctor") && adm.status === "admitted";

  return (
    <>
      <Link to="/dashboard/ipd/admissions" className="small back-link"><Icon name="arrowLeft" size={15} /> All admissions</Link>

      <div className="bill-layout">
        <section className="panel panel-flush" style={{ minWidth: 0 }}>
          <div className="panel-head" style={{ padding: "18px 20px 0" }}>
            <div>
              <h2 style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {adm.admissionNumber} <span className={`badge adm-${adm.status}`}>{ADMISSION_STATUS[adm.status]}</span>
              </h2>
              <p className="muted tiny" style={{ margin: 0 }}>Admitted {dateFmt(adm.admittedAt, lab)}</p>
            </div>
            <div className="actions">
              {canDischarge && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setDischarging(true)}>
                  <Icon name="check" size={15} /> Discharge patient
                </button>
              )}
            </div>
          </div>

          <div className="picked" style={{ margin: "14px 20px" }}>
            <div className="avatar">{p.name[0]}</div>
            <div>
              <Link className="who-name" to={`/dashboard/patients/${p._id}`}>{p.name}</Link>
              <div className="who-sub">{p.uhid} · {p.age}y {p.gender} · {prettyPhone(p.phone)}</div>
            </div>
          </div>

          <div style={{ padding: "0 20px 20px", display: "grid", gap: 16 }}>
            <dl className="facts">
              <dt>Ward</dt><dd>{adm.ward?.name} ({WARD_TYPE[adm.ward?.type]})</dd>
              <dt>Bed</dt><dd>{adm.bed?.number}{adm.ward?.floor ? ` · Floor ${adm.ward.floor}` : ""}</dd>
              <dt>Doctor</dt><dd>{adm.doctor?.name} — {adm.doctor?.specialty}</dd>
              {adm.reason && <><dt>Reason</dt><dd>{adm.reason}</dd></>}
              {adm.diagnosis && <><dt>Diagnosis</dt><dd>{adm.diagnosis}</dd></>}
              {adm.expectedDischarge && <><dt>Expected discharge</dt><dd>{dateFmt(adm.expectedDischarge, lab)}</dd></>}
            </dl>

            {(adm.vitals?.bp || adm.vitals?.pulse || adm.vitals?.temperature || adm.vitals?.spo2 || adm.vitals?.weight) && (
              <div>
                <h3 className="small" style={{ marginBottom: 6 }}>Vitals on admission</h3>
                <div className="chip-list">
                  {adm.vitals.bp && <span className="tag">BP {adm.vitals.bp}</span>}
                  {adm.vitals.pulse && <span className="tag">Pulse {adm.vitals.pulse}</span>}
                  {adm.vitals.temperature && <span className="tag">Temp {adm.vitals.temperature}</span>}
                  {adm.vitals.spo2 && <span className="tag">SpO₂ {adm.vitals.spo2}</span>}
                  {adm.vitals.weight && <span className="tag">Wt {adm.vitals.weight}</span>}
                </div>
              </div>
            )}

            {adm.notes && <p className="small"><strong>Notes:</strong> {adm.notes}</p>}

            {adm.status === "discharged" && (
              <div className="notice" style={{ margin: 0 }}>
                <strong>Discharged</strong> on {dateFmt(adm.dischargedAt, lab)} by {adm.dischargedBy || "–"}
                {adm.dischargeSummary && <p style={{ margin: "6px 0 0" }}>{adm.dischargeSummary}</p>}
              </div>
            )}
          </div>
        </section>

        <aside style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <section className="panel bill-summary">
            <h2>Stay summary</h2>
            <dl className="sums">
              <dt>Duration</dt><dd>{days} day{days !== 1 ? "s" : ""}</dd>
              <dt>Daily rate</dt><dd>{money2(adm.ward?.dailyRate || 0, lab)}</dd>
              <dt className="sum-total">Bed charges</dt><dd className="sum-total">{money2(charges, lab)}</dd>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Quick links</h2></div>
            <ul className="list">
              <li>
                <Link to={`/dashboard/patients/${p._id}`} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div className="kpi-icon t-blue" style={{ width: 32, height: 32 }}><Icon name="users" size={14} /></div>
                  <span className="who-name small">Patient profile</span>
                </Link>
              </li>
              <li>
                <Link to={`/dashboard/billing/new?patient=${p._id}`} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div className="kpi-icon t-green" style={{ width: 32, height: 32 }}><Icon name="wallet" size={14} /></div>
                  <span className="who-name small">Create bill for this patient</span>
                </Link>
              </li>
            </ul>
          </section>
        </aside>
      </div>

      {discharging && (
        <DischargeDrawer
          admission={adm}
          onClose={() => setDischarging(false)}
          onDone={(updated) => { setAdm(updated); setDischarging(false); }}
        />
      )}
    </>
  );
}

function DischargeDrawer({ admission, onClose, onDone }) {
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const { admission: updated } = await dischargeAdmission(admission._id, { dischargeSummary: summary });
      onDone(updated);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={`Discharge ${admission.patient?.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Discharging…" : "Discharge patient"}</button>
        </>
      }
    >
      {error && <div className="notice notice-bad">{error}</div>}
      <div className="picked">
        <div className="avatar">{admission.patient?.name?.[0]}</div>
        <div>
          <div className="who-name">{admission.patient?.name}</div>
          <div className="who-sub">{admission.ward?.name} · Bed {admission.bed?.number}</div>
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="ds">Discharge summary</label>
        <textarea id="ds" className="input" rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000}
          placeholder="Condition at discharge, treatment given, follow-up instructions…" />
      </div>
    </Drawer>
  );
}
