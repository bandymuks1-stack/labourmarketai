/**
 * Pure model for the COMPACT journal edit surface (journal compact edit UX,
 * P0). No IO, no React — fully unit-testable.
 *
 * Responsibilities:
 *   • derive the editor's activity rows from the entry's PERSISTED state
 *     (fragment metrics + durable skill links) — never from re-running
 *     suggestions;
 *   • keep each activity's time tied to ITS row (index-grouped fragment
 *     metrics are the truthful association — see `EditEntryActivity`);
 *   • build the ONE batch-save field map for the existing
 *     `supersedeJournalEntry` FormData contract — an untouched edit
 *     re-submits the preloaded metrics unchanged (no data loss).
 */
import type {
  EditEntryAmount,
  JournalEditingEntry,
} from "@/lib/journal/edit-entry";

export type CompactTimeUnit = "hours" | "minutes" | "days";

export type CompactActivityRow = {
  /** Stable client key. */
  key: string;
  /** Display label (activity label / linked-skill name / clarification). */
  label: string;
  /** Taxonomy slug when the row represents a durable entry↔skill link. */
  skillSlug: string | null;
  /** Original fragment phrase (kept so evidence survives re-submission). */
  rawPhrase: string | null;
  /** Time input value ("" = no time for this activity). */
  timeValue: string;
  timeUnit: CompactTimeUnit;
  /** persisted = from the saved entry; added = local, UNSAVED until save. */
  origin: "persisted" | "added";
};

const TIME_UNITS: readonly CompactTimeUnit[] = ["hours", "minutes", "days"];

function toTimeUnit(u: string | null | undefined): CompactTimeUnit {
  return (TIME_UNITS as readonly string[]).includes(u ?? "")
    ? (u as CompactTimeUnit)
    : "hours";
}

function foldLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Format a numeric metric value for a text input (locale-neutral dot). */
function amountToInput(v: number): string {
  return Number.isFinite(v) ? String(v) : "";
}

export type DeriveCompactRowsResult = {
  rows: CompactActivityRow[];
  /** Entry-level time (the `quantity` metric with a time unit) shown as ONE
   *  global field ONLY when no activity row carries its own time — with
   *  per-row times the total is derived from the rows instead (never a
   *  competing global field). */
  looseTime: EditEntryAmount | null;
};

/**
 * Rows come from the entry's persisted fragments (each with its OWN time)
 * plus durably linked skills that no fragment already represents. A linked
 * skill whose name matches a fragment label merges INTO that fragment row
 * (one activity = one row).
 */
export function deriveCompactRows(
  entry: JournalEditingEntry,
  workerSkills: ReadonlyArray<{ slug: string; name: string }>,
): DeriveCompactRowsResult {
  const nameBySlug = new Map(workerSkills.map((s) => [s.slug, s.name]));
  const rows: CompactActivityRow[] = [];

  for (const a of entry.activities) {
    const label =
      a.userLabel ?? a.activityLabel ?? a.rawPhrase ?? "";
    if (!label.trim()) continue;
    rows.push({
      key: `frag-${a.index}`,
      label: label.trim(),
      skillSlug: null,
      rawPhrase: a.rawPhrase,
      timeValue: a.time ? amountToInput(a.time.value) : "",
      timeUnit: toTimeUnit(a.time?.unitSlug),
      origin: "persisted",
    });
  }

  // Durable skill links → their own rows, unless a fragment row already
  // carries the same label (then the link merges into that row).
  for (const slug of entry.skillSlugs) {
    const name = nameBySlug.get(slug) ?? slug.replace(/[-_]+/g, " ");
    const existing = rows.find(
      (r) =>
        r.skillSlug === null &&
        (foldLabel(r.label) === foldLabel(name) ||
          foldLabel(r.label) === foldLabel(slug)),
    );
    if (existing) {
      existing.skillSlug = slug;
      // A row whose stored label IS the slug (a saved taxonomy selection —
      // `fragment_activity` persists the slug) reads as the human skill name.
      if (foldLabel(existing.label) === foldLabel(slug)) {
        existing.label = name;
      }
      continue;
    }
    rows.push({
      key: `skill-${slug}`,
      label: name,
      skillSlug: slug,
      rawPhrase: null,
      timeValue: "",
      timeUnit: "hours",
      origin: "persisted",
    });
  }

  const anyRowTime = rows.some((r) => r.timeValue !== "");
  return {
    rows,
    looseTime: !anyRowTime && entry.time ? entry.time : null,
  };
}

/** Parse a row's time input; null when empty/invalid/negative. */
export function parseRowTime(row: {
  timeValue: string;
  timeUnit: CompactTimeUnit;
}): { value: number; unitSlug: CompactTimeUnit } | null {
  const raw = row.timeValue.trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return { value, unitSlug: row.timeUnit };
}

/**
 * Total time across rows, canonicalised: whole hours when the minute total
 * divides evenly, minutes otherwise. Null when no row has a valid time.
 */
