import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import PatientPicker from "../../components/hms/PatientPicker.jsx";
import {
  BILL_STATUS, createClaim, listBills, listInsurers, listPolicies, money2,
} from "../../lib/hms.js";
import { prettyDate } from "../../lib/api.js";

export default function ClaimNew() {
  const { lab, setHeader } = useShell();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => setHeader({ title: "New insurance claim", sub: "File a claim against a patient's bill" }), [setHeader]);

  const [patient, setPatient] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [bills, setBills] = useState([]);
  const [insurers, setInsurers] = useState([]);

  const [policyId, setPolicyId] = useState("");
  const [billId, setBillId] = useState(params.get("bill") || "");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { listInsurers().then((d) => setInsurers(d.insurers)); }, []);

  useEffect(() => {
    if (!patient) { setPolicies([]); setBills([]); return; }
    listPolicies({ patient: patient._id }).then((d) => setPolicies(d.policies));
    listBills({ q: patient.uhid }).then((d) => {
      const live = d.bills.filter((b) => b.status !== "cancelled");
      setBills(live);
      if (params.get("bill")) setBillId(params.get("bill"));
    });
  }, [patient]);

  useEffect(() => {
    if (billId) {
      const bill = bills.find((b) => b._id === billId);
      if (bill && !claimedAmount) setClaimedAmount(String(bill.total));
    }
  }, [billId, bills]);

  const selectedBill = bills.find((b) => b._id === billId);
  const selectedPolicy = policies.find((p) => p._id === policyId);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { claim } = await createClaim({
        bill: billId, policy: policyId,
        claimedAmount: Number(claimedAmount), diagnosis, notes,
      });
      navigate(`/dashboard/insurance/${claim._id}`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <>
      <Link to="/dashboard/insurance" className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Icon name="arrowLeft" size={15} /> Insurance claims
      </Link>

      <form className="panel" onSubmit={submit} style={{ maxWidth: 720 }}>
        <h2>Patient</h2>
        <PatientPicker patient={patient} onPick={setPatient} formId="claim-patient" />

        {patient && (
          <>
            <h2 style={{ marginTop: 24 }}>Policy</h2>
            {policies.length === 0 ? (
              <p className="muted small">No policy on file. <Link to={`/dashboard/patients/${patient._id}?tab=insurance`}>Add a policy</Link> first.</p>
            ) : (
              <select className="input" value={policyId} onChange={(e) => setPolicyId(e.target.value)} required>
                <option value="">Choose a policy</option>
                {policies.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.insurer?.name} · {p.policyNumber}{p.memberId ? ` · Member ${p.memberId}` : ""}
                  </option>
                ))}
              </select>
            )}

            <h2 style={{ marginTop: 24 }}>Bill</h2>
            {bills.length === 0 ? (
              <p className="muted small">No active bills for this patient.</p>
            ) : (
              <select className="input" value={billId} onChange={(e) => setBillId(e.target.value)} required>
                <option value="">Choose a bill</option>
                {bills.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.number} · {prettyDate(b.date, lab)} · {money2(b.total, lab)} · {BILL_STATUS[b.status]}
                  </option>
                ))}
              </select>
            )}

            {selectedBill && (
              <div className="picked" style={{ marginTop: 10 }}>
                <div>
                  <div className="who-name">Bill {selectedBill.number}</div>
                  <div className="who-sub">Total {money2(selectedBill.total, lab)} · Paid {money2(selectedBill.paid, lab)} · Due {money2(selectedBill.due, lab)}</div>
                </div>
              </div>
            )}

            <h2 style={{ marginTop: 24 }}>Claim details</h2>
            <div>
              <label className="field-label">Amount to claim from insurer</label>
              <input className="input" type="number" min="0" max={selectedBill?.total || 10000000} step="0.01" value={claimedAmount} onChange={(e) => setClaimedAmount(e.target.value)} required />
              {selectedBill && Number(claimedAmount) > 0 && Number(claimedAmount) < selectedBill.total && (
                <p className="muted tiny">Patient pays the remaining {money2(selectedBill.total - Number(claimedAmount), lab)}.</p>
              )}
            </div>
            <div>
              <label className="field-label">Diagnosis (for the claim form)</label>
              <input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} maxLength={300} />
            </div>
            <div>
              <label className="field-label">Notes (optional)</label>
              <textarea className="input" rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
            </div>

            {error && <div className="notice notice-bad">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy || !policyId || !billId || !(Number(claimedAmount) > 0)}>
              {busy ? "Creating…" : "Create claim"}
            </button>
          </>
        )}
      </form>
    </>
  );
}
