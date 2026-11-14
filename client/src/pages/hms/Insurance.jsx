import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import {
  CLAIM_STATUS, INSURER_TYPE, listClaims, listInsurers, money2, saveInsurer,
} from "../../lib/hms.js";
import { prettyDate } from "../../lib/api.js";

export default function Insurance() {
  const { lab, role, setHeader } = useShell();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "claims");
  useEffect(() => setHeader({ title: "Insurance & TPA", sub: "Claims, insurers and patient policies" }), [setHeader]);
  return (
    <>
      <div className="tabs" role="tablist">
        {["claims", "insurers"].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t === "claims" ? "Claims" : "Insurers & TPAs"}
          </button>
        ))}
      </div>
      {tab === "claims" && <ClaimsTab lab={lab} role={role} />}
      {tab === "insurers" && <InsurersTab lab={lab} role={role} />}
    </>
  );
}

/* ========== Claims list ========== */

function ClaimsTab({ lab, role }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    listClaims(filter ? { status: filter } : {}).then(setData);
  }, [filter]);

  if (!data) return <div className="panel skeleton" style={{ height: 200 }} />;

  const { claims, summary } = data;
  const sumOf = (key) => summary.reduce((s, r) => s + (r[key] || 0), 0);
  const countOf = (st) => summary.find((r) => r._id === st)?.count || 0;

  return (
    <>
      <div className="grid-kpi grid-kpi-4">
        <div className="kpi-card"><div className="kpi-icon t-blue"><Icon name="file" size={18} /></div><div><div className="kpi-value">{countOf("submitted") + countOf("query")}</div><div className="kpi-label">Pending</div></div></div>
        <div className="kpi-card"><div className="kpi-icon t-green"><Icon name="check" size={18} /></div><div><div className="kpi-value">{countOf("approved")}</div><div className="kpi-label">Approved</div></div></div>
        <div className="kpi-card"><div className="kpi-icon t-blue"><Icon name="wallet" size={18} /></div><div><div className="kpi-value">{money2(sumOf("settled"), lab)}</div><div className="kpi-label">Settled</div></div></div>
        <div className="kpi-card"><div className="kpi-icon t-amber"><Icon name="clock" size={18} /></div><div><div className="kpi-value">{money2(sumOf("amount") - sumOf("settled"), lab)}</div><div className="kpi-label">Awaiting</div></div></div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Insurance claims</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <select className="input input-sm" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ minWidth: 120 }}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              {Object.entries(CLAIM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Link className="btn btn-primary btn-sm" to="/dashboard/insurance/new"><Icon name="plus" size={15} /> New claim</Link>
          </div>
        </div>

        {claims.length === 0 ? (
          <p className="muted small">No claims found.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Claim</th><th>Patient</th><th>Insurer</th><th>Bill</th><th className="num">Claimed</th><th className="num">Approved</th><th>Status</th></tr></thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c._id}>
                    <td><Link to={`/dashboard/insurance/${c._id}`}>{c.claimNumber || "—"}</Link></td>
                    <td>{c.patient?.name}<div className="who-sub">{c.patient?.uhid}</div></td>
                    <td>{c.insurer?.name}<div className="who-sub">{INSURER_TYPE[c.insurer?.type]}</div></td>
                    <td><Link to={`/dashboard/billing/${c.bill?._id}`}>{c.bill?.number}</Link></td>
                    <td className="num">{money2(c.claimedAmount, lab)}</td>
                    <td className="num">{c.approvedAmount ? money2(c.approvedAmount, lab) : "–"}</td>
                    <td><span className={`badge cl-${c.status}`}>{CLAIM_STATUS[c.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ========== Insurers list ========== */

function InsurersTab({ lab, role }) {
  const [insurers, setInsurers] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => listInsurers().then((d) => setInsurers(d.insurers));
  useEffect(() => { load(); }, []);

  if (!insurers) return <div className="panel skeleton" style={{ height: 200 }} />;

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Insurance companies and TPAs</h2>
          {role === "owner" && (
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} /> Add insurer</button>
          )}
        </div>
        {insurers.length === 0 ? (
          <p className="muted small">No insurers added yet. The administrator can add them here.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Type</th><th>Contact</th><th>Phone</th><th>Email</th><th></th></tr></thead>
              <tbody>
                {insurers.map((ins) => (
                  <tr key={ins._id} className={ins.active ? "" : "muted"}>
                    <td><strong>{ins.name}</strong>{!ins.active && <span className="badge" style={{ marginLeft: 6 }}>Inactive</span>}</td>
                    <td>{INSURER_TYPE[ins.type]}</td>
                    <td>{ins.contact || "–"}</td>
                    <td>{ins.phone || "–"}</td>
                    <td>{ins.email || "–"}</td>
                    <td>{role === "owner" && <button className="btn btn-quiet btn-xs" onClick={() => setEditing(ins)}>Edit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <InsurerForm
          insurer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function InsurerForm({ insurer, onClose, onSaved }) {
  const isNew = !insurer._id;
  const [form, setForm] = useState({
    name: insurer.name || "",
    type: insurer.type || "insurance",
    contact: insurer.contact || "",
    phone: insurer.phone || "",
    email: insurer.email || "",
    notes: insurer.notes || "",
    active: insurer.active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save() {
    setBusy(true); setError("");
    try {
      await saveInsurer(insurer._id, form);
      onSaved();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <Drawer
      title={isNew ? "Add insurer" : `Edit ${insurer.name}`}
      onClose={onClose}
      footer={<><button className="btn btn-quiet" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}
    >
      {error && <div className="notice notice-bad">{error}</div>}
      <div><label className="field-label">Name</label><input className="input" value={form.name} onChange={set("name")} maxLength={100} autoFocus /></div>
      <div><label className="field-label">Type</label><select className="input" value={form.type} onChange={set("type")}><option value="insurance">Insurance company</option><option value="tpa">TPA (Third-party administrator)</option></select></div>
      <div><label className="field-label">Contact person</label><input className="input" value={form.contact} onChange={set("contact")} maxLength={80} /></div>
      <div><label className="field-label">Phone</label><input className="input" value={form.phone} onChange={set("phone")} maxLength={20} /></div>
      <div><label className="field-label">Email</label><input className="input" value={form.email} onChange={set("email")} maxLength={80} /></div>
      <div><label className="field-label">Notes</label><textarea className="input" rows="2" value={form.notes} onChange={set("notes")} maxLength={300} /></div>
      {!isNew && (
        <label className="radio"><input type="checkbox" checked={form.active} onChange={set("active")} /> Active (shows in dropdowns)</label>
      )}
    </Drawer>
  );
}