export function computeTotalTime(
  rows: ReadonlyArray<{ timeValue: string; timeUnit: CompactTimeUnit }>,
): { value: number; unitSlug: "hours" | "minutes" } | null {
  let totalMinutes = 0;
  let any = false;
  for (const row of rows) {
    const t = parseRowTime(row);
    if (!t) continue;
    any = true;
    totalMinutes +=
      t.unitSlug === "minutes"
        ? t.value
        : t.unitSlug === "hours"
          ? t.value * 60
          : t.value * 24 * 60;
  }
  if (!any) return null;
  totalMinutes = Math.round(totalMinutes * 100) / 100;
  if (totalMinutes % 60 === 0) {
    return { value: totalMinutes / 60, unitSlug: "hours" };
  }
  return { value: totalMinutes, unitSlug: "minutes" };
}

export type CompactSaveInput = {
  text: string;
  workDate: string;
  /** Engagement (org/project) the entry is logged against — carried through
   *  the save unchanged so an edit never silently moves it to another org. */
  engagementContextId: string;
  rows: ReadonlyArray<CompactActivityRow>;
  /** Linked-skill rows the worker REMOVED — shipped as rejected slugs so the
   *  pipeline records entry-scoped `skill_rejected` markers (honest lane). */
  removedSkillSlugs: ReadonlyArray<string>;
  /** Global time field (only rendered when no row carries its own time). */
  looseTimeValue: string;
  looseTimeUnit: CompactTimeUnit;
  /** Non-time productivity quantity (advanced section). */
  quantityValue: string;
  quantityUnit: string;
  directionSlug: string;
  siteName: string;
  institutionName: string;
  topic: string;
};

/**
 * The ONE batch-save field map for the existing `supersedeJournalEntry`
 * FormData contract. Per-activity times ship as index-paired
 * `fragments_json` entries (→ `parsed_fragment` + `fragment_activity` +
 * `fragment_time` rows built by the action); the entry-level `quantity`
 * metric stays the honest total: an explicit non-time quantity wins,
 * otherwise the SUM of row times, otherwise the global time field.
 */
export function buildCompactSaveFields(
  input: CompactSaveInput,
): Record<string, string> {
  const fields: Record<string, string> = {
    notes: input.text,
    work_date: input.workDate,
  };
  if (input.engagementContextId)
    fields.engagement_context_id = input.engagementContextId;
  if (input.siteName.trim()) fields.site_name = input.siteName.trim();
  if (input.directionSlug) fields.work_direction = input.directionSlug;
  if (input.institutionName.trim())
    fields.institution_name = input.institutionName.trim();
  if (input.topic.trim()) fields.topic = input.topic.trim();

  // Activity rows → fragments_json (index association preserved by order).
  // A row that originates from a taxonomy selection keeps ITS `skillSlug` as
  // the fragment's `activitySlug` (P1-A): the server validates the slug and
  // links the skill to the new entry; a free-text row ships `activitySlug:
  // null` and stays an honest label — never a fabricated taxonomy claim.
  const fragments = input.rows
    .filter((r) => r.label.trim().length > 0)
    .map((r) => {
      const t = parseRowTime(r);
      return {
        rawPhrase: (r.rawPhrase ?? r.label).trim(),
        timeValue: t ? t.value : null,
        timeUnit: t ? t.unitSlug : null,
        activitySlug: r.skillSlug,
        activityLabel: r.label.trim(),
        isUnknown: false,
        userLabel: null,
      };
    });
  if (fragments.length > 0) {
    fields.fragments_json = JSON.stringify(fragments);
  }

  // A slug the worker removed AND then re-added in the same session is NOT
  // rejected — the row present in the save wins over the earlier removal.
  const presentSlugs = new Set(
    input.rows.map((r) => r.skillSlug).filter(Boolean),
  );
  fields.rejected_slugs_json = JSON.stringify(
    [...new Set(input.removedSkillSlugs)].filter(
      (slug) => !presentSlugs.has(slug),
    ),
  );

  // Entry-level quantity lane (one `quantity` metric slot, as before):
  const qtyRaw = input.quantityValue.trim().replace(",", ".");
  const qty = qtyRaw === "" ? null : Number(qtyRaw);
  const total = computeTotalTime(input.rows);
  const loose = parseRowTime({
    timeValue: input.looseTimeValue,
    timeUnit: input.looseTimeUnit,
  });
  if (qty !== null && Number.isFinite(qty) && qty >= 0) {
    fields.quantity = String(qty);
    fields.unit_slug = input.quantityUnit;
  } else if (total) {
    fields.quantity = String(total.value);
    fields.unit_slug = total.unitSlug;
  } else if (loose) {
    fields.quantity = String(loose.value);
    fields.unit_slug = loose.unitSlug;
  }
  return fields;
}

/** Serializable dirty-state fingerprint — the editor compares the current
 *  fingerprint to the one taken at open/save time. */
export function compactStateFingerprint(input: CompactSaveInput): string {
  return JSON.stringify(buildCompactSaveFields(input));
}
