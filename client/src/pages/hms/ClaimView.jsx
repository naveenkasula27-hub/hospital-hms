import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import {
  CLAIM_STATUS, INSURER_TYPE, PAY_METHOD, deleteClaim, getClaim, money2, updateClaim,
} from "../../lib/hms.js";
import { prettyDate } from "../../lib/api.js";

const NEXT_ACTIONS = {
  draft: [{ to: "submitted", label: "Submit to insurer", primary: true }],
  submitted: [
    { to: "approved", label: "Mark approved", primary: true },
    { to: "query", label: "Query raised" },
    { to: "rejected", label: "Reject", danger: true },
  ],
  query: [
    { to: "submitted", label: "Re-submit", primary: true },
    { to: "approved", label: "Mark approved" },
    { to: "rejected", label: "Reject", danger: true },
  ],
  approved: [{ to: "settled", label: "Record settlement", primary: true }],
};

export default function ClaimView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lab, role, setHeader } = useShell();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState(null);

  const load = () => getClaim(id).then(setData).catch((e) => setError(e.message));
  useEffect(() => { setData(null); load(); }, [id]);

  useEffect(() => {
    if (data) setHeader({
      title: `Claim ${data.claim.claimNumber || "(draft)"}`,
      sub: `${data.claim.patient.name} · ${data.claim.insurer.name}`,
    });
  }, [data, setHeader]);

  if (error && !data) return <div className="notice notice-bad">{error}</div>;
  if (!data) return <div className="panel skeleton" style={{ height: 300 }} />;

  const c = data.claim;
  const actions = NEXT_ACTIONS[c.status] || [];

  async function doDelete() {
    if (!confirm("Delete this claim? This cannot be undone.")) return;
    await deleteClaim(c._id);
    navigate("/dashboard/insurance");
  }

  return (
    <>
      <Link to="/dashboard/insurance" className="small back-link"><Icon name="arrowLeft" size={15} /> Insurance claims</Link>

      <div className="bill-layout">
        <section className="panel" style={{ minWidth: 0 }}>
          <div className="panel-head" style={{ padding: "18px 20px 0" }}>
            <div>
              <h2 style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {c.claimNumber || "Draft claim"}
                <span className={`badge cl-${c.status}`}>{CLAIM_STATUS[c.status]}</span>
              </h2>
              <p className="muted tiny" style={{ margin: 0 }}>
                Created {prettyDate(new Date(c.createdAt).toISOString().slice(0, 10), lab)}
              </p>
            </div>
            <div className="actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {actions.map((a) => (
                <button
                  key={a.to}
                  className={`btn btn-sm ${a.primary ? "btn-primary" : a.danger ? "btn-quiet btn-danger" : "btn-soft"}`}
                  onClick={() => setAction(a)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "14px 20px", display: "grid", gap: 16 }}>
            <div className="picked">
              <div className="avatar">{c.patient.name[0]}</div>
              <div>
                <Link className="who-name" to={`/dashboard/patients/${c.patient._id}`}>{c.patient.name}</Link>
                <div className="who-sub">{c.patient.uhid} · {c.patient.age}y {c.patient.gender}</div>
              </div>
            </div>

            <dl className="facts">
              <dt>Insurer</dt><dd>{c.insurer.name} ({INSURER_TYPE[c.insurer.type]})</dd>
              <dt>Policy</dt><dd>{c.policy.policyNumber}{c.policy.memberId ? ` · Member ${c.policy.memberId}` : ""}</dd>
              {c.policy.sumInsured > 0 && <><dt>Sum insured</dt><dd>{money2(c.policy.sumInsured, lab)}</dd></>}
              {c.policy.validFrom && <><dt>Valid</dt><dd>{prettyDate(c.policy.validFrom, lab)} to {prettyDate(c.policy.validTo, lab)}</dd></>}
              <dt>Bill</dt><dd><Link to={`/dashboard/billing/${c.bill._id}`}>{c.bill.number}</Link> · {money2(c.bill.total, lab)}{c.bill.due > 0 ? ` (${money2(c.bill.due, lab)} due)` : ""}</dd>
              {c.diagnosis && <><dt>Diagnosis</dt><dd>{c.diagnosis}</dd></>}
              {c.notes && <><dt>Notes</dt><dd>{c.notes}</dd></>}
              {c.insurer.contact && <><dt>Contact</dt><dd>{c.insurer.contact}{c.insurer.phone ? ` · ${c.insurer.phone}` : ""}{c.insurer.email ? ` · ${c.insurer.email}` : ""}</dd></>}
            </dl>
          </div>

          <div className="panel-head" style={{ padding: "0 20px" }}><h2>Activity log</h2></div>
          <ul className="timeline" style={{ padding: "0 20px 20px" }}>
            {c.log.map((l, i) => (
              <li key={i}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`badge cl-${l.status}`}>{CLAIM_STATUS[l.status]}</span>
                  <span className="who-sub">{new Date(l.at).toLocaleString(lab.locale || "en-IN")} · {l.by}</span>
                </div>
                {l.note && <p className="muted small">{l.note}</p>}
              </li>
            ))}
          </ul>
        </section>

        <aside style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <section className="panel bill-summary">
            <h2>Amounts</h2>
            <dl className="sums">
              <dt>Bill total</dt><dd>{money2(c.bill.total, lab)}</dd>
              <dt>Claimed</dt><dd>{money2(c.claimedAmount, lab)}</dd>
              {c.approvedAmount > 0 && <><dt>Approved</dt><dd>{money2(c.approvedAmount, lab)}</dd></>}
              <dt>Patient share</dt><dd>{money2(c.patientShare, lab)}</dd>
              {c.settledAmount > 0 && <><dt className="sum-total">Settled</dt><dd className="sum-total">{money2(c.settledAmount, lab)}</dd></>}
              {c.settledRef && <><dt className="tiny">Ref</dt><dd className="tiny">{c.settledRef}</dd></>}
            </dl>
          </section>

          {c.status !== "settled" && role === "owner" && (
            <button type="button" className="btn btn-quiet btn-sm btn-danger" onClick={doDelete}>Delete this claim</button>
          )}
        </aside>
      </div>

      {action && (
        <StatusAction
          claim={c}
          action={action}
          onClose={() => setAction(null)}
          onSaved={() => { setAction(null); load(); }}
        />
      )}
    </>
  );
}

