import { describe, expect, it } from "vitest";

import {
  TODAY_VIEW_BATCH_LIMIT,
  TODAY_VIEW_CARDS,
  TODAY_VIEW_EXCEPTION_READ_LIMIT,
  exceptionReadIds,
  pendingInvitationCount,
  rowsOfOrganization,
  todayViewApprovals,
  todayViewDecisions,
  todayViewFacts,
  type TodayViewApprovalInput,
  type TodayViewQueueRow,
} from "./organization-today-view-model";

const ORG = "org-a";
const TODAY = "2026-11-07";

function row(id: string, over: Partial<TodayViewQueueRow> = {}): TodayViewQueueRow {
  return {
    id,
    workerId: "w1",
    workerName: "Tomas",
    organizationId: ORG,
    createdAt: "2026-11-05T08:00:00Z",
    hours: { value: 8, unit: "hours", certain: true },
    ...over,
  };
}

function input(over: Partial<TodayViewApprovalInput<TodayViewQueueRow>> = {}): TodayViewApprovalInput<TodayViewQueueRow> {
  const queue = over.queue === undefined ? [row("e1")] : over.queue;
  return {
    organizationId: ORG,
    reviewable: queue === null ? null : queue.length,
    queue,
    exceptions: {},
    utcToday: TODAY,
    employees: { total: 3, reviewOff: 0 },
    ownUnconfirmed: 0,
    otherReviewer: true,
    readerReviews: true,
    ...over,
  };
}

describe("what waits for approval", () => {
  it("names the people and their hours before anything is approved", () => {
    const view = todayViewApprovals(
      input({
        queue: [
          row("e1", { hours: { value: 8, unit: "hours", certain: true } }),
          row("e2", { hours: { value: 7.1, unit: "hours", certain: true } }),
          row("e3", { workerId: "w2", workerName: "Rasa", hours: { value: 0.2, unit: "hours", certain: true } }),
        ],
      }),
    );
    expect(view.state).toBe("waiting");
    expect(view.waiting).toBe(3);
    expect(view.people.map((p) => [p.name, p.entries, p.amounts])).toEqual([
      ["Tomas", 2, [{ unit: "hours", value: 15.1 }]],
      ["Rasa", 1, [{ unit: "hours", value: 0.2 }]],
    ]);
    expect(view.total.people).toBe(2);
    expect(view.total.amounts).toEqual([{ unit: "hours", value: 15.3 }]);
  });

  it("two people with one name stay two, and an unnamed worker is not one shared person", () => {
    const view = todayViewApprovals(
      input({
        queue: [
          row("e1", { workerId: "w1", workerName: "Jonas" }),
          row("e2", { workerId: "w2", workerName: "Jonas" }),
          row("e3", { workerId: null, workerName: "—" }),
          row("e4", { workerId: null, workerName: "—" }),
        ],
      }),
    );
    expect(view.people).toHaveLength(4);
  });

  it("a total never includes an unclear figure, a missing one, or days turned into hours", () => {
    const view = todayViewApprovals(
      input({
        queue: [
          row("e1"),
          row("e2", { hours: { value: 40, unit: "hours", certain: false } }),
          row("e3", { hours: null }),
          row("e4", { hours: { value: 2, unit: "days", certain: true } }),
        ],
      }),
    );
    expect(view.total.amounts).toEqual([
      { unit: "hours", value: 8 },
      { unit: "days", value: 2 },
    ]);
    expect(view.total.unclear).toBe(1);
    expect(view.total.noHours).toBe(1);
    expect(view.total.entries).toBe(4);
  });

  it("carries what the batch review reported, per person", () => {
    const view = todayViewApprovals(
      input({
        queue: [row("e1"), row("e2"), row("e3", { workerId: "w2", workerName: "Rasa" })],
        exceptions: { e1: ["unusual_hours"], e2: ["unusual_hours", "new_skill"] },
      }),
    );
    expect(view.people[0]!.exceptions).toEqual(["unusual_hours", "new_skill"]);
    expect(view.people[1]!.exceptions).toEqual([]);
  });

  it("puts the oldest entries on cards and counts the rest", () => {
    const queue = Array.from({ length: TODAY_VIEW_CARDS + 2 }, (_, i) => row(`e${i}`));
    const view = todayViewApprovals(input({ queue }));
    expect(view.cards.map((c) => c.id)).toEqual(queue.slice(0, TODAY_VIEW_CARDS).map((c) => c.id));
    expect(view.moreHere).toBe(2);
    expect(view.waiting).toBe(queue.length);
  });

  it("offers only today's filed entries to the batch, within the action's limit", () => {
    const filedToday = Array.from({ length: TODAY_VIEW_BATCH_LIMIT + 3 }, (_, i) =>
      row(`t${i}`, { createdAt: `${TODAY}T07:00:00Z` }),
    );
    const view = todayViewApprovals(input({ queue: [row("old"), ...filedToday] }));
    expect(view.batch).toHaveLength(TODAY_VIEW_BATCH_LIMIT);
    expect(view.batch.some((c) => c.id === "old")).toBe(false);
  });
});

