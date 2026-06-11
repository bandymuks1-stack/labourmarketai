// Visual system is law — the ONLY allowed colors (brief §8.1), now THEME-SWAPPABLE.
//
// Each token resolves to `rgb(var(--c-*) / <alpha-value>)`, where the channel
// triplet lives in app/globals.css. This is what makes dark↔light (or any
// rebrand) a TOKEN SWAP with ZERO component edits: components keep using the same
// classes (bg-ink-800, text-text-primary, bg-state-success/10 …); only the CSS
// variables change per `[data-theme]`. The `<alpha-value>` form preserves
// Tailwind opacity modifiers (e.g. /10, /40). Dark is the default (:root); the
// light slot is defined in globals.css and proven by <ThemeToggle/>.
//
// The literal hex for each channel is documented next to its definition in
// globals.css, so this file never carries a raw value.
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export const colors = {
  ink: {
    900: c("ink-900"),
    800: c("ink-800"),
    700: c("ink-700"),
    600: c("ink-600"),
    500: c("ink-500"),
  },
  brand: {
    blue: c("brand-blue"),
    cyan: c("brand-cyan"),
    violet: c("brand-violet"),
    purple: c("brand-purple"),
    orange: c("brand-orange"),
  },
  state: {
    live: c("state-live"),
    success: c("state-success"),
    warning: c("state-warning"),
    amber: c("state-amber"),
    danger: c("state-danger"),
  },
  text: {
    primary: c("text-primary"),
    secondary: c("text-secondary"),
    muted: c("text-muted"),
  },
  tier: {
    diamond: c("tier-diamond"),
    gold: c("tier-gold"),
    silver: c("tier-silver"),
    bronze: c("tier-bronze"),
  },
  // DESIGN_SOUL: single semantic gold trust accent (aliases tier-gold channels).
  trust: {
    accent: c("trust-accent"),
  },
} as const;
