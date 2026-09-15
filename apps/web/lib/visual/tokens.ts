/** Centralised visual tokens so future Visual Dashboard OS
 *  slices stay consistent. Pure constants only — no runtime
 *  fetch. Card / chip / icon-family choices live here so the
 *  worker card, job demand card, agency card and draft board
 *  read as one product.
 *
 *  THESE ARE ALIASES, NOT A SECOND DESIGN SYSTEM. They used to carry raw
 *  zinc/white classes plus Tailwind `dark:` variants, which follow the OS
 *  colour scheme rather than the product's data-theme — so these cards stayed
 *  white on a dark product whenever the OS was light. Every value below now
 *  resolves to the canonical ink/text tokens in app/globals.css. Prefer those
 *  directly in new work; this object exists for the two cards that already
 *  reference it.
 *
 *  Source of the direction: Agentai visual-sprint artefact +
 *  PR-ready product pack under runtime/artifacts/labourmarket-
 *  product/ (2026-05-28).
 */
export const VISUAL_TOKENS = {
  cardRadius: "rounded-2xl",
  cardBorder: "border-ink-600",
  cardSurface: "bg-ink-800",
  chipSurface: "bg-ink-700",
  chipText: "text-text-secondary",
  iconFamily: "lucide",
  heroAvatarSize: 48,
} as const;
