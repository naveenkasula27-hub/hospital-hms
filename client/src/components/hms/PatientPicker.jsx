import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import PatientForm from "../../pages/hms/PatientForm.jsx";
import { listPatients, prettyPhone } from "../../lib/hms.js";

/** Search for a patient by name, mobile or UHID, or register a new one. */
export default function PatientPicker({ patient, onPick, formId = "picker-patient" }) {
  const [registering, setRegistering] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => listPatients({ q }).then((d) => setResults(d.patients)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (patient) {
    return (
      <div className="picked">
        <div className="avatar">{patient.name[0]}</div>
        <div>
          <div className="who-name">{patient.name}</div>
          <div className="who-sub">{patient.uhid} · {patient.age}y {patient.gender} · {prettyPhone(patient.phone)}</div>
        </div>
        <button type="button" className="btn btn-quiet btn-xs" style={{ marginLeft: "auto" }} onClick={() => onPick(null)}>Change</button>
      </div>
    );
  }

  if (registering) {
    return (
      <div>
        <PatientForm compact formId={formId} onSaved={(p) => { setRegistering(false); onPick(p); }} />
        <button type="button" className="btn btn-quiet btn-sm" style={{ marginTop: 10 }} onClick={() => setRegistering(false)}>Back to search</button>
      </div>
    );
  }

  return (
    <div>
      <div className="search-box">
        <Icon name="search" size={16} />
        <input className="input" placeholder="Search by name, mobile or UHID" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search patients" />
      </div>
      {results.length > 0 && (
        <ul className="results">
          {results.map((p) => (
            <li key={p._id}>
              <button type="button" onClick={() => onPick(p)}>
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
  );
}
