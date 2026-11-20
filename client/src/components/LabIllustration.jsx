/**
 * A small original line illustration for the Gallery's "Laboratory" slot —
 * a microscope and a rack of samples. Not a photo, not a stock image: the
 * same hand-built, currentColor approach as AboutIllustration, used here
 * only until a real photo of the lab is supplied.
 */
export default function LabIllustration({ size = 220 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 220 220" fill="none" aria-hidden="true">
      <circle cx="110" cy="110" r="100" fill="currentColor" opacity="0.07" />

      {/* Microscope base and arm */}
      <rect x="62" y="150" width="70" height="12" rx="6" fill="currentColor" opacity="0.85" />
      <path d="M97 150V124a10 10 0 0 1 10-10h4" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M111 114c14-4 26 2 30 16" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <rect x="85" y="112" width="34" height="12" rx="6" fill="#fff" stroke="currentColor" strokeWidth="3" />
      <circle cx="140" cy="130" r="9" fill="#fff" stroke="currentColor" strokeWidth="3" />
      <path d="M97 124v-18a6 6 0 0 1 6-6h0a6 6 0 0 1 6 6v18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="103" cy="92" r="7" fill="currentColor" />

      {/* Sample rack */}
      <rect x="40" y="140" width="46" height="10" rx="3" fill="currentColor" opacity="0.6" />
      <g>
        <rect x="46" y="112" width="10" height="30" rx="4" fill="#fff" stroke="currentColor" strokeWidth="2.5" />
        <rect x="47" y="116" width="8" height="14" fill="currentColor" opacity="0.8" />
        <rect x="60" y="106" width="10" height="36" rx="4" fill="#fff" stroke="currentColor" strokeWidth="2.5" />
        <rect x="61" y="112" width="8" height="18" fill="currentColor" opacity="0.5" />
        <rect x="74" y="116" width="10" height="26" rx="4" fill="#fff" stroke="currentColor" strokeWidth="2.5" />
        <rect x="75" y="122" width="8" height="12" fill="currentColor" opacity="0.65" />
      </g>

      {/* Bench line */}
      <path d="M26 162h168" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
