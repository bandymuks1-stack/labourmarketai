/**
 * WEEKLY PERSONAL INTELLIGENCE — pure view-model deriver (value train 2, B1).
 *
 * ONE personal intelligence loop (train doctrine): USER STATE → WORK JOURNAL /
 * SKILLS → MARKET STATE → RELEVANT CHANGE → EXPLANATION. This module is the
 * EXPLANATION step as data: given the worker's own weekly journal facts and
 * the SAME recommendation rows the opportunities board already computes, it
 * derives a small, codes-only signal list a surface or the notification
 * dispatcher can localize. It creates no second matching engine and no second
 * journal read — inputs come from `lib/opportunities/recommendations` and the
 * canonical journal window helpers, and every number is carried with its
 * basis, never persisted.
 *
 * HONESTY RULES (binding, tested):
 *  - No fabricated counts: a failed read degrades to an `*_unavailable`
 *    signal — never to a confident zero.
 *  - "New since last week" is OMITTED (not rendered as 0) while the seen
 *    store is absent — an unknowable is not a number.
 *  - Any match count travels with a §19 basis exemplar ("X of Y skills, N
 *    confirmed") — `RecommendationBasis` whole, never a bare %.
 *  - Inactivity copy is factual ("no new work evidence recorded"), never a
 *    manufactured loss claim — the codes here name facts, and the copy layer
 *    is bound to them.
 *
 * Pure. No IO, no env, no server-only. Types only from other pure modules.
 */
import type {
  JobRecommendation,
  RecommendationBasis,
} from "../opportunities/recommendations-model";
import type { JournalReportWindow } from "../journal/journal-window-report";

/** Missing-evidence slugs surfaced at most. */
export const WEEKLY_TOP_MISSING_SKILLS_MAX = 3;

/** The worker's OWN journal facts for the window (entries recorded = rows
 *  with `deleted_at is null` AND `superseded_by is null`, the same filter the
 *  canonical window report applies). */
export interface WeeklyJournalFacts {
  readonly window: JournalReportWindow;
  /** false when the journal read failed — the deriver then degrades. */
  readonly available: boolean;
  readonly entryCount: number;
  /** Entries in the window carrying a manager confirmation. */
  readonly confirmedCount: number;
  readonly lastEntryAtIso: string | null;
}

/** Point-in-time market facts from the canonical recommendations read. */
export interface WeeklyOpportunityFacts {
  /** false when the board read was not authorized / degraded. */
  readonly available: boolean;
  /** Total recommendable matches (the board's own honest count). */
  readonly totalRecommendable: number;
  /** Seen store applied? (worker_opportunity_seen is an owner-gated draft.) */
  readonly seenAvailable: boolean;
  /** Unseen recommendations — meaningful ONLY when `seenAvailable`. */
  readonly newCount: number;
  /** Recommendable demands POSTED in the last 7 days — a market fact that
   *  needs no seen store. Distinct from `newCount` ("new for you"): this is
   *  "appeared this week", and the copy layer must keep that distinction. */
  readonly appearedThisWeekCount: number;
  /** Top recommendations, best first, basis carried whole. */
  readonly top: readonly JobRecommendation[];
}

/** A §19-shaped exemplar: the count's best concrete instance WITH its basis. */
export interface WeeklyMatchExemplar {
  readonly requestId: string;
  readonly roleSlug: string | null;
  readonly basis: RecommendationBasis;
}

/** Codes-only signals — the copy layer localizes; nothing here is free text. */
export type WeeklyIntelligenceSignal =
  | { readonly code: "journal_active"; readonly entries: number; readonly confirmed: number }
  | { readonly code: "journal_inactive" }
  | { readonly code: "journal_unavailable" }
  | {
      readonly code: "matching_opportunities";
      readonly count: number;
      readonly exemplar: WeeklyMatchExemplar | null;
    }
  | { readonly code: "no_matching_opportunities" }
  | { readonly code: "opportunities_unavailable" }
  /** Present ONLY when the seen store is applied and the count is positive. */
  | { readonly code: "new_opportunities"; readonly count: number }
  /** Demands posted in the trailing 7 days ("appeared this week" — a market
   *  fact, NEVER phrased as "new since you last looked"). */
  | { readonly code: "appeared_this_week"; readonly count: number }
  /** Evidence gaps in the CURRENT top matches (context-bound, §19). */
  | { readonly code: "missing_evidence"; readonly skillSlugs: readonly string[] };

export interface WeeklyPersonalIntelligence {
  readonly window: JournalReportWindow;
  /** `weekly_digest:<ISO week>` — the idempotency key a weekly send dedupes
   *  on (UNIQUE (recipient, dedupe_key) makes re-runs exactly-once). */
  readonly dedupeKey: string;
  readonly journal: WeeklyJournalFacts;
  readonly opportunities: WeeklyOpportunityFacts;
  readonly signals: readonly WeeklyIntelligenceSignal[];
}

/**
 * ISO-8601 week of a UTC day, e.g. "2026-W34". The Thursday of a week decides
 * its ISO year, so year boundaries land whole weeks on one side.
 */
export function isoWeekKey(dayIso: string): string {
  const d = new Date(`${dayIso}T00:00:00.000Z`);
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** The one weekly idempotency key (decided here so every consumer agrees). */
export function weeklyDigestDedupeKey(dayIso: string): string {
  return `weekly_digest:${isoWeekKey(dayIso)}`;
}

/**
 * Distinct missing-skill slugs across the top recommendations, in basis
 * order, capped. Context-bound by construction: these are the gaps of the
 * worker's CURRENT top matches, not a global deficiency statement.
 */
export function topMissingEvidenceSlugs(
  top: readonly JobRecommendation[],
  max: number = WEEKLY_TOP_MISSING_SKILLS_MAX,
): readonly string[] {
  const out: string[] = [];
  for (const rec of top) {
    for (const slug of rec.missingSkillSlugs) {
      if (!out.includes(slug)) out.push(slug);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function deriveWeeklyPersonalIntelligence(
  journal: WeeklyJournalFacts,
  opportunities: WeeklyOpportunityFacts,
): WeeklyPersonalIntelligence {
  const signals: WeeklyIntelligenceSignal[] = [];

  if (!journal.available) {
    signals.push({ code: "journal_unavailable" });
  } else if (journal.entryCount === 0) {
    signals.push({ code: "journal_inactive" });
  } else {
    signals.push({
      code: "journal_active",
      entries: journal.entryCount,
      confirmed: journal.confirmedCount,
    });
  }

  if (!opportunities.available) {
    signals.push({ code: "opportunities_unavailable" });
  } else if (opportunities.totalRecommendable === 0) {
    signals.push({ code: "no_matching_opportunities" });
  } else {
    const best = opportunities.top[0];
    signals.push({
      code: "matching_opportunities",
      count: opportunities.totalRecommendable,
      exemplar: best
        ? { requestId: best.requestId, roleSlug: best.roleSlug, basis: best.basis }
        : null,
    });
    if (opportunities.seenAvailable && opportunities.newCount > 0) {
      signals.push({ code: "new_opportunities", count: opportunities.newCount });
    }
    if (opportunities.appearedThisWeekCount > 0) {
      signals.push({
        code: "appeared_this_week",
        count: opportunities.appearedThisWeekCount,
      });
    }
    const missing = topMissingEvidenceSlugs(opportunities.top);
    if (missing.length > 0) {
      signals.push({ code: "missing_evidence", skillSlugs: missing });
    }
  }

  return {
    window: journal.window,
    dedupeKey: weeklyDigestDedupeKey(journal.window.endIso),
    journal,
    opportunities,
    signals,
  };
}
