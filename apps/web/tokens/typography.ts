// Typography — TYPOGRAPHY DECISION LOCK (DI approved, research-backed,
// 2026-06-12; extends the TASK 07 lock of 2026-06-11). Four roles:
//
//   display — Bricolage Grotesque   headings / cards
//   body/UI — Inter                 body text + all UI controls
//   mono    — JetBrains Mono        numbers / labels
//   accent  — Instrument Serif      ACCENT ONLY: hero headlines, pull quotes,
//                                   founder-moment empty states; min size
//                                   ~28px; NEVER body or UI text.
//
// Why Inter stays as body: screen-legibility research (a low-vision review of
// 18 studies, dyslexia studies, eye-tracking) favors a dedicated UI sans for
// body text; Instrument Serif is a single-weight condensed display face
// designed for large sizes only and is unsuitable for body/UI text.
// Distinctiveness lives in Bricolage Grotesque (display) and the token
// system, not the body font.
//
// Font CSS vars are wired in app/[locale]/layout.tsx via next/font; swapping
// a font is a token swap there — components never name a typeface. Guarded by
// lib/guards/design-tokens.test.ts (raw typeface names outside this file +
// the layout wiring fail CI; Instrument Serif outside whitelisted accent
// contexts fails CI).
export const typography = {
  fontFamily: {
    display: ["var(--font-display)", "system-ui", "sans-serif"],
    sans: ["var(--font-sans)", "system-ui", "sans-serif"],
    mono: ["var(--font-mono)", "ui-monospace", "monospace"],
  },
  letterSpacing: {
    // hero/display headings
    tightest: "-0.02em",
    // mono small-caps labels
    label: "0.12em",
  },
} as const;