describe("one organization", () => {
  it("another organization's entries are not approved under this heading", () => {
    const view = todayViewApprovals(input({ queue: [row("e1"), row("other", { organizationId: "org-b" })] }));
    expect(view.waiting).toBe(1);
    expect(view.cards.map((c) => c.id)).toEqual(["e1"]);
    expect(view.elsewhere).toBe(1);
  });

  it("a row that does not say which organization it belongs to stays out, and is counted", () => {
    const queue = [row("unknown", { organizationId: null })];
    expect(rowsOfOrganization(ORG, queue)).toEqual([]);
    const view = todayViewApprovals(input({ queue }));
    expect(view.state).toBe("empty");
    expect(view.elsewhere).toBe(1);
  });

  it("entries the set counted but the row read did not return are never silently gone", () => {
    const view = todayViewApprovals(input({ reviewable: 3, queue: [row("e1")] }));
    expect(view.waiting).toBe(1);
    expect(view.elsewhere).toBe(2);
  });
});

describe("unknown is not zero", () => {
  it("a failed count read is not 'nothing waits'", () => {
    const view = todayViewApprovals(input({ reviewable: null, queue: [] }));
    expect(view.state).toBe("unreadable");
    expect(view.waiting).toBeNull();
    expect(view.cards).toEqual([]);
  });

  it("a failed row read offers nothing to approve", () => {
    const view = todayViewApprovals(input({ reviewable: 4, queue: null }));
    expect(view.state).toBe("unreadable");
    expect(view.waiting).toBeNull();
    expect(view.cards).toEqual([]);
    expect(view.batch).toEqual([]);
    expect(view.elsewhere).toBe(0);
  });

  it("an organization that cannot be resolved cannot be said to have nothing waiting", () => {
    const view = todayViewApprovals(input({ organizationId: null }));
    expect(view.state).toBe("unreadable");
    expect(view.waiting).toBeNull();
  });

  it("a genuinely empty queue is the only empty state", () => {
    const view = todayViewApprovals(input({ queue: [] }));
    expect(view.state).toBe("empty");
    expect(view.waiting).toBe(0);
    expect(view.total.entries).toBe(0);
  });

  it("failed facts about why nothing waits do not invent a reason", () => {
    const view = todayViewApprovals(
      input({ queue: [], employees: null, ownUnconfirmed: null, otherReviewer: null, readerReviews: null }),
    );
    expect(view.state).toBe("empty");
    expect(view.reason.noEmployees).toBe(false);
    expect(view.reason.reviewOff).toBeNull();
  });
});

describe("who may approve", () => {
  it("a reader with no reviewer relationship here gets no controls and no 'nothing waits'", () => {
    const view = todayViewApprovals(input({ readerReviews: false, queue: [row("e1")] }));
    expect(view.state).toBe("not-reviewer");
    expect(view.waiting).toBeNull();
    expect(view.cards).toEqual([]);
    expect(view.batch).toEqual([]);
    expect(view.people).toEqual([]);
    expect(view.total.entries).toBe(0);
  });

  it("the same reader is still told about work waiting for them elsewhere", () => {
    const view = todayViewApprovals(input({ readerReviews: false, queue: [row("o", { organizationId: "org-b" })] }));
    expect(view.state).toBe("not-reviewer");
    expect(view.elsewhere).toBe(1);
  });

  it("an empty gated set offers nothing, whoever is reading", () => {
    const view = todayViewApprovals(input({ queue: [], readerReviews: null }));
    expect(view.cards).toEqual([]);
    expect(view.batch).toEqual([]);
  });

  it("a failed relationship read leaves the decision with the gated set", () => {
    const view = todayViewApprovals(input({ readerReviews: null }));
    expect(view.state).toBe("waiting");
    expect(view.cards).toHaveLength(1);
  });
});

