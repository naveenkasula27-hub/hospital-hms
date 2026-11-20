import { useEffect, useRef } from "react";
import { useLang } from "../lib/i18n.jsx";

export default function BookingDialog({ open, onClose, children }) {
  const ref = useRef(null);
  const { t, lang } = useLang();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (open) {
        dialog.close();
        previous?.focus?.();
      }
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="lb-test-booking-dialog"
      aria-labelledby="test-booking-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="lb-dialog-close" onClick={onClose} aria-label={t.close}>
        ×
      </button>
      <header>
        <p className="lb-eyebrow">{lang === "te" ? "మీ తదుపరి అడుగు" : "YOUR NEXT STEP"}</p>
        <h2 id="test-booking-title">{lang === "te" ? "మీ బుకింగ్‌ను పూర్తి చేయండి" : "Let's book your visit"}</h2>
        <p>{lang === "te" ? "మీ వివరాలు, తేదీ, అందుబాటులోని సమయాన్ని ఎంచుకోండి." : "Add your details, choose a date, and select an available time."}</p>
      </header>
      {children}
    </dialog>
  );
}
