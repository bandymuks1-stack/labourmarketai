/**
 * WORK IN NUMBERS — the presentation model (issue #1689 / #1724, owner
 * direction 2026-09-13: "Kokie įgūdžiai užima didžiausią mano veiklos
 * dalį?" answered first, on a phone, above the fold).
 *
 * Pure: no IO, no i18n, no clock. Every figure in here is READ from the ONE
 * work-intelligence model (`lib/journal/work-intelligence.ts`); nothing is
 * re-derived, summed or re-scoped. The two consumers — the journal page's
 * compact summary and the `/dashboard/journal?view=numbers` station — build their
 * rows through these functions so a figure is composed ONCE and renders the
 * same on both.
 *
 * ── HONESTY VOCABULARY (SEP-7: UNKNOWN ≠ ZERO ≠ NOT_MEASURED) ─────────────
 *   UNKNOWN       the reader returned null → `numbersState` = "unknown";
 *                 the surface says it could not read, never a zero;
 *   ZERO          the model was read and holds no entry at all;
 *   NOT_MEASURED  a skill backed only by untimed entries: `measured` is
 *                 false and `confirmationShare` is null — the row is
 *                 counted as entries WITHOUT hours, never printed as 0 h.
 *
 * A share is a fraction of the person's OWN attributed hours; a bar's width
 * is that share and nothing else (the number is printed beside it — state is
 * never colour alone, §S). No score, no rating, no rank, no tier of the
 * person exists here.
 */

import type {
  OrganizationRecordTotals,
  OutputTotal,
  SkillWorkTime,
  WorkIntelligence,
  WorkPeriodScope,
  WorkPeriodTotals,
  WorkTrend,
} from "@/lib/journal/work-intelligence";
import type { EvidenceTier } from "@/lib/evidence/evidence-tier";

/** What the surface may render for a model it was handed. */
export type NumbersState = "unknown" | "no_entries" | "ok";

export function numbersState(wi: WorkIntelligence | null | undefined): NumbersState {
  if (!wi) return "unknown";
  return wi.totalEntries === 0 ? "no_entries" : "ok";
}

/** A CSS width for a share bar: 0..100, whole percent, clamped. A malformed
 *  share (NaN, negative, > 1) never paints a bar that claims what the model
 *  did not say. */
export function shareBarWidth(share: number): number {
  if (!Number.isFinite(share) || share <= 0) return 0;
  return Math.round(Math.min(1, share) * 100);
}

/** The period row every focus figure describes — the tab, or the explicit
 *  `range` row when the caller asked for a window. Falls back to the last
 *  row (all time) only when the model carries no matching row, which the
 *  model's own contract forbids. */
export function focusPeriod(wi: WorkIntelligence): WorkPeriodTotals {
  return (
    wi.periods.find((p) => p.key === wi.scope) ??
    wi.periods.find((p) => p.key === wi.focus) ??
    wi.periods[wi.periods.length - 1]!
  );
}

/** The scope the figures are named by, in words the surface translates:
 *  a tab key, or the explicit window's two days. */
export type ScopeWords =
  | { readonly kind: Exclude<WorkPeriodScope, "range"> }
  | { readonly kind: "range"; readonly startIso: string; readonly endIso: string };

export function scopeWords(wi: WorkIntelligence): ScopeWords {
  if (wi.scope === "range" && wi.focusRange) {
    return { kind: "range", startIso: wi.focusRange.startIso, endIso: wi.focusRange.endIso };
  }
  return { kind: wi.focus };
}

/** One output the skill's own kind of work completed, in its recorded unit. */
export type SkillOutputView = {
  readonly unit: string;
  readonly value: number;
  readonly entries: number;
};

/** One skill row as the station and the summary render it. */
export type SkillRowView = {
  readonly skillId: string;
  readonly slug: string;
  /** Catalogue name, or null when the locale has none (the row is then
   *  dropped by the caller — a raw slug never reaches the person). */
  readonly name: string | null;
  readonly tier: EvidenceTier;
  /** ATTRIBUTABLE PRACTICE hours — the figure the share is a fraction of. */
  readonly attributedHours: number;
  /** Share of the person's own attributed hours, 0..1. */
  readonly share: number;
  /** `shareBarWidth(share)`. */
  readonly barWidth: number;
  /** Hours on entries this skill shares with others — involvement, never
   *  summed into anything. */
  readonly sharedHours: number;
  readonly confirmedHours: number;
  /** confirmedHours / attributedHours, or null when there are no
   *  attributed hours to be a share of (NOT_MEASURED, not 0). */
  readonly confirmationShare: number | null;
  readonly entries: number;
  readonly days: number;
  readonly contexts: number;
  readonly firstWorkedDay: string | null;
  readonly lastWorkedDay: string | null;
  readonly trend: WorkTrend;
  /** Outputs whose kind of work is THIS skill (the activity key equals the
   *  skill slug — the intake's strong skill reading); empty otherwise. */
  readonly outputs: readonly SkillOutputView[];
  /** true when at least one attributed hour reached the skill. */
  readonly measured: boolean;
  /** true when the skill has only involvement hours (no attributable ones). */
  readonly involvedOnly: boolean;
  /** true when entries back the skill but none carries a duration. */
  readonly untimed: boolean;
};

