import type { Config } from "tailwindcss";

/**
 * Brand token preset (single source for Tailwind theme).
 *
 * Slice 1 establishes only the font wiring so the build is green. The full
 * "Industrial Intelligence" token system (colors, gradients, radii, shadows)
 * is populated from `tokens/*` in slice 2 (design system) — this file is the
 * one place that mapping will live.
 */
const preset = {
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
} satisfies Partial<Config>;

export default preset;
