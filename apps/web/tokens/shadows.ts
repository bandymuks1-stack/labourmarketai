// Shadows / glows (brief §8.4). Soft colored glows, never hard drop shadows.
//
// BLACK + METALLIC GOLD (owner-approved final direction, 2026-09-09). Same
// restraint as before, gold instead of blue: on a #000 ground a glow reads much
// hotter than it did on #06070D, so the spreads and opacities are held DOWN
// rather than carried over — the owner's brief asks for "restrained warm
// illumination", explicitly not "everything glowing" (§21).
export const shadows = {
  // The inset top line is CHAMPAGNE at very low alpha — the "illuminated edge"
  // of the palette. It is what makes a graphite panel read as a lit surface
  // rather than a flat black rectangle, without any glow.
  card: "0 1px 0 rgba(242,214,117,0.05) inset, 0 0 0 1px rgba(212,175,55,0.08)",
  cardHover: "0 0 24px rgba(212,175,55,0.10), 0 0 0 1px rgba(212,175,55,0.24)",
  ctaGlow: "0 6px 20px rgba(140,106,22,0.28)",
  portrait: "0 0 48px rgba(212,175,55,0.26)",
} as const;
