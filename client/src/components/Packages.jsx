import { money } from "../lib/api.js";
import { useLang } from "../lib/i18n.jsx";
import { packageImage } from "../lib/packagePhotos.js";

function PackageCard({ p, lab, byCode, picked, onToggle, t }) {
  const on = picked.has(p.code);
  const names = p.testCodes.map((c) => byCode[c]?.name).filter(Boolean);
  const shownNames = names.slice(0, 4).join(", ");
  const more = names.length - 4;

  return (
    <li className="pkg">
      <img className="pkg-photo" src={packageImage(p.code)} alt="" loading="lazy" />
      <div className="pkg-top">
        <h3>{p.name}</h3>
        {typeof p.price === "number" && <span className="pkg-price">{money(p.price, lab)}</span>}
      </div>
      {p.description && <p>{p.description}</p>}
      <div className="pkg-badges">
        <span className="badge">{t.pkgTests(names.length)}</span>
        {p.fasting && <span className="badge badge-warn">{p.fasting}</span>}
      </div>
      {shownNames && (
        <p className="pkg-included">
          {shownNames}
          {more > 0 && <> {t.pkgMore(more)}</>}
        </p>
      )}
      <button
        type="button"
        className={`btn ${on ? "btn-primary" : "btn-ghost"}`}
        style={{ width: "100%", marginTop: 4 }}
        onClick={() => onToggle(p.code)}
      >
        {on ? t.pkgAdded : t.pkgAdd}
      </button>
    </li>
  );
}

/**
 * A slow, continuous left-scrolling strip when there are enough packages to
 * make one (5+) — the row is drawn twice back to back and the whole track
 * animates left by exactly one copy's width, so it loops with no jump. The
 * animation pauses on hover or keyboard focus, so "Add to booking" is never
 * a moving target when someone actually goes to click it. Fewer than 5
 * packages just wrap as a plain grid, since a short row has nothing to
 * scroll and autoplay would look like a glitch rather than a feature.
 */
export default function Packages({ packages, lab, byCode, picked, onToggle }) {
  const { t } = useLang();
  const scrolling = packages.length >= 5;

  if (!scrolling) {
    return (
      <ul className="pkgs">
        {packages.map((p) => (
          <PackageCard key={p.code} p={p} lab={lab} byCode={byCode} picked={picked} onToggle={onToggle} t={t} />
        ))}
      </ul>
    );
  }

  return (
    <div className="pkgs-scroll">
      <ul className="pkgs-track">
        {packages.map((p) => (
          <PackageCard key={p.code} p={p} lab={lab} byCode={byCode} picked={picked} onToggle={onToggle} t={t} />
        ))}
        {packages.map((p) => (
          <PackageCard key={`${p.code}-dup`} p={p} lab={lab} byCode={byCode} picked={picked} onToggle={onToggle} t={t} />
        ))}
      </ul>
    </div>
  );
}
