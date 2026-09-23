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

/**
 * WHAT IS WAITING ON THE PERSON outside the journal — a booking offer they
 * have not answered, an invitation addressed to them, a conversation with a
 * message they have not read. Each figure is the domain reader's OWN count
 * (`listMyBookings`, `listInvitationsAddressedToMe`,
 * `getUnreadConversationIds`); `null` means that reader could not answer
 * (SEP-7: UNKNOWN ≠ ZERO — a failed read is never "nothing waiting").
 */
export type TodayAttention = {
  /** Booking offers proposed TO the person, still unanswered. */
  readonly offers: number | null;
  /** Pending invitations addressed to the person (both invitation systems). */
  readonly invitations: number | null;
  /** Unread conversations; `onlyId` when exactly one, so the door opens it. */
  readonly unread: { readonly count: number; readonly onlyId: string | null } | null;
};

export type TodayDoorKind = "offers" | "invitations" | "unread";

/** The EXISTING doors each attention item opens — no new route. */
export const TODAY_DOOR_HREFS: Readonly<Record<TodayDoorKind, string>> = {
  offers: "/dashboard/bookings",
  invitations: "/dashboard/network",
  unread: "/dashboard/communication",
};

export type TodayOpenItem =
  | { readonly kind: "offers"; readonly count: number; readonly href: string }
  | { readonly kind: "invitations"; readonly count: number; readonly href: string }
  | { readonly kind: "unread"; readonly count: number; readonly href: string }
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
 * The doors — one item per kind of thing waiting on the person, in the order
 * someone else is waiting: an offer to answer, an invitation to answer, a
 * message to read. A reader that answered `null` contributes NO item (the
 * section names it as unread through a data attribute); a reader that
 * answered 0 contributes no item either — nothing is waiting.
 */
export function deriveTodayDoors(attention: TodayAttention | null): TodayOpenItem[] {
  if (!attention) return [];
  const items: TodayOpenItem[] = [];
  if (attention.offers !== null && attention.offers > 0) {
    items.push({ kind: "offers", count: attention.offers, href: TODAY_DOOR_HREFS.offers });
  }
  if (attention.invitations !== null && attention.invitations > 0) {
    items.push({
      kind: "invitations",
      count: attention.invitations,
      href: TODAY_DOOR_HREFS.invitations,
    });
  }
  if (attention.unread !== null && attention.unread.count > 0) {
    items.push({
      kind: "unread",
      count: attention.unread.count,
      href: attention.unread.onlyId
        ? `${TODAY_DOOR_HREFS.unread}/${attention.unread.onlyId}`
        : TODAY_DOOR_HREFS.unread,
    });
  }
  return items;
}

/** Which attention readers could not answer — named, never rendered as 0. */
export function unknownTodayDoors(attention: TodayAttention | null): TodayDoorKind[] {
  if (!attention) return ["offers", "invitations", "unread"];
  const out: TodayDoorKind[] = [];
  if (attention.offers === null) out.push("offers");
  if (attention.invitations === null) out.push("invitations");
  if (attention.unread === null) out.push("unread");
  return out;
}

/**
 * Open items — what still needs an answer, a figure, a name or a look.
 *
 * First the DOORS (`deriveTodayDoors`): someone else is waiting, and no
 * other place on ŠIANDIEN says so. Then the journal's own: the counts are the
 * model's (`entriesWithoutDuration` of the week, `unlabelledEntries`) and
 * the checks are the model's plausibility checks that nobody has explained
 * yet. Ordered: untimed, unlabelled, then checks in the model's own order;
 * the journal part is capped at MAX_OPEN_ITEMS (the journal shows the rest);
 * the doors are never capped — there is no "rest" surface for them.
 *
 * A journal that could not be read is `unknown` — unless a door is open, in
 * which case the door is still shown (the work block already says the
 * journal could not be read).
 */
export function deriveTodayOpenItems(
  wi: WorkIntelligence | null,
  attention: TodayAttention | null = null,
): TodayOpenItems {
  const doors = deriveTodayDoors(attention);
  const week = wi ? period(wi, "week") : null;
  if (!wi || !week) {
    return doors.length > 0 ? { kind: "known", items: doors } : { kind: "unknown" };
  }
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
  return { kind: "known", items: [...doors, ...items.slice(0, MAX_OPEN_ITEMS)] };
}

export function deriveTodayGrowth(growth: GrowthReading | null): TodayGrowth {
  if (!growth) return { kind: "unknown" };
  if (growth.limitation === "insufficient_skills") return { kind: "insufficient" };
  const direction = growth.directions[0];
  if (!direction) return { kind: "none" };
  return { kind: "direction", direction };
}

/**
 * "TUŠČIA = TVARKINGA" for the growth line (design system §A.8, owner §20:
 * the home shows what matters now). A line that has nothing to say about the
 * person is left out rather than stated: "a growth reading needs at least two
 * skills" (`insufficient`) and "no clear direction yet" (`none`) are the
 * reading being EMPTY, not a fact about the person's work. What stays:
 *   · `direction` — the reading itself;
 *   · `unknown`   — a read that FAILED is named, never silently dropped
 *                   (SEP-7: UNKNOWN ≠ ZERO — an absent line would read as
 *                   "nothing to see", which the product does not know).
 * The destination is one tap away either way: the "numbers" station.
 */
export function isTodayGrowthShown(
  growth: TodayGrowth,
): growth is Extract<TodayGrowth, { kind: "direction" | "unknown" }> {
  return growth.kind === "direction" || growth.kind === "unknown";
}

/**
 * The same rule for the opportunity line. `none` (no postings) and
 * `no-worker` (no worker row yet — ŠIANDIEN's ONE next action already leads
 * there) are the line being empty; `bands` is the reading, and `unavailable`
 * / `unknown` are a source that could not answer — named, never read as
 * "nothing for you". The destination stays one tap away: the "world" station.
 */
export function isTodayOpportunityShown(
  opportunity: TodayOpportunity,
): opportunity is Extract<TodayOpportunity, { kind: "bands" | "unavailable" | "unknown" }> {
  return (
    opportunity.kind === "bands" ||
    opportunity.kind === "unavailable" ||
    opportunity.kind === "unknown"
  );
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
  /** Optional: what is waiting on the person (doors). Absent = not read. */
  readonly attention?: TodayAttention | null;
}): TodayModel {
  return {
    header: {
      displayName: input.displayName?.trim() || null,
      professionSlug: input.professionSlug,
      state: deriveTodayState(input.workIntelligence),
    },
    next: deriveTodayNext(input.workCard),
    work: deriveTodayWork(input.workIntelligence),
    openItems: deriveTodayOpenItems(input.workIntelligence, input.attention ?? null),
    growth: deriveTodayGrowth(input.growth),
    opportunity: deriveTodayOpportunity(input.opportunities),
  };
}