describe("which entries the exception read asks about", () => {
  it("always covers the cards and today's batch, within the bound", () => {
    const old = Array.from({ length: TODAY_VIEW_EXCEPTION_READ_LIMIT + 20 }, (_, i) => row(`o${i}`));
    const today = [row("t1", { createdAt: `${TODAY}T07:00:00Z` })];
    const ids = exceptionReadIds([...old, ...today], TODAY);
    expect(ids).toHaveLength(TODAY_VIEW_EXCEPTION_READ_LIMIT);
    expect(ids).toContain("t1");
    expect(ids.slice(0, TODAY_VIEW_CARDS)).toEqual(old.slice(0, TODAY_VIEW_CARDS).map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("today's facts", () => {
  const applied = {
    applied: true as const,
    todayIso: TODAY,
    roster: 12,
    absentToday: [{ workerId: "w1", name: "Rasa" }],
    absentNext7: [],
    pendingAbsenceDecisions: 1,
    journalEntriesToday: 0,
    awaitingReview: 3,
    clientReviewToDecide: 0,
  };

  it("measured facts pass through, a measured zero stays zero", () => {
    const view = todayViewFacts(applied);
    expect(view.readable).toBe(true);
    expect(view.facts).toEqual([
      { key: "roster", value: 12 },
      { key: "journalToday", value: 0 },
    ]);
    expect(view.absentToday).toEqual([{ workerId: "w1", name: "Rasa" }]);
    expect(view.absentNext).toEqual([]);
  });

  it("each failed fact stays null on its own", () => {
    const view = todayViewFacts({ ...applied, roster: null, absentToday: null, absentNext7: null });
    expect(view.facts[0]).toEqual({ key: "roster", value: null });
    expect(view.facts[1]).toEqual({ key: "journalToday", value: 0 });
    expect(view.absentToday).toBeNull();
    expect(view.absentNext).toBeNull();
  });

  it("nothing readable at all is not an empty day", () => {
    const view = todayViewFacts({ applied: false, reason: "error" });
    expect(view.readable).toBe(false);
    expect(view.facts.every((f) => f.value === null)).toBe(true);
    expect(view.absentToday).toBeNull();
    expect(view.absentNext).toBeNull();
  });

  it("offers no fact that would claim who is working", () => {
    expect(todayViewFacts(applied).facts.map((f) => f.key)).toEqual(["roster", "journalToday"]);
  });
});

describe("what needs a decision", () => {
  const none = { absences: 0, clientReview: 0, reviewOff: 0, conflicts: 0, invitations: 0, claims: 0 };

  it("lists only what waits, each with its door", () => {
    const view = todayViewDecisions({ ...none, absences: 2, invitations: 1 });
    expect(view.items).toEqual([
      { key: "absences", count: 2, href: "/dashboard/absences" },
      { key: "invitations", count: 1, href: "/dashboard/company/people#company-invitations" },
    ]);
    expect(view.clear).toBe(false);
  });

  it("all zero is clear", () => {
    const view = todayViewDecisions(none);
    expect(view.items).toEqual([]);
    expect(view.unread).toEqual([]);
    expect(view.clear).toBe(true);
  });

  it("one failed read is listed apart and the section is not clear", () => {
    const view = todayViewDecisions({ ...none, conflicts: null });
    expect(view.items).toEqual([]);
    expect(view.unread).toEqual(["conflicts"]);
    expect(view.clear).toBe(false);
  });

  it("every read failed", () => {
    const view = todayViewDecisions({
      absences: null,
      clientReview: null,
      reviewOff: null,
      conflicts: null,
      invitations: null,
      claims: null,
    });
    expect(view.unread).toHaveLength(6);
    expect(view.clear).toBe(false);
  });

  it("the hours are not repeated here: they lead the screen", () => {
    expect(Object.keys(none)).not.toContain("review");
    expect(todayViewDecisions(none).items.some((i) => (i.key as string) === "review")).toBe(false);
  });

  it("a failed invitation read is unknown, an answered one counts pending only", () => {
    expect(pendingInvitationCount(null)).toBeNull();
    expect(pendingInvitationCount({ kind: "error" })).toBeNull();
    expect(pendingInvitationCount({ kind: "ok", rows: [{ status: "pending" }, { status: "accepted" }] })).toBe(1);
    expect(pendingInvitationCount({ kind: "ok", rows: [] })).toBe(0);
  });
});
