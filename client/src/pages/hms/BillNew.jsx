import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import PatientForm from "./PatientForm.jsx";
import {
  ITEM_KIND, PAY_METHOD, createBill, getPatient, getUnbilled, lineTotals, listPatients, listServices, money2, prettyPhone, round2,
} from "../../lib/hms.js";

let lineKey = 0;
const newLine = (fields) => ({ key: ++lineKey, kind: "other", name: "", qty: 1, rate: 0, discount: 0, taxPct: 0, ...fields });

export default function BillNew() {
  const { lab, setHeader } = useShell();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [patient, setPatient] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  const [pending, setPending] = useState(null);   // items waiting to be billed for this patient
  const [lines, setLines] = useState([]);
  const [services, setServices] = useState([]);
  const [notes, setNotes] = useState("");

  const [takePayment, setTakePayment] = useState(true);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setHeader({ title: "New bill", sub: "Consultation, lab tests and hospital charges on one invoice" }), [setHeader]);
  useEffect(() => { listServices().then((d) => setServices(d.services)).catch(() => {}); }, []);

  // Opened from a patient's record or the queue: start with that patient.
  useEffect(() => {
    const id = params.get("patient");
    if (id) getPatient(id).then((d) => setPatient(d.patient)).catch((e) => setError(e.message));
  }, [params]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => listPatients({ q }).then((d) => setResults(d.patients)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPending(null);
    setLines([]);
    if (!patient) return;
    getUnbilled(patient._id)
      .then((d) => {
        const items = d.items.map((i) => newLine(i));
        setPending(items);
        setLines(items);   // everything waiting is on the bill unless reception takes it off
      })
      .catch((e) => setError(e.message));
  }, [patient]);

  const totals = useMemo(() => {
    const t = lines.map(lineTotals);
    const sum = (k) => round2(t.reduce((s, l) => s + l[k], 0));
    return { subtotal: sum("gross"), discount: sum("discount"), tax: sum("tax"), total: sum("amount") };
  }, [lines]);

  useEffect(() => {
    if (!amountTouched) setAmount(totals.total ? String(totals.total) : "");
  }, [totals.total, amountTouched]);

  const onBill = (p) => lines.some((l) => l.key === p.key);
  // A lab booking is billed whole, so its tests go on and come off together.
  const togglePending = (p) => {
    const group = p.booking ? pending.filter((x) => x.booking === p.booking) : [p];
    const keys = new Set(group.map((g) => g.key));
    setLines((ls) => (onBill(p) ? ls.filter((l) => !keys.has(l.key)) : [...ls, ...group.filter((g) => !ls.some((l) => l.key === g.key))]));
  };
  const update = (key, field, value) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  function addService(id) {
    const s = services.find((x) => x._id === id);
    if (s) setLines((ls) => [...ls, newLine({ kind: s.kind, name: s.name, rate: s.price, taxPct: s.taxPct, service: s._id })]);
  }

  async function save() {
    setError("");
    if (!patient) return setError("Choose the patient first.");
    if (!lines.length) return setError("Add at least one item to the bill.");
    if (lines.some((l) => !l.name.trim())) return setError("Every line needs a name.");
    if (lines.some((l) => !(Number(l.qty) > 0))) return setError("Quantity must be more than zero.");
    const pay = Number(amount) || 0;
    if (takePayment && pay > totals.total) return setError("The payment is more than the bill total.");
    setBusy(true);
    try {
      const { bill } = await createBill({
        patient: patient._id,
        items: lines.map((l) => ({
          kind: l.kind, name: l.name.trim(), qty: Number(l.qty), rate: Number(l.rate) || 0,
          discount: Number(l.discount) || 0, taxPct: Number(l.taxPct) || 0,
          appointment: l.appointment || null, booking: l.booking || null, service: l.service || null,
        })),
        payment: takePayment && pay > 0 ? { amount: pay, method, ref } : null,
        notes,
      });
      navigate(`/dashboard/billing/${bill._id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/dashboard/billing" className="small back-link"><Icon name="arrowLeft" size={15} /> All bills</Link>
      {error && <div className="notice notice-bad" role="alert" style={{ margin: 0 }}>{error}</div>}

      <div className="bill-layout">
        <div style={{ display: "grid", gap: 18, alignContent: "start", minWidth: 0 }}>
          <section className="panel">
            <div className="panel-head"><h2>1. Patient</h2></div>
            {patient ? (
              <div className="picked">
                <div className="avatar">{patient.name[0]}</div>
                <div>
                  <div className="who-name">{patient.name}</div>
                  <div className="who-sub">{patient.uhid} · {patient.age}y {patient.gender} · {prettyPhone(patient.phone)}</div>
                </div>
                <button type="button" className="btn btn-quiet btn-xs" style={{ marginLeft: "auto" }} onClick={() => setPatient(null)}>Change</button>
              </div>
            ) : registering ? (
              <div>
                <PatientForm compact formId="bill-patient" onSaved={(p) => { setPatient(p); setRegistering(false); }} />
                <button type="button" className="btn btn-quiet btn-sm" style={{ marginTop: 10 }} onClick={() => setRegistering(false)}>Back to search</button>
              </div>
            ) : (
              <div>
                <div className="search-box">
                  <Icon name="search" size={16} />
                  <input className="input" placeholder="Search by name, mobile or UHID" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search patients" />
                </div>
                {results.length > 0 && (
                  <ul className="results">
                    {results.map((p) => (
                      <li key={p._id}>
                        <button type="button" onClick={() => setPatient(p)}>
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
            )}
          </section>

          {patient && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>2. Waiting to be billed</h2>
                  <p className="muted tiny">Unpaid consultations and lab tests for {patient.name}</p>
                </div>
              </div>
              {!pending ? (
                <div className="skeleton" style={{ height: 60 }} />
              ) : pending.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>Nothing pending. Add charges below.</p>
              ) : (
                <ul className="pending">
                  {pending.map((p) => (
                    <li key={p.key}>
                      <label>
                        <input type="checkbox" checked={onBill(p)} onChange={() => togglePending(p)} />
                        <span className="grow">
                          <span className="who-name small">{p.name}</span>
                          <span className="who-sub">{p.source}{p.unpriced ? " · no price set, enter the rate" : ""}</span>
                        </span>
                        <strong className="small">{money2(p.rate, lab)}</strong>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {patient && (
            <section className="panel panel-flush">
              <div className="panel-head" style={{ padding: "18px 20px 0" }}>
                <h2>3. Bill items</h2>
                <div className="toolbar">
                  {services.length > 0 && (
                    <select className="select" value="" onChange={(e) => addService(e.target.value)} aria-label="Add a hospital charge">
                      <option value="">+ Add a hospital charge</option>
                      {services.map((s) => <option key={s._id} value={s._id}>{s.name} · {money2(s.price, lab)}</option>)}
                    </select>
                  )}
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setLines((ls) => [...ls, newLine({})])}>
                    <Icon name="plus" size={15} /> Other item
                  </button>
                </div>
              </div>
              {lines.length === 0 ? (
                <div className="empty-state"><Icon name="file" size={26} /><p>No items on this bill yet.</p></div>
              ) : (
                <div className="table-wrap">
                  <table className="table bill-lines">
                    <thead>
                      <tr><th>Item</th><th>Type</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Discount</th><th className="num">Tax %</th><th className="num">Amount</th><th /></tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const t = lineTotals(l);
                        const linked = l.appointment || l.booking;
                        return (
                          <tr key={l.key}>
                            <td style={{ minWidth: 220 }}>
                              <input className="input input-sm" value={l.name} onChange={(e) => update(l.key, "name", e.target.value)} aria-label="Item name" placeholder="What is this charge for?" />
                            </td>
                            <td>
                              {linked ? <span className="tag">{ITEM_KIND[l.kind]}</span> : (
                                <select className="select input-sm" value={l.kind} onChange={(e) => update(l.key, "kind", e.target.value)} aria-label="Type">
                                  {["procedure", "room", "other"].map((k) => <option key={k} value={k}>{ITEM_KIND[k]}</option>)}
                                </select>
                              )}
                            </td>
                            <td className="num"><input className="input input-sm input-num" type="number" min="1" step="1" value={l.qty} disabled={Boolean(l.appointment)} onChange={(e) => update(l.key, "qty", e.target.value)} aria-label="Quantity" /></td>
                            <td className="num"><input className="input input-sm input-num" type="number" min="0" step="0.01" value={l.rate} onChange={(e) => update(l.key, "rate", e.target.value)} aria-label="Rate" /></td>
                            <td className="num"><input className="input input-sm input-num" type="number" min="0" step="0.01" value={l.discount} onChange={(e) => update(l.key, "discount", e.target.value)} aria-label="Discount" /></td>
                            <td className="num">
                              <select className="select input-sm" value={l.taxPct} onChange={(e) => update(l.key, "taxPct", Number(e.target.value))} aria-label="Tax percent">
                                {[0, 5, 12, 18].map((p) => <option key={p} value={p}>{p}%</option>)}
                              </select>
                            </td>
                            <td className="num"><strong>{money2(t.amount, lab)}</strong></td>
                            <td>
                              <button type="button" className="icon-btn" onClick={() => (l.booking ? togglePending(l) : remove(l.key))} aria-label={`Remove ${l.name || "line"}`}><Icon name="x" size={16} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ padding: "0 20px 18px" }}>
                <label className="field-label" htmlFor="bill-notes">Note on the bill (optional)</label>
                <input id="bill-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="e.g. Senior citizen discount approved by Dr. Rao" />
              </div>
            </section>
          )}
        </div>

        <aside className="panel bill-summary">
          <h2>Summary</h2>
          <dl className="sums">
            <dt>Subtotal</dt><dd>{money2(totals.subtotal, lab)}</dd>
            <dt>Discount</dt><dd>{totals.discount ? `− ${money2(totals.discount, lab)}` : money2(0, lab)}</dd>
            <dt>Tax</dt><dd>{money2(totals.tax, lab)}</dd>
            <dt className="sum-total">Total</dt><dd className="sum-total">{money2(totals.total, lab)}</dd>
          </dl>

          <label className="check-row">
            <input type="checkbox" checked={takePayment} onChange={(e) => setTakePayment(e.target.checked)} />
            Take payment now
          </label>

          {takePayment && (
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="field-label" htmlFor="pay-amount">Amount received</label>
                <input id="pay-amount" className="input" type="number" min="0" step="0.01" value={amount}
                  onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }} />
                {Number(amount) > 0 && Number(amount) < totals.total && (
                  <p className="muted tiny" style={{ margin: "6px 0 0" }}>{money2(round2(totals.total - Number(amount)), lab)} will stay due on this bill.</p>
                )}
              </div>
              <div>
                <p className="field-label">Paid by</p>
                <div className="radios">
                  {["cash", "upi", "card", "bank"].map((k) => (
                    <label key={k} className="radio">
                      <input type="radio" name="bill-method" checked={method === k} onChange={() => setMethod(k)} /> {PAY_METHOD[k]}
                    </label>
                  ))}
                </div>
              </div>
              {method !== "cash" && (
                <div>
                  <label className="field-label" htmlFor="pay-ref">{method === "upi" ? "UPI transaction ID" : method === "card" ? "Card slip number" : "Reference"} (optional)</label>
                  <input id="pay-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} />
                </div>
              )}
            </div>
          )}

          <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={busy || !patient || !lines.length} onClick={save}>
            {busy ? "Saving…" : takePayment && Number(amount) > 0 ? `Save bill & record ${money2(Number(amount), lab)}` : "Save bill"}
          </button>
        </aside>
      </div>
    </>
  );
}
