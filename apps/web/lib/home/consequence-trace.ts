import type { ConfirmedWorkCount } from "@/lib/evidence/confirmed-work-read";
import { deriveConfirmedWorkTier, type ConfirmedWorkTier } from "@/lib/evidence/evidence-tier";
import {
  deriveIndependentReviewResult,
  deriveReviewTimeline,
  isSelfConfirmedOnly,
  type ConfirmationRow,
  type ReviewDecision,
} from "@/lib/journal/review-status";
import { deriveEntryWorkTime, type WorkTimeMetricRow } from "@/lib/journal/work-time";
import {
  notificationEventHref,
  notificationRenderedType,
  type NotificationEventRow,
} from "@/lib/notifications/events";

import { CAUSAL_CHAINS } from "./home-state";

/**
 * THE CONSEQUENCE TRACE — "what I did → what changed → what it opened",
 * the ONE read-only chain every Future Experience surface draws (home,
 * Living CV journey, team arena; owner decision 2026-10-14, A+B+C).
 *
 * It EXTENDS the home's "because" region (`home-state.ts`), it does not
 * replace or duplicate it:
 *
 *   journal chains   a recent journal entry of the person's own, walked
 *                    through the facts the canonical readers already hold:
 *                      recorded (fact)  ← `deriveEntryWorkTime`
 *                      → review (fact, or "waiting" — pending, never implied)
 *                                      ← `deriveReviewTimeline`
 *                      → Living CV (derived, ONLY when someone other than the
 *                        person approved it — `deriveIndependentReviewResult`)
 *                                      ← the entry's own skill links + the
 *                                        confirmed-work counts per skill
 *                      → matching (derived: the skills matching now reads as
 *                        confirmed work — `deriveConfirmedWorkTier`, the SAME
 *                        tier `match-v1` reads)
 *   state chains     the closed `CAUSAL_CHAINS` set from the home model —
 *                    the event's own fact IS the state change.
 *
 * HONESTY (each rule pinned by `consequence-trace.test.ts`):
 *   - A step is drawn only when its fact exists. "Waiting for review" is a
 *     pending step, never a confirmation. A rejected entry or a decision the
 *     person made on their own work never reaches the Living CV step.
 *   - Matching keeps no history. The matching step states what matching
 *     reads NOW for the entry's skills; it never claims "your match changed".
 *   - A reader that could not answer stays UNKNOWN: unreadable skill links or
 *     counts make the Living CV step's `skills` null (named, never "no
 *     skills"); an unreadable journal or feed is flagged, never empty.
 *   - No score, no rank, no figure a reader did not return.
 *
 * Pure and deterministic: no IO, no `Date`, no locale. Copy is resolved by
 * the view from the kinds carried here.
 */

export type TraceBasis = "fact" | "pending" | "derived";

export type TraceSkill = {
  readonly slug: string;
  /** Independently confirmed live entries that show this skill (all time). */
  readonly confirmedEntries: number;
  /** Distinct work days of those entries. */
  readonly confirmedDays: number;
  /** The confirmed-work tier matching reads for this skill. */
  readonly tier: ConfirmedWorkTier;
};

export type TraceStep =
  | {
      readonly kind: "recorded";
      readonly basis: "fact";
      readonly at: string;
      /** The work day (`YYYY-MM-DD`) — the person's stated day, else the save day. */
      readonly day: string;
      /** Timed hours; `null` = the entry carries no hour duration. */
      readonly hours: number | null;
      /** Work recorded in days — kept apart, never converted to hours. */
      readonly dayUnits: number | null;
    }
  | { readonly kind: "awaiting_review"; readonly basis: "pending" }
  | {
      readonly kind: "reviewed";
      readonly basis: "fact";
      readonly decision: ReviewDecision;
      readonly at: string | null;
      /** The reviewer's engagement role as stored, or null. */
      readonly role: string | null;
      /** Written by the auto-confirm policy, not by a hand. */
      readonly automatic: boolean;
      /** Approved, but only by the person themselves — never confirmation. */
      readonly selfOnly: boolean;
    }
  | {
      readonly kind: "living_cv";
      readonly basis: "derived";
      /** `null` = the skill links or counts could not be read (UNKNOWN). */
      readonly skills: readonly TraceSkill[] | null;
      /** The entry is confirmed but tied to no skill yet — its time still
       *  counts as confirmed work; nothing is attributed to a skill. */
      readonly unlinked: boolean;
    }
  | {
      readonly kind: "matching";
      readonly basis: "derived";
      readonly skills: readonly TraceSkill[];
    }
  | {
      readonly kind: "state_change";
      readonly basis: "fact";
      /** i18n key under `homeRegions.chain.consequence`. */
      readonly consequenceKey: string;
      /** i18n key under `homeRegions.chain.state`. */
      readonly stateKey: string;
    };

