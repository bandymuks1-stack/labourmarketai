/**
 * Journal profession templates — PURE field_schema parsing (Journal Proof
 * Engine v1, §10 slug registry `journal_profession_templates`, DRAFT
 * migration 20260714180000 — owner-gated, may not be applied).
 *
 * A template row's `field_schema` jsonb is DATA the composer interprets:
 *   { "default_unit_slug": "<productivity unit slug>",
 *     "scaffold": { "<locale>": ["line", ...], ... } }
 *
 * Parsing is defensive: a malformed row degrades to `null` (the template is
 * simply not offered) — never a crash, never a guessed field. Labels for the
 * template PICKER come from the journal.templates i18n namespace keyed by
 * slug; a slug without a label is skipped by the composer (§10 — no raw slug
 * ever reaches the UI).
 *
 * Pure. No IO, no env.
 */

export interface JournalTemplateOption {
  slug: string;
  /** Scaffold lines for the ACTIVE locale (fallback chain lt → en → first). */
  scaffoldLines: string[];
  /** Productivity-unit slug to preselect in the quantity editor. */
  defaultUnitSlug: string | null;
}

const SLUG_RE = /^[a-z0-9_]{3,60}$/;
const MAX_LINES = 12;
const MAX_LINE_LEN = 120;

function cleanLines(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const line of v) {
    if (typeof line !== "string") return null;
    const s = line.slice(0, MAX_LINE_LEN);
    if (s.trim().length === 0) continue;
    out.push(s);
    if (out.length >= MAX_LINES) break;
  }
  return out.length > 0 ? out : null;
}

/**
 * Parse one registry row into a composer option for `locale`.
 * Returns null when the row is unusable (bad slug / no scaffold) — honest
 * absence, the picker simply does not offer it.
 */
export function parseJournalTemplateRow(
  row: { slug?: unknown; field_schema?: unknown },
  locale: string,
): JournalTemplateOption | null {
  const slug = typeof row.slug === "string" ? row.slug : "";
  if (!SLUG_RE.test(slug)) return null;
  const schema =
    row.field_schema && typeof row.field_schema === "object"
      ? (row.field_schema as Record<string, unknown>)
      : null;
  if (!schema) return null;

  const scaffold =
    schema.scaffold && typeof schema.scaffold === "object"
      ? (schema.scaffold as Record<string, unknown>)
      : null;
  if (!scaffold) return null;
  const lines =
    cleanLines(scaffold[locale]) ??
    cleanLines(scaffold.lt) ??
    cleanLines(scaffold.en) ??
    cleanLines(Object.values(scaffold)[0]);
  if (!lines) return null;

  const defaultUnitSlug =
    typeof schema.default_unit_slug === "string" &&
    SLUG_RE.test(schema.default_unit_slug)
      ? schema.default_unit_slug
      : null;

  return { slug, scaffoldLines: lines, defaultUnitSlug };
}

/** Scaffold lines → the text block that prefills the composer textarea. */
export function templateScaffoldText(option: JournalTemplateOption): string {
  return option.scaffoldLines.join("\n");
}
