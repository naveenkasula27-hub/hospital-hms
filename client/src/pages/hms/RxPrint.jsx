import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getAppointment, prettyPhone, time12 } from "../../lib/hms.js";
import { me } from "../../lib/dash.js";
import { prettyDate } from "../../lib/api.js";

export default function RxPrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [lab, setLab] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getAppointment(id), me()])
      .then(([a, s]) => { setData(a.appointment); setLab(s.lab); })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (data && lab) document.title = `Prescription · ${data.patient.name}`;
  }, [data, lab]);

  if (error) return <main className="center"><div className="notice notice-bad">{error}</div><Link to="/dashboard">Back to dashboard</Link></main>;
  if (!data || !lab) return <main className="center"><p className="muted">Preparing prescription…</p></main>;

  const { patient: p, doctor: d, vitals: v, consult: c } = data;
  const vitalsLine = [
    v.bp && `BP ${v.bp}`, v.pulse && `Pulse ${v.pulse}`, v.temperature && `Temp ${v.temperature}°F`,
    v.spo2 && `SpO₂ ${v.spo2}%`, v.weight && `Wt ${v.weight} kg`, v.height && `Ht ${v.height} cm`,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <div className="rx-toolbar">
        {params.get("from") === "queue" && <Link className="btn btn-ghost btn-sm" to="/dashboard/appointments">Back to queue</Link>}
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>Print</button>
      </div>
      <article className="rx-page">
        <header className="rx-letterhead">
          <div>
            <h1>{lab.name}</h1>
            <p>{lab.city && !lab.address?.includes(lab.city) ? [lab.address, lab.city].filter(Boolean).join(", ") : lab.address}</p>
            <p>Phone: {lab.phone}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>{d.name}</strong>
            <p>{d.qualification}</p>
            <p>{d.specialty}</p>
            {d.regNo && <p>Reg. no. {d.regNo}</p>}
          </div>
        </header>

        <section className="rx-patient">
          <span><strong>{p.name}</strong></span>
          <span>{p.age} y / {p.gender}</span>
          <span>UHID: {p.uhid}</span>
          <span>{prettyDate(data.date, lab)}, {time12(data.time)}</span>
          <span>Mobile: {prettyPhone(p.phone)}</span>
          <span>Token: {data.token}</span>
          <span>Ref: {data.reference}</span>
          {p.allergies && <span><strong>Allergy: {p.allergies}</strong></span>}
        </section>

        {vitalsLine && <p className="small" style={{ margin: "10px 0 0" }}><strong>Vitals:</strong> {vitalsLine}</p>}
        {c.complaints && <p className="small" style={{ margin: "8px 0 0" }}><strong>Complaints:</strong> {c.complaints}</p>}
        {c.findings && <p className="small" style={{ margin: "6px 0 0" }}><strong>Findings:</strong> {c.findings}</p>}
        {c.diagnosis && <p className="small" style={{ margin: "6px 0 0" }}><strong>Diagnosis:</strong> {c.diagnosis}</p>}

        <div className="rx-symbol">℞</div>
        {data.prescription.length === 0 ? (
          <p className="muted small">No medicines prescribed.</p>
        ) : (
          <table className="table">
            <thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>When</th><th>Duration</th><th>Instructions</th></tr></thead>
            <tbody>
              {data.prescription.map((r, i) => (
                <tr key={i}><td>{i + 1}</td><td><strong>{r.medicine}</strong></td><td>{r.dose}</td><td>{r.frequency}</td><td>{r.duration}</td><td>{r.instructions}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        {data.labOrders.length > 0 && (
          <p className="small" style={{ marginTop: 16 }}><strong>Lab tests advised:</strong> {data.labOrders.map((o) => o.name).join(", ")}</p>
        )}
        {c.advice && <p className="small"><strong>Advice:</strong> {c.advice}</p>}
        {c.followUpDate && <p className="small"><strong>Review on:</strong> {prettyDate(c.followUpDate, lab)}</p>}

        <div className="rx-sign">
          <div style={{ height: 40 }} />
          <strong>{d.name}</strong>
          <div className="muted tiny">Signature</div>
        </div>
      </article>
    </>
  );
}