export type TraceItem = {
  readonly id: string;
  readonly origin: "journal" | "event";
  /** The latest moment in the chain (decision time, else record time). */
  readonly at: string;
  /** Where the source fact lives — an existing route, never a new one. */
  readonly href: string;
  readonly title:
    | { readonly kind: "entry"; readonly text: string }
    /** The bell's own label key (`auth.notifications.types.*`). */
    | { readonly kind: "event"; readonly renderedType: string };
  readonly steps: readonly TraceStep[];
};

export type ConsequenceTrace =
  | {
      readonly kind: "known";
      readonly items: readonly TraceItem[];
      /** The journal could not be read — journal chains are absent for that
       *  reason, never because nothing happened. */
      readonly journalUnknown: boolean;
      /** The notification feed could not be read. */
      readonly eventsUnknown: boolean;
      /** The journal window stopped at its ceiling: chains come from the
       *  newest entries only. */
      readonly truncated: boolean;
    }
  | { readonly kind: "unknown" };

/** One journal entry as the trace needs it (the journal-list core's row). */
export type TraceEntryInput = {
  readonly id: string;
  readonly createdAt: string;
  readonly originalText: string | null;
  readonly metrics: readonly WorkTimeMetricRow[] | null;
  readonly confirmations: readonly ConfirmationRow[] | null;
};

export type ConsequenceTraceInput = {
  /** Newest entries; `null` = the journal read failed. */
  readonly entries: readonly TraceEntryInput[] | null;
  readonly entriesTruncated: boolean;
  /** The person's profile id — "confirmed" excludes their own decisions. */
  readonly subjectProfileId: string | null;
  /** entry id → linked skill slugs; `null` = unread / failed. */
  readonly skillLinks: ReadonlyMap<string, readonly string[]> | null;
  /** skill slug → independently confirmed work; `null` = unread / failed. */
  readonly confirmedWork: ReadonlyMap<string, ConfirmedWorkCount> | null;
  /** The person's notification feed; `null` = unavailable. */
  readonly events: readonly NotificationEventRow[] | null;
  /** Chains whose latest moment is older than this ISO instant are left out. */
  readonly sinceIso: string;
  /** How many chains to return (newest first). */
  readonly limit?: number;
};

export const TRACE_DEFAULT_LIMIT = 6;
/** The journal's own route — the entry is one tap from its chain. */
export const TRACE_JOURNAL_HREF = "/dashboard/journal";

const UNKNOWN = { kind: "unknown" } as const;

function firstLine(text: string | null): string {
  const line = String(text ?? "").trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > 90 ? `${line.slice(0, 89)}…` : line;
}

function latest(a: string, b: string | null): string {
  return b && b > a ? b : a;
}

function traceSkills(
  slugs: readonly string[],
  confirmedWork: ReadonlyMap<string, ConfirmedWorkCount>,
): TraceSkill[] {
  return [...new Set(slugs)].sort().map((slug) => {
    const counts = confirmedWork.get(slug);
    return {
      slug,
      confirmedEntries: counts?.confirmedWorkEntries ?? 0,
      confirmedDays: counts?.confirmedDays ?? 0,
      tier: deriveConfirmedWorkTier(counts),
    };
  });
}

/** One entry's chain. Exported for the Living CV journey (F3), which walks
 *  the same steps per stop. */
