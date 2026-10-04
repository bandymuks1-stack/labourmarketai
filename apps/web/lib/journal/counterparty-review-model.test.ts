import { describe, expect, it } from "vitest";

import {
  DECISION_TO_RPC,
  counterpartyNoteProblem,
  decideRefusalKey,
  entryReviewPhase,
  isResubmission,
  isUuid,
  offeredDecisions,
  parseEntryDetail,
  parseEntryReviewStates,
  parseLinkCandidates,
  parseQueueRows,
  partitionQueue,
  queueBucket,
  registerOutcomeKey,
  revokeOutcomeKey,
  submitOutcomeKey,
} from "./counterparty-review-model";

const E1 = "f1000000-0000-0000-0000-000000000001";
const E2 = "f1000000-0000-0000-0000-000000000002";
const L1 = "d5093154-7924-4cde-94c8-d3c4c67cf012";

describe("decision vocabulary", () => {
  it("maps onto the EXISTING review vocabulary (no second status system)", () => {
    expect(DECISION_TO_RPC).toEqual({
      accept: "approved",
      request_correction: "changes_requested",
      dispute: "rejected",
    });
  });

  it("requires a note for a correction request and a dispute, never for an acceptance", () => {
    expect(counterpartyNoteProblem("accept", "")).toBeNull();
    expect(counterpartyNoteProblem("request_correction", "  ")).toBe("required");
    expect(counterpartyNoteProblem("dispute", "no")).toBe("required");
    expect(counterpartyNoteProblem("dispute", "Wrong wall")).toBeNull();
    expect(counterpartyNoteProblem("accept", "x".repeat(2001))).toBe("too_long");
  });
});

describe("subject side: entry review phase", () => {
  const empty = parseEntryReviewStates({});
  it("is none for an unknown entry (UNKNOWN is never rendered as a state)", () => {
    expect(entryReviewPhase(empty.get(E1))).toBe("none");
    expect(entryReviewPhase(null)).toBe("none");
  });

  it("offers submission only when a valid counterparty exists", () => {
    const withCandidate = parseEntryReviewStates({
      [E1]: {
        superseded_by: null,
        correction_of: null,
        submission: null,
        latest: null,
        candidates: [{ link_id: L1, party_name: "Client C", party_role: "client" }],
      },
    }).get(E1);
    expect(entryReviewPhase(withCandidate)).toBe("ready_to_submit");
    const without = parseEntryReviewStates({
      [E1]: { submission: null, latest: null, candidates: [] },
    }).get(E1);
    expect(entryReviewPhase(without)).toBe("none");
  });

  it("walks recorded -> submitted -> accepted / correction requested / disputed", () => {
    const sub = { link_id: L1, submitted_at: "2026-10-04T10:00:00Z", party_name: "C", party_role: "client" };
    const phase = (latest: unknown) =>
      entryReviewPhase(
        parseEntryReviewStates({ [E1]: { submission: sub, latest, candidates: [] } }).get(E1),
      );
    expect(phase(null)).toBe("submitted");
    expect(phase({ decision: "approved", note: null, at: "2026-10-05T10:00:00Z" })).toBe("accepted");
    expect(phase({ decision: "changes_requested", note: "fix", at: null })).toBe("correction_requested");
    expect(phase({ decision: "rejected", note: "no", at: null })).toBe("disputed");
  });

  it("never invents a role the vocabulary does not know", () => {
    const s = parseEntryReviewStates({
      [E1]: { submission: { link_id: L1, party_role: "landlord" }, candidates: [] },
    }).get(E1);
    expect(s?.submission?.partyRole).toBeNull();
  });

  it("a corrected version is a RESUBMISSION only when its original was submitted", () => {
    const states = parseEntryReviewStates({
      [E1]: { submission: { link_id: L1 }, latest: { decision: "changes_requested" }, candidates: [] },
      [E2]: { correction_of: E1, submission: null, candidates: [{ link_id: L1 }] },
    });
    expect(isResubmission(states.get(E2), states)).toBe(true);
    const unrelated = parseEntryReviewStates({
      [E2]: { correction_of: E1, submission: null, candidates: [{ link_id: L1 }] },
    });
    expect(isResubmission(unrelated.get(E2), unrelated)).toBe(false);
  });

  it("ignores malformed payloads", () => {
    expect(parseEntryReviewStates(null).size).toBe(0);
    expect(parseEntryReviewStates([1, 2]).size).toBe(0);
    expect(parseEntryReviewStates({ x: "nope" }).size).toBe(0);
  });
});

