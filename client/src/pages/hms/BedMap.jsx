import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import { getBedMap, BED_STATUS, WARD_TYPE, money2 } from "../../lib/hms.js";

export default function BedMap() {
  const { lab, role, setHeader } = useShell();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setHeader({ title: "Bed map", sub: "Ward-wise bed occupancy at a glance" });
    getBedMap().then(setData).catch((e) => setError(e.message));
  }, [setHeader]);

  if (error) return <div className="notice notice-bad">{error}</div>;
  if (!data) return <div className="panel skeleton" style={{ height: 300 }} />;

  const { wards, totals } = data;
  const canManage = role === "owner";

  return (
    <>
      <div className="grid-kpi grid-kpi-4">
        <div className="kpi-card">
          <div className="kpi-icon t-blue"><Icon name="bed" size={20} /></div>
          <div><div className="kpi-value">{totals.total}</div><div className="kpi-label">Total beds</div></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon t-green"><Icon name="check" size={20} /></div>
          <div><div className="kpi-value">{totals.available}</div><div className="kpi-label">Available</div></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon t-rose"><Icon name="users" size={20} /></div>
          <div><div className="kpi-value">{totals.occupied}</div><div className="kpi-label">Occupied</div></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon t-amber"><Icon name="settings" size={20} /></div>
          <div><div className="kpi-value">{totals.maintenance}</div><div className="kpi-label">Maintenance</div></div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        {(role === "owner" || role === "reception") && (
          <Link className="btn btn-primary btn-sm" to="/dashboard/ipd/admit"><Icon name="plus" size={15} /> Admit patient</Link>
        )}
        {canManage && (
          <Link className="btn btn-quiet btn-sm" to="/dashboard/ipd/wards"><Icon name="settings" size={15} /> Manage wards & beds</Link>
        )}
      </div>

      {wards.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">No wards set up yet.</p>
          {canManage && <Link className="btn btn-primary" to="/dashboard/ipd/wards">Add your first ward</Link>}
        </div>
      )}

      {wards.map((ward) => (
        <section key={ward._id} className="panel" style={{ marginTop: 12 }}>
          <div className="panel-head">
            <div>
              <h2>{ward.name}</h2>
              <span className="muted small">{WARD_TYPE[ward.type]} · {ward.floor || "–"} · {money2(ward.dailyRate, lab)}/day</span>
            </div>
            <span className="muted small">{ward.beds.filter((b) => b.status === "available").length} of {ward.beds.length} available</span>
          </div>
          {ward.beds.length === 0 ? (
            <p className="muted small">No beds in this ward yet.</p>
          ) : (
            <div className="bed-grid">
              {ward.beds.map((bed) => (
                <BedCard key={bed._id} bed={bed} role={role} />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}

function BedCard({ bed, role }) {
  const adm = bed.currentAdmission;
  const canAdmit = role === "owner" || role === "reception";

  if (bed.status === "occupied" && adm) {
    return (
      <Link to={`/dashboard/ipd/${adm._id}`} className={`bed-card bed-${bed.status}`}>
        <div className="bed-number">{bed.number}</div>
        <div className="bed-patient">{adm.patient?.name || "Patient"}</div>
        <div className="bed-sub">{adm.patient?.uhid}</div>
      </Link>
    );
  }

  if (bed.status === "available" && canAdmit) {
    return (
      <Link to={`/dashboard/ipd/admit?bed=${bed._id}`} className={`bed-card bed-${bed.status}`}>
        <div className="bed-number">{bed.number}</div>
        <div className="bed-label">Available</div>
      </Link>
    );
  }

  return (
    <div className={`bed-card bed-${bed.status}`}>
      <div className="bed-number">{bed.number}</div>
      <div className="bed-label">{BED_STATUS[bed.status]}</div>
    </div>
  );
}
