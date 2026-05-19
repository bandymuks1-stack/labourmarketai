// Brand gradients (brief §8.2). Gradient on ONE accent word only — never body.
export const gradients = {
  heroAccent:
    "linear-gradient(90deg, #3E8BFF 0%, #7B5CFF 55%, #B57BFF 100%)",
  primaryCta: "linear-gradient(135deg, #3E8BFF 0%, #7B5CFF 100%)",
  cardGlow:
    "radial-gradient(120% 80% at 50% 0%, rgba(62,139,255,0.08) 0%, transparent 60%)",
  cardBorder:
    "linear-gradient(135deg, rgba(62,139,255,0.40), rgba(123,92,255,0.15) 50%, rgba(62,139,255,0.05))",
  pageAmbient:
    "radial-gradient(1200px 800px at 20% 0%, rgba(62,139,255,0.06), transparent 60%), radial-gradient(1000px 600px at 80% 30%, rgba(123,92,255,0.05), transparent 55%)",
} as const;
