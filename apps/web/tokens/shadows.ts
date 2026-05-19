// Shadows / glows (brief §8.4). Soft colored glows, never hard drop shadows.
export const shadows = {
  card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(62,139,255,0.08)",
  cardHover:
    "0 0 40px rgba(62,139,255,0.15), 0 0 0 1px rgba(62,139,255,0.25)",
  ctaGlow: "0 8px 32px rgba(62,139,255,0.35)",
  portrait: "0 0 80px rgba(62,139,255,0.45)",
} as const;
