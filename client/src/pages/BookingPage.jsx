import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  getLab,
  getAvailability,
  createBooking,
  money,
  prettyDate,
  todayForLab,
} from "../lib/api.js";
import TestList from "../components/TestList.jsx";
import Packages from "../components/Packages.jsx";
import SelectedPanel from "../components/SelectedPanel.jsx";
import BookingForm from "../components/BookingForm.jsx";
import Confirmation from "../components/Confirmation.jsx";
import BookingDialog from "../components/BookingDialog.jsx";
import DemoStrip from "../components/DemoStrip.jsx";
import LangToggle from "../components/LangToggle.jsx";
import AudienceTiles from "../components/AudienceTiles.jsx";
import AboutIllustration from "../components/AboutIllustration.jsx";
import CareBenefits from "../components/CareBenefits.jsx";
import BookingFAQ from "../components/BookingFAQ.jsx";
import { LangProvider, useLang } from "../lib/i18n.jsx";
import { EXPERIENCE } from "../lib/experience.js";
import CategoryIcon from "../lib/categoryIcons.jsx";
import TEST_ICONS from "../lib/testIcons.js";
import "../storefront.css";
import "../experience.css";
import "../services.css";

/**
 * A horizontally scrolling spotlight for one category (fixed to "Fever" —
 * one of the most commonly searched categories, same choice the reference
 * site made). Scrolls continuously and slowly, pauses on hover/focus/
 * pointer-down so a visitor can actually read a card or click its buttons,
 * and respects prefers-reduced-motion. A category this lab has none of in
 * its catalog just doesn't render the section.
 */
