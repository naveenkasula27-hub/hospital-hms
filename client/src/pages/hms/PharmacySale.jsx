import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import PatientPicker from "../../components/hms/PatientPicker.jsx";
import {
  PAY_METHOD, createSale, getPatient, getPrescriptions, getStock, lineTotals, money2, prettyExpiry, round2,
} from "../../lib/hms.js";
import { prettyDate } from "../../lib/api.js";

export default function PharmacySale() {
  const { lab, setHeader } = useShell();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [patient, setPatient] = useState(null);
  const [stock, setStock] = useState([]);
  const [rxList, setRxList] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [cart, setCart] = useState([]);   // { medicine, qty, discountPct }
  const [q, setQ] = useState("");

  const [takePayment, setTakePayment] = useState(true);
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setHeader({ title: "New pharmacy sale", sub: "Dispense a prescription or sell over the counter" }), [setHeader]);
  useEffect(() => { getStock({}).then((d) => setStock(d.medicines)).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    const id = params.get("patient");
    if (id) getPatient(id).then((d) => setPatient(d.patient)).catch((e) => setError(e.message));
  }, [params]);

  useEffect(() => {
    setRxList(null);
    setAppointment(null);
    if (patient) getPrescriptions(patient._id).then((d) => setRxList(d.prescriptions)).catch(() => setRxList([]));
  }, [patient]);

  const byId = useMemo(() => Object.fromEntries(stock.map((m) => [m._id, m])), [stock]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return stock.filter((m) => m.name.toLowerCase().includes(t) || m.generic?.toLowerCase().includes(t)).slice(0, 8);
  }, [q, stock]);

  function add(m, qty = 1) {
    setCart((c) => (c.some((l) => l.medicine === m._id)
      ? c.map((l) => (l.medicine === m._id ? { ...l, qty: Number(l.qty) + qty } : l))
      : [...c, { medicine: m._id, qty, discountPct: 0 }]));
    setQ("");
  }

  function loadRx(rx) {
    setAppointment(rx.appointment);
    const next = [];
    for (const line of rx.lines) {
      if (!line.match || line.match.inStock === 0 || next.some((l) => l.medicine === line.match._id)) continue;
      next.push({ medicine: line.match._id, qty: Math.min(line.qty, line.match.inStock), discountPct: 0 });
    }
    setCart(next);
  }

  const set = (id, field, value) => setCart((c) => c.map((l) => (l.medicine === id ? { ...l, [field]: value } : l)));

  // An estimate at the first batch's MRP; the server prices each batch it actually takes from.
  const lines = cart.map((l) => {
    const m = byId[l.medicine];
    const qty = Number(l.qty) || 0;
    const rate = m?.mrp ?? 0;
    const discount = round2((qty * rate * (Number(l.discountPct) || 0)) / 100);
    return { ...l, m, ...lineTotals({ qty, rate, discount, taxPct: m?.gstPct || 0, taxInclusive: true }) };
  });
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  const gst = round2(lines.reduce((s, l) => s + l.tax, 0));
  const disc = round2(lines.reduce((s, l) => s + l.discount, 0));
  const short = lines.find((l) => l.m && Number(l.qty) > l.m.inStock);

  async function save() {
    setError("");
    if (!patient) return setError("Choose the patient first.");
    if (!cart.length) return setError("Add at least one medicine.");
    if (short) return setError(`Only ${short.m.inStock} ${short.m.unit}s of ${short.m.name} in stock.`);
    setBusy(true);
    try {
      const { bill } = await createSale({
        patient: patient._id,
        appointment,
        lines: cart.map((l) => ({ medicine: l.medicine, qty: Number(l.qty), discountPct: Number(l.discountPct) || 0 })),
        payment: takePayment ? { full: true, method, ref } : null,
      });
      navigate(`/dashboard/billing/${bill._id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/dashboard/pharmacy" className="small back-link"><Icon name="arrowLeft" size={15} /> Pharmacy stock</Link>
      {error && <div className="notice notice-bad" role="alert" style={{ margin: 0 }}>{error}</div>}

      <div className="bill-layout">
        <div style={{ display: "grid", gap: 18, alignContent: "start", minWidth: 0 }}>
          <section className="panel">
            <div className="panel-head"><h2>1. Patient</h2></div>
            <PatientPicker patient={patient} onPick={(p) => { setPatient(p); setCart([]); }} formId="sale-patient" />
          </section>

          {patient && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>2. Prescriptions</h2>
                  <p className="muted tiny" style={{ margin: 0 }}>From the last 30 days. Loading one fills the cart with what is in stock.</p>
                </div>
              </div>
              {!rxList ? <div className="skeleton" style={{ height: 60 }} /> : rxList.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>No recent prescription. Add medicines below.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {rxList.map((rx) => (
                    <div key={rx.appointment} className={`rx-card${appointment === rx.appointment ? " is-on" : ""}`}>
                      <div className="rx-card-head">
                        <div>
                          <strong className="small">{rx.doctor}</strong>
                          <div className="who-sub">{prettyDate(rx.date, lab)} · Visit {rx.reference}</div>
                        </div>
                        {rx.dispensed && <span className="badge b-paid">Dispensed</span>}
                        <button type="button" className="btn btn-soft btn-xs" onClick={() => loadRx(rx)}>
                          {appointment === rx.appointment ? "Loaded" : rx.dispensed ? "Load again" : "Load into cart"}
                        </button>
                      </div>
                      <ul className="rx-lines">
                        {rx.lines.map((l, i) => (
                          <li key={i}>
                            <span>{l.text} <span className="who-sub">{[l.frequency, l.duration].filter(Boolean).join(", ")}</span></span>
                            {l.match ? (
                              <span className={`who-sub${l.match.inStock ? "" : " text-bad"}`}>
                                → {l.match.name} · {l.match.inStock ? `${l.match.inStock} in stock` : "out of stock"}
                              </span>
                            ) : <span className="who-sub text-due">Not stocked</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {patient && (
            <section className="panel panel-flush">
              <div className="panel-head" style={{ padding: "18px 20px 0" }}>
                <h2>3. Medicines</h2>
              </div>
              <div style={{ padding: "0 20px 14px", position: "relative" }}>
                <div className="search-box">
                  <Icon name="search" size={16} />
                  <input className="input" placeholder="Add a medicine: type its name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search medicines" />
                </div>
                {matches.length > 0 && (
                  <ul className="results">
                    {matches.map((m) => (
                      <li key={m._id}>
                        <button type="button" disabled={m.inStock === 0} onClick={() => add(m)}>
                          <div className="grow">
                            <div className="who-name">{m.name}</div>
                            <div className="who-sub">{m.generic} · {m.inStock ? `${m.inStock} ${m.unit}s · ${money2(m.mrp, lab)} each · exp ${prettyExpiry(m.nextExpiry)}` : "Out of stock"}</div>
                          </div>
                          {m.rxRequired && <span className="tag">Rx</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {cart.length === 0 ? (
                <div className="empty-state" style={{ paddingTop: 10 }}><Icon name="pill" size={26} /><p>The cart is empty.</p></div>
              ) : (
                <div className="table-wrap">
                  <table className="table bill-lines">
                    <thead><tr><th>Medicine</th><th className="num">In stock</th><th className="num">Qty</th><th className="num">MRP</th><th className="num">Disc %</th><th className="num">Amount</th><th /></tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.medicine}>
                          <td style={{ minWidth: 180 }}>
                            <div className="who-name">{l.m?.name}</div>
                            <div className="who-sub">{l.m?.rack ? `Rack ${l.m.rack} · ` : ""}GST {l.m?.gstPct}% incl.</div>
                          </td>
                          <td className={`num${l.m && Number(l.qty) > l.m.inStock ? " text-bad" : ""}`}>{l.m?.inStock}</td>
                          <td className="num"><input className="input input-sm input-num" type="number" min="1" step="1" value={l.qty} onChange={(e) => set(l.medicine, "qty", e.target.value)} aria-label={`Quantity of ${l.m?.name}`} /></td>
                          <td className="num">{money2(l.m?.mrp ?? 0, lab)}</td>
                          <td className="num"><input className="input input-sm input-num" type="number" min="0" max="100" step="1" value={l.discountPct} onChange={(e) => set(l.medicine, "discountPct", e.target.value)} aria-label={`Discount on ${l.m?.name}`} /></td>
                          <td className="num"><strong>{money2(l.amount, lab)}</strong></td>
                          <td><button type="button" className="icon-btn" onClick={() => setCart((c) => c.filter((x) => x.medicine !== l.medicine))} aria-label={`Remove ${l.m?.name}`}><Icon name="x" size={16} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="panel bill-summary">
          <h2>Summary</h2>
          <dl className="sums">
            <dt>Items</dt><dd>{cart.length}</dd>
            <dt>Discount</dt><dd>{disc ? `− ${money2(disc, lab)}` : money2(0, lab)}</dd>
            <dt>GST included</dt><dd>{money2(gst, lab)}</dd>
            <dt className="sum-total">To pay</dt><dd className="sum-total">{money2(total, lab)}</dd>
          </dl>
          <p className="muted tiny" style={{ margin: 0 }}>Priced at MRP. If one medicine comes from two batches with different MRPs, the bill uses each batch's own price.</p>

          <label className="check-row">
            <input type="checkbox" checked={takePayment} onChange={(e) => setTakePayment(e.target.checked)} />
            Paid now in full
          </label>
          {takePayment && (
            <>
              <div className="radios">
                {["cash", "upi", "card"].map((k) => (
                  <label key={k} className="radio"><input type="radio" name="sale-method" checked={method === k} onChange={() => setMethod(k)} /> {PAY_METHOD[k]}</label>
                ))}
              </div>
              {method !== "cash" && (
                <div>
                  <label className="field-label" htmlFor="sale-ref">{method === "upi" ? "UPI transaction ID" : "Card slip number"} (optional)</label>
                  <input id="sale-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} />
                </div>
              )}
            </>
          )}

          <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={busy || !patient || !cart.length || Boolean(short)} onClick={save}>
            {busy ? "Saving…" : takePayment ? `Sell & collect ${money2(total, lab)}` : "Sell on credit"}
          </button>
        </aside>
      </div>
    </>
  );
}
