import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import {
  MEDICINE_FORMS, STOCK_STATUS, adjustBatch, getMedicine, getPharmacySummary, getStock, money2, prettyExpiry, saveMedicine,
} from "../../lib/hms.js";
import { prettyDate } from "../../lib/api.js";

const FILTERS = [
  { key: "", label: "All" },
  { key: "low", label: "Low & out" },
  { key: "expiring", label: "Expiring in 3 months" },
  { key: "expired", label: "Expired" },
  { key: "inactive", label: "Hidden" },
];

export default function Pharmacy() {
  const { lab, role, setHeader } = useShell();
  const runsStock = role === "owner" || role === "pharmacist";
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);        // medicine id in the details drawer
  const [editing, setEditing] = useState(null);  // {} new, or a medicine

  useEffect(() => setHeader({ title: "Pharmacy", sub: "Medicine stock, batches and expiry" }), [setHeader]);
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    setError("");
    getPharmacySummary().then(setSummary).catch(() => {});
    return getStock({ q: query, filter }).then((d) => setRows(d.medicines)).catch((e) => setError(e.message));
  }, [query, filter]);

  useEffect(() => { setRows(null); load(); }, [load]);

  const s = summary;
  return (
    <>
      <div className="grid-kpi">
        <Kpi icon="wallet" tint="t-green" label="Pharmacy sales today" value={s ? money2(s.salesToday, lab) : "…"} hint={s ? `${s.billsToday} bill${s.billsToday === 1 ? "" : "s"} · ${money2(s.salesWeek, lab)} this week` : ""} />
        <Kpi icon="pill" tint="t-teal" label="Stock value (at cost)" value={s ? money2(s.stockValue, lab) : "…"} hint={s ? `${s.medicines} medicines stocked` : ""} />
        <Kpi icon="alert" tint="t-amber" label="Low or out of stock" value={s ? s.low + s.out : "…"} hint={s ? `${s.out} out of stock · reorder soon` : ""} onClick={() => setFilter("low")} />
        <Kpi icon="clock" tint="t-rose" label="Expiring in 3 months" value={s ? s.expiring : "…"} hint={s ? (s.expired ? `${s.expired} with expired batches on the shelf` : "No expired stock on the shelf") : ""} onClick={() => setFilter("expiring")} />
      </div>

      <div className="panel" style={{ padding: "14px 16px" }}>
        <div className="toolbar">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search medicine or generic name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search medicines" />
          </div>
          <Link className="btn btn-primary btn-sm" to="/dashboard/pharmacy/sale"><Icon name="plus" size={16} /> New sale</Link>
          {runsStock && <Link className="btn btn-soft btn-sm" to="/dashboard/pharmacy/receive"><Icon name="truck" size={16} /> Receive stock</Link>}
          {runsStock && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} /> Add medicine</button>}
        </div>
        <div className="segmented" role="group" aria-label="Filter stock" style={{ marginTop: 12 }}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="notice notice-bad" role="alert">{error}</div>}

      <section className="panel panel-flush">
        {!rows ? (
          <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 200 }} /></div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><Icon name="pill" size={30} /><p>No medicines {query ? "match that search" : "here"}.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Medicine</th><th>Rack</th><th className="num">In stock</th><th>Next expiry</th><th className="num">MRP</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m._id} className="row-link" onClick={() => setOpen(m._id)}>
                    <td className="cell-patient">
                      <div className="who-name">{m.name}</div>
                      <div className="who-sub">{[m.generic, m.form, m.manufacturer].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>{m.rack || "–"}</td>
                    <td className="num"><strong>{m.inStock}</strong> <span className="who-sub">{m.unit}{m.inStock === 1 ? "" : "s"}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {prettyExpiry(m.nextExpiry)}
                      {m.expiringQty > 0 && <div className="who-sub text-due">{m.expiringQty} expiring soon</div>}
                      {m.expiredQty > 0 && <div className="who-sub text-bad">{m.expiredQty} expired on shelf</div>}
                    </td>
                    <td className="num">{m.mrp != null ? money2(m.mrp, lab) : "–"}</td>
                    <td><span className={`badge st-${m.status}`}>{STOCK_STATUS[m.status]}</span></td>
                    <td className="num"><button type="button" className="btn btn-quiet btn-xs" onClick={(e) => { e.stopPropagation(); setOpen(m._id); }}>Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <MedicineDetails id={open} runsStock={runsStock} onClose={() => setOpen(null)} onEdit={(m) => { setOpen(null); setEditing(m); }} onChanged={load} />
      )}
      {editing && (
        <MedicineForm medicine={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

function Kpi({ icon, tint, label, value, hint, onClick }) {
  return (
    <div className={`panel kpi${onClick ? " kpi-click" : ""}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && (e.key === "Enter" || e.key === " ") && onClick()}>
      <div className={`kpi-icon ${tint}`}><Icon name={icon} size={20} /></div>
      <div style={{ minWidth: 0 }}>
        <p className="kpi-label">{label}</p>
        <p className="kpi-value">{value}</p>
        {hint && <p className="kpi-hint">{hint}</p>}
      </div>
    </div>
  );
}

const MOVE_LABEL = { purchase: "Received", sale: "Sold", return: "Returned", adjust: "Adjusted" };

function MedicineDetails({ id, runsStock, onClose, onEdit, onChanged }) {
  const { lab } = useShell();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adjusting, setAdjusting] = useState(null);

  const load = useCallback(() => getMedicine(id).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const m = data?.medicine;
  return (
    <Drawer
      title={m ? m.name : "Medicine"}
      onClose={onClose}
      footer={runsStock && m ? <button className="btn btn-quiet" onClick={() => onEdit(m)}><Icon name="edit" size={15} /> Edit medicine</button> : null}
    >
      {error && <div className="notice notice-bad">{error}</div>}
      {!data ? <div className="skeleton" style={{ height: 200 }} /> : (
        <>
          <dl className="facts">
            <dt>Generic</dt><dd>{m.generic || "–"}</dd>
            <dt>Form</dt><dd>{m.form} · sold per {m.unit}</dd>
            <dt>Maker</dt><dd>{m.manufacturer || "–"}</dd>
            <dt>GST · HSN</dt><dd>{m.gstPct}% · {m.hsn || "–"}</dd>
            <dt>Reorder at</dt><dd>{m.reorderLevel} {m.unit}s</dd>
            <dt>Rack</dt><dd>{m.rack || "–"}</dd>
            <dt>Prescription</dt><dd>{m.rxRequired ? "Needed" : "Not needed"}</dd>
          </dl>

          <p className="section-title">Batches on the shelf</p>
          {data.batches.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No stock received yet.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">MRP</th><th className="num">Cost</th>{runsStock && <th />}</tr></thead>
                <tbody>
                  {data.batches.map((b) => (
                    <tr key={b._id}>
                      <td className="mono">{b.batchNo}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {prettyExpiry(b.expiry)}
                        {b.expired ? <div className="who-sub text-bad">Expired</div> : b.expiringSoon ? <div className="who-sub text-due">Expiring soon</div> : null}
                      </td>
                      <td className="num"><strong>{b.qty}</strong></td>
                      <td className="num">{money2(b.mrp, lab)}</td>
                      <td className="num">{money2(b.purchaseRate, lab)}</td>
                      {runsStock && <td className="num"><button type="button" className="btn btn-quiet btn-xs" onClick={() => setAdjusting(b)}>Adjust</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {adjusting && (
            <AdjustForm batch={adjusting} unit={m.unit} onCancel={() => setAdjusting(null)}
              onSaved={() => { setAdjusting(null); load(); onChanged(); }} />
          )}

          <p className="section-title">Recent movements</p>
          {data.moves.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Nothing yet.</p> : (
            <ul className="list moves">
              {data.moves.map((mv) => (
                <li key={mv._id}>
                  <span className={`move-qty ${mv.qty > 0 ? "in" : "out"}`}>{mv.qty > 0 ? "+" : ""}{mv.qty}</span>
                  <div className="grow">
                    <div className="small"><strong>{MOVE_LABEL[mv.type]}</strong> · batch {mv.batch?.batchNo}</div>
                    <div className="who-sub">{prettyDate(mv.date, lab)}{mv.note ? ` · ${mv.note}` : ""}{mv.by ? ` · ${mv.by}` : ""}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Drawer>
  );
}

function AdjustForm({ batch, unit, onCancel, onSaved }) {
  const [dir, setDir] = useState("remove");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const n = Math.abs(parseInt(qty, 10) || 0);
      await adjustBatch(batch._id, { qty: dir === "remove" ? -n : n, reason });
      onSaved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ background: "#fafbfd", display: "grid", gap: 10 }}>
      <strong className="small">Adjust batch {batch.batchNo} · {batch.qty} {unit}s now</strong>
      {error && <div className="notice notice-bad" style={{ margin: 0 }}>{error}</div>}
      <div className="radios">
        <label className="radio"><input type="radio" checked={dir === "remove"} onChange={() => setDir("remove")} /> Remove</label>
        <label className="radio"><input type="radio" checked={dir === "add"} onChange={() => setDir("add")} /> Add</label>
      </div>
      <div className="two">
        <div>
          <label className="field-label" htmlFor="adj-qty">Units</label>
          <input id="adj-qty" className="input" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="adj-reason">Reason</label>
          <input id="adj-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
            placeholder={dir === "remove" ? "Expired, returned to supplier" : "Found in recount"} list="adj-reasons" />
          <datalist id="adj-reasons">
            <option value="Expired, returned to supplier" /><option value="Expired, destroyed" /><option value="Damaged" />
            <option value="Stock count correction" /><option value="Found in recount" />
          </datalist>
        </div>
      </div>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !(parseInt(qty, 10) > 0) || reason.trim().length < 3} onClick={save}>
          {busy ? "Saving…" : `${dir === "remove" ? "Remove" : "Add"} ${parseInt(qty, 10) || 0} ${unit}s`}
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function MedicineForm({ medicine, onClose, onSaved }) {
  const [f, setF] = useState({
    name: "", generic: "", form: "Tablet", unit: "tablet", manufacturer: "", hsn: "3004", gstPct: 12,
    reorderLevel: 20, rxRequired: true, rack: "", active: true, ...medicine,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { _id, lab: _l, createdAt, updatedAt, __v, inStock, expiredQty, expiringQty, nextExpiry, mrp, stockValue, status, ...body } = f;
      const { medicine: saved } = await saveMedicine(medicine._id, { ...body, gstPct: Number(body.gstPct), reorderLevel: Number(body.reorderLevel) });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={medicine._id ? "Edit medicine" : "Add a medicine"}
      onClose={onClose}
      footer={<><button className="btn btn-quiet" onClick={onClose}>Cancel</button><button className="btn btn-primary" type="submit" form="medicine-form" disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}
    >
      <form id="medicine-form" onSubmit={save} noValidate style={{ display: "grid", gap: 14 }}>
        {error && <div className="notice notice-bad" style={{ margin: 0 }}>{error}</div>}
        <div>
          <label className="field-label" htmlFor="m-name">Name with strength</label>
          <input id="m-name" className="input" value={f.name} onChange={set("name")} maxLength={100} placeholder="e.g. Paracetamol 650 mg" autoFocus />
        </div>
        <div className="two">
          <div>
            <label className="field-label" htmlFor="m-generic">Generic name</label>
            <input id="m-generic" className="input" value={f.generic} onChange={set("generic")} maxLength={100} placeholder="Paracetamol" />
          </div>
          <div>
            <label className="field-label" htmlFor="m-maker">Manufacturer</label>
            <input id="m-maker" className="input" value={f.manufacturer} onChange={set("manufacturer")} maxLength={80} />
          </div>
        </div>
        <div className="two">
          <div>
            <label className="field-label" htmlFor="m-form">Form</label>
            <select id="m-form" className="select" value={f.form} onChange={set("form")}>
              {MEDICINE_FORMS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="m-unit">Sold per</label>
            <input id="m-unit" className="input" value={f.unit} onChange={set("unit")} maxLength={20} placeholder="tablet, bottle, tube" />
          </div>
        </div>
        <div className="two">
          <div>
            <label className="field-label" htmlFor="m-gst">GST</label>
            <select id="m-gst" className="select" value={f.gstPct} onChange={set("gstPct")}>
              {[0, 5, 12, 18, 28].map((p) => <option key={p} value={p}>{p}%</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="m-hsn">HSN code</label>
            <input id="m-hsn" className="input" value={f.hsn} onChange={set("hsn")} maxLength={10} />
          </div>
        </div>
        <div className="two">
          <div>
            <label className="field-label" htmlFor="m-reorder">Warn when stock falls to</label>
            <input id="m-reorder" className="input" type="number" min="0" value={f.reorderLevel} onChange={set("reorderLevel")} />
          </div>
          <div>
            <label className="field-label" htmlFor="m-rack">Rack / shelf</label>
            <input id="m-rack" className="input" value={f.rack} onChange={set("rack")} maxLength={20} placeholder="A3" />
          </div>
        </div>
        <label className="check-row"><input type="checkbox" checked={f.rxRequired} onChange={set("rxRequired")} /> Needs a prescription (Schedule H)</label>
        <label className="check-row"><input type="checkbox" checked={f.active} onChange={set("active")} /> Stocked and shown at the counter</label>
      </form>
    </Drawer>
  );
}
