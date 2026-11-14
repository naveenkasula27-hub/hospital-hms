import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import { BILL_STATUS, PAY_METHOD, addDays, listBills, money2 } from "../../lib/hms.js";
import { prettyDate, todayForLab } from "../../lib/api.js";

const RANGES = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "7 days", days: 6 },
  { key: "30", label: "30 days", days: 29 },
];

export default function Billing() {
  const { lab, setHeader } = useShell();
  const navigate = useNavigate();
  const today = todayForLab(lab);
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => setHeader({ title: "Billing", sub: "Bills, payments and dues" }), [setHeader]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  function pickRange(r) {
    setRange(r.key);
    setFrom(addDays(today, -r.days));
    setTo(today);
  }

  const load = useCallback(() => {
    setError("");
    return listBills({ from, to, status, q: query }).then(setData).catch((e) => setError(e.message));
  }, [from, to, status, query]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const s = data?.summary;
  const methods = s ? Object.entries(s.byMethod).filter(([, v]) => v) : [];
  const period = from === to ? prettyDate(from, lab) : `${prettyDate(from, lab)} – ${prettyDate(to, lab)}`;

  return (
    <>
      <div className="grid-kpi grid-kpi-3">
        <Kpi icon="file" tint="t-blue" label={`Billed · ${period}`} value={s ? money2(s.billed, lab) : "…"} hint={s ? `${s.bills} bill${s.bills === 1 ? "" : "s"}` : ""} />
        <Kpi icon="wallet" tint="t-green" label={`Collected · ${period}`} value={s ? money2(s.collected, lab) : "…"}
          hint={methods.length ? methods.map(([m, v]) => `${PAY_METHOD[m]} ${money2(v, lab)}`).join(" · ") : "No payments yet"} />
        <Kpi icon="clock" tint="t-amber" label="Dues outstanding" value={s ? money2(s.due, lab) : "…"} hint={s ? `${s.dueBills} bill${s.dueBills === 1 ? "" : "s"} not fully paid` : ""} />
      </div>

      <div className="panel" style={{ padding: "14px 16px" }}>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Period">
            {RANGES.map((r) => (
              <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => pickRange(r)}>{r.label}</button>
            ))}
          </div>
          <input type="date" className="input" value={from} max={to} aria-label="From"
            onChange={(e) => { if (e.target.value) { setFrom(e.target.value); setRange(""); } }} />
          <input type="date" className="input" value={to} min={from} max={today} aria-label="To"
            onChange={(e) => { if (e.target.value) { setTo(e.target.value); setRange(""); } }} />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All bills</option>
            <option value="due">Due (unpaid or part paid)</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <div className="search-box">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Bill number, patient, mobile or UHID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bills" />
          </div>
          <Link className="btn btn-primary btn-sm" to="/dashboard/billing/new"><Icon name="plus" size={16} /> New bill</Link>
        </div>
        {query && <p className="muted tiny" style={{ margin: "10px 0 0" }}>Searching all dates for “{query}”.</p>}
      </div>

      {error && <div className="notice notice-bad" role="alert">{error}</div>}

      <section className="panel panel-flush">
        {!data ? (
          <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 180 }} /></div>
        ) : data.bills.length === 0 ? (
          <div className="empty-state">
            <Icon name="file" size={30} />
            <p>No bills {query ? "match that search" : `for ${period}`}.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Bill no.</th><th>Date</th><th>Patient</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Due</th><th>Status</th><th className="num">Actions</th></tr>
              </thead>
              <tbody>
                {data.bills.map((b) => (
                  <tr key={b._id} className="row-link" onClick={() => navigate(`/dashboard/billing/${b._id}`)}>
                    <td><Link className="who-name mono" to={`/dashboard/billing/${b._id}`} onClick={(e) => e.stopPropagation()}>{b.number}</Link></td>
                    <td style={{ whiteSpace: "nowrap" }}>{prettyDate(b.date, lab)}</td>
                    <td className="cell-patient">
                      <div className="who-name">{b.patient?.name}</div>
                      <div className="who-sub">{b.patient?.uhid} · {b.items.length} item{b.items.length === 1 ? "" : "s"}</div>
                    </td>
                    <td className="num">{money2(b.total, lab)}</td>
                    <td className="num">{money2(b.paid, lab)}</td>
                    <td className="num">{b.status === "cancelled" ? "–" : <strong className={b.due > 0 ? "text-due" : ""}>{money2(b.due, lab)}</strong>}</td>
                    <td><span className={`badge b-${b.status}`}>{BILL_STATUS[b.status]}</span></td>
                    <td>
                      <div className="actions">
                        <a className="btn btn-quiet btn-xs" href={`/print/invoice/${b._id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          <Icon name="printer" size={14} /> Print
                        </a>
                      </div>
                    </td>
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

function Kpi({ icon, tint, label, value, hint }) {
  return (
    <div className="panel kpi">
      <div className={`kpi-icon ${tint}`}><Icon name={icon} size={20} /></div>
      <div style={{ minWidth: 0 }}>
        <p className="kpi-label">{label}</p>
        <p className="kpi-value">{value}</p>
        {hint && <p className="kpi-hint">{hint}</p>}
      </div>
    </div>
  );
}
