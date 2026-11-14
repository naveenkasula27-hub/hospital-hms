import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import { ADMISSION_STATUS, WARD_TYPE, listAdmissions, money2, prettyPhone } from "../../lib/hms.js";

export default function Admissions() {
  const { lab, role, setHeader } = useShell();
  const [admissions, setAdmissions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [filter, setFilter] = useState("admitted");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHeader({ title: "Admissions", sub: "Current and past in-patient admissions" });
  }, [setHeader]);

  useEffect(() => {
    setLoading(true);
    listAdmissions(filter ? { status: filter } : {})
      .then((d) => { setAdmissions(d.admissions); setSummary(d.summary); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const count = (s) => (summary.find((r) => r._id === s) || {}).count || 0;

  return (
    <>
      <div className="grid-kpi" style={{ marginBottom: 8 }}>
        <div className="kpi-card">
          <div className="kpi-icon t-blue"><Icon name="bed" size={20} /></div>
          <div><div className="kpi-value">{count("admitted")}</div><div className="kpi-label">Currently admitted</div></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon t-green"><Icon name="check" size={20} /></div>
          <div><div className="kpi-value">{count("discharged")}</div><div className="kpi-label">Discharged (total)</div></div>
        </div>
      </div>

      <section className="panel panel-flush">
        <div className="panel-head">
          <h2>Admissions</h2>
          <div className="actions">
            <select className="input input-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All</option>
              <option value="admitted">Currently admitted</option>
              <option value="discharged">Discharged</option>
            </select>
            {(role === "owner" || role === "reception") && (
              <Link className="btn btn-primary btn-sm" to="/dashboard/ipd/admit"><Icon name="plus" size={15} /> Admit</Link>
            )}
          </div>
        </div>

        {loading && <div className="skeleton" style={{ height: 120 }} />}

        {!loading && admissions.length === 0 && (
          <p className="muted small" style={{ padding: "20px" }}>No admissions found.</p>
        )}

        {!loading && admissions.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Admission #</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Ward / Bed</th>
                  <th>Admitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {admissions.map((a) => (
                  <tr key={a._id}>
                    <td><Link to={`/dashboard/ipd/${a._id}`}>{a.admissionNumber}</Link></td>
                    <td>
                      <div className="who-name small">{a.patient?.name}</div>
                      <div className="who-sub">{a.patient?.uhid}</div>
                    </td>
                    <td>
                      <div className="who-name small">{a.doctor?.name}</div>
                      <div className="who-sub">{a.doctor?.specialty}</div>
                    </td>
                    <td>
                      <div className="who-name small">{a.ward?.name}</div>
                      <div className="who-sub">Bed {a.bed?.number}</div>
                    </td>
                    <td className="small">{new Date(a.admittedAt).toLocaleDateString(lab?.locale || "en-IN")}</td>
                    <td><span className={`badge adm-${a.status}`}>{ADMISSION_STATUS[a.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
