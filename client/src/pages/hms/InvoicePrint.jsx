import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ITEM_KIND, PAY_METHOD, getBill, money2, prettyExpiry, prettyPhone, rupeesInWords, taxSplit } from "../../lib/hms.js";
import { me } from "../../lib/dash.js";
import { prettyDate } from "../../lib/api.js";

export default function InvoicePrint() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [lab, setLab] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getBill(id), me()])
      .then(([b, s]) => { setData(b); setLab(s.lab); })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (data) document.title = `Invoice ${data.bill.number}`;
  }, [data]);

  if (error) return <main className="center"><div className="notice notice-bad">{error}</div><Link to="/dashboard/billing">Back to billing</Link></main>;
  if (!data || !lab) return <main className="center"><p className="muted">Preparing invoice…</p></main>;

  const { bill, invoice } = data;
  const p = bill.patient;
  const hasTax = bill.tax > 0;
  const split = taxSplit(bill);
  const address = lab.city && !lab.address?.includes(lab.city) ? [lab.address, lab.city].filter(Boolean).join(", ") : lab.address;
  const inr = (lab.currency || "INR") === "INR";

  return (
    <>
      <div className="rx-toolbar">
        <Link className="btn btn-ghost btn-sm" to={`/dashboard/billing/${bill._id}`}>Back to bill</Link>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>Print</button>
      </div>
      <article className="rx-page invoice">
        {bill.status === "cancelled" && <div className="inv-stamp">CANCELLED</div>}
        <header className="rx-letterhead">
          <div>
            <h1>{lab.name}</h1>
            {invoice.legalName && invoice.legalName !== lab.name && <p>{invoice.legalName}</p>}
            <p>{address}</p>
            <p>Phone: {lab.phone}</p>
            {invoice.gstin && <p>GSTIN: {invoice.gstin}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="inv-title">{!invoice.gstin ? "Invoice" : hasTax ? "Tax invoice" : "Bill of supply"}</p>
            <p><strong>{bill.number}</strong></p>
            <p>Date: {prettyDate(bill.date, lab)}</p>
          </div>
        </header>

        <section className="rx-patient inv-patient">
          <span><strong>{p.name}</strong></span>
          <span>{p.age} y / {p.gender}</span>
          <span>UHID: {p.uhid}</span>
          <span>Mobile: {prettyPhone(p.phone)}</span>
          {p.address && <span style={{ gridColumn: "1 / -1" }}>Address: {p.address}</span>}
        </section>

        <table className="table inv-table">
          <thead>
            <tr>
              <th>#</th><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Discount</th>
              {hasTax && <th className="num">GST</th>}<th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.items.map((i, n) => (
              <tr key={n}>
                <td>{n + 1}</td>
                <td>
                  {i.name}
                  <div className="tiny muted">
                    {i.batchNo ? `Batch ${i.batchNo} · Exp ${prettyExpiry(i.expiry)}${i.hsn ? ` · HSN ${i.hsn}` : ""}` : ITEM_KIND[i.kind]}
                  </div>
                </td>
                <td className="num">{i.qty}</td>
                <td className="num">{money2(i.rate, lab)}</td>
                <td className="num">{i.discount ? money2(i.discount, lab) : "–"}</td>
                {hasTax && <td className="num">{i.tax ? `${money2(i.tax, lab)} (${i.taxPct}%${i.taxInclusive ? " incl." : ""})` : "–"}</td>}
                <td className="num">{money2(i.amount, lab)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-bottom">
          <div className="inv-words">
            {inr && <p className="small"><strong>Amount in words:</strong> {rupeesInWords(bill.total)}</p>}
            {bill.payments.length > 0 && (
              <p className="small">
                <strong>Payments:</strong>{" "}
                {bill.payments.map((pm) => `${pm.kind === "refund" ? "Refund" : PAY_METHOD[pm.method]} ${money2(pm.amount, lab)} on ${prettyDate(pm.date, lab)}${pm.ref ? ` (ref ${pm.ref})` : ""}`).join("; ")}
              </p>
            )}
            {bill.notes && <p className="small"><strong>Note:</strong> {bill.notes}</p>}
            {invoice.gstin && !hasTax && <p className="tiny muted">Healthcare services exempt from GST.</p>}
          </div>
          <dl className="sums inv-sums">
            <dt>Subtotal</dt><dd>{money2(bill.subtotal, lab)}</dd>
            {bill.discount > 0 && <><dt>Discount</dt><dd>− {money2(bill.discount, lab)}</dd></>}
            {split.added > 0 && <><dt>GST</dt><dd>{money2(split.added, lab)}</dd></>}
            <dt className="sum-total">Total</dt><dd className="sum-total">{money2(bill.total, lab)}</dd>
            {split.included > 0 && <><dt className="tiny">Includes GST</dt><dd className="tiny">{money2(split.included, lab)}</dd></>}
            <dt>Paid</dt><dd>{money2(bill.paid, lab)}</dd>
            {bill.status !== "cancelled" && <><dt><strong>Balance due</strong></dt><dd><strong>{money2(bill.due, lab)}</strong></dd></>}
          </dl>
        </div>

        <div className="rx-sign">
          <div style={{ height: 36 }} />
          <strong>Authorised signatory</strong>
          <div className="muted tiny">{lab.name}</div>
        </div>
        {invoice.footer && <p className="tiny muted inv-footer">{invoice.footer}</p>}
        <p className="tiny muted inv-footer">This is a computer-generated invoice.</p>
      </article>
    </>
  );
}
