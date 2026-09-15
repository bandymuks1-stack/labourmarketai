import type { GrowthDirection, GrowthReading } from "@/lib/journal/growth-reading";
import type { WorkIntelligence, WorkPeriodTotals } from "@/lib/journal/work-intelligence";
import type { WorkTimeCheck } from "@/lib/journal/work-time-plausibility";
import type { OpportunitiesResultView } from "@/lib/marketplace/worker-opportunities-contract";
import { deriveFitBand, isAssessedFit, type FitBand } from "@/lib/opportunities/fit-band";
import type { WorkCardDerived, WorkDim } from "@/lib/worker/work-card-state";

/**
 * ŠIANDIEN — the PURE composition model behind the worker's home
 * (`docs/design/final/01-WORKER-MOBILE-IA-2026-09-13.md` §2, §5).
 *
 * WHAT THIS IS NOT. It is not a second priority engine, not a second hour
 * ledger and not a second fit engine. Every figure is lifted from a model a
 * canonical reader already produced:
 *
 *   next action        ← `deriveWorkCardState` (`lib/worker/work-card-state`)
 *   today / this week  ← `WorkIntelligence.periods` (`loadOwnWorkIntelligence`)
 *   open items         ← the same model's untimed / unlabelled counts and
 *                        its plausibility `checks`
 *   growth             ← `deriveGrowthReading(...).directions[0]`
 *   opportunities      ← the rows `loadOpportunitiesResultAction` already
 *                        projects, banded by `deriveFitBand`
 *
 * This module only decides what ONE screen says about them, and it says
 * UNKNOWN whenever a reader answered `null` (SEP-7: UNKNOWN ≠ ZERO — a
 * journal that could not be read is never "0 h today").
 *
 * Pure and deterministic: no IO, no `Date`, no locale.
 */

export type TodayState =
  | { readonly kind: "recorded"; readonly entries: number; readonly hours: number }
  | { readonly kind: "nothing" }
  | { readonly kind: "unknown" };

export type TodayNext =
  | {
      readonly kind: "action";
      readonly dim: WorkDim;
      /** A real route. Inline card dimensions (availability / location /
       *  pay) open the work-card editor's canonical home — the player-card
       *  result — rather than a route that does not exist. */
      readonly href: string;
      /** i18n key under `auth.dashboard.workCard` (`why.<dim>` / `why.complete`). */
      readonly whyKey: string;
      /** Whether the card is stale (a calm "does this still hold?"). */
      readonly stale: boolean;
    }
  | { readonly kind: "unknown" };

export type TodayPeriodFigures = {
  readonly hours: number;
  readonly entries: number;
  /** Entries counted but not timed — a figure is still owed. */
  readonly untimed: number;
};

export type TodayWork =
  | {
      readonly kind: "known";
      readonly today: TodayPeriodFigures;
      readonly week: TodayPeriodFigures;
      /** The read stopped at its ceiling — the figures are "from the last N
       *  entries", never posed as a total. */
      readonly truncated: boolean;
    }
  | { readonly kind: "unknown" };

export type TodayOpenItem =
  | { readonly kind: "untimed"; readonly entries: number }
  | { readonly kind: "unlabelled"; readonly entries: number }
  | { readonly kind: "check"; readonly check: WorkTimeCheck };

export type TodayOpenItems =
  | { readonly kind: "known"; readonly items: readonly TodayOpenItem[] }
  | { readonly kind: "unknown" };

export type TodayGrowth =
  | { readonly kind: "direction"; readonly direction: GrowthDirection }
  /** Fewer than two evidenced skills — the reading says so, never guesses. */
  | { readonly kind: "insufficient" }
  /** Enough evidence, but no kind fired. */
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

