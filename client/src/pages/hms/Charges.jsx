import { useEffect, useState } from "react";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import { ITEM_KIND, getInvoiceSettings, listServices, money2, saveInvoiceSettings, saveService } from "../../lib/hms.js";

export default function Charges() {
  const { lab, setHeader } = useShell();
  const [services, setServices] = useState(null);
  const [editing, setEditing] = useState(null);   // {} for new, a service to edit
  const [error, setError] = useState("");

  useEffect(() => setHeader({ title: "Charges & invoice", sub: "Hospital charges reception can add to a bill, and what prints on invoices" }), [setHeader]);

  const load = () => listServices().then((d) => setServices(d.services)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      {error && <div className="notice notice-bad">{error}</div>}
      <div className="grid-2">
        <section className="panel panel-flush">
          <div className="panel-head" style={{ padding: "18px 20px 0" }}>
            <div>
              <h2>Hospital charges</h2>
              <p className="muted tiny" style={{ margin: 0 }}>Consultation fees are set on each doctor. Lab prices are in Tests & prices.</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} /> Add charge</button>
          </div>
          {!services ? (
            <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 160 }} /></div>
          ) : services.length === 0 ? (
            <div className="empty-state"><Icon name="tag" size={28} /><p>No charges yet. Add dressing, injection, ECG and the like.</p></div>
          ) : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead><tr><th>Charge</th><th>Type</th><th className="num">Price</th><th className="num">Tax</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s._id}>
                      <td className="who-name">{s.name}</td>
                      <td>{ITEM_KIND[s.kind]}</td>
                      <td className="num">{money2(s.price, lab)}</td>
                      <td className="num">{s.taxPct}%</td>
                      <td><span className={`badge ${s.active ? "s-completed" : "s-no_show"}`}>{s.active ? "In use" : "Hidden"}</span></td>
                      <td className="num"><button type="button" className="btn btn-quiet btn-xs" onClick={() => setEditing(s)}><Icon name="edit" size={14} /> Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <InvoiceSettings />
      </div>

      {editing && (
        <ChargeForm service={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

function ChargeForm({ service, onClose, onSaved }) {
  const [f, setF] = useState({
    name: service.name || "", kind: service.kind || "procedure", price: service.price ?? "", taxPct: service.taxPct ?? 0, active: service.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveService(service._id, { ...f, price: Number(f.price), taxPct: Number(f.taxPct) });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={service._id ? "Edit charge" : "Add a charge"}
      onClose={onClose}
      footer={<><button className="btn btn-quiet" onClick={onClose}>Cancel</button><button className="btn btn-primary" type="submit" form="charge-form" disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}
    >
      <form id="charge-form" className="form" onSubmit={save} noValidate style={{ display: "grid", gap: 14 }}>
        {error && <div className="notice notice-bad" style={{ margin: 0 }}>{error}</div>}
        <div>
          <label className="field-label" htmlFor="c-name">Name</label>
          <input id="c-name" className="input" value={f.name} onChange={set("name")} maxLength={80} placeholder="e.g. Dressing (small)" autoFocus />
        </div>
        <div className="two">
          <div>
            <label className="field-label" htmlFor="c-kind">Type</label>
            <select id="c-kind" className="select" value={f.kind} onChange={set("kind")}>
              <option value="procedure">Procedure</option>
              <option value="room">Room / bed</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="c-price">Price</label>
            <input id="c-price" className="input" type="number" min="0" step="0.01" value={f.price} onChange={set("price")} />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="c-tax">GST</label>
          <select id="c-tax" className="select" value={f.taxPct} onChange={set("taxPct")}>
            {[0, 5, 12, 18].map((p) => <option key={p} value={p}>{p}%</option>)}
          </select>
          <p className="muted tiny" style={{ margin: "6px 0 0" }}>Most healthcare services are GST-exempt. Check with the hospital's accountant before adding tax.</p>
        </div>
        <label className="check-row"><input type="checkbox" checked={f.active} onChange={set("active")} /> Show this charge to reception</label>
      </form>
    </Drawer>
  );
}

function InvoiceSettings() {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: "", error: "" });

  useEffect(() => {
    getInvoiceSettings().then((d) => setF({ legalName: "", gstin: "", footer: "", ...d.invoice })).catch((e) => setMsg({ ok: "", error: e.message }));
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ ok: "", error: "" });
    try {
      const { invoice } = await saveInvoiceSettings(f);
      setF(invoice);
      setMsg({ ok: "Saved. New and old invoices print with these details.", error: "" });
    } catch (err) {
      setMsg({ ok: "", error: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!f) return <section className="panel skeleton" style={{ height: 260 }} />;

  return (
    <section className="panel">
      <div className="panel-head"><h2>On the invoice</h2></div>
      <form onSubmit={save} noValidate style={{ display: "grid", gap: 14 }}>
        {msg.error && <div className="notice notice-bad" style={{ margin: 0 }}>{msg.error}</div>}
        {msg.ok && <div className="notice notice-ok" style={{ margin: 0 }}>{msg.ok}</div>}
        <div>
          <label className="field-label" htmlFor="i-legal">Registered business name (optional)</label>
          <input id="i-legal" className="input" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} maxLength={120} placeholder="If different from the hospital name" />
        </div>
        <div>
          <label className="field-label" htmlFor="i-gstin">GSTIN (optional)</label>
          <input id="i-gstin" className="input mono" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} maxLength={15} placeholder="36ABCDE1234F1Z5" />
        </div>
        <div>
          <label className="field-label" htmlFor="i-footer">Footer note (optional)</label>
          <textarea id="i-footer" className="input" rows={3} value={f.footer} onChange={(e) => setF({ ...f, footer: e.target.value })} maxLength={300} placeholder="e.g. Fees once paid are not refundable after consultation." />
        </div>
        <div><button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy ? "Saving…" : "Save invoice details"}</button></div>
      </form>
    </section>
  );
}
