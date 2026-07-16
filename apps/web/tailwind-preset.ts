import type { Config } from "tailwindcss";
import { colors, gradients, motion, radii, shadows, typography } from "./tokens";

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
        tier: colors.tier,
        trust: colors.trust,
        surface: colors.surface,
        border: colors.border,
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
      // Motion tokens → `duration-fast`, `ease-spring`, … (TASK 06). The single
      // timing/easing source; resolves to the CSS vars in globals.css.
      transitionDuration: { ...motion.duration },
      transitionTimingFunction: { ...motion.easing },
      // `container` is the authenticated shell canvas; `content` is the shared
      // working width for dashboard pages whose roots previously re-constrained
      // themselves to max-w-xl…4xl (the production narrow-column defect —
      // UX Recovery Train Wagon 1). Pages needing full canvas (map, calendar,
      // dashboard grid) simply omit both and inherit the shell.
      maxWidth: { container: "1440px", content: "1200px" },
    },
  },
} satisfies Partial<Config>;

export default preset;
