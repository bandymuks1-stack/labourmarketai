import {
  archetypesForIsco,
  archetypesForRelationship,
  composeJournal,
  JOURNAL_MODULES,
  UNIVERSAL_CORE_SLUGS,
  type JournalModuleId,
  type WorkEvidenceArchetypeId,
} from "./work-evidence-archetypes";

/**
 * ARCHETYPE MODULE FIELDS — the one bridge between the universal journal
 * composition (`composeJournal`) and the metric rows an entry carries
 * (`journal_entry_metrics`, owner rule §12: modules appear progressively,
 * each field = one metric row, never a column, never a second form).
 *
 * WHO decides which modules an entry may carry — TWO sources, unioned:
 *
 *   · the OCCUPATION the work belongs to — the entry's work direction is one
 *     of the worker's own professions; `professions.esco_uri` (applied to
 *     production 2026-09-08, ledger 20260908082301, 34 of 49 professions)
 *     names the ESCO occupation, `esco_occupations.isco_group` its ISCO-08
 *     unit group, and `archetypesForIsco` the work-evidence archetypes of
 *     that family. A tiler (7122 → 71) composes place and crew, materials
 *     and tools, conditions and safety, inspection; a software developer
 *     (2512 → 25) composes software delivery and case/matter fields. An
 *     unmapped profession (`esco_uri` NULL — `teacher`, `caregiver`, kept
 *     unmapped on purpose) resolves to nothing: UNKNOWN is the honest answer,
 *     never a guessed family.
 *   · the RELATIONSHIP the work is done under — the engagement context's
 *     `relationship_slug`. A `student` placement adds apprenticeship training
 *     + supervised practice; a `volunteer` engagement adds a field project.
 *
 * Neither source alone is the composition: an apprentice electrician gets
 * the trade's modules AND the placement's supervision fields. Nothing on
 * either path is manufactured — a worker with no mapped profession under an
 * `employee` context sees the universal core alone, exactly as
 * `composeJournal([])`.
 *
 * WHERE the rows are accepted: the server, from the ENGAGEMENT's own
 * relationship AND the worker's OWN professions read server-side
 * (`resolveModuleMetricRows` in journal-write-core) — never from a
 * client-declared list or a client-declared occupation: a surgeon's entry
 * cannot be posted construction quantity fields by editing a request. Values
 * are the person's own words (`source = worker_input`), text only, capped,
 * one row per slug.
 *
 * Pure: no I/O, no React, safe on both sides. The ISCO codes come in from the
 * server (`journal-occupation-path.ts`); this module only composes.
 */

/** FormData field both editors ship and both write paths read. */
export const MODULE_METRICS_FIELD = "module_metrics_json";

/** One module field value — the person's own short text. */
export const MODULE_VALUE_MAX_LENGTH = 200;

/** Hard cap on fields per save; the widest composition today is 8. */
export const MODULE_FIELDS_MAX = 40;

/** Every metric slug any module may add — the closed set a value may name. */
export const ALL_MODULE_SLUGS: ReadonlySet<string> = new Set(
  Object.values(JOURNAL_MODULES).flatMap((slugs) => [...slugs]),
);

const CORE = new Set<string>(UNIVERSAL_CORE_SLUGS);

export type JournalModuleGroup = {
  readonly moduleId: JournalModuleId;
  readonly slugs: readonly string[];
};

/** What decides an entry's composition: the occupation family (ISCO-08
 *  codes of the professions in play — the entry's own direction on the
 *  client, ALL of the worker's professions on the server) and the
 *  engagement relationship. Either may be absent. */
export type JournalModuleSources = {
  readonly relationshipSlug?: string | null;
  readonly iscoGroups?: ReadonlyArray<string | null | undefined>;
};

/** The archetypes both sources resolve to, in the order they were named —
 *  occupation families first, the relationship's additions after. */
export function archetypesForSources(
  sources: JournalModuleSources,
): readonly WorkEvidenceArchetypeId[] {
  const ids: WorkEvidenceArchetypeId[] = [];
  for (const code of sources.iscoGroups ?? []) ids.push(...archetypesForIsco(code));
  ids.push(...archetypesForRelationship(sources.relationshipSlug));
  return [...new Set(ids)];
}

