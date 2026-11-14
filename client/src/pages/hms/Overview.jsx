import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import { getOverview, initials, STATUS, time12 } from "../../lib/hms.js";
import { money } from "../../lib/api.js";

function Kpi({ icon, tint, label, value, hint }) {
  return (
    <div className="panel kpi">
      <div className={`kpi-icon ${tint}`}><Icon name={icon} size={20} /></div>
      <div>
        <p className="kpi-label">{label}</p>
        <p className="kpi-value">{value}</p>
        {hint && <p className="kpi-hint">{hint}</p>}
      </div>
    </div>
  );
}

export default function Overview() {
  const { lab, session, setHeader } = useShell();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const first = session.user.name.split(" ")[0];
    setHeader({ title: `Good ${greeting()}, ${first}`, sub: "Here is how the hospital is doing today" });
  }, [session.user.name, setHeader]);

  useEffect(() => {
    let alive = true;
    const load = () => getOverview().then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (error) return <div className="notice notice-bad">{error}</div>;
  if (!data) return <div className="grid-kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="panel skeleton" style={{ height: 96 }} />)}</div>;

  const a = data.appointments;
  const max = Math.max(1, ...data.week.map((w) => w.count));

  return (
    <>
      <div className="grid-kpi">
        <Kpi icon="calendar" tint="t-teal" label="OPD appointments today" value={a.total} hint={`${a.completed} completed · ${a.noShow} no-show`} />
        <Kpi icon="clock" tint="t-amber" label="Waiting now" value={a.waiting} hint={`${a.inConsultation} with a doctor · ${data.lab.pending} lab reports pending`} />
        <Kpi icon="userPlus" tint="t-violet" label="New patients today" value={data.patients.newToday} hint={`${data.patients.total} registered in total`} />
        <Kpi icon="wallet" tint="t-green" label="Collected today" value={money(data.collectedToday, lab)}
          hint={data.dues.amount > 0 ? `${money(data.dues.amount, lab)} due on ${data.dues.bills} bill${data.dues.bills === 1 ? "" : "s"}` : "No dues outstanding"} />
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>OPD visits, last 7 days</h2>
              <p className="muted tiny">Cancelled appointments are not counted</p>
            </div>
          </div>
          <div className="chart" role="img" aria-label={`OPD visits: ${data.week.map((w) => `${w.date} ${w.count}`).join(", ")}`}>
            {data.week.map((w) => (
              <div className="chart-col" key={w.date}>
                <span className="chart-val">{w.count}</span>
                <div className={`chart-bar${w.date === data.today ? " is-today" : ""}`} style={{ height: `${(w.count / max) * 140}px` }} />
                <span className="chart-day">{new Date(`${w.date}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Doctors on duty</h2>
            <Link className="small" to="/dashboard/doctors">All doctors</Link>
          </div>
          {data.doctors.length === 0 ? (
            <p className="muted small">No doctor sits today.</p>
          ) : (
            <ul className="list">
              {data.doctors.map((d) => (
                <li key={d._id}>
                  <div className="avatar">{initials(d.name)}</div>
                  <div className="grow">
                    <div className="who-name">{d.name}</div>
                    <div className="who-sub">{d.specialty}{d.room ? ` · ${d.room}` : ""}</div>
                    <div className="meter" aria-hidden="true"><span style={{ width: `${d.total ? (d.done / d.total) * 100 : 0}%` }} /></div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="who-name">{d.done}/{d.total}</div>
                    <div className="who-sub">{d.waiting} waiting</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel panel-flush">
        <div className="panel-head">
          <div>
            <h2>Live queue</h2>
            <p className="muted tiny">Updates every 30 seconds</p>
          </div>
          <Link className="btn btn-soft btn-sm" to="/dashboard/appointments">Open appointments</Link>
        </div>
        {data.queue.length === 0 ? (
          <div className="empty-state"><Icon name="check" size={28} /><p>Nobody is waiting right now.</p></div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Time</th><th>Status</th></tr></thead>
              <tbody>
                {data.queue.map((q) => (
                  <tr key={q._id}>
                    <td><span className="token">{q.token}</span></td>
                    <td>
                      <Link className="who-name" to={`/dashboard/patients/${q.patient?._id}`}>{q.patient?.name}</Link>
                      <div className="who-sub">{q.patient?.uhid}</div>
                    </td>
                    <td>{q.doctor?.name}</td>
                    <td>{time12(q.time)}</td>
                    <td><span className={`badge s-${q.status}`}>{STATUS[q.status]}</span></td>
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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
