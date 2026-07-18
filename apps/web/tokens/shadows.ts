// Shadows / glows (brief §8.4). Soft colored glows, never hard drop shadows.
//
// Premium visual refinement (real-user-launch train): the decorative glows are
// softened (lower spread + opacity) so surfaces read as a restrained European
// business product rather than a neon "AI" UI. Single primary-blue glow only.
export const shadows = {
  card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(62,139,255,0.06)",
  cardHover:
    "0 0 24px rgba(62,139,255,0.10), 0 0 0 1px rgba(62,139,255,0.18)",
  ctaGlow: "0 6px 20px rgba(62,139,255,0.22)",
  portrait: "0 0 48px rgba(62,139,255,0.30)",
} as const;
