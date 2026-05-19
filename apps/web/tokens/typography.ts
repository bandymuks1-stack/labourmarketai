// Typography (brief §8.3). Display: Geist · Body: Inter · Mono: Geist Mono.
// Font CSS vars are wired in app/[locale]/layout.tsx via next/font.
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