/** The module groups the sources compose, in catalogue order. Empty when
 *  nothing resolves — the editors then render nothing (honest absence, never
 *  a generic form). */
export function moduleGroupsFor(sources: JournalModuleSources): JournalModuleGroup[] {
  const composition = composeJournal(archetypesForSources(sources));
  return composition.modules.map((moduleId) => ({
    moduleId,
    slugs: [...JOURNAL_MODULES[moduleId]],
  }));
}

/** The metric slugs the sources' composition allows — what the server
 *  accepts for an entry logged against that engagement by that worker. */
export function allowedModuleSlugsFor(sources: JournalModuleSources): ReadonlySet<string> {
  return new Set(moduleGroupsFor(sources).flatMap((g) => [...g.slugs]));
}

/** Relationship-only view of the same composition (a context with no
 *  occupation in play, or a caller that has none to offer). */
export function moduleGroupsForRelationship(
  relationshipSlug: string | null | undefined,
): JournalModuleGroup[] {
  return moduleGroupsFor({ relationshipSlug });
}

/** Relationship-only accept set — see `allowedModuleSlugsFor`. */
export function allowedModuleSlugsForRelationship(
  relationshipSlug: string | null | undefined,
): ReadonlySet<string> {
  return allowedModuleSlugsFor({ relationshipSlug });
}

/** slug → the person's text, for the fields that carry a value. */
export type ModuleFieldValues = Readonly<Record<string, string>>;

const SLUG_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** Preload for an edit: the module values an entry's persisted metric rows
 *  carry (first non-empty row per slug wins; unknown slugs are ignored, so a
 *  core row like `topic` never surfaces here). */
export function readModuleFieldValues(
  metrics: ReadonlyArray<{ metric_slug: string; value_text: string | null }> | null | undefined,
): ModuleFieldValues {
  const out: Record<string, string> = {};
  for (const m of metrics ?? []) {
    if (!ALL_MODULE_SLUGS.has(m.metric_slug) || m.metric_slug in out) continue;
    const v = (m.value_text ?? "").trim();
    if (v) out[m.metric_slug] = v;
  }
  return out;
}

/** The editors' wire form: JSON of the NON-EMPTY trimmed values, or null
 *  when there is nothing to send (the field is then omitted). */
export function serializeModuleFields(values: ModuleFieldValues): string | null {
  const entries = Object.entries(values)
    .map(([slug, v]) => [slug, v.trim()] as const)
    .filter(([, v]) => v.length > 0);
  return entries.length === 0 ? null : JSON.stringify(Object.fromEntries(entries));
}

/** Defensive parse of the wire form: an object of slug → string only; slugs
 *  must be module slugs (never a core slug, never free-form), values are
 *  trimmed and capped, malformed input degrades to nothing. What it does NOT
 *  decide is whether a slug is allowed for THIS entry — that is the
 *  engagement's relationship, checked in `moduleMetricRows`. */
export function parseModuleFields(raw: string | null | undefined): ModuleFieldValues {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [slug, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Object.keys(out).length >= MODULE_FIELDS_MAX) break;
      if (!SLUG_RE.test(slug) || CORE.has(slug) || !ALL_MODULE_SLUGS.has(slug)) continue;
      if (typeof v !== "string") continue;
      const value = v.trim().slice(0, MODULE_VALUE_MAX_LENGTH);
      if (value) out[slug] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export type ModuleMetricRow = {
  metric_slug: string;
  value_text: string;
  source: "worker_input";
};

/** Turn accepted values into metric rows for the atomic save. A slug outside
 *  the entry's own composition is refused — named, never silently dropped
 *  and never stored (the same honesty the source-document check keeps). */
export function moduleMetricRows(
  values: ModuleFieldValues,
  allowed: ReadonlySet<string>,
): { ok: true; rows: ModuleMetricRow[] } | { ok: false; refused: string[] } {
  const refused = Object.keys(values).filter((slug) => !allowed.has(slug));
  if (refused.length > 0) return { ok: false, refused };
  const rows: ModuleMetricRow[] = Object.entries(values).map(([slug, value]) => ({
    metric_slug: slug,
    value_text: value,
    source: "worker_input",
  }));
  return { ok: true, rows };
}