export type TodayOpportunity =
  | {
      readonly kind: "bands";
      /** Rows per band over the rows the reader returned (its shown slice). */
      readonly counts: Readonly<Record<FitBand, number>>;
      /** Rows beyond the shown slice, as the reader counted them. */
      readonly more: number;
      /** Nothing the engine assessed as a fit — "found postings (not yet
       *  assessed)" is the honest heading, never "jobs that fit you". */
      readonly discoveryOnly: boolean;
    }
  | { readonly kind: "none" }
  | { readonly kind: "no-worker" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unknown" };

export type TodayModel = {
  readonly header: {
    readonly displayName: string | null;
    readonly professionSlug: string | null;
    readonly state: TodayState;
  };
  readonly next: TodayNext;
  readonly work: TodayWork;
  readonly openItems: TodayOpenItems;
  readonly growth: TodayGrowth;
  readonly opportunity: TodayOpportunity;
};

/** The canonical home of the inline work-card editor (W3 row 1; pinned by
 *  `wagon4-setup-journey`): the player-card result inside the conversation. */
export const WORK_CARD_EDITOR_HREF = "/dashboard?result=player-card";

/** How many open items ŠIANDIEN lists before pointing at the journal. */
export const MAX_OPEN_ITEMS = 3;

const EMPTY_BANDS: Readonly<Record<FitBand, number>> = {
  strong: 0,
  possible: 0,
  missing_requirement: 0,
  conflict: 0,
  not_assessed: 0,
};

function period(wi: WorkIntelligence, key: "today" | "week"): WorkPeriodTotals | null {
  return wi.periods.find((p) => p.key === key) ?? null;
}

function figures(p: WorkPeriodTotals): TodayPeriodFigures {
  return { hours: p.hours, entries: p.entries, untimed: p.entriesWithoutDuration };
}

export function deriveTodayState(wi: WorkIntelligence | null): TodayState {
  if (!wi) return { kind: "unknown" };
  const today = period(wi, "today");
  if (!today) return { kind: "unknown" };
  if (today.entries === 0) return { kind: "nothing" };
  return { kind: "recorded", entries: today.entries, hours: today.hours };
}

export function deriveTodayNext(card: WorkCardDerived | null): TodayNext {
  if (!card) return { kind: "unknown" };
  return {
    kind: "action",
    dim: card.next.dim,
    href: card.next.href ?? WORK_CARD_EDITOR_HREF,
    whyKey: card.next.whyKey,
    stale: card.state === "stale",
  };
}

export function deriveTodayWork(wi: WorkIntelligence | null): TodayWork {
  if (!wi) return { kind: "unknown" };
  const today = period(wi, "today");
  const week = period(wi, "week");
  if (!today || !week) return { kind: "unknown" };
  return {
    kind: "known",
    today: figures(today),
    week: figures(week),
    truncated: wi.coverage.truncated || wi.coverage.linksTruncated,
  };
}

/**
 * Open items — what still needs a figure, a name or a look. The counts are
 * the model's own (`entriesWithoutDuration` of the week, `unlabelledEntries`)
 * and the checks are the model's plausibility checks that nobody has
 * explained yet. Ordered: untimed, unlabelled, then checks in the model's
 * own order; capped at MAX_OPEN_ITEMS (the journal shows the rest).
 */
export function deriveTodayOpenItems(wi: WorkIntelligence | null): TodayOpenItems {
  if (!wi) return { kind: "unknown" };
  const week = period(wi, "week");
  if (!week) return { kind: "unknown" };
  const items: TodayOpenItem[] = [];
  if (week.entriesWithoutDuration > 0) {
    items.push({ kind: "untimed", entries: week.entriesWithoutDuration });
  }
  if (wi.unlabelledEntries > 0) {
    items.push({ kind: "unlabelled", entries: wi.unlabelledEntries });
  }
  for (const check of wi.checks) {
    if (check.acknowledged !== null) continue;
    items.push({ kind: "check", check });
  }
  return { kind: "known", items: items.slice(0, MAX_OPEN_ITEMS) };
}

export function deriveTodayGrowth(growth: GrowthReading | null): TodayGrowth {
  if (!growth) return { kind: "unknown" };
  if (growth.limitation === "insufficient_skills") return { kind: "insufficient" };
  const direction = growth.directions[0];
  if (!direction) return { kind: "none" };
  return { kind: "direction", direction };
}

/**
 * The opportunity line — band counts over the SAME rows the conversation's
 * result renders. A platform match carries the engine's status; an external
 * row already carries its band (lane D). No second engine, no re-ranking.
 */
export function deriveTodayOpportunity(
  view: OpportunitiesResultView | null,
): TodayOpportunity {
  if (!view) return { kind: "unknown" };
  if (view.kind === "no-worker") return { kind: "no-worker" };
  if (view.kind === "unavailable") return { kind: "unavailable" };
  if (view.matches.length === 0 && view.external.length === 0) return { kind: "none" };

  const counts: Record<FitBand, number> = { ...EMPTY_BANDS };
  for (const m of view.matches) {
    counts[deriveFitBand({ status: m.fitStatus }).band] += 1;
  }
  for (const row of view.external) {
    counts[row.band] += 1;
  }
  const discoveryOnly =
    view.matches.length === 0 &&
    view.external.length > 0 &&
    view.external.every((row) => !isAssessedFit(row.band));
  const more =
    Math.max(0, view.totalRecommendable - view.matches.length) +
    Math.max(0, view.totalExternal - view.external.length);
  return { kind: "bands", counts, more, discoveryOnly };
}

export function deriveTodayModel(input: {
  readonly displayName: string | null;
  readonly professionSlug: string | null;
  readonly workCard: WorkCardDerived | null;
  readonly workIntelligence: WorkIntelligence | null;
  readonly growth: GrowthReading | null;
  readonly opportunities: OpportunitiesResultView | null;
}): TodayModel {
  return {
    header: {
      displayName: input.displayName?.trim() || null,
      professionSlug: input.professionSlug,
      state: deriveTodayState(input.workIntelligence),
    },
    next: deriveTodayNext(input.workCard),
    work: deriveTodayWork(input.workIntelligence),
    openItems: deriveTodayOpenItems(input.workIntelligence),
    growth: deriveTodayGrowth(input.growth),
    opportunity: deriveTodayOpportunity(input.opportunities),
  };
}
