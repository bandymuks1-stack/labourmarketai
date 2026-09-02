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

export const theme = {
  color: {
    background: "#0B0E14",
    surface: "#141922",
    surfaceRaised: "#1C2330",
    border: "#2A3342",
    text: "#F2F5F9",
    textMuted: "#9AA6B8",
    accent: "#4C8DFF",
    accentText: "#04070D",
    warning: "#F2B441",
    danger: "#FF6B6B",
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
