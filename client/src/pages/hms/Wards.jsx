import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useShell } from "./HmsShell.jsx";
import Icon from "../../components/hms/Icon.jsx";
import Drawer from "../../components/hms/Drawer.jsx";
import { listWards, saveWard, saveBed, bulkBeds, listBeds, updateBed, WARD_TYPE, BED_STATUS, money2 } from "../../lib/hms.js";

export default function Wards() {
  const { lab, setHeader } = useShell();
  const [wards, setWards] = useState([]);
  const [editing, setEditing] = useState(null);
  const [addingBeds, setAddingBeds] = useState(null);
  const [wardBeds, setWardBeds] = useState({});

  useEffect(() => {
    setHeader({ title: "Wards & beds", sub: "Set up wards, add and manage beds" });
    load();
  }, [setHeader]);

  async function load() {
    const d = await listWards();
    setWards(d.wards);
    const beds = await listBeds({});
    const map = {};
    for (const b of beds.beds) {
      const wid = String(b.ward?._id || b.ward);
      if (!map[wid]) map[wid] = [];
      map[wid].push(b);
    }
    setWardBeds(map);
  }

  return (
    <>
      <Link to="/dashboard/ipd" className="small back-link"><Icon name="arrowLeft" size={15} /> Bed map</Link>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} /> Add ward</button>
      </div>

      {wards.length === 0 && (
        <div className="panel" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted">No wards yet. Create your first ward to start adding beds.</p>
        </div>
      )}

      {wards.map((w) => {
        const beds = wardBeds[w._id] || [];
        return (
          <section key={w._id} className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head">
              <div>
                <h2>{w.name}</h2>
                <span className="muted small">{WARD_TYPE[w.type]} · Floor {w.floor || "–"} · {money2(w.dailyRate, lab)}/day · {w.beds?.total || 0} beds</span>
              </div>
              <div className="actions">
                <button className="btn btn-soft btn-xs" onClick={() => setAddingBeds(w)}><Icon name="plus" size={14} /> Add beds</button>
                <button className="btn btn-quiet btn-xs" onClick={() => setEditing(w)}><Icon name="edit" size={14} /> Edit</button>
              </div>
            </div>

            {beds.length === 0 ? (
              <p className="muted small">No beds in this ward.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Bed #</th><th>Status</th><th>Notes</th><th></th></tr></thead>
                  <tbody>
                    {beds.map((b) => (
                      <tr key={b._id}>
                        <td><strong>{b.number}</strong></td>
                        <td><span className={`badge bed-st-${b.status}`}>{BED_STATUS[b.status]}</span></td>
                        <td className="muted small">{b.notes || "–"}</td>
                        <td>
                          {b.status !== "occupied" && (
                            <button className="btn btn-quiet btn-xs"
                              onClick={async () => {
                                const next = b.status === "available" ? "maintenance" : "available";
                                await updateBed(b._id, { status: next });
                                load();
                              }}>
                              {b.status === "available" ? "Set maintenance" : "Set available"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {editing && <WardForm ward={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {addingBeds && <AddBedsForm ward={addingBeds} onClose={() => setAddingBeds(null)} onSaved={() => { setAddingBeds(null); load(); }} />}
    </>
  );
}

function WardForm({ ward, onClose, onSaved }) {
  const isNew = !ward._id;
  const [form, setForm] = useState({
    name: ward.name || "", floor: ward.floor || "", type: ward.type || "general", dailyRate: ward.dailyRate ?? "", active: ward.active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true); setError("");
    try {
      await saveWard(ward._id, { ...form, dailyRate: Number(form.dailyRate) || 0 });
      onSaved();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <Drawer title={isNew ? "Add ward" : `Edit ${ward.name}`} onClose={onClose}
      footer={<><button className="btn btn-quiet" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={save}>{busy ? "Saving…" : "Save ward"}</button></>}>
      {error && <div className="notice notice-bad">{error}</div>}
      <div><label className="field-label">Ward name</label><input className="input" value={form.name} onChange={set("name")} required maxLength={60} autoFocus /></div>
      <div><label className="field-label">Type</label>
        <select className="input" value={form.type} onChange={set("type")}>
          {Object.entries(WARD_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div><label className="field-label">Floor</label><input className="input" value={form.floor} onChange={set("floor")} maxLength={30} placeholder="e.g. Ground, 1st" /></div>
      <div><label className="field-label">Daily rate (₹)</label><input className="input" type="number" min="0" value={form.dailyRate} onChange={set("dailyRate")} /></div>
    </Drawer>
  );
}

function AddBedsForm({ ward, onClose, onSaved }) {
  const [mode, setMode] = useState("bulk");
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("10");
  const [single, setSingle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function save() {
    setBusy(true); setError(""); setResult(null);
    try {
      if (mode === "bulk") {
        const d = await bulkBeds({ ward: ward._id, prefix, from: Number(from), to: Number(to) });
        setResult(`Added ${d.beds.length} bed(s).${d.skipped.length ? ` Skipped (already exist): ${d.skipped.join(", ")}` : ""}`);
      } else {
        await saveBed({ ward: ward._id, number: single });
        setResult("Bed added.");
      }
      onSaved();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <Drawer title={`Add beds to ${ward.name}`} onClose={onClose}
      footer={<><button className="btn btn-quiet" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Adding…" : "Add beds"}</button></>}>
      {error && <div className="notice notice-bad">{error}</div>}
      {result && <div className="notice">{result}</div>}
      <div>
        <p className="field-label">Mode</p>
        <div className="radios">
          <label className="radio"><input type="radio" name="bm" checked={mode === "bulk"} onChange={() => setMode("bulk")} /> Bulk (range)</label>
          <label className="radio"><input type="radio" name="bm" checked={mode === "single"} onChange={() => setMode("single")} /> Single bed</label>
        </div>
      </div>
      {mode === "bulk" ? (
        <>
          <div><label className="field-label">Prefix (e.g. GW-)</label><input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={10} placeholder="GW-" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label className="field-label">From</label><input className="input" type="number" min="1" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="field-label">To</label><input className="input" type="number" min="1" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <p className="muted tiny">Creates beds {prefix}{from} through {prefix}{to}.</p>
        </>
      ) : (
        <div><label className="field-label">Bed number</label><input className="input" value={single} onChange={(e) => setSingle(e.target.value)} maxLength={20} placeholder="e.g. ICU-01" /></div>
      )}
    </Drawer>
  );
}
