// Radii (brief §8.4). Cards use lg (18px).
//
// THE LADDER MUST STAY MONOTONIC. Before UX 2.0 the map stopped at `xl`, so
// `rounded-2xl` / `rounded-3xl` fell through to Tailwind's defaults (16px /
// 24px) — which made `rounded-2xl` (16px) SMALLER than `rounded-lg` (18px). A
// chat bubble therefore rendered less rounded than the card nested inside it,
// and "reach for the bigger class" silently tightened a corner. The ladder is
// now complete and strictly increasing; nothing falls through to Tailwind.
//
// Pinned by lib/guards/ux-2-0-foundation.test.ts.
const scale = {
  xs: "6px",
  sm: "10px",
  md: "14px",
  lg: "18px",
  xl: "24px",
  "2xl": "28px",
  "3xl": "36px",
} as const;

/**
 * Semantic aliases — what a surface IS, not how round it happens to look.
 * Conversation code uses these so the bubble/card/control relationship is
 * stated once and cannot drift: a speech bubble is always softer than the
 * structural card it may contain, and a control is always tighter than the
 * card it sits on.
 */
const semantic = {
  /** Buttons, chips, inputs — small controls. */
  control: scale.md, // 14px
  /** Structural cards and inline flow panels. */
  card: scale.lg, // 18px
  /** Chat speech bubbles — deliberately the softest surface in the product. */
  bubble: scale["2xl"], // 28px
} as const;

export const radii = { ...scale, ...semantic } as const;

/** The numeric ladder, in order. Exported so the guard can assert monotonicity
 *  without re-declaring the values it is meant to be checking. */
export const RADII_LADDER = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const;
