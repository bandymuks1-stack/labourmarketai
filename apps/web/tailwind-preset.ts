import type { Config } from "tailwindcss";
import { colors, gradients, radii, shadows, typography } from "./tokens";

/**
 * Brand token preset — the ONLY place tokens map into Tailwind.
 * Components use these classes; no raw hex anywhere in components (brief §1.6).
 */
const preset = {
  theme: {
    extend: {
      colors: {
        ink: colors.ink,
        brand: colors.brand,
        state: colors.state,
        text: colors.text,
      },
      borderRadius: { ...radii },
      boxShadow: {
        card: shadows.card,
        "card-hover": shadows.cardHover,
        "cta-glow": shadows.ctaGlow,
        portrait: shadows.portrait,
      },
      backgroundImage: {
        "gradient-hero": gradients.heroAccent,
        "gradient-cta": gradients.primaryCta,
        "card-glow": gradients.cardGlow,
        "card-border": gradients.cardBorder,
        "page-ambient": gradients.pageAmbient,
      },
      fontFamily: {
        display: [...typography.fontFamily.display],
        sans: [...typography.fontFamily.sans],
        mono: [...typography.fontFamily.mono],
      },
      letterSpacing: {
        tightest: typography.letterSpacing.tightest,
        label: typography.letterSpacing.label,
      },
      maxWidth: { container: "1440px" },
    },
  },
} satisfies Partial<Config>;

export default preset;