function FeverSpotlight({ tests, lab, slug, lang, picked, onToggle, onBook }) {
  const te = lang === "te";
  const lane = useRef(null);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const fever = tests.filter((test) => test.category === "Fever");

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (paused || interacting || fever.length < 2 || motion.matches) return;
    const el = lane.current;
    if (!el) return;
    let frame;
    let previous;
    let position = el.scrollLeft;
    let atEnd = 0;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(el);
    const tick = (time) => {
      const delta = previous === undefined ? 0 : Math.min(time - previous, 50);
      previous = time;
      if (visible && !document.hidden && !motion.matches) {
        const maximum = el.scrollWidth - el.clientWidth;
        if (maximum > 1) {
          position = Math.min(maximum, position + delta * 0.03);
          if (position >= maximum) {
            atEnd += delta;
            if (atEnd >= 1800) {
              position = 0;
              atEnd = 0;
            }
          }
          el.scrollLeft = position;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [paused, interacting, fever.length]);

  if (!fever.length) return null;

  const move = (direction) => {
    setPaused(true);
    lane.current?.scrollBy({ left: direction * (lane.current.clientWidth * 0.85), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <section className="lb-fever" aria-labelledby="fever-heading">
      <div className="lb-fever-intro">
        {TEST_ICONS.Fever ? <img src={TEST_ICONS.Fever} width="180" height="180" loading="lazy" alt="" /> : <CategoryIcon category="Fever" size={60} />}
        <p className="lb-eyebrow">{te ? "మరింత స్పష్టత కావాలా" : "WHEN YOU NEED A CLOSER LOOK"}</p>
        <h2 id="fever-heading">{te ? <>జ్వర టెస్టులు,<br />సులభంగా కనుగొనండి.</> : <>Fever tests,<br />easy to find.</>}</h2>
        <p>{te ? "మీ డాక్టర్ సూచించిన టెస్టును కనుగొని సన్నాహాల వివరాలను చూడండి." : "Find the test your clinician has advised and check the preparation details."}</p>
        <Link to={`/${slug}/tests?category=Fever`}>{te ? "జ్వర టెస్టులు చూడండి →" : "View fever tests →"}</Link>
      </div>
      <div className="lb-fever-content">
        <div className="lb-fever-heading">
          <p>{te ? "జ్వర పరిశోధనల కోసం ప్రసిద్ధ టెస్టులు" : "Popular tests for fever investigations"}</p>
          <div className="lb-lane-controls">
            <button type="button" aria-label="Previous fever tests" onClick={() => move(-1)}>←</button>
            <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? (te ? "ప్లే" : "Play") : (te ? "పాజ్" : "Pause")}</button>
            <button type="button" aria-label="Next fever tests" onClick={() => move(1)}>→</button>
          </div>
        </div>
        <ul
          className="lb-fever-lane"
          ref={lane}
          onMouseEnter={() => setInteracting(true)}
          onMouseLeave={() => setInteracting(false)}
          onFocusCapture={() => setInteracting(true)}
          onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setInteracting(false); }}
          onPointerDown={() => setPaused(true)}
          tabIndex="0"
          aria-label="Fever tests; scroll for more"
        >
          {fever.map((test) => (
            <li className="lb-fever-card" key={test.code}>
              <span className="lb-test-category">{test.category}</span>
              <h3>{test.name}</h3>
              <p>{test.sample} {te ? "నమూనా" : "sample"}</p>
              <p className="lb-report-line">{te ? "రిపోర్ట్:" : "Reports:"} <strong>{test.reportTime || (te ? "ల్యాబ్‌ను అడగండి" : "Confirm with the lab")}</strong></p>
              <div className="lb-fever-price">
                <div>
                  <strong>{typeof test.price === "number" ? money(test.price, lab) : (te ? "ల్యాబ్‌ను అడగండి" : "Ask the lab")}</strong>
                  <small>{te ? "టెస్టు ధర" : "Test price"}</small>
                </div>
                <button type="button" className="add" aria-pressed={picked.has(test.code)} aria-label={`${picked.has(test.code) ? "Remove" : "Add"} ${test.name}`} onClick={() => onToggle(test.code)}>
                  {picked.has(test.code) ? (te ? "జోడించారు ✓" : "Added ✓") : (te ? "+ జోడించు" : "+ Add")}
                </button>
              </div>
              <button className="lb-fever-book" type="button" onClick={() => onBook(test.code)}>{te ? "ఈ టెస్టును బుక్ చేయండి →" : "Book this test →"}</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function BookingPage() {
  return (
    <LangProvider>
      <BookingPageInner />
    </LangProvider>
  );
}

function BookingPageInner() {
  const { t, lang } = useLang();
  const te = lang === "te";
  const copy = EXPERIENCE[lang];
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // The homepage and the "browse" screens (tests / checkups) are all one
  // component so the basket and search state survive moving between them —
  // which one shows is just read off the URL, like labBook does.
  const view = location.pathname.endsWith("/checkups")
    ? "packages"
    : location.pathname.endsWith("/tests")
    ? "tests"
    : "home";

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);

  // What the patient has picked
  const [picked, setPicked] = useState({ tests: new Set(), packages: new Set() });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  // A category chip on the homepage links to /tests?category=X; pick that up
  // once, when arriving on the tests view, instead of fighting the URL on
  // every render (the category filter itself lives in plain state so typing
  // and clearing it stays simple).
  useEffect(() => {
    if (view !== "tests") return;
    const fromUrl = searchParams.get("category");
    if (fromUrl) setCategory(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, location.search]);

  // Dismissing the "Need help?" bar should only last for this one visit —
  // closing the tab and opening the site again should show it, falling in,
  // like a first-time visitor. sessionStorage (cleared when the tab closes)
  // is right for that; localStorage would hide it forever after one click,
  // which is the bug this replaced. Fails silently in case a browser blocks it.
  const [helpDismissed, setHelpDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("labbook-help-dismissed") === "1";
    } catch {
      return false;
    }
  });
  function dismissHelp() {
    setHelpDismissed(true);
    try {
      sessionStorage.setItem("labbook-help-dismissed", "1");
    } catch {
      /* ignore */
    }
  }

  // Date and slots
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [availability, setAvailability] = useState(null);

  const [confirmed, setConfirmed] = useState(null);
  const formRef = useRef(null);

  /* ---------- Load the lab ---------- */
  useEffect(() => {
    let alive = true;
    setData(null);
    setLoadError("");
    getLab(slug)
      .then((d) => {
        if (!alive) return;
        // Guard against a reply that came back 200 but is not a lab, for
        // example a proxy or hosting error page. Without this the page
        // would render against undefined and go blank.
        if (!d || !d.lab) {
          setLoadError("This lab's booking page could not be loaded.");
          return;
        }
        setData({ lab: d.lab, tests: d.tests || [], packages: d.packages || [], categories: d.categories || [] });
      })
      .catch((err) => alive && setLoadError(err.message));
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!data) return;
    document.title = `Book a test — ${data.lab.name}`;
    const root = document.documentElement;
    if (data.lab.theme?.primary) root.style.setProperty("--primary", data.lab.theme.primary);
    if (data.lab.theme?.accent) root.style.setProperty("--accent", data.lab.theme.accent);
    // Falls back to the header colour, which is what labs without a cta set
    // have always used.
    root.style.setProperty("--cta", data.lab.theme?.cta || data.lab.theme?.primary || "");
  }, [data]);

  /* ---------- Load slots when the date changes ---------- */
  useEffect(() => {
    if (!date || !data) {
      setAvailability(null);
      return;
    }
    let alive = true;
    setAvailability({ loading: true });
    getAvailability(slug, date)
      .then((a) => alive && setAvailability(a))
      .catch((err) => alive && setAvailability({ error: err.message }));
    return () => {
      alive = false;
    };
  }, [date, slug, data]);

  // If the chosen slot became full, drop it.
  useEffect(() => {
    if (!slot || !availability?.slots) return;
    const row = availability.slots.find((s) => s.label === slot);
    if (row?.full) setSlot("");
  }, [availability, slot]);

  const lab = data?.lab;
  const byCode = useMemo(
    () => Object.fromEntries((data?.tests || []).map((t) => [t.code, t])),
    [data]
  );

  // Picks made on the "Men"/"Women"/"Kids"/"Seniors" checkup guide page
  // arrive here through sessionStorage, since that's a separate route with
  // no shared React state. Pull them into the basket once the real test
  // list has loaded (so only codes this lab actually has get added), then
  // clear the key so a later visit doesn't re-apply the same picks.
  useEffect(() => {
    if (!data) return;
    let codes = [];
    try {
      const raw = sessionStorage.getItem(`labbook-pending-tests:${slug}`);
      codes = raw ? JSON.parse(raw) : [];
    } catch {
      codes = [];
    }
    if (Array.isArray(codes) && codes.length) {
      const valid = codes.filter((c) => byCode[c]);
      if (valid.length) {
        setPicked((p) => {
          const tests = new Set(p.tests);
          for (const c of valid) tests.add(c);
          return { ...p, tests };
        });
      }
    }
    try {
      sessionStorage.removeItem(`labbook-pending-tests:${slug}`);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, slug]);
  const pkgByCode = useMemo(
    () => Object.fromEntries((data?.packages || []).map((p) => [p.code, p])),
    [data]
  );

  /* ---------- What is in the basket ---------- */
  const basket = useMemo(() => {
    const items = [
      ...[...picked.packages].map((c) => pkgByCode[c]).filter(Boolean).map((p) => ({
        kind: "package",
        code: p.code,
        name: p.name,
        price: p.price,
      })),
      ...[...picked.tests].map((c) => byCode[c]).filter(Boolean).map((t) => ({
        kind: "test",
        code: t.code,
        name: t.name,
        price: t.price,
      })),
    ];
    const allPriced = items.length > 0 && items.every((i) => typeof i.price === "number");
    const subtotal = allPriced ? items.reduce((s, i) => s + i.price, 0) : null;
    return { items, subtotal, allPriced };
  }, [picked, byCode, pkgByCode]);

  /* ---------- Fasting warnings for what was picked ---------- */
  const fastingNotes = useMemo(() => {
    const notes = new Set();
    for (const c of picked.tests) if (byCode[c]?.fasting) notes.add(byCode[c].fasting);
    for (const c of picked.packages) if (pkgByCode[c]?.fasting) notes.add(pkgByCode[c].fasting);
    return [...notes];
  }, [picked, byCode, pkgByCode]);

  /* ---------- Which picks cannot be done at home ---------- */
  const labOnly = useMemo(() => {
    const names = new Set();
    for (const c of picked.tests) {
      const t = byCode[c];
      if (t && !t.homeCollectable) names.add(t.name);
    }
    for (const c of picked.packages) {
      for (const tc of pkgByCode[c]?.testCodes || []) {
        const t = byCode[tc];
        if (t && !t.homeCollectable) names.add(t.name);
      }
    }
    return [...names];
  }, [picked, byCode, pkgByCode]);

  /**
   * Picking anything after a booking means the patient has started a new one,
   * so the old confirmation goes away.
   *
   * Without this they were stuck: the confirmation stayed on screen, and the
   * bar at the bottom of the screen hides itself while a confirmation is up,
   * so there was no visible way to continue. The only route forward was the
   * Confirm button far down the page, which is exactly the button people
   * cannot find.
   */
  function startNewIfConfirmed() {
    setConfirmed((c) => (c ? null : c));
  }

  function toggleTest(code) {
    startNewIfConfirmed();
    setPicked((p) => {
      const tests = new Set(p.tests);
      tests.has(code) ? tests.delete(code) : tests.add(code);
      return { ...p, tests };
    });
  }

  function togglePackage(code) {
    startNewIfConfirmed();
    setPicked((p) => {
      const packages = new Set(p.packages);
      packages.has(code) ? packages.delete(code) : packages.add(code);
      return { ...p, packages };
    });
  }

  /** "Book this test →" on the Fever spotlight: add it, then open the booking dialog straight away. */
  function bookTest(code) {
    startNewIfConfirmed();
    setPicked((p) => ({ ...p, tests: new Set(p.tests).add(code) }));
    setBookingOpen(true);
  }

  function addQueryToNotes(text) {
    setQuery("");
    formRef.current?.appendNote(text);
  }

  async function submit(fields) {
    const body = {
      ...fields,
      testCodes: [...picked.tests],
      packageCodes: [...picked.packages],
      date,
      slot,
    };
    const result = await createBooking(slug, body);
    setConfirmed(result);
    setPicked({ tests: new Set(), packages: new Set() });
    setDate("");
    setSlot("");
    setBookingOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return result;
  }

  /* ---------- Loading and error states ---------- */
  if (loadError) {
    return (
      <main className="center">
        <h1>{t.notAvailableTitle}</h1>
        <p className="muted">{loadError}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="wrap" style={{ paddingTop: 28 }}>
        <div className="skeleton" style={{ height: 34, width: "55%", marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 18, width: "35%", marginBottom: 26 }} />
        <div className="skeleton" style={{ height: 230 }} />
        <span className="center muted small" style={{ display: "block" }}>{t.loading}</span>
      </main>
    );
  }

  const pickedCount = picked.tests.size + picked.packages.size;

  return (
    <>
      {lab.isDemo && <DemoStrip labName={lab.name} />}

      <header className="site-head">
        <div className="wrap">
          <div className="head-row">
            {lab.logoUrl ? (
              <img className="logo" src={lab.logoUrl} alt="" />
            ) : (
              <div className="logo" aria-hidden="true" />
            )}
            <div>
              <h1>{lab.name}</h1>
              {lab.tagline && <p className="tagline">{lab.tagline}</p>}
            </div>
          </div>
          {/* A real menu, like the Book a Test / Health Checkup rows on the
              bigger diagnostic sites, instead of a bare Directions link —
              gives first-time visitors a way to jump straight to a section. */}
          <nav className="head-nav" aria-label={t.findTitle}>
            <Link to={`/${slug}`}>{te ? "హోమ్" : "Home"}</Link>
            <Link to={`/${slug}/tests`} aria-current={view === "tests" ? "page" : undefined}>{t.findTitle}</Link>
            {data.packages.length > 0 && <Link to={`/${slug}/checkups`} aria-current={view === "packages" ? "page" : undefined}>{t.packagesTitle}</Link>}
            {lab.kind === "hospital" && <Link to={`/${slug}/appointment`}>{te ? "డాక్టర్‌ను బుక్ చేయండి" : "Book a doctor"}</Link>}
            <Link to={`/${slug}/check`}>{t.heroCheckBooking}</Link>
            {lab.mapsUrl && (
              <a href={lab.mapsUrl} target="_blank" rel="noopener noreferrer">
                {t.directions}
              </a>
            )}
          </nav>
          <div className="head-links">
            <LangToggle />
          </div>
        </div>
      </header>

      {confirmed && <div className="wrap"><Confirmation booking={confirmed} lab={lab} onDone={() => setConfirmed(null)} /></div>}

      {view === "home" && <>
      {/* The three things most people open this page to do, in one row they
          can't miss: call, message on WhatsApp, or check a booking they
          already made. Burying these in the header's small text links meant
          first-time visitors scrolled past them without noticing. */}
      <div className="hero">
        <div className="wrap hero-flex">
        <div className="hero-copy">
          <form
            className="hero-search-row"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/${slug}/tests`);
            }}
          >
            <input
              className="hero-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchAria}
            />
            <button type="submit" className="hero-search-btn" aria-label={t.searchButton}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <span className="hero-search-btn-label">{t.searchButton}</span>
            </button>
          </form>
          <div className="hero-actions">
            <a className="hero-action hero-action-call" href={`tel:${lab.phone.replace(/\s/g, "")}`}>
              <span className="hero-action-badge hero-action-badge-call" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.2c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2 2Z" />
                </svg>
              </span>
              <span className="hero-action-text"><span className="hero-action-label">{t.heroCallUs}</span><span className="hero-action-sub">{te ? "మా బృందంతో మాట్లాడండి" : "Talk to our team"}</span></span>
            </a>
            {lab.whatsapp && (
              <a
                className="hero-action hero-action-whatsapp"
                href={`https://wa.me/${lab.whatsapp}?text=${encodeURIComponent(
                  `Hello ${lab.name}, I have a question.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="hero-action-badge hero-action-badge-whatsapp" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Zm5.6 14.2c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.6-.6-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5.2.6.7 1.9.8 2 .1.2.1.4 0 .6-.1.2-.1.3-.3.5l-.4.5c-.1.2-.3.3-.1.6.2.3.9 1.4 1.8 2.3 1.3 1.1 2.3 1.5 2.6 1.7.3.2.5.1.7-.1l.7-.8c.2-.3.4-.2.7-.1l1.8.9c.2.1.4.2.5.3.1.2.1.9-.1 1.5Z" />
                  </svg>
                </span>
                <span className="hero-action-text"><span className="hero-action-label">{t.heroWhatsapp}</span><span className="hero-action-sub">{te ? "తక్షణ చాట్" : "Chat instantly"}</span></span>
              </a>
            )}
            <Link className="hero-action hero-action-check" to={`/${slug}/check`}>
              <span className="hero-action-badge hero-action-badge-check" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.3 14.5-4-4 1.4-1.4 2.6 2.6 5.6-5.6L17.7 9.5l-7 7Z" />
                </svg>
              </span>
              <span className="hero-action-text"><span className="hero-action-label">{t.heroCheckBooking}</span><span className="hero-action-sub">{te ? "మీ స్థితిని ట్రాక్ చేయండి" : "Track your status"}</span></span>
            </Link>
            {lab.kind === "hospital" && (
              <Link className="hero-action hero-action-doctor" to={`/${slug}/appointment`}>
                <span className="hero-action-badge hero-action-badge-doctor hero-action-badge-photo" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="24" fill="#ede9fe" />
                    <circle cx="24" cy="18" r="7" fill="#c4b5fd" />
                    <path d="M8 42c1-9 7-14 16-14s15 5 16 14" fill="#fff" />
                    <path d="M15 28c3 2 5.5 3 9 3s6-1 9-3" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="24" cy="33" r="2.4" fill="#7c3aed" />
                  </svg>
                </span>
                <span className="hero-action-text"><span className="hero-action-label">{te ? "డాక్టర్‌ను బుక్ చేయండి" : "Book a doctor"}</span><span className="hero-action-sub">{te ? "సమయం ఎంచుకుని టోకెన్ పొందండి" : "Pick a time, get a token"}</span></span>
              </Link>
            )}
          </div>
        </div>
        <div className="hero-photo" aria-hidden="true">
          <img src="/images/home-collection-ai.png" alt="" width="640" height="480" loading="eager" fetchpriority="high" />
        </div>
        </div>
      </div>

      {/* An "about" band using only facts that are actually true of this
          lab right now — its own description, its real test/package
          counts, its real phone and WhatsApp. No invented trust badges,
          no stock photos of people, no numbers we can't back up — just
          an original drawn illustration in the lab's own colour. */}
      <section className="about-band">
        <div className="wrap about-band-inner">
          <div className="about-band-text">
            <h2>{t.aboutHeading(lab.name)}</h2>
            {lab.about && <p className="about-band-copy">{lab.about}</p>}
            <div className="about-band-stats">
              <div className="about-band-stat">
                <strong>{data.tests.length}</strong>
                <span>{t.aboutStatTests(data.tests.length)}</span>
              </div>
              {data.packages.length > 0 && (
                <div className="about-band-stat">
                  <strong>{data.packages.length}</strong>
                  <span>{t.aboutStatPackages(data.packages.length)}</span>
                </div>
              )}
            </div>
            <div className="about-band-actions">
              {lab.whatsapp && (
                <a
                  className="btn btn-primary"
                  href={`https://wa.me/${lab.whatsapp}?text=${encodeURIComponent(
                    `Hello ${lab.name}, I have a question.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.aboutChat}
                </a>
              )}
              <a className="btn btn-ghost" href={`tel:${lab.phone.replace(/\s/g, "")}`}>
                {t.aboutCall}
              </a>
            </div>
          </div>
          <div className="about-band-art">
            <AboutIllustration />
          </div>
        </div>
      </section>

      {/* "How we can help" — the real services this site offers, each going
          straight to the real thing, not a teaser for a page that doesn't
          exist. The doctor-appointment card only shows for a hospital, since
          a lab-only deployment has nothing to send it to. */}
      <section className="wrap lb-services-section" aria-labelledby="services-title">
        <div className="lb-section-heading">
          <div><p className="lb-eyebrow">{te ? "మేం ఎలా సహాయం చేయగలం" : "HOW WE CAN HELP"}</p><h2 id="services-title">{te ? "మీ రోజుకు సరిపోయే సంరక్షణ" : "Care that fits your day"}</h2></div>
          <p>{te ? "మీ తదుపరి టెస్టును ప్లాన్ చేసుకోవడానికి సులభమైన మార్గం." : "A simpler way to plan your next test."}</p>
        </div>
        <div className={`lb-service-grid lb-service-grid-${3 + (data.packages.length > 0 ? 1 : 0) + (lab.kind === "hospital" ? 1 : 0)}`}>
          <Link to={`/${slug}/tests`}><span>01 / {te ? "ల్యాబ్ టెస్టులు" : "LAB TESTS"}</span><h3>{te ? "మీకు కావాల్సిన టెస్టు" : "The test you need"}</h3><p>{te ? "నమూనా, సన్నాహాలు, రిపోర్ట్ వివరాలతో వ్యక్తిగత టెస్టులను చూడండి." : "Browse individual tests with clear sample, preparation, and report details."}</p><b>{te ? "టెస్టు వెతకండి →" : "Find a test →"}</b></Link>
          {data.packages.length > 0 && (
            <Link to={`/${slug}/checkups`}><span>02 / {te ? "హెల్త్ చెకప్‌లు" : "HEALTH CHECKUPS"}</span><h3>{te ? "విస్తృత ఆరోగ్య చిత్రం" : "A wider health picture"}</h3><p>{te ? "ప్యాకేజీలను చూసి అందులో ఏ టెస్టులు ఉన్నాయో తెలుసుకోండి." : "Explore packages and see exactly which tests are included."}</p><b>{te ? "చెకప్‌లు చూడండి →" : "View checkups →"}</b></Link>
          )}
          {lab.kind === "hospital" && (
            <Link to={`/${slug}/appointment`}><span>03 / {te ? "డాక్టర్ అపాయింట్‌మెంట్" : "DOCTOR APPOINTMENT"}</span><h3>{te ? "డాక్టర్‌ను కలవండి" : "See a doctor"}</h3><p>{te ? "డాక్టర్, సమయాన్ని ఎంచుకుని వెంటనే టోకెన్ నంబర్ పొందండి." : "Pick a doctor and a time, and get a token number straight away."}</p><b>{te ? "డాక్టర్‌ను బుక్ చేయండి →" : "Book a doctor →"}</b></Link>
          )}
          <Link to={`/${slug}/tests`}><span>{lab.kind === "hospital" ? "04" : "03"} / {lab.homeCollection ? (te ? "హోమ్ కలెక్షన్" : "HOME COLLECTION") : (te ? "బుకింగ్" : "BOOKING")}</span><h3>{lab.homeCollection ? (te ? "ఇంటికి దగ్గరగా సంరక్షణ" : "Care closer to home") : (te ? "మీ సందర్శనను ప్లాన్ చేయండి" : "Plan your visit")}</h3><p>{lab.homeCollection ? (te ? "అర్హత ఉన్న టెస్టులకు బుకింగ్ ఫారమ్‌లో హోమ్ కలెక్షన్ ఎంచుకోండి." : "Choose home collection in the booking form for eligible tests.") : (te ? "మీ వివరాలు, అందుబాటులోని తేదీ, సమయాన్ని ఎంచుకోండి." : "Fill in your details and pick an available date and time.")}</p><b>{lab.homeCollection ? (te ? "కలెక్షన్ ఎంచుకోండి →" : "Choose collection →") : (te ? "బుకింగ్‌కు వెళ్లండి →" : "Go to booking →")}</b></Link>
          <Link to={`/${slug}/check`}><span>{lab.kind === "hospital" ? "05" : "04"} / {te ? "మీ రిపోర్టులు" : "YOUR REPORTS"}</span><h3>{te ? "మీ బుకింగ్‌ను అనుసరించండి" : "Keep up with your booking"}</h3><p>{te ? "పురోగతి, విడుదలైన రిపోర్టులను చూడటానికి బుకింగ్ రిఫరెన్స్ వాడండి." : "Use your booking reference to check progress and released reports."}</p><b>{te ? "మీ బుకింగ్‌ను ట్రాక్ చేయండి →" : "Track your booking →"}</b></Link>
        </div>
      </section>

      {/* "Explore by health category" — a teaser for the same categories
          TestList already filters by; clicking one jumps down and pre-selects
          it, rather than linking to a page that doesn't exist here. */}
      {data.categories.length > 0 && (
        <section className="wrap lb-discover" aria-labelledby="category-title">
          <div className="lb-section-heading">
            <div><p className="lb-eyebrow">{te ? "మీకు ముఖ్యమైన దానితో మొదలుపెట్టండి" : "START WITH WHAT MATTERS TO YOU"}</p><h2 id="category-title">{te ? "ఆరోగ్య వర్గం ద్వారా అన్వేషించండి" : "Explore by health category"}</h2></div>
            <Link to={`/${slug}/tests`}>{te ? "అన్ని టెస్టులు →" : "All tests →"}</Link>
          </div>
          <div className="lb-category-grid">
            {data.categories.map((name) => (
              <Link
                key={name}
                className="lb-category"
                to={`/${slug}/tests?category=${encodeURIComponent(name)}`}
              >
                {TEST_ICONS[name] ? <img src={TEST_ICONS[name]} loading="lazy" alt="" /> : <CategoryIcon category={name} size={40} />}
                <span>{name}</span>
              </Link>
            ))}
          </div>
          <p className="lb-swipe-hint">{te ? "మరిన్ని వర్గాలను చూడటానికి స్క్రోల్ చేయండి →" : "Scroll to explore more categories →"}</p>
        </section>
      )}

      <div className="wrap"><FeverSpotlight tests={data.tests} lab={lab} slug={slug} lang={lang} picked={picked.tests} onToggle={toggleTest} onBook={bookTest} /></div>

      <div className="wrap">
        <section className="lb-how">
          <p className="lb-eyebrow">{te ? "ఎలా బుక్ చేయాలి" : "HOW TO BOOK"}</p>
          <h2>{te ? "టెస్టు ఎంచుకోవడం నుండి రిపోర్ట్ వరకు" : "From choosing a test to getting your report"}</h2>
          <ol>
            <li><strong>{te ? "మీ టెస్టులను కనుగొని జోడించండి" : "Find & add your tests"}</strong><p>{te ? "వర్గం లేదా పేరుతో వెతకండి. వ్యక్తిగత టెస్టులు లేదా చెకప్ ఎంచుకోండి." : "Choose a category or search by name. Add individual tests or choose a checkup."}</p><Link to={`/${slug}/tests`}>{te ? "టెస్టులు చూడండి →" : "Explore tests →"}</Link></li>
            <li><strong>{te ? "మీ సేకరణను ఎంచుకోండి" : "Choose your collection"}</strong><p>{te ? "బుకింగ్‌కు కొనసాగి, వివరాలు నింపి, అందుబాటులోని తేదీ, సమయాన్ని ఎంచుకోండి." : "Continue to booking, fill in your details, and choose an available date and time."}</p></li>
            <li><strong>{te ? "మీ బుకింగ్‌ను అనుసరించండి" : "Follow your booking"}</strong><p>{te ? "మీ రిఫరెన్స్‌ను దాచుకోండి. స్థితి, రిపోర్టుల కోసం ఫోన్ నంబర్‌తో వాడండి." : "Save your reference. Use it with your phone number to check status and released reports."}</p><Link to={`/${slug}/check`}>{te ? "బుకింగ్ చూడండి →" : "Check a booking →"}</Link></li>
          </ol>
        </section>

        <CareBenefits lab={lab} />

        <section className="lb-services-section">
          <p className="lb-eyebrow">{te ? "ప్రతి దశకు సంరక్షణ" : "CARE FOR EVERY STAGE"}</p>
          <h2>{te ? "మీ చెకప్ కోసం ప్రారంభ స్థానాన్ని కనుగొనండి" : "Find a starting point for your checkup"}</h2>
          <AudienceTiles slug={slug} />
        </section>

        <BookingFAQ
          lab={lab}
          onHelp={() => {
            if (lab.whatsapp) {
              window.open(`https://wa.me/${lab.whatsapp}?text=${encodeURIComponent(`Hello ${lab.name}, I have a question.`)}`, "_blank", "noopener");
            } else {
              window.location.href = `tel:${lab.phone.replace(/\s/g, "")}`;
            }
          }}
        />
      </div>
      </>}

      {view !== "home" && <div className="wrap">
        <div className="lb-browse-top">
          <Link to={`/${slug}`}>← {te ? "హోమ్‌కు తిరిగి" : "Back to home"}</Link>
          <p className="lb-eyebrow">{lab.name}</p>
          <h2>{view === "packages" ? t.packagesTitle : t.findTitle}</h2>
          <p>{view === "packages" ? t.packagesSub : (te ? "మీకు కావాల్సింది ఎంచుకోండి. బుక్ చేసే ముందు వివరాలు, ధర చూడండి." : "Choose what you need. See the details and price before you book.")}</p>
          <div className="lb-route-tabs">
            <Link to={`/${slug}/tests`} aria-current={view === "tests" ? "page" : undefined}>{te ? "వ్యక్తిగత టెస్టులు" : "Individual tests"}</Link>
            {data.packages.length > 0 && <Link to={`/${slug}/checkups`} aria-current={view === "packages" ? "page" : undefined}>{t.packagesTitle}</Link>}
          </div>
        </div>

        <div className="cols">
          <main>
            {view === "tests" && (
              <section className="card">
                <TestList
                  tests={data.tests}
                  categories={data.categories}
                  lab={lab}
                  query={query}
                  category={category}
                  onCategory={setCategory}
                  picked={picked.tests}
                  onToggle={toggleTest}
                  onAddQueryToNotes={addQueryToNotes}
                />
              </section>
            )}

            {view === "packages" && data.packages.length > 0 && (
              <section className="card">
                <Packages
                  packages={data.packages}
                  lab={lab}
                  byCode={byCode}
                  picked={picked.packages}
                  onToggle={togglePackage}
                />
              </section>
            )}
          </main>

          <aside className="side">
            <section className="card">
              <h2>{t.yourBooking}</h2>
              <SelectedPanel
                basket={basket}
                lab={lab}
                fastingNotes={fastingNotes}
                onRemove={(item) =>
                  item.kind === "package" ? togglePackage(item.code) : toggleTest(item.code)
                }
              />
            </section>

            <section className="card lb-booking-help">
              <h2>{te ? "మీ సందర్శనకు సిద్ధమా?" : "Ready to book?"}</h2>
              <p className="muted small">{te ? "టెస్టులు ఎంచుకుని మీకు అనుకూలమైన తేదీ, సమయాన్ని ఎంచుకోండి." : "Choose your tests or checkups, then pick a date and time."}</p>
              <button type="button" className="btn btn-primary" onClick={() => setBookingOpen(true)} disabled={pickedCount === 0}>
                {te ? "బుకింగ్‌కు కొనసాగండి" : "Continue to booking"}
              </button>
            </section>
          </aside>
        </div>
      </div>}

      <BookingDialog open={bookingOpen} onClose={() => setBookingOpen(false)}>
        <SelectedPanel
          basket={basket}
          lab={lab}
          fastingNotes={fastingNotes}
          onRemove={(item) => (item.kind === "package" ? togglePackage(item.code) : toggleTest(item.code))}
        />
        <BookingForm
          ref={formRef}
          lab={lab}
          basket={basket}
          labOnly={labOnly}
          date={date}
          slot={slot}
          availability={availability}
          minDate={todayForLab(lab)}
          onDate={(d) => {
            setDate(d);
            setSlot("");
          }}
          onSlot={setSlot}
          onSubmit={submit}
        />
      </BookingDialog>

      {pickedCount > 0 && !confirmed && (
        <div className="bar">
          {/* The wrapper the layout rules target. Without it the contents sat
              hard against the left edge of the window with the button below
              them, instead of text left and button right. */}
          <div className="bar-inner">
            <span className="bar-cart" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6" />
                <circle cx="10" cy="20" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
              </svg>
              <span className="bar-badge">{pickedCount}</span>
            </span>

            <div className="bar-text">
              <span className="bar-count">{t.testsChosen(pickedCount)}</span>
              {basket.subtotal !== null && <> · {money(basket.subtotal, lab)}</>}
              {date && <div className="tiny muted">{prettyDate(date, lab)}{slot ? `, ${slot}` : ""}</div>}
            </div>

            <button type="button" className="btn btn-primary bar-go" onClick={() => setBookingOpen(true)}>{t.continue}</button>
          </div>
        </div>
      )}

      {!helpDismissed && !(pickedCount > 0 && !confirmed) && (
        <div className="help-bar">
          <div className="wrap help-bar-inner">
            <div>
              <p className="help-bar-title">{t.needHelp}</p>
              <p className="help-bar-sub">{t.needHelpSub}</p>
            </div>
            <div className="help-bar-actions">
              <a className="btn btn-ghost" href={`tel:${lab.phone.replace(/\s/g, "")}`}>
                {t.callLabel(lab.phone)}
              </a>
              {lab.whatsapp && (
                <a
                  className="btn btn-primary"
                  href={`https://wa.me/${lab.whatsapp}?text=${encodeURIComponent(
                    `Hello ${lab.name}, I have a question.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.whatsapp}
                </a>
              )}
              <button
                type="button"
                className="help-bar-close"
                onClick={dismissHelp}
                aria-label={t.close}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="site-foot">
        <div className="wrap">
          {lab.address && <p style={{ margin: 0 }}>{lab.address}</p>}
          <p style={{ margin: "4px 0 0" }}>{lab.name} · {lab.phone}</p>
        </div>
      </footer>
    </>
  );
}
