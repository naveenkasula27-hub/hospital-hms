import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import PatientPicker from "../../components/hms/PatientPicker.jsx";
import { createAdmission, listDoctors, listWards, listBeds, WARD_TYPE } from "../../lib/hms.js";

export default function AdmitPatient() {
  const { role, setHeader } = useShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedBed = searchParams.get("bed") || "";

  const [patient, setPatient] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [wards, setWards] = useState([]);
  const [beds, setBeds] = useState([]);
  const [form, setForm] = useState({
    doctor: "", ward: "", bed: preselectedBed, diagnosis: "", reason: "", notes: "",
    expectedDischarge: "",
    bp: "", pulse: "", temperature: "", spo2: "", weight: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setHeader({ title: "Admit patient", sub: "In-patient admission" });
    listDoctors().then((d) => setDoctors(d.doctors));
    listWards().then((d) => setWards(d.wards));
  }, [setHeader]);

  useEffect(() => {
    if (form.ward) {
      listBeds({ ward: form.ward, status: "available" }).then((d) => setBeds(d.beds));
    } else {
      listBeds({ status: "available" }).then((d) => {
        setBeds(d.beds);
        if (preselectedBed) {
          const found = d.beds.find((b) => b._id === preselectedBed);
          if (found) setForm((f) => ({ ...f, ward: String(found.ward?._id || found.ward), bed: preselectedBed }));
        }
      });
    }
  }, [form.ward]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        patient: patient._id,
        doctor: form.doctor,
        bed: form.bed,
        diagnosis: form.diagnosis,
        reason: form.reason,
        notes: form.notes,
        expectedDischarge: form.expectedDischarge,
        vitals: { bp: form.bp, pulse: form.pulse, temperature: form.temperature, spo2: form.spo2, weight: form.weight },
      };
      const { admission } = await createAdmission(body);
      navigate(`/dashboard/ipd/${admission._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const availableInWard = beds.filter((b) => !form.ward || String(b.ward?._id || b.ward) === form.ward);

  return (
    <>
      <Link to="/dashboard/ipd" className="small back-link"><Icon name="arrowLeft" size={15} /> Bed map</Link>

      <form className="panel form-panel" onSubmit={submit} style={{ maxWidth: 700 }}>
        {error && <div className="notice notice-bad">{error}</div>}

        <fieldset>
          <legend>Patient</legend>
          <PatientPicker patient={patient} onPick={setPatient} formId="admit-patient" />
        </fieldset>

        <fieldset>
          <legend>Bed assignment</legend>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="field-label">Ward</label>
              <select className="input" value={form.ward} onChange={set("ward")}>
                <option value="">All wards</option>
                {wards.map((w) => (
                  <option key={w._id} value={w._id}>{w.name} ({WARD_TYPE[w.type]})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Bed</label>
              <select className="input" value={form.bed} onChange={set("bed")} required>
                <option value="">Choose a bed</option>
                {availableInWard.map((b) => (
                  <option key={b._id} value={b._id}>{b.number} — {b.ward?.name || ""}</option>
                ))}
              </select>
              {availableInWard.length === 0 && <p className="muted tiny">No available beds{form.ward ? " in this ward" : ""}.</p>}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Attending doctor</legend>
          <select className="input" value={form.doctor} onChange={set("doctor")} required>
            <option value="">Choose a doctor</option>
            {doctors.map((d) => <option key={d._id} value={d._id}>{d.name} — {d.specialty}</option>)}
          </select>
        </fieldset>

        <fieldset>
          <legend>Admission details</legend>
          <div>
            <label className="field-label">Reason for admission</label>
            <input className="input" value={form.reason} onChange={set("reason")} maxLength={500} placeholder="e.g. Chest pain evaluation" />
          </div>
          <div>
            <label className="field-label">Diagnosis (if known)</label>
            <input className="input" value={form.diagnosis} onChange={set("diagnosis")} maxLength={500} />
          </div>
          <div>
            <label className="field-label">Expected discharge date (optional)</label>
            <input className="input" type="date" value={form.expectedDischarge} onChange={set("expectedDischarge")} />
          </div>
          <div>
            <label className="field-label">Notes</label>
            <textarea className="input" rows={3} value={form.notes} onChange={set("notes")} maxLength={1000} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Vitals on admission (optional)</legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
            <div><label className="field-label">BP</label><input className="input" value={form.bp} onChange={set("bp")} placeholder="120/80" maxLength={20} /></div>
            <div><label className="field-label">Pulse</label><input className="input" value={form.pulse} onChange={set("pulse")} placeholder="72" maxLength={20} /></div>
            <div><label className="field-label">Temp</label><input className="input" value={form.temperature} onChange={set("temperature")} placeholder="98.6°F" maxLength={20} /></div>
            <div><label className="field-label">SpO₂</label><input className="input" value={form.spo2} onChange={set("spo2")} placeholder="98%" maxLength={20} /></div>
            <div><label className="field-label">Weight</label><input className="input" value={form.weight} onChange={set("weight")} placeholder="65 kg" maxLength={20} /></div>
          </div>
        </fieldset>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !patient || !form.bed || !form.doctor}>
            {busy ? "Admitting…" : "Admit patient"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => navigate("/dashboard/ipd")}>Cancel</button>
        </div>
      </form>
    </>
  );
}
