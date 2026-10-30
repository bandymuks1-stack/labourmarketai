import { describe, expect, it } from "vitest";

import {
  canonicalInputHash,
  genuineTokenIssuedAt,
  issueConfirmationToken,
} from "@/lib/conversation/confirmation-token";
import {
  findConfirmedDraftEntry,
  fragmentMetricRows,
  parseFragments,
  timeFactsKeyOfIntake,
  timeFactsKeyOfRows,
} from "./journal-write-core";
import { intakeWorkTimeFields } from "./intake-work-time";

/**
 * P0-A (owner, 2026-10-30) — a confirm retried after its response was lost
 * must answer with the entry the first call recorded, never "not saved —
 * draft again" (which wrote the same day twice). Two pure parts:
 *  1. only a GENUINE token (ours, unexpired, this action / input / user) has
 *     an issue time to ask about — a moved state or a spent token is exactly
 *     the case it answers;
 *  2. the entry it asks for is the draft's exact one: live, same worker,
 *     context, words, work day and project choice, recorded after the token.
 */

const SECRET = "test-secret-0123456789";
const INPUT = { notes: "Klijavau plyteles 6 val.", workDate: "2026-10-29" };
const NOW = 1_800_000_000_000;

function token(overrides: Partial<{ input: unknown; userId: string; issuedAtMs: number }> = {}) {
  return issueConfirmationToken(SECRET, {
    actionId: "journal.confirm",
    inputHash: canonicalInputHash(overrides.input ?? INPUT),
    userId: overrides.userId ?? "user-1",
    stateFingerprint: "journal-head:v1:w:h0",
    issuedAtMs: overrides.issuedAtMs ?? NOW - 10_000,
  });
}

const ctx = {
  actionId: "journal.confirm",
  input: INPUT,
  userId: "user-1",
  currentStateFingerprint: "journal-head:v1:w:h1",
  nowMs: NOW,
};

describe("genuineTokenIssuedAt", () => {
  it("a genuine token whose state moved has an issue time", () => {
    expect(genuineTokenIssuedAt(SECRET, token(), ctx)).toBe(NOW - 10_000);
  });
  it("also when the state did not move (a spent token racing the first call)", () => {
    expect(
      genuineTokenIssuedAt(SECRET, token(), { ...ctx, currentStateFingerprint: "journal-head:v1:w:h0" }),
    ).toBe(NOW - 10_000);
  });
  it("never for another input, another user, an expired token or a forged one", () => {
    expect(genuineTokenIssuedAt(SECRET, token({ input: { ...INPUT, notes: "x" } }), ctx)).toBeNull();
    expect(genuineTokenIssuedAt(SECRET, token({ userId: "user-2" }), ctx)).toBeNull();
    expect(genuineTokenIssuedAt(SECRET, token({ issuedAtMs: NOW - 10 * 60_000 }), ctx)).toBeNull();
    expect(genuineTokenIssuedAt("another-secret-000000", token(), ctx)).toBeNull();
    expect(genuineTokenIssuedAt(SECRET, "not-a-real.token", ctx)).toBeNull();
  });
});

