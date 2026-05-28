/** Centralised visual tokens so future Visual Dashboard OS
 *  slices stay consistent. Pure constants only — no runtime
 *  fetch. Card / chip / icon-family choices live here so the
 *  worker card, job demand card, agency card and draft board
 *  read as one product.
 *
 *  Source of the direction: Agentai visual-sprint artefact +
 *  PR-ready product pack under runtime/artifacts/labourmarket-
 *  product/ (2026-05-28).
 */
export const VISUAL_TOKENS = {
  cardRadius: "rounded-2xl",
  cardBorder: "border-zinc-200 dark:border-zinc-800",
  cardSurface: "bg-white dark:bg-zinc-950",
  chipSurface: "bg-zinc-100 dark:bg-zinc-900",
  chipText: "text-zinc-700 dark:text-zinc-200",
  iconFamily: "lucide",
  heroAvatarSize: 48,
} as const;
