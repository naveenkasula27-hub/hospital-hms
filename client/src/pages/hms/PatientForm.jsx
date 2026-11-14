import { useState } from "react";
import { createPatient, updatePatient } from "../../lib/hms.js";

const BLANK = {
  name: "", phone: "", age: "", gender: "", email: "", address: "", bloodGroup: "",
  allergies: "", conditions: "", emergencyName: "", emergencyPhone: "", abhaId: "",
};

/** The registration form. Calls onSaved with the saved patient. */
export default function PatientForm({ patient, onSaved, formId = "patient-form", compact = false }) {
  const [v, setV] = useState(() => (patient ? { ...BLANK, ...patient, phone: patient.phone?.replace(/^91(?=\d{10}$)/, "") } : BLANK));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const bad = (k) => (error?.field === k ? " invalid" : "");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...v };
      for (const k of ["_id", "uhid", "lab", "registeredOn", "createdAt", "updatedAt", "__v", "source", "lastVisit", "visits"]) delete body[k];
      const { patient: saved } = patient ? await updatePatient(patient._id, body) : await createPatient(body);
      onSaved(saved);
    } catch (err) {
      setError({ message: err.message, field: err.field });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={formId} className="form" onSubmit={submit} noValidate>
      {error && <div className="notice notice-bad" role="alert" style={{ margin: 0 }}>{error.message}</div>}

      <div>
        <label className="field-label" htmlFor="p-name">Full name</label>
        <input id="p-name" className={`input${bad("name")}`} value={v.name} onChange={set("name")} autoFocus />
      </div>
      <div className="three">
        <div>
          <label className="field-label" htmlFor="p-phone">Mobile</label>
          <input id="p-phone" className={`input${bad("phone")}`} inputMode="tel" value={v.phone} onChange={set("phone")} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-age">Age</label>
          <input id="p-age" className={`input${bad("age")}`} inputMode="numeric" value={v.age} onChange={set("age")} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-gender">Gender</label>
          <select id="p-gender" className={`select${bad("gender")}`} value={v.gender} onChange={set("gender")}>
            <option value="">Choose</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      {!compact && (
        <>
          <div className="two">
            <div>
              <label className="field-label" htmlFor="p-blood">Blood group</label>
              <select id="p-blood" className="select" value={v.bloodGroup} onChange={set("bloodGroup")}>
                <option value="">Not known</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="p-email">Email (optional)</label>
              <input id="p-email" className={`input${bad("email")}`} type="email" value={v.email} onChange={set("email")} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="p-address">Address</label>
            <input id="p-address" className="input" value={v.address} onChange={set("address")} />
          </div>

          <p className="section-title">Medical alerts</p>
          <div className="two">
            <div>
              <label className="field-label" htmlFor="p-allergies">Allergies</label>
              <input id="p-allergies" className="input" placeholder="e.g. Penicillin" value={v.allergies} onChange={set("allergies")} />
            </div>
            <div>
              <label className="field-label" htmlFor="p-conditions">Ongoing conditions</label>
              <input id="p-conditions" className="input" placeholder="e.g. Diabetes, BP" value={v.conditions} onChange={set("conditions")} />
            </div>
          </div>

          <p className="section-title">Emergency contact and IDs</p>
          <div className="three">
            <div>
              <label className="field-label" htmlFor="p-ename">Contact name</label>
              <input id="p-ename" className="input" value={v.emergencyName} onChange={set("emergencyName")} />
            </div>
            <div>
              <label className="field-label" htmlFor="p-ephone">Contact mobile</label>
              <input id="p-ephone" className="input" inputMode="tel" value={v.emergencyPhone} onChange={set("emergencyPhone")} />
            </div>
            <div>
              <label className="field-label" htmlFor="p-abha">ABHA ID</label>
              <input id="p-abha" className="input" value={v.abhaId} onChange={set("abhaId")} />
            </div>
          </div>
        </>
      )}

      {compact && (
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Registering…" : "Register and continue"}
        </button>
      )}
      {!compact && <input type="submit" hidden disabled={busy} />}
    </form>
  );
}