const outputsFor = (outputs: readonly OutputTotal[], slug: string): SkillOutputView[] =>
  outputs
    .filter((o) => o.activity === slug)
    .map((o) => ({ unit: o.unit, value: o.value, entries: o.entries }));

function toRow(s: SkillWorkTime, wi: WorkIntelligence, name: string | null): SkillRowView {
  const measured = s.attributedHours > 0;
  return {
    skillId: s.skillId,
    slug: s.slug,
    name,
    tier: s.tier,
    attributedHours: s.attributedHours,
    share: s.share,
    barWidth: shareBarWidth(s.share),
    sharedHours: s.sharedHours,
    confirmedHours: s.confirmedHours,
    confirmationShare: measured ? Math.min(1, s.confirmedHours / s.attributedHours) : null,
    entries: s.entries,
    days: s.days,
    contexts: s.contexts,
    firstWorkedDay: s.firstWorkedDay,
    lastWorkedDay: s.lastWorkedDay,
    trend: s.trend,
    outputs: outputsFor(wi.outputs, s.slug),
    measured,
    involvedOnly: !measured && s.sharedHours > 0,
    untimed: !measured && s.sharedHours <= 0 && s.entries > 0,
  };
}

/**
 * The evidenced skills — every row an entry backs (attributed, involved or
 * untimed) — sorted by share desc, then attributed hours, then involvement,
 * then entries, then slug. A LISTING order over the person's own hours,
 * never a ranking of the person. Declared-only skills (0 entries) are not
 * rows here: they are the growth reading's `self_stated` kind.
 */
export function skillRows(
  wi: WorkIntelligence,
  skillName: (slug: string) => string | null,
): SkillRowView[] {
  return wi.skills
    .filter((s) => s.attributedHours > 0 || s.sharedHours > 0 || s.entries > 0)
    .map((s) => toRow(s, wi, skillName(s.slug)))
    .sort(
      (a, b) =>
        b.share - a.share ||
        b.attributedHours - a.attributedHours ||
        b.sharedHours - a.sharedHours ||
        b.entries - a.entries ||
        a.slug.localeCompare(b.slug),
    );
}

/** The one row that answers the question — the largest share of attributed
 *  hours — or null when no hour was attributed to any skill (then the
 *  surface says so in words; it never promotes an untimed row to "largest"). */
export function dominantSkill(rows: readonly SkillRowView[]): SkillRowView | null {
  const first = rows[0];
  return first && first.measured && first.share > 0 ? first : null;
}

/** What the lead sentence can say, decided from the model, not guessed. */
export type DominantAnswer =
  | { readonly kind: "unknown" }
  | { readonly kind: "no_entries" }
  | { readonly kind: "period_empty" }
  | { readonly kind: "untimed"; readonly entries: number }
  | { readonly kind: "dominant"; readonly row: SkillRowView };

export function dominantAnswer(
  wi: WorkIntelligence | null | undefined,
  rows: readonly SkillRowView[],
): DominantAnswer {
  const state = numbersState(wi);
  if (state === "unknown") return { kind: "unknown" };
  if (state === "no_entries") return { kind: "no_entries" };
  const period = focusPeriod(wi!);
  if (period.entries === 0) return { kind: "period_empty" };
  const row = dominantSkill(rows);
  if (row) return { kind: "dominant", row };
  return { kind: "untimed", entries: period.entries };
}

/** The organization's ledger row for the same scope, or the honest states:
 *  `unknown` (the ledger could not be read), `none` (read, nothing recorded
 *  all time). Never summed with anything. */
export type OrgLedgerView =
  | { readonly kind: "unknown" }
  | { readonly kind: "none" }
  | {
      readonly kind: "rows";
      readonly period: OrganizationRecordTotals;
      readonly all: OrganizationRecordTotals;
    };

export function orgLedger(wi: WorkIntelligence): OrgLedgerView {
  const records = wi.organizationRecords;
  if (records === null) return { kind: "unknown" };
  const all = records.find((p) => p.key === "all") ?? null;
  const period = records.find((p) => p.key === wi.scope) ?? records.find((p) => p.key === wi.focus) ?? null;
  if (!all || !period) return { kind: "none" };
  if (all.hours <= 0 && all.rejectedHours <= 0) return { kind: "none" };
  return { kind: "rows", period, all };
}

/** Open checks first (they need a decision), acknowledged after — both kept
 *  visible; an acknowledgement never hides a check. */
export function splitChecks<T extends { acknowledged: unknown }>(
  checks: readonly T[],
): { open: T[]; acked: T[] } {
  return {
    open: checks.filter((c) => c.acknowledged === null),
    acked: checks.filter((c) => c.acknowledged !== null),
  };
}
