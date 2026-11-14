import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import { MedicineForm } from "./Pharmacy.jsx";
import { createPurchase, getStock, listPurchases, money2, round2 } from "../../lib/hms.js";
import { todayForLab } from "../../lib/api.js";

let key = 0;
const blank = () => ({ key: ++key, medicine: "", search: "", batchNo: "", expiry: "", qty: "", freeQty: "", purchaseRate: "", mrp: "", gstPct: 12 });

export default function PharmacyReceive() {
  const { lab, setHeader } = useShell();
  const navigate = useNavigate();
  const today = todayForLab(lab);
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(today);
  const [lines, setLines] = useState([blank()]);
  const [adding, setAdding] = useState(null);   // line key waiting for a new medicine
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setHeader({ title: "Receive stock", sub: "Enter a supplier's invoice. Stock goes on the shelf as soon as you save." }), [setHeader]);
  const loadMeds = () => getStock({}).then((d) => setMedicines(d.medicines));
  useEffect(() => {
    loadMeds().catch((e) => setError(e.message));
    listPurchases().then((d) => setSuppliers(d.suppliers)).catch(() => {});
  }, []);

  const byName = useMemo(() => Object.fromEntries(medicines.map((m) => [m.name.toLowerCase(), m])), [medicines]);
  const set = (k, field, value) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, [field]: value } : l)));

  function pickMedicine(k, text) {
    const m = byName[text.trim().toLowerCase()];
    setLines((ls) => ls.map((l) => (l.key === k ? { ...l, search: text, medicine: m?._id || "", gstPct: m ? m.gstPct : l.gstPct } : l)));
  }

  const amount = (l) => round2((Number(l.qty) || 0) * (Number(l.purchaseRate) || 0) * (1 + (Number(l.gstPct) || 0) / 100));
  const total = round2(lines.reduce((s, l) => s + amount(l), 0));

  async function save() {
    setError("");
    const filled = lines.filter((l) => l.search.trim() || l.batchNo.trim());
    if (!supplier.trim()) return setError("Enter the supplier's name.");
    if (!filled.length) return setError("Add at least one medicine.");
    const unknown = filled.find((l) => !l.medicine);
    if (unknown) return setError(`“${unknown.search || "A line"}” is not in the medicine list. Pick it from the list, or add it as a new medicine.`);
    setBusy(true);
    try {
      await createPurchase({
        supplier: supplier.trim(), invoiceNo, date,
        items: filled.map((l) => ({
          medicine: l.medicine, batchNo: l.batchNo, expiry: l.expiry, qty: Number(l.qty), freeQty: Number(l.freeQty) || 0,
          purchaseRate: Number(l.purchaseRate) || 0, mrp: Number(l.mrp), gstPct: Number(l.gstPct),
        })),
      });
      navigate("/dashboard/pharmacy/purchases", { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/dashboard/pharmacy/purchases" className="small back-link"><Icon name="arrowLeft" size={15} /> Purchases</Link>
      {error && <div className="notice notice-bad" role="alert" style={{ margin: 0 }}>{error}</div>}

      <section className="panel">
        <div className="three">
          <div>
            <label className="field-label" htmlFor="p-supplier">Supplier</label>
            <input id="p-supplier" className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} list="suppliers" maxLength={100} placeholder="e.g. Sri Sai Pharma Distributors" autoFocus />
            <datalist id="suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <label className="field-label" htmlFor="p-inv">Supplier invoice no.</label>
            <input id="p-inv" className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={40} />
          </div>
          <div>
            <label className="field-label" htmlFor="p-date">Invoice date</label>
            <input id="p-date" className="input" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="panel panel-flush">
        <div className="panel-head" style={{ padding: "18px 20px 0" }}>
          <div>
            <h2>Medicines received</h2>
            <p className="muted tiny" style={{ margin: 0 }}>Quantities and prices are per unit the pharmacy sells (one tablet, one bottle). MRP includes GST.</p>
          </div>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setLines((ls) => [...ls, blank()])}><Icon name="plus" size={15} /> Add line</button>
        </div>
        <datalist id="medicine-names">{medicines.map((m) => <option key={m._id} value={m.name} />)}</datalist>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table bill-lines">
            <thead>
              <tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">Free</th><th className="num">Cost / unit</th><th className="num">MRP / unit</th><th className="num">GST</th><th className="num">Amount</th><th /></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td style={{ minWidth: 220 }}>
                    <input className="input input-sm" list="medicine-names" value={l.search} onChange={(e) => pickMedicine(l.key, e.target.value)} placeholder="Start typing…" aria-label="Medicine" />
                    {l.search.trim().length > 2 && !l.medicine && (
                      <button type="button" className="link-btn tiny" onClick={() => setAdding(l.key)}>+ Add “{l.search.trim()}” as a new medicine</button>
                    )}
                  </td>
                  <td><input className="input input-sm" style={{ width: 110 }} value={l.batchNo} onChange={(e) => set(l.key, "batchNo", e.target.value.toUpperCase())} aria-label="Batch number" /></td>
                  <td><input className="input input-sm" type="month" min={today.slice(0, 7)} value={l.expiry} onChange={(e) => set(l.key, "expiry", e.target.value)} aria-label="Expiry month" /></td>
                  <td className="num"><input className="input input-sm input-num" type="number" min="1" value={l.qty} onChange={(e) => set(l.key, "qty", e.target.value)} aria-label="Quantity" /></td>
                  <td className="num"><input className="input input-sm input-num" type="number" min="0" value={l.freeQty} onChange={(e) => set(l.key, "freeQty", e.target.value)} aria-label="Free quantity" /></td>
                  <td className="num"><input className="input input-sm input-num" type="number" min="0" step="0.01" value={l.purchaseRate} onChange={(e) => set(l.key, "purchaseRate", e.target.value)} aria-label="Cost per unit" /></td>
                  <td className="num"><input className="input input-sm input-num" type="number" min="0" step="0.01" value={l.mrp} onChange={(e) => set(l.key, "mrp", e.target.value)} aria-label="MRP per unit" /></td>
                  <td className="num">
                    <select className="select input-sm" value={l.gstPct} onChange={(e) => set(l.key, "gstPct", Number(e.target.value))} aria-label="GST">
                      {[0, 5, 12, 18, 28].map((p) => <option key={p} value={p}>{p}%</option>)}
                    </select>
                  </td>
                  <td className="num"><strong>{money2(amount(l), lab)}</strong></td>
                  <td><button type="button" className="icon-btn" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))} aria-label="Remove line"><Icon name="x" size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="receive-foot">
          <span className="muted small">Invoice total with GST</span>
          <strong className="kpi-value" style={{ fontSize: "1.3rem" }}>{money2(total, lab)}</strong>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save and add to stock"}</button>
        </div>
      </section>

      {adding && (
        <MedicineForm
          medicine={{ name: lines.find((l) => l.key === adding)?.search.trim() || "" }}
          onClose={() => setAdding(null)}
          onSaved={async (m) => {
            const k = adding;
            setAdding(null);
            await loadMeds();
            setLines((ls) => ls.map((l) => (l.key === k ? { ...l, search: m.name, medicine: m._id, gstPct: m.gstPct } : l)));
          }}
        />
      )}
    </>
  );
}