export function traceJournalEntry(
  entry: TraceEntryInput,
  ctx: Pick<ConsequenceTraceInput, "subjectProfileId" | "skillLinks" | "confirmedWork">,
): TraceItem {
  const wt = deriveEntryWorkTime({
    entryId: entry.id,
    createdAt: entry.createdAt,
    originalText: entry.originalText,
    metrics: entry.metrics ?? [],
  });
  const steps: TraceStep[] = [
    {
      kind: "recorded",
      basis: "fact",
      at: entry.createdAt,
      day: wt.day,
      hours: wt.totalHours > 0 ? wt.totalHours : null,
      dayUnits: wt.totalDayUnits > 0 ? wt.totalDayUnits : null,
    },
  ];
  let at = entry.createdAt;

  const timeline = deriveReviewTimeline(entry.confirmations);
  const last = timeline[timeline.length - 1];
  if (!last) {
    steps.push({ kind: "awaiting_review", basis: "pending" });
  } else {
    at = latest(at, last.at);
    steps.push({
      kind: "reviewed",
      basis: "fact",
      decision: last.result,
      at: last.at,
      role: last.role,
      automatic: last.automatic,
      selfOnly: isSelfConfirmedOnly(entry.confirmations, ctx.subjectProfileId),
    });
    const confirmed =
      deriveIndependentReviewResult(entry.confirmations, ctx.subjectProfileId) === "approved";
    if (confirmed) {
      const slugs = ctx.skillLinks?.get(entry.id) ?? null;
      if (ctx.skillLinks === null || ctx.confirmedWork === null) {
        steps.push({ kind: "living_cv", basis: "derived", skills: null, unlinked: false });
      } else if (!slugs || slugs.length === 0) {
        steps.push({ kind: "living_cv", basis: "derived", skills: [], unlinked: true });
      } else {
        const skills = traceSkills(slugs, ctx.confirmedWork);
        steps.push({ kind: "living_cv", basis: "derived", skills, unlinked: false });
        const matched = skills.filter((s) => s.tier !== "none");
        if (matched.length > 0) steps.push({ kind: "matching", basis: "derived", skills: matched });
      }
    }
  }

  return {
    id: `journal:${entry.id}`,
    origin: "journal",
    at,
    href: TRACE_JOURNAL_HREF,
    title: { kind: "entry", text: firstLine(entry.originalText) },
    steps,
  };
}

export function deriveConsequenceTrace(input: ConsequenceTraceInput): ConsequenceTrace {
  if (input.entries === null && input.events === null) return UNKNOWN;
  const items: TraceItem[] = [];
  const tracedEntryIds = new Set<string>();

  for (const entry of input.entries ?? []) {
    const item = traceJournalEntry(entry, input);
    if (item.at < input.sinceIso) continue;
    items.push(item);
    tracedEntryIds.add(entry.id);
  }

  for (const e of input.events ?? []) {
    // The journal chain already tells this decision with its consequence.
    if (e.eventType === "journal_review_decided" && tracedEntryIds.has(e.entityId)) continue;
    const chain = CAUSAL_CHAINS[e.eventType];
    if (!chain || e.createdAt < input.sinceIso) continue;
    items.push({
      id: `event:${e.id}`,
      origin: "event",
      at: e.createdAt,
      href: notificationEventHref(e.entityType, e.metadata) ?? "/dashboard/activity",
      title: { kind: "event", renderedType: notificationRenderedType(e.eventType, e.metadata) },
      steps: [
        {
          kind: "state_change",
          basis: "fact",
          consequenceKey: chain.consequenceKey,
          stateKey: chain.stateKey,
        },
      ],
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
  return {
    kind: "known",
    items: items.slice(0, input.limit ?? TRACE_DEFAULT_LIMIT),
    journalUnknown: input.entries === null,
    eventsUnknown: input.events === null,
    truncated: input.entriesTruncated,
  };
}

/** True when the chain reached the Living CV — the moment the person's work
 *  became confirmed experience (the view's one celebratory state). */
export function traceReachedLivingCv(item: TraceItem): boolean {
  return item.steps.some((s) => s.kind === "living_cv" && s.skills !== null);
}
