/**
 * CV print template registry (Full CV System v1, §10 Lego).
 *
 * Template IDENTITY is a slug in this registry; template LABELS live in the
 * i18n JSON (`cvExport.templates.<slug>`). Adding a template = one registry
 * row + one label key + its render branch — no hardcoded UI enum spread
 * across components. Both registered templates are REAL print layouts today
 * (§18 — no placeholder template ids for layouts that don't exist).
 */

export interface CvTemplate {
  id: string;
}

export const CV_TEMPLATES: readonly CvTemplate[] = [
  { id: "standard" },
  { id: "compact" },
];

export const DEFAULT_CV_TEMPLATE = "standard";

/** Unknown/absent → the default template (honest fallback, never a 404). */
export function parseCvTemplateId(raw: string | string[] | undefined): string {
  const s = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return CV_TEMPLATES.some((t) => t.id === s) ? s : DEFAULT_CV_TEMPLATE;
}
