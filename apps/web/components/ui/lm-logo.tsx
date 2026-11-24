import { useId } from "react";

/**
 * The LM mark — the ONE production logo component.
 *
 * The geometry is the owner's original CorelDRAW vector, verbatim:
 * `docs/brand/source/LM_Color Single.svg` (md5 eafd130e9820d6e9df12cc075229d0b5),
 * viewBox 700.27 x 660.2. Nothing was redrawn or re-traced. The only change is
 * the fill: the original's ORANGE becomes the metallic-gold ramp
 * (#8C6A16 → #D4AF37 → #F2D675 → #D4AF37 → #8C6A16), and the original's opaque
 * black background rect is dropped so the mark sits on whatever surface hosts
 * it. `public/brand/lm-mark.svg` is the same artwork as a static file, for
 * anywhere that needs a URL rather than a component.
 *
 * WHY A COMPONENT AND NOT AN <img>: the mark has to inherit size from the
 * layout and stay crisp at every one, and a component keeps the artwork in ONE
 * place instead of a URL each caller sizes differently.
 *
 * The gradient id is PER INSTANCE (`useId()`). It used to be one fixed id, on
 * the reasoning that identical definitions resolve identically. That holds
 * only while the FIRST definition in the document is painted: every
 * `url(#id)` resolves to the first element carrying the id, and Chromium does
 * not paint a gradient defined inside a `display:none` subtree. Once the mark
 * is repeated — the one top bar AND every assistant turn in the conversation —
 * a hidden first copy (a collapsed history block, a breakpoint-hidden
 * variant) would strip the fill from every mark on the page. `useId()` is
 * available to server components (React's server build exports it; it is not
 * a client-only hook), so the public nav and the auth shell keep rendering
 * this on the server.
 *
 * Before this component the favicon and the PWA icon were three generic
 * ascending bars, the public/auth chrome carried the wordmark as plain text,
 * and the AUTHENTICATED chrome (the one top bar and the assistant's mark in
 * the conversation) carried a yellow letter tile standing in for the mark.
 * The public/auth shells adopted this first (#1683); the authenticated
 * product followed, so every place the product shows its identity now shows
 * THIS artwork — never a letter, never a second drawing.
 */
export function LmLogo({
  className,
  title = "LabourMarket.ai",
}: {
  className?: string;
  /** Empty string marks it decorative — use that when a wordmark sits beside it. */
  title?: string;
}) {
  // Only word characters survive: React's id delimiters have changed across
  // versions (`:r1:`, `«r1»`, `_r_1_`), and a `url(#…)` fragment must stay a
  // plain token. The distinguishing part of the id is alphanumeric, so
  // stripping the delimiters never collapses two instances into one.
  const gradientId = `lm-metal-${useId().replace(/\W/g, "")}`;
  const decorative = title === "";
  return (
    <svg
      viewBox="0 0 700.27 660.2"
      className={className}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="89"
          y1="537"
          x2="653"
          y2="123"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8C6A16" />
          <stop offset="0.28" stopColor="#D4AF37" />
          <stop offset="0.5" stopColor="#F2D675" />
          <stop offset="0.72" stopColor="#D4AF37" />
          <stop offset="1" stopColor="#8C6A16" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`}>
        <polygon points="158.18,123.09 89.02,123.09 89.02,533.46 336.3,533.46 336.3,464.3 158.18,464.3 " />
        <polygon points="208.23,173.43 367.53,385.6 367.55,385.57 367.69,385.77 478.08,238.75 478.08,533.46 547.24,533.46 547.24,146.63 547.46,146.34 547.24,135.44 547.24,123.09 546.99,123.09 478.43,123.09 478.08,123.09 478.08,123.56 367.63,270.66 256.84,123.09 208.23,123.09 " />
        <circle cx="614.05" cy="497.95" r="39.16" />
        <polygon points="326.49,414.25 208.23,256.78 208.23,414.25 " />
      </g>
    </svg>
  );
}
