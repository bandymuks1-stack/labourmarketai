// Brand gradients (brief §8.2). Gradient on ONE accent word only — never body.
//
// Premium visual refinement (real-user-launch train): the decorative gradients
// are consolidated to ONE restrained blue primary. The former blue→violet→purple
// ramps read as generic "AI-startup" lighting; they are replaced by a durable
// single-hue blue depth gradient and calmer, lower-intensity ambient/border
// washes. Semantic state/tier colours and the ink foundations are untouched, so
// contrast is unchanged. Decoration now uses the primary accent only; violet /
// purple are reserved for genuinely distinct semantic use, never decoration.
export const gradients = {
  heroAccent:
    "linear-gradient(90deg, #3E8BFF 0%, #1E6FE0 100%)",
  primaryCta: "linear-gradient(135deg, #3E8BFF 0%, #2D6BE0 100%)",
  cardGlow:
    "radial-gradient(120% 80% at 50% 0%, rgba(62,139,255,0.05) 0%, transparent 62%)",
  cardBorder:
    "linear-gradient(135deg, rgba(62,139,255,0.28), rgba(62,139,255,0.06) 60%, rgba(62,139,255,0.03))",
  pageAmbient:
    "radial-gradient(1200px 800px at 20% 0%, rgba(62,139,255,0.045), transparent 62%)",
} as const;
