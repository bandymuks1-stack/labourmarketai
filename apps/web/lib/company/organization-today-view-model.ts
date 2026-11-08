/**
 * The organization's "today" view (`/dashboard/company?view=today`, owner order
 * 2026-11-07: approving work hours must be the easiest thing to find). Pure: the view
 * says what the existing reads answered and adds no number of its own.
 *
 * Four rules this file holds:
 *
 *  - UNKNOWN IS NOT ZERO (SEP-7). A failed read stays null and is said, never a calm 0.
 *  - NOTHING ABOUT ATTENDANCE. `roster` is active links and `absentToday` is approved
 *    recorded absences; no field here says who is working (`organization-today.ts`).
 *  - ONE ORGANIZATION. The reviewable set spans every organization the caller reviews,
 *    so a row is counted here only when it says it belongs here. The rest are named as
 *    waiting elsewhere, never dropped and never approved under the wrong heading.
 *  - THE RPC DECIDES WHO APPROVES. Approve controls exist only for rows the gated set
 *    returned, and not at all for a reader who holds no reviewer relationship here.
 *
 * Hours are summed per unit, and only the certain ones. A total is never built from a
 * figure the reviewer is told to look at closer, and days are never turned into hours.
 */
import type { OrganizationToday } from "@/lib/planning/organization-today";
import {
  organizationApprovalsView,
  type OrganizationApprovalsView,
  type OrganizationEmployeeReview,
} from "@/lib/journal/organization-approvals-model";
import { utcDayKey } from "@/lib/time/display";

/** The cards on this screen. The rest of the queue is one tap away. */
export const TODAY_VIEW_CARDS = 5;
/** `batchQuickConfirm` refuses a larger payload outright. */
export const TODAY_VIEW_BATCH_LIMIT = 50;
/** Bounded RPC argument. Cards and the batch always fit inside it. */
export const TODAY_VIEW_EXCEPTION_READ_LIMIT = 100;

export type TodayViewQueueRow = {
  readonly id: string;
  readonly workerId: string | null;
  readonly workerName: string;
  readonly organizationId: string | null;
  readonly createdAt: string;
  readonly hours: { readonly value: number; readonly unit: string; readonly certain: boolean } | null;
};

export type TodayViewAmount = { readonly unit: string; readonly value: number };

export type TodayViewWorkLoad = {
  readonly entries: number;
  /** Certain figures only, one amount per unit. */
  readonly amounts: readonly TodayViewAmount[];
  /** Entries whose stored figure the canonical rule could not settle. */
  readonly unclear: number;
  /** Entries with no stored duration: the reviewer reads the text. */
  readonly noHours: number;
};

export type TodayViewPerson = TodayViewWorkLoad & {
  readonly key: string;
  readonly name: string;
  /** What the batch review reported on this person's entries. Absence says nothing. */
  readonly exceptions: readonly string[];
};

export type TodayViewApprovals<R> = {
  readonly state: "unreadable" | "not-reviewer" | "waiting" | "empty";
  /** The size of the queue for THIS organization. Null: it cannot be read. */
  readonly waiting: number | null;
  readonly people: readonly TodayViewPerson[];
  readonly total: TodayViewWorkLoad & { readonly people: number };
  /** The oldest entries, approvable here. Empty for anyone who may not review. */
  readonly cards: readonly R[];
  /** Entries filed today, the batch dialog's candidates (same rule as the quick queue). */
  readonly batch: readonly R[];
  /** Waiting beyond the cards on this screen. */
  readonly moreHere: number;
  /** Waiting for this reader outside this organization, or not shown to this read. */
  readonly elsewhere: number;
  /** Why nothing waits, by the first screen's own rule. */
  readonly reason: OrganizationApprovalsView;
};

export type TodayViewApprovalInput<R> = {
  /** The organization the screen is about. Null: it could not be resolved. */
  readonly organizationId: string | null;
  /** The size of the gated reviewable set. Null: that read failed. */
  readonly reviewable: number | null;
  /** The queue rows. Null: that read failed. */
  readonly queue: readonly R[] | null;
  readonly exceptions: Readonly<Record<string, readonly string[]>>;
  /** Canonical UTC day; the quick queue's batch uses the same one. */
  readonly utcToday: string;
  readonly employees: OrganizationEmployeeReview | null;
  readonly ownUnconfirmed: number | null;
  readonly otherReviewer: boolean | null;
  /** False: the reader holds no reviewer relationship here. Null: that read failed. */
  readonly readerReviews: boolean | null;
};

const isFiledOn = (row: { readonly createdAt: string }, day: string) => utcDayKey(row.createdAt) === day;

/** Sums cannot carry float dust onto a screen a manager signs off. */
const roundAmount = (value: number) => Math.round(value * 100) / 100;

function workLoadOf(rows: readonly TodayViewQueueRow[]): TodayViewWorkLoad {
  const amounts = new Map<string, number>();
  let unclear = 0;
  let noHours = 0;
  for (const row of rows) {
    if (row.hours === null) noHours += 1;
    else if (!row.hours.certain) unclear += 1;
    else amounts.set(row.hours.unit, (amounts.get(row.hours.unit) ?? 0) + row.hours.value);
  }
  return {
    entries: rows.length,
    amounts: [...amounts].map(([unit, value]) => ({ unit, value: roundAmount(value) })),
    unclear,
    noHours,
  };
}

