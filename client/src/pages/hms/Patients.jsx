import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import PatientForm from "./PatientForm.jsx";
import { listPatients, prettyPhone } from "../../lib/hms.js";
import { prettyDate } from "../../lib/api.js";

export default function Patients() {
  const { lab, role, setHeader } = useShell();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const canAdd = role === "owner" || role === "reception";

  useEffect(() => setHeader({ title: "Patients", sub: "Every registered patient and their records" }), [setHeader]);

  useEffect(() => {
    const t = setTimeout(() => {
      listPatients({ q, page }).then(setData).catch((e) => setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, page]);

  return (
    <>
      <div className="panel" style={{ padding: "14px 16px" }}>
        <div className="toolbar">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search by name, mobile or UHID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search patients" />
          </div>
          {data && <span className="muted small">{data.total} patients</span>}
          {canAdd && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <Icon name="userPlus" size={16} /> Register patient
            </button>
          )}
        </div>
      </div>

      {error && <div className="notice notice-bad">{error}</div>}

      <section className="panel panel-flush">
        {!data ? (
          <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 200 }} /></div>
        ) : data.patients.length === 0 ? (
          <div className="empty-state"><Icon name="users" size={30} /><p>{q ? "No patient matches that search." : "No patients registered yet."}</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Patient</th><th>UHID</th><th>Mobile</th><th>Blood</th><th>Alerts</th><th>Visits</th><th>Last visit</th></tr></thead>
              <tbody>
                {data.patients.map((p) => (
                  <tr key={p._id} className="row-link" onClick={() => navigate(`/dashboard/patients/${p._id}`)}>
                    <td>
                      <div className="who">
                        <div className="avatar">{p.name[0]}</div>
                        <div>
                          <Link className="who-name" to={`/dashboard/patients/${p._id}`} onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                          <div className="who-sub">{p.age}y · {p.gender}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono small">{p.uhid}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{prettyPhone(p.phone)}</td>
                    <td>{p.bloodGroup || "–"}</td>
                    <td>{p.allergies ? <span className="alert-chip">{p.allergies}</span> : p.conditions ? <span className="tag">{p.conditions}</span> : "–"}</td>
                    <td>{p.visits}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{p.lastVisit ? prettyDate(p.lastVisit, lab) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="pager" style={{ padding: "12px 20px" }}>
            <button className="btn btn-quiet btn-sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</button>
            <span className="muted small">Page {data.page} of {data.pages}</span>
            <button className="btn btn-quiet btn-sm" disabled={page >= data.pages} onClick={() => setPage((n) => n + 1)}>Next</button>
          </div>
        )}
      </section>

      {adding && (
        <Drawer
          title="Register patient"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn btn-quiet" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit" form="patient-form">Register</button>
            </>
          }
        >
          <PatientForm onSaved={(p) => navigate(`/dashboard/patients/${p._id}`)} />
        </Drawer>
      )}
    </>
  );
}