describe("counterparty side: queue", () => {
  const row = (entry_id: string, latest_decision: unknown) => ({
    entry_id,
    submission_id: "5b000000-0000-0000-0000-000000000001",
    link_id: L1,
    project_id: null,
    worker_id: "aaaaf000-0000-0000-0000-000000000f01",
    party_organization_id: null,
    party_role: "client",
    original_text: "Installed fence",
    original_language: "lt",
    entry_created_at: null,
    submitted_at: "2026-10-04T10:00:00Z",
    resubmission_of_entry_id: null,
    latest_decision,
  });

  it("buckets by the latest decision", () => {
    expect(queueBucket({ latestDecision: null })).toBe("to_decide");
    expect(queueBucket({ latestDecision: "approved" })).toBe("accepted");
    expect(queueBucket({ latestDecision: "changes_requested" })).toBe("waiting_for_worker");
    expect(queueBucket({ latestDecision: "rejected" })).toBe("disputed");
    const parts = partitionQueue(
      parseQueueRows([row(E1, null), row(E2, "approved")]),
    );
    expect(parts.to_decide.map((r) => r.entryId)).toEqual([E1]);
    expect(parts.accepted.map((r) => r.entryId)).toEqual([E2]);
  });

  it("offers decisions exactly as the database allows them", () => {
    expect(offeredDecisions(null)).toEqual(["accept", "request_correction", "dispute"]);
    expect(offeredDecisions("approved")).toEqual([]); // accept is final
    expect(offeredDecisions("changes_requested")).toEqual([]); // waiting for the worker
    expect(offeredDecisions("rejected")).toEqual(["accept"]); // a dispute is withdrawn only by accepting
  });

  it("drops rows missing ids and keeps the work text verbatim", () => {
    const rows = parseQueueRows([row(E1, null), { entry_id: E2 }, "x"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].originalText).toBe("Installed fence");
  });

  it("parses the entry detail with metrics, photo metadata and history", () => {
    const d = parseEntryDetail({
      entry_id: E1,
      subject_display_name: "Free Lancer",
      project_name: "Fence project",
      party_role: "client",
      original_text: "Installed fence",
      metrics: [{ metric_slug: "area_done", value_numeric: 40, unit_slug: "m2" }, { bad: true }],
      photos: [{ id: "p1", file_name: "a.jpg", storage_path: "u/a.jpg" }, { id: "p2" }],
      history: [{ entry_id: E1, decision: "rejected", note: "No", at: "2026-10-04T10:00:00Z" }],
    });
    expect(d?.subjectName).toBe("Free Lancer");
    expect(d?.metrics).toHaveLength(1);
    expect(d?.photos).toHaveLength(1);
    expect(d?.history[0].decision).toBe("rejected");
    expect(parseEntryDetail(null)).toBeNull();
    expect(parseEntryDetail({})).toBeNull();
  });
});

describe("project page: link candidates", () => {
  it("distinguishes person and team relationships and the active link", () => {
    const c = parseLinkCandidates([
      { worker_id: "w1", display_name: "A", relationship_kind: "person", link_id: null },
      { worker_id: "w2", display_name: null, relationship_kind: "team", link_id: L1, party_role: "customer" },
    ]);
    expect(c[0]).toMatchObject({ kind: "person", linkId: null });
    expect(c[1]).toMatchObject({ kind: "team", linkId: L1, partyRole: "customer", displayName: null });
  });
});

describe("outcome keys are closed sets", () => {
  it("passes known outcomes and turns anything else into error", () => {
    expect(registerOutcomeKey("no_work_relationship")).toBe("no_work_relationship");
    expect(registerOutcomeKey("DROP TABLE")).toBe("error");
    expect(revokeOutcomeKey("revoked")).toBe("revoked");
    expect(revokeOutcomeKey("")).toBe("error");
    expect(submitOutcomeKey("counterparty_ambiguous")).toBe("counterparty_ambiguous");
    expect(submitOutcomeKey("approved")).toBe("error");
    expect(decideRefusalKey("already_accepted")).toBe("already_accepted");
    expect(decideRefusalKey("whatever")).toBe("error");
  });

  it("validates uuids", () => {
    expect(isUuid(E1)).toBe(true);
    expect(isUuid("1; drop table")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
