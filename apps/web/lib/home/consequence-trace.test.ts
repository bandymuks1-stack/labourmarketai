import { describe, expect, it } from "vitest";

import type { NotificationEventRow } from "@/lib/notifications/events";

import {
  TRACE_DEFAULT_LIMIT,
  deriveConsequenceTrace,
  traceJournalEntry,
  traceReachedLivingCv,
  type ConsequenceTraceInput,
  type TraceEntryInput,
  type TraceStep,
} from "./consequence-trace";
import { CAUSAL_CHAINS } from "./home-state";

const ME = "profile-me";
const BOSS = "profile-boss";
const SINCE = "2026-10-01T00:00:00.000Z";

const hours = (n: number) => [
  { metric_slug: "quantity", value_numeric: n, value_text: null, unit_slug: "hours" },
  { metric_slug: "work_date", value_numeric: null, value_text: "2026-10-13", unit_slug: null },
];

const decision = (d: "approved" | "rejected" | "changes_requested", by: string, at: string) => ({
  confirmation_scope: { decision: d },
  created_at: at,
  confirmer_role: by === ME ? "owner" : "manager",
  confirmer_id: by,
});

const entry = (patch: Partial<TraceEntryInput> & { id: string }): TraceEntryInput => ({
  createdAt: "2026-10-13T08:00:00.000Z",
  originalText: "Skydas P-1 sujungtas\nantra eilutė",
  metrics: hours(8),
  confirmations: [],
  ...patch,
});

const ev = (
  id: string,
  eventType: string,
  createdAt: string,
  extra: Partial<NotificationEventRow> = {},
): NotificationEventRow =>
  ({
    id,
    eventType,
    entityType: "engagement",
    entityId: `ent-${id}`,
    createdAt,
    readAt: null,
    metadata: {},
    ...extra,
  }) as unknown as NotificationEventRow;

const base = (patch: Partial<ConsequenceTraceInput> = {}): ConsequenceTraceInput => ({
  entries: [],
  entriesTruncated: false,
  subjectProfileId: ME,
  skillLinks: new Map(),
  confirmedWork: new Map(),
  events: [],
  sinceIso: SINCE,
  ...patch,
});

const kinds = (steps: readonly TraceStep[]) => steps.map((s) => s.kind);

describe("consequence trace — journal chains", () => {
  it("an entry nobody answered yet stops at a PENDING step, never a confirmation", () => {
    const item = traceJournalEntry(entry({ id: "e1" }), base());
    expect(kinds(item.steps)).toEqual(["recorded", "awaiting_review"]);
    expect(item.steps[1]).toMatchObject({ basis: "pending" });
    expect(item.steps[0]).toMatchObject({ kind: "recorded", basis: "fact", hours: 8, day: "2026-10-13" });
    expect(item.title).toEqual({ kind: "entry", text: "Skydas P-1 sujungtas" });
  });

  it("an untimed entry carries hours null, never 0", () => {
    const item = traceJournalEntry(entry({ id: "e1", metrics: [] }), base());
    expect(item.steps[0]).toMatchObject({ kind: "recorded", hours: null, dayUnits: null });
  });

  it("an independently approved entry reaches the Living CV and matching, with the SAME tier matching reads", () => {
    const item = traceJournalEntry(
      entry({ id: "e1", confirmations: [decision("approved", BOSS, "2026-10-13T16:20:00.000Z")] }),
      base({
        skillLinks: new Map([["e1", ["panel_installation"]]]),
        confirmedWork: new Map([["panel_installation", { confirmedWorkEntries: 5, confirmedDays: 4 }]]),
      }),
    );
    expect(kinds(item.steps)).toEqual(["recorded", "reviewed", "living_cv", "matching"]);
    expect(item.at).toBe("2026-10-13T16:20:00.000Z");
    const cv = item.steps[2] as Extract<TraceStep, { kind: "living_cv" }>;
    expect(cv.basis).toBe("derived");
    expect(cv.skills).toEqual([
      { slug: "panel_installation", confirmedEntries: 5, confirmedDays: 4, tier: "repeated_confirmed" },
    ]);
    expect(traceReachedLivingCv(item)).toBe(true);
  });

  it("a self-approved entry is shown as a decision but NEVER reaches the Living CV", () => {
    const item = traceJournalEntry(
      entry({ id: "e1", confirmations: [decision("approved", ME, "2026-10-13T16:20:00.000Z")] }),
      base({ skillLinks: new Map([["e1", ["panel_installation"]]]) }),
    );
    expect(kinds(item.steps)).toEqual(["recorded", "reviewed"]);
    expect(item.steps[1]).toMatchObject({ decision: "approved", selfOnly: true });
    expect(traceReachedLivingCv(item)).toBe(false);
  });

  it("a rejected or returned entry never reaches the Living CV", () => {
    for (const d of ["rejected", "changes_requested"] as const) {
      const item = traceJournalEntry(
        entry({ id: "e1", confirmations: [decision(d, BOSS, "2026-10-13T16:20:00.000Z")] }),
        base({ skillLinks: new Map([["e1", ["x"]]]) }),
      );
      expect(kinds(item.steps)).toEqual(["recorded", "reviewed"]);
      expect(item.steps[1]).toMatchObject({ decision: d, selfOnly: false });
    }
  });

  it("latest decision wins (approved after changes requested)", () => {
    const item = traceJournalEntry(
      entry({
        id: "e1",
        confirmations: [
          decision("changes_requested", BOSS, "2026-10-12T10:00:00.000Z"),
          decision("approved", BOSS, "2026-10-13T10:00:00.000Z"),
        ],
      }),
      base(),
    );
    expect(item.steps[1]).toMatchObject({ decision: "approved" });
  });

  it("unreadable skill links or counts make the Living CV step UNKNOWN (null), never 'no skills'", () => {
    const confirmed = entry({ id: "e1", confirmations: [decision("approved", BOSS, "2026-10-13T16:20:00.000Z")] });
    for (const patch of [{ skillLinks: null }, { confirmedWork: null }]) {
      const item = traceJournalEntry(confirmed, base(patch));
      expect(item.steps[2]).toEqual({ kind: "living_cv", basis: "derived", skills: null, unlinked: false });
      expect(kinds(item.steps)).not.toContain("matching");
      expect(traceReachedLivingCv(item)).toBe(false);
    }
  });

  it("a confirmed entry tied to no skill says so (unlinked) and claims no matching effect", () => {
    const item = traceJournalEntry(
      entry({ id: "e1", confirmations: [decision("approved", BOSS, "2026-10-13T16:20:00.000Z")] }),
      base(),
    );
    expect(item.steps[2]).toEqual({ kind: "living_cv", basis: "derived", skills: [], unlinked: true });
    expect(kinds(item.steps)).not.toContain("matching");
  });
});