describe("findConfirmedDraftEntry", () => {
  type Row = { id: string; project_id?: string | null; journal_entry_metrics?: unknown[] };
  function sb(result: { data: Row[] | null; error: unknown } | "throw") {
    const calls: string[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "gte", "order"]) {
      b[m] = (...args: unknown[]) => {
        calls.push(`${m}:${String(args[0])}${m === "gte" || m === "eq" ? `=${String(args[1])}` : ""}`);
        return b;
      };
    }
    b.limit = async () => {
      if (result === "throw") throw new Error("x");
      return result;
    };
    return { client: { from: () => b } as never, calls };
  }
  // What the confirm writes for "Klijavau plyteles 6 val.": one fragment, 6 h.
  const sixHours = [{ metric_slug: "fragment_time", value_numeric: 6, unit_slug: "hours", value_text: "1" }];
  const day = (d: string, time: unknown[] = sixHours) => [{ metric_slug: "work_date", value_text: d }, ...time];
  const q = {
    workerId: "worker-1",
    engagementId: "ctx-1",
    originalText: INPUT.notes,
    workDate: "2026-10-29",
    issuedAtMs: NOW - 10_000,
    timeFactsKey: timeFactsKeyOfIntake(intakeWorkTimeFields(INPUT.notes, "2026-10-29")),
  };

  it("finds the live entry with the draft's words and day, recorded after the token (5 s clock skew)", async () => {
    const { client, calls } = sb({ data: [{ id: "e-1", journal_entry_metrics: day("2026-10-29") }], error: null });
    expect(await findConfirmedDraftEntry(client, q)).toBe("e-1");
    expect(calls).toContain("eq:worker_id=worker-1");
    expect(calls).toContain("eq:engagement_context_id=ctx-1");
    expect(calls).toContain(`eq:original_text=${INPUT.notes}`);
    expect(calls).toContain("is:deleted_at");
    expect(calls).toContain("is:superseded_by");
    expect(calls).toContain(`gte:created_at=${new Date(NOW - 15_000).toISOString()}`);
  });

  it("the same words for another day are another entry, not this draft", async () => {
    const { client } = sb({ data: [{ id: "e-1", journal_entry_metrics: day("2026-10-28") }], error: null });
    expect(await findConfirmedDraftEntry(client, q)).toBeNull();
  });

  it("the same words saved elsewhere with OTHER reviewed hours are not this draft (Codex P2)", async () => {
    const fourHours = [{ metric_slug: "fragment_time", value_numeric: 4, unit_slug: "hours", value_text: "1" }];
    const { client } = sb({ data: [{ id: "e-1", journal_entry_metrics: day("2026-10-29", fourHours) }], error: null });
    expect(await findConfirmedDraftEntry(client, q)).toBeNull();
    const none = sb({ data: [{ id: "e-1", journal_entry_metrics: day("2026-10-29", []) }], error: null });
    expect(await findConfirmedDraftEntry(none.client, q)).toBeNull();
  });

  it("the project choice must match: a project, 'none', or the database's own rule", async () => {
    const rows = { data: [{ id: "e-1", project_id: "p1", journal_entry_metrics: day("2026-10-29") }], error: null };
    expect(await findConfirmedDraftEntry(sb(rows).client, { ...q, projectId: "p1" })).toBe("e-1");
    expect(await findConfirmedDraftEntry(sb(rows).client, { ...q, projectId: "p2" })).toBeNull();
    expect(await findConfirmedDraftEntry(sb(rows).client, { ...q, projectId: "none" })).toBeNull();
    // absent = the database attributed it (auto-link), whatever it chose
    expect(await findConfirmedDraftEntry(sb(rows).client, { ...q, projectId: null })).toBe("e-1");
  });

  it("nothing, a read error and a throw all read as none", async () => {
    expect(await findConfirmedDraftEntry(sb({ data: [], error: null }).client, q)).toBeNull();
    expect(await findConfirmedDraftEntry(sb({ data: null, error: { message: "e" } }).client, q)).toBeNull();
    expect(await findConfirmedDraftEntry(sb("throw").client, q)).toBeNull();
  });
});

describe("time facts key — the intake fields and the rows the write core stores agree", () => {
  const rowsFor = (fields: Record<string, string>) => [
    ...fragmentMetricRows(parseFragments(fields.fragments_json ?? null)),
    ...(fields.quantity ? [{ metric_slug: "quantity", value_numeric: Number(fields.quantity), unit_slug: fields.unit_slug }] : []),
    ...(fields.work_start ? [{ metric_slug: "work_start", value_text: fields.work_start }] : []),
    ...(fields.work_end ? [{ metric_slug: "work_end", value_text: fields.work_end }] : []),
    ...(fields.break_minutes ? [{ metric_slug: "break_minutes", value_numeric: Number(fields.break_minutes), unit_slug: "minutes" }] : []),
  ];
  for (const notes of [
    "Klijavau plyteles 6 val., glaisčiau sienas 2 val.",
    "Dirbau nuo 22 iki 6, 30 min pertrauka",
    "Nuvažiavau 320 km",
    "Montavau lentynas",
  ]) {
    it(notes, () => {
      const fields = intakeWorkTimeFields(notes, "2026-10-29");
      expect(timeFactsKeyOfRows(rowsFor(fields))).toBe(timeFactsKeyOfIntake(fields));
    });
  }
});
