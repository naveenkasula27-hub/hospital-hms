import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import {
  BILL_STATUS, CLAIM_STATUS, ITEM_KIND, PAY_METHOD, addBillPayment, cancelBill, getBill, listClaims, money2, prettyExpiry, prettyPhone, taxSplit,
} from "../../lib/hms.js";
import { prettyDate } from "../../lib/api.js";

export default function BillView() {
  const { id } = useParams();
  const { lab, role, setHeader } = useShell();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [claims, setClaims] = useState([]);

  useEffect(() => {
    setBill(null);
    getBill(id).then((d) => setBill(d.bill)).catch((e) => setError(e.message));
    if (role !== "pharmacist") listClaims({ bill: id }).then((d) => setClaims(d.claims)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (bill) setHeader({ title: `Bill ${bill.number}`, sub: `${bill.patient.name} · ${prettyDate(bill.date, lab)}` });
  }, [bill, lab, setHeader]);

  if (error && !bill) return <div className="notice notice-bad">{error}</div>;
  if (!bill) return <div className="panel skeleton" style={{ height: 300 }} />;

  const p = bill.patient;
  const live = bill.status !== "cancelled";

  return (
    <>
      {role === "pharmacist"
        ? <Link to="/dashboard/pharmacy/sales" className="small back-link"><Icon name="arrowLeft" size={15} /> Pharmacy sales</Link>
        : <Link to="/dashboard/billing" className="small back-link"><Icon name="arrowLeft" size={15} /> All bills</Link>}

      <div className="bill-layout">
        <section className="panel panel-flush" style={{ minWidth: 0 }}>
          <div className="panel-head" style={{ padding: "18px 20px 0" }}>
            <div>
              <h2 style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {bill.number} <span className={`badge b-${bill.status}`}>{BILL_STATUS[bill.status]}</span>
              </h2>
              <p className="muted tiny" style={{ margin: 0 }}>Made {prettyDate(bill.date, lab)} by {bill.createdBy || "–"}</p>
            </div>
            <div className="actions">
              <a className="btn btn-quiet btn-sm" href={`/print/invoice/${bill._id}`} target="_blank" rel="noopener noreferrer"><Icon name="printer" size={15} /> Print invoice</a>
              {live && bill.due > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => setPaying(true)}><Icon name="wallet" size={15} /> Take payment</button>}
            </div>
          </div>

          <div className="picked" style={{ margin: "14px 20px" }}>
            <div className="avatar">{p.name[0]}</div>
            <div>
              <Link className="who-name" to={`/dashboard/patients/${p._id}`}>{p.name}</Link>
              <div className="who-sub">{p.uhid} · {p.age}y {p.gender} · {prettyPhone(p.phone)}</div>
            </div>
          </div>

          {bill.status === "cancelled" && (
            <div className="notice notice-bad" style={{ margin: "0 20px 14px" }}>
              Cancelled by {bill.cancelled.by} on {new Date(bill.cancelled.at).toLocaleDateString(lab.locale || "en-IN")}. Reason: {bill.cancelled.reason}
            </div>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Discount</th><th className="num">Tax</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {bill.items.map((i, n) => (
                  <tr key={n}>
                    <td>{n + 1}</td>
                    <td>{i.name}<div className="who-sub">{ITEM_KIND[i.kind]}{i.batchNo ? ` · Batch ${i.batchNo} · Exp ${prettyExpiry(i.expiry)}` : ""}</div></td>
                    <td className="num">{i.qty}</td>
                    <td className="num">{money2(i.rate, lab)}</td>
                    <td className="num">{i.discount ? `− ${money2(i.discount, lab)}` : "–"}</td>
                    <td className="num">{i.tax ? `${money2(i.tax, lab)} (${i.taxPct}%${i.taxInclusive ? " incl." : ""})` : "–"}</td>
                    <td className="num"><strong>{money2(i.amount, lab)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bill.notes && <p className="small" style={{ padding: "0 20px" }}><strong>Note:</strong> {bill.notes}</p>}
        </section>

        <aside style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <section className="panel bill-summary">
            <h2>Summary</h2>
            <dl className="sums">
              <dt>Subtotal</dt><dd>{money2(bill.subtotal, lab)}</dd>
              <dt>Discount</dt><dd>{bill.discount ? `− ${money2(bill.discount, lab)}` : money2(0, lab)}</dd>
              {taxSplit(bill).added > 0 && <><dt>GST</dt><dd>{money2(taxSplit(bill).added, lab)}</dd></>}
              <dt className="sum-total">Total</dt><dd className="sum-total">{money2(bill.total, lab)}</dd>
              {taxSplit(bill).included > 0 && <><dt className="tiny">Includes GST</dt><dd className="tiny">{money2(taxSplit(bill).included, lab)}</dd></>}
              <dt>Paid</dt><dd>{money2(bill.paid, lab)}</dd>
              {live && <><dt><strong>Balance due</strong></dt><dd><strong className={bill.due > 0 ? "text-due" : ""}>{money2(bill.due, lab)}</strong></dd></>}
            </dl>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Payments</h2></div>
            {bill.payments.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>No payment yet.</p>
            ) : (
              <ul className="list">
                {bill.payments.map((pm, n) => (
                  <li key={n}>
                    <div className={`kpi-icon ${pm.kind === "refund" ? "t-rose" : "t-green"}`} style={{ width: 34, height: 34 }}>
                      <Icon name={pm.kind === "refund" ? "arrowLeft" : "check"} size={15} />
                    </div>
                    <div className="grow">
                      <div className="who-name small">{pm.kind === "refund" ? "Refund" : "Received"} · {PAY_METHOD[pm.method]}</div>
                      <div className="who-sub">{prettyDate(pm.date, lab)}{pm.ref ? ` · Ref ${pm.ref}` : ""}</div>
                    </div>
                    <strong className="small">{pm.kind === "refund" ? "− " : ""}{money2(pm.amount, lab)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {role !== "pharmacist" && (
            <section className="panel">
              <div className="panel-head">
                <h2>Insurance</h2>
                {live && claims.length === 0 && (
                  <Link className="btn btn-soft btn-xs" to={`/dashboard/insurance/new?bill=${bill._id}`}><Icon name="shield" size={14} /> File claim</Link>
                )}
              </div>
              {claims.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>No insurance claim on this bill.</p>
              ) : (
                <ul className="list">
                  {claims.map((c) => (
                    <li key={c._id}>
                      <div className="kpi-icon t-blue" style={{ width: 34, height: 34 }}><Icon name="shield" size={15} /></div>
                      <div className="grow">
                        <Link className="who-name small" to={`/dashboard/insurance/${c._id}`}>{c.claimNumber || "Draft claim"}</Link>
                        <div className="who-sub">{c.insurer?.name} · Claimed {money2(c.claimedAmount, lab)}</div>
                      </div>
                      <span className={`badge cl-${c.status}`}>{CLAIM_STATUS[c.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {live && role === "owner" && (
            <button type="button" className="btn btn-quiet btn-sm btn-danger" onClick={() => setCancelling(true)}>Cancel this bill</button>
          )}
        </aside>
      </div>

      {paying && <TakePayment bill={bill} onClose={() => setPaying(false)} onSaved={(b) => { setBill({ ...b, patient: bill.patient }); setPaying(false); }} />}
      {cancelling && <CancelBill bill={bill} onClose={() => setCancelling(false)} onSaved={(b) => { setBill({ ...b, patient: bill.patient }); setCancelling(false); }} />}
    </>
  );
}

function TakePayment({ bill, onClose, onSaved }) {
  const { lab } = useShell();
  const [amount, setAmount] = useState(String(bill.due));
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const { bill: saved } = await addBillPayment(bill._id, { amount: Number(amount), method, ref });
      onSaved(saved);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Take payment"
      onClose={onClose}
      footer={<><button className="btn btn-quiet" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={save}>{busy ? "Saving…" : `Record ${money2(Number(amount) || 0, lab)}`}</button></>}
    >
      {error && <div className="notice notice-bad">{error}</div>}
      <div className="picked">
        <div>
          <div className="who-name">{bill.number}</div>
          <div className="who-sub">{bill.patient.name} · total {money2(bill.total, lab)}, paid {money2(bill.paid, lab)}</div>
        </div>
        <div className="kpi-value" style={{ marginLeft: "auto", fontSize: "1.3rem" }}>{money2(bill.due, lab)}</div>
      </div>
      <div>
        <label className="field-label" htmlFor="tp-amount">Amount received</label>
        <input id="tp-amount" className="input" type="number" min="0" max={bill.due} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div>
        <p className="field-label">Paid by</p>
        <div className="radios">
          {["cash", "upi", "card", "bank"].map((k) => (
            <label key={k} className="radio"><input type="radio" name="tp-method" checked={method === k} onChange={() => setMethod(k)} /> {PAY_METHOD[k]}</label>
          ))}
        </div>
      </div>
      {method !== "cash" && (
        <div>
          <label className="field-label" htmlFor="tp-ref">{method === "upi" ? "UPI transaction ID" : method === "card" ? "Card slip number" : "Reference"} (optional)</label>
          <input id="tp-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} />
        </div>
      )}
    </Drawer>
  );
}

function CancelBill({ bill, onClose, onSaved }) {
  const { lab } = useShell();
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const { bill: saved } = await cancelBill(bill._id, { reason, refundMethod });
      onSaved(saved);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={`Cancel bill ${bill.number}`}
      onClose={onClose}
      footer={<><button className="btn btn-quiet" onClick={onClose}>Keep the bill</button><button className="btn btn-primary btn-danger-solid" disabled={busy || reason.trim().length < 3} onClick={save}>{busy ? "Cancelling…" : "Cancel bill"}</button></>}
    >
      {error && <div className="notice notice-bad">{error}</div>}
      <p className="small" style={{ margin: 0 }}>
        The bill stays on record, marked cancelled, and its number is never reused. Visits and lab tests on it go back to “waiting to be billed”.
      </p>
      {bill.paid > 0 && (
        <div className="notice notice-warn" style={{ margin: 0 }}>
          {money2(bill.paid, lab)} was paid on this bill. It will be recorded as refunded today. Hand it back to the patient.
        </div>
      )}
      <div>
        <label className="field-label" htmlFor="cb-reason">Reason</label>
        <input id="cb-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Wrong patient selected" autoFocus />
      </div>
      {bill.paid > 0 && (
        <div>
          <p className="field-label">Refunded by</p>
          <div className="radios">
            {["cash", "upi", "card", "bank"].map((k) => (
              <label key={k} className="radio"><input type="radio" name="cb-method" checked={refundMethod === k} onChange={() => setRefundMethod(k)} /> {PAY_METHOD[k]}</label>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}