describe("consequence trace — composition", () => {
  it("both reads failed → UNKNOWN; one failed → known with the failed half flagged", () => {
    expect(deriveConsequenceTrace(base({ entries: null, events: null }))).toEqual({ kind: "unknown" });
    const t = deriveConsequenceTrace(base({ entries: null }));
    expect(t).toMatchObject({ kind: "known", journalUnknown: true, eventsUnknown: false, items: [] });
    const u = deriveConsequenceTrace(base({ events: null }));
    expect(u).toMatchObject({ kind: "known", journalUnknown: false, eventsUnknown: true });
  });

  it("state chains come ONLY from the closed CAUSAL_CHAINS set", () => {
    const t = deriveConsequenceTrace(
      base({
        events: [
          ev("a", "booking_accepted", "2026-10-12T09:00:00.000Z"),
          ev("b", "message_received", "2026-10-12T10:00:00.000Z"),
          ev("c", "job_alert", "2026-10-12T11:00:00.000Z"),
        ],
      }),
    );
    if (t.kind !== "known") throw new Error("expected known");
    expect(t.items.map((i) => i.id)).toEqual(["event:a"]);
    expect(t.items[0].steps[0]).toEqual({
      kind: "state_change",
      basis: "fact",
      ...CAUSAL_CHAINS.booking_accepted,
    });
  });

  it("a review decision event about a traced entry is not drawn twice", () => {
    const t = deriveConsequenceTrace(
      base({
        entries: [entry({ id: "e1", confirmations: [decision("approved", BOSS, "2026-10-13T16:20:00.000Z")] })],
        events: [
          ev("r", "journal_review_decided", "2026-10-13T16:21:00.000Z", {
            entityType: "journal_entry",
            entityId: "e1",
          } as Partial<NotificationEventRow>),
        ],
      }),
    );
    if (t.kind !== "known") throw new Error("expected known");
    expect(t.items.map((i) => i.id)).toEqual(["journal:e1"]);
  });

  it("chains older than the window are left out; newest first; limited", () => {
    const old = entry({ id: "old", createdAt: "2026-09-01T08:00:00.000Z" });
    const many = Array.from({ length: TRACE_DEFAULT_LIMIT + 3 }, (_, i) =>
      entry({ id: `n${i}`, createdAt: `2026-10-1${i % 10}T08:00:00.000Z` }),
    );
    const t = deriveConsequenceTrace(base({ entries: [old, ...many] }));
    if (t.kind !== "known") throw new Error("expected known");
    expect(t.items).toHaveLength(TRACE_DEFAULT_LIMIT);
    expect(t.items.some((i) => i.id === "journal:old")).toBe(false);
    const ats = t.items.map((i) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);
  });

  it("an old entry confirmed inside the window IS a recent chain (the decision is the change)", () => {
    const t = deriveConsequenceTrace(
      base({
        entries: [
          entry({
            id: "e1",
            createdAt: "2026-09-01T08:00:00.000Z",
            confirmations: [decision("approved", BOSS, "2026-10-13T16:20:00.000Z")],
          }),
        ],
      }),
    );
    if (t.kind !== "known") throw new Error("expected known");
    expect(t.items.map((i) => i.id)).toEqual(["journal:e1"]);
  });

  it("carries the journal window's truncation as stated coverage", () => {
    const t = deriveConsequenceTrace(base({ entriesTruncated: true }));
    expect(t).toMatchObject({ kind: "known", truncated: true });
  });

  it("no step ever carries a score-like field", () => {
    const t = deriveConsequenceTrace(
      base({
        entries: [entry({ id: "e1", confirmations: [decision("approved", BOSS, "2026-10-13T16:20:00.000Z")] })],
        skillLinks: new Map([["e1", ["a"]]]),
        confirmedWork: new Map([["a", { confirmedWorkEntries: 1, confirmedDays: 1 }]]),
      }),
    );
    const json = JSON.stringify(t);
    for (const word of ["score", "rank", "rating", "percentile", "level"]) {
      expect(json.toLowerCase()).not.toContain(word);
    }
  });
});