function peopleOf(
  rows: readonly TodayViewQueueRow[],
  exceptions: Readonly<Record<string, readonly string[]>>,
): TodayViewPerson[] {
  const byPerson = new Map<string, TodayViewQueueRow[]>();
  for (const row of rows) {
    // A row with no worker stands alone: unreadable is not one shared person.
    const key = row.workerId ?? `entry:${row.id}`;
    byPerson.set(key, [...(byPerson.get(key) ?? []), row]);
  }
  return [...byPerson].map(([key, own]) => ({
    key,
    name: own[0]!.workerName,
    ...workLoadOf(own),
    exceptions: [...new Set(own.flatMap((row) => exceptions[row.id] ?? []))],
  }));
}

/** The rows that belong to this organization. A row that does not say stays out. */
export function rowsOfOrganization<R extends TodayViewQueueRow>(
  organizationId: string | null,
  queue: readonly R[],
): readonly R[] {
  return organizationId === null ? [] : queue.filter((row) => row.organizationId === organizationId);
}

/** Which entries to ask the batch review about: the cards and the batch first. */
export function exceptionReadIds<R extends TodayViewQueueRow>(rows: readonly R[], utcToday: string): string[] {
  const first = [...rows.slice(0, TODAY_VIEW_CARDS), ...rows.filter((row) => isFiledOn(row, utcToday))];
  return [...new Set([...first, ...rows].map((row) => row.id))].slice(0, TODAY_VIEW_EXCEPTION_READ_LIMIT);
}

export function todayViewApprovals<R extends TodayViewQueueRow>(input: TodayViewApprovalInput<R>): TodayViewApprovals<R> {
  const { organizationId, reviewable, queue, exceptions, utcToday } = input;
  const reason = organizationApprovalsView({
    pending: reviewable,
    employees: input.employees,
    ownUnconfirmed: input.ownUnconfirmed,
    otherReviewer: input.otherReviewer,
  });
  const unreadable = reviewable === null || queue === null || organizationId === null;
  const here = unreadable ? [] : rowsOfOrganization(organizationId, queue);
  const mayReview = input.readerReviews !== false;
  const shown = mayReview ? here : [];
  // Rows the set counted but the row read did not return are not zero either.
  const unshown = unreadable ? 0 : Math.max(0, reviewable - queue.length);
  const elsewhere = unreadable ? 0 : queue.length - here.length + unshown;
  const cards = shown.slice(0, TODAY_VIEW_CARDS);
  const people = peopleOf(shown, exceptions);

  return {
    state: unreadable ? "unreadable" : !mayReview ? "not-reviewer" : shown.length > 0 ? "waiting" : "empty",
    waiting: unreadable || !mayReview ? null : shown.length,
    people,
    total: { ...workLoadOf(shown), people: people.length },
    cards,
    batch: shown.filter((row) => isFiledOn(row, utcToday)).slice(0, TODAY_VIEW_BATCH_LIMIT),
    moreHere: shown.length - cards.length,
    elsewhere,
    reason,
  };
}

export type TodayViewFact = { readonly key: "roster" | "journalToday"; readonly value: number | null };

export type TodayViewFacts = {
  /** False: not one of today's reads answered, and the section says so as a whole. */
  readonly readable: boolean;
  readonly facts: readonly TodayViewFact[];
  readonly absentToday: Extract<OrganizationToday, { applied: true }>["absentToday"];
  readonly absentNext: Extract<OrganizationToday, { applied: true }>["absentNext7"];
};

export function todayViewFacts(today: OrganizationToday): TodayViewFacts {
  if (!today.applied) {
    return {
      readable: false,
      facts: [
        { key: "roster", value: null },
        { key: "journalToday", value: null },
      ],
      absentToday: null,
      absentNext: null,
    };
  }
  return {
    readable: true,
    facts: [
      { key: "roster", value: today.roster },
      { key: "journalToday", value: today.journalEntriesToday },
    ],
    absentToday: today.absentToday,
    absentNext: today.absentNext7,
  };
}

export type TodayViewDecisionKey = "absences" | "clientReview" | "reviewOff" | "conflicts" | "invitations" | "claims";

const DECISION_DOORS: Readonly<Record<TodayViewDecisionKey, string>> = {
  absences: "/dashboard/absences",
  clientReview: "/dashboard/inbox/counterparty",
  reviewOff: "/dashboard/company/people#org-members",
  conflicts: "/dashboard/company/planning#roster-timeline",
  invitations: "/dashboard/company/people#company-invitations",
  claims: "/dashboard/company/needs#company-claims",
};

export type TodayViewDecisions = {
  readonly items: readonly { readonly key: TodayViewDecisionKey; readonly count: number; readonly href: string }[];
  /** Listed apart as "could not be read", never dropped as nothing waiting. */
  readonly unread: readonly TodayViewDecisionKey[];
  /** Only when every read answered and found nothing. */
  readonly clear: boolean;
};

/** The first screen's decision counts, minus the hours: those lead this screen. */
export function todayViewDecisions(counts: Readonly<Record<TodayViewDecisionKey, number | null>>): TodayViewDecisions {
  const keys = Object.keys(DECISION_DOORS) as TodayViewDecisionKey[];
  const items = keys.flatMap((key) => {
    const count = counts[key];
    return count !== null && count > 0 ? [{ key, count, href: DECISION_DOORS[key] }] : [];
  });
  const unread = keys.filter((key) => counts[key] === null);
  return { items, unread, clear: items.length === 0 && unread.length === 0 };
}

/** The invitation read's answer as the count the decisions take. */
export function pendingInvitationCount(
  read: { readonly kind: "ok"; readonly rows: readonly { readonly status: string }[] } | { readonly kind: string } | null,
): number | null {
  if (read === null || read.kind !== "ok" || !("rows" in read)) return null;
  return read.rows.filter((row) => row.status === "pending").length;
}
