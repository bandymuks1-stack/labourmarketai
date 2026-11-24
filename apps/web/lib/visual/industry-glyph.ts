/** Industry → owner-facing display label. Pure, deterministic.
 *  Used by <JobDemandCard/> + future demand-side surfaces to
 *  surface the industry name when the component needs more than
 *  just the icon (e.g. accessible labels, fallback when an icon
 *  doesn't render). Same enum the card uses, so adding a new
 *  industry only needs an update in one place. */
export type IndustryKey =
  | "general"
  | "construction"
  | "trades"
  | "manufacturing"
  | "office"
  | "other";

const LABEL_LT: Record<IndustryKey, string> = {
  general: "Bendra",
  construction: "Statyba",
  trades: "Amatai",
  manufacturing: "Gamyba",
  office: "Biuras",
  other: "Kita",
};

const LABEL_EN: Record<IndustryKey, string> = {
  general: "General",
  construction: "Construction",
  trades: "Trades",
  manufacturing: "Manufacturing",
  office: "Office",
  other: "Other",
};

export function industryLabel(key: IndustryKey, locale: "lt" | "en" = "lt"): string {
  return (locale === "en" ? LABEL_EN : LABEL_LT)[key];
}
