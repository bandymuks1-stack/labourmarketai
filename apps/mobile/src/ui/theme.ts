import { Platform } from "react-native";

/**
 * A small, deliberate set of tokens — not a second design system.
 *
 * The web app's design tokens live in `apps/web/tokens` and are expressed as
 * CSS custom properties, which a React Native `StyleSheet` cannot consume.
 * Rather than invent a parallel palette, this restates the few values a shell
 * needs and keeps them in one file, so the eventual token export has one place
 * to land.
 *
 * Sizes are chosen for a phone held in a work glove, not for a mouse: 48pt
 * minimum touch targets (above the 44pt floor both platforms recommend) and
 * body text that stays legible in daylight.
 */

// Values restated from apps/web/app/globals.css (dark theme) — the black/gold brand.
// 2026-10-18: this file still carried the pre-gold navy/blue palette, so the native
// sign-in rendered a blue primary button on navy while the web is obsidian + gold.
export const theme = {
  color: {
    background: "#070706", // --c-ink-900 obsidian, the application ground
    surface: "#151513", // --c-ink-800 graphite, cards and panels
    surfaceRaised: "#1D1D1A", // --c-ink-700 nested panel
    border: "#767065", // --c-ink-500 control boundary (3:1+ for inputs, WCAG 1.4.11)
    text: "#F5F1E8", // --c-text-primary warm ivory
    textMuted: "#A39C8D", // --c-text-muted
    accent: "#D4AF37", // --c-brand-blue (resolves to metallic gold)
    accentText: "#0A0A0A", // --c-text-on-brand
    warning: "#FFA552", // --c-state-amber
    danger: "#FF5C5C", // --c-state-danger
  },
  space: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 20,
  },
  /** Every tappable thing is at least this tall. Non-negotiable. */
  minTouchTarget: 48,
  font: {
    body: 16,
    title: 24,
    small: 14,
    mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
} as const;