function StatusAction({ claim, action, onClose, onSaved }) {
  const { lab, role } = useShell();
  const [claimNumber, setClaimNumber] = useState(claim.claimNumber || "");
  const [approvedAmount, setApprovedAmount] = useState(String(claim.approvedAmount || claim.claimedAmount));
  const [settledAmount, setSettledAmount] = useState(String(claim.approvedAmount || claim.claimedAmount));
  const [settledRef, setSettledRef] = useState("");
  const [patientShare, setPatientShare] = useState(String(claim.patientShare));
  const [note, setNote] = useState("");
  const [recordPayment, setRecordPayment] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true); setError("");
    try {
      const body = { status: action.to, note };
      if (action.to === "submitted") body.claimNumber = claimNumber;
      if (action.to === "approved") {
        body.approvedAmount = Number(approvedAmount);
        body.patientShare = Number(patientShare);
      }
      if (action.to === "settled") {
        body.settledAmount = Number(settledAmount);
        body.settledRef = settledRef;
        body.recordPayment = recordPayment;
      }
      await updateClaim(claim._id, body);
      onSaved();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <Drawer title={action.label} onClose={onClose} footer={
      <><button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      <button className={`btn ${action.danger ? "btn-primary btn-danger-solid" : "btn-primary"}`} disabled={busy} onClick={save}>{busy ? "Saving…" : action.label}</button></>
    }>
      {error && <div className="notice notice-bad">{error}</div>}

      {action.to === "submitted" && (
        <div>
          <label className="field-label">Claim / pre-auth number from insurer</label>
          <input className="input" value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} maxLength={60} placeholder="e.g. CLM-2026-12345" autoFocus />
        </div>
      )}

      {action.to === "approved" && (
        <>
          <div>
            <label className="field-label">Approved amount</label>
            <input className="input" type="number" min="0" step="0.01" value={approvedAmount} onChange={(e) => { setApprovedAmount(e.target.value); setPatientShare(String(Math.max(0, claim.claimedAmount - Number(e.target.value)))); }} />
          </div>
          <div>
            <label className="field-label">Patient's share</label>
            <input className="input" type="number" min="0" step="0.01" value={patientShare} onChange={(e) => setPatientShare(e.target.value)} />
            <p className="muted tiny">What the patient has to pay out of pocket.</p>
          </div>
        </>
      )}

      {action.to === "settled" && (
        <>
          <div>
            <label className="field-label">Amount settled by insurer</label>
            <input className="input" type="number" min="0" step="0.01" value={settledAmount} onChange={(e) => setSettledAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="field-label">UTR / cheque / reference number</label>
            <input className="input" value={settledRef} onChange={(e) => setSettledRef(e.target.value)} maxLength={60} />
          </div>
          {claim.bill?.due > 0 && (
            <label className="radio">
              <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} />
              Record this as a payment on the bill (reduces the balance due)
            </label>
          )}
        </>
      )}

      <div>
        <label className="field-label">Note (optional)</label>
        <textarea className="input" rows="2" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </div>
    </Drawer>
  );
}
