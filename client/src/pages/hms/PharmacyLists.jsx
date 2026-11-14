import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import { BILL_STATUS, listPurchases, listSales, money2, prettyExpiry } from "../../lib/hms.js";
import { prettyDate, todayForLab } from "../../lib/api.js";

/** Supplier invoices entered into stock. */
export function PharmacyPurchases() {
  const { lab, setHeader } = useShell();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setHeader({ title: "Purchases", sub: "Stock received from suppliers" }), [setHeader]);
  useEffect(() => { listPurchases().then(setData).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <div className="panel" style={{ padding: "14px 16px" }}>
        <div className="toolbar">
          <span className="muted small">{data ? `${data.purchases.length} entries · ${data.suppliers.length} suppliers` : ""}</span>
          <Link className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} to="/dashboard/pharmacy/receive"><Icon name="truck" size={16} /> Receive stock</Link>
        </div>
      </div>
      {error && <div className="notice notice-bad">{error}</div>}
      <section className="panel panel-flush">
        {!data ? <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 160 }} /></div> : data.purchases.length === 0 ? (
          <div className="empty-state"><Icon name="truck" size={30} /><p>No stock received yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Supplier</th><th>Invoice no.</th><th className="num">Lines</th><th className="num">Total</th><th>Entered by</th></tr></thead>
              <tbody>
                {data.purchases.map((p) => (
                  <Fragment key={p._id}>
                    <tr className="row-link" onClick={() => setOpen(open === p._id ? "" : p._id)} aria-expanded={open === p._id}>
                      <td style={{ whiteSpace: "nowrap" }}>{prettyDate(p.date, lab)}</td>
                      <td className="who-name">{p.supplier}</td>
                      <td className="mono">{p.invoiceNo || "–"}</td>
                      <td className="num">{p.items.length}</td>
                      <td className="num"><strong>{money2(p.total, lab)}</strong></td>
                      <td className="who-sub">{p.by}</td>
                    </tr>
                    {open === p._id && (
                      <tr className="row-detail">
                        <td colSpan={6}>
                          <table className="table">
                            <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="num">Qty + free</th><th className="num">Cost</th><th className="num">MRP</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
                            <tbody>
                              {p.items.map((i, n) => (
                                <tr key={n}>
                                  <td>{i.name}</td><td className="mono">{i.batchNo}</td><td>{prettyExpiry(i.expiry)}</td>
                                  <td className="num">{i.qty}{i.freeQty ? ` + ${i.freeQty}` : ""}</td>
                                  <td className="num">{money2(i.purchaseRate, lab)}</td><td className="num">{money2(i.mrp, lab)}</td>
                                  <td className="num">{i.gstPct}%</td><td className="num">{money2(i.amount, lab)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/** The day's pharmacy bills. */
export function PharmacySales() {
  const { lab, setHeader } = useShell();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayForLab(lab));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => setHeader({ title: "Pharmacy sales", sub: "Every medicine bill, by day" }), [setHeader]);
  useEffect(() => {
    setData(null);
    listSales(date).then(setData).catch((e) => setError(e.message));
  }, [date]);

  const live = data?.bills.filter((b) => b.status !== "cancelled") || [];
  const total = live.reduce((s, b) => s + b.total, 0);

  return (
    <>
      <div className="panel" style={{ padding: "14px 16px" }}>
        <div className="toolbar">
          <input type="date" className="input" value={date} max={todayForLab(lab)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          <span className="small">{data ? <><strong>{money2(total, lab)}</strong> from {live.length} bill{live.length === 1 ? "" : "s"}</> : ""}</span>
          <Link className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} to="/dashboard/pharmacy/sale"><Icon name="plus" size={16} /> New sale</Link>
        </div>
      </div>
      {error && <div className="notice notice-bad">{error}</div>}
      <section className="panel panel-flush">
        {!data ? <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 160 }} /></div> : data.bills.length === 0 ? (
          <div className="empty-state"><Icon name="pill" size={30} /><p>No sales on {prettyDate(date, lab)}.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Bill no.</th><th>Patient</th><th>Medicines</th><th className="num">Total</th><th className="num">Due</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.bills.map((b) => (
                  <tr key={b._id} className="row-link" onClick={() => navigate(`/dashboard/billing/${b._id}`)}>
                    <td className="who-name mono">{b.number}</td>
                    <td className="cell-patient"><div className="who-name">{b.patient?.name}</div><div className="who-sub">{b.patient?.uhid}</div></td>
                    <td className="small" style={{ maxWidth: 320 }}>{[...new Set(b.items.map((i) => i.name))].join(", ")}</td>
                    <td className="num">{money2(b.total, lab)}</td>
                    <td className="num">{b.status === "cancelled" ? "–" : money2(b.due, lab)}</td>
                    <td><span className={`badge b-${b.status}`}>{BILL_STATUS[b.status]}</span></td>
                    <td className="num">
                      <a className="btn btn-quiet btn-xs" href={`/print/invoice/${b._id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="printer" size={14} /> Print</a>
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
