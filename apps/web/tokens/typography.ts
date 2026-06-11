// Typography — TASK 07 lock (owner, 2026-06-11): Display: Bricolage Grotesque
// (headings/cards) · Body: Inter · Mono: JetBrains Mono (numbers/labels).
// Font CSS vars are wired in app/[locale]/layout.tsx via next/font; swapping
// a font is a token swap there — components never name a typeface.
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
