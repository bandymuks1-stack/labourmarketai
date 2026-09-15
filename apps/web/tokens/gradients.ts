// Brand gradients (brief §8.2). Gradient on ONE accent word only — never body.
//
// BLACK + METALLIC GOLD (owner-approved final direction, 2026-09-09). The
// decorative ramps were a single restrained BLUE; the brand is now metallic
// gold, so they are the gold ramp instead. `metallic` is the owner's five-stop
// ramp (#8A6A12 → #D4AF37 → #FFD966 → #D4AF37 → #8A6A12) and is reserved for
// genuine brand moments — the logo and a single accent word. Everything else
// uses the two-stop depth ramp, because a five-stop metal on ordinary chrome
// stops reading as metal and starts reading as decoration.
//
// Semantic state/tier colours and the ink foundations are untouched, so
// contrast is unchanged. Violet / purple stay reserved for genuinely distinct
// semantic use, never decoration.
export const gradients = {
  /** The owner's metallic ramp. Logo + large brand moments ONLY — never a
   *  surface that carries small text (the #8C6A16 depth stop is 3.95:1 under a
   *  near-black label, which is why the CTA uses its own AA-safe ramp). */
  metallic:
    "linear-gradient(135deg, #8C6A16 0%, #D4AF37 24%, #F2D675 50%, #D4AF37 76%, #8C6A16 100%)",
  // THEME-AWARE (resolved in app/globals.css, like every colour token). A fixed
  // ramp here silently failed AA in the light theme: the light gold under
  // light's WHITE on-brand text measured 1.74:1. Dark keeps the bright metal,
  // light uses the deep end of the same ramp.
  heroAccent: "var(--gradient-hero)",
  primaryCta: "var(--gradient-cta)",
  cardGlow:
    "radial-gradient(120% 80% at 50% 0%, rgba(212,175,55,0.06) 0%, transparent 62%)",
  cardBorder:
    "linear-gradient(135deg, rgba(212,175,55,0.32), rgba(212,175,55,0.08) 60%, rgba(212,175,55,0.03))",
  pageAmbient:
    "radial-gradient(1200px 800px at 20% 0%, rgba(212,175,55,0.05), transparent 62%)",
} as const;
