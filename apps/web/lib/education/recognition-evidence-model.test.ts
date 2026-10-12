import { describe, expect, it } from "vitest";

import {
  MAX_CITED_ENTRIES,
  buildEvidenceBySubject,
  excerptOf,
  type EvidenceConfirmationRow,
  type EvidenceEntryRow,
  type StudentContextRow,
} from "./recognition-evidence-model";

const LEARNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEARNER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSESSOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CTX_A = "c0000000-0000-4000-8000-00000000000a";
const CTX_B = "c0000000-0000-4000-8000-00000000000b";

const contexts: StudentContextRow[] = [
  { id: CTX_A, profile_id: LEARNER_A },
  { id: CTX_B, profile_id: LEARNER_B },
];

function entry(id: string, ctx: string, createdAt: string, text = "Laid tiles"): EvidenceEntryRow {
  return { id, engagement_context_id: ctx, entry_type_slug: "supervised_practice", created_at: createdAt, original_text: text };
}
function conf(entryId: string, confirmer: string, createdAt = "2026-10-02T10:00:00Z"): EvidenceConfirmationRow {
  return { entry_id: entryId, confirmer_id: confirmer, created_at: createdAt };
}

describe("recognition evidence — exactly what the RPC will accept", () => {
  it("lists an entry confirmed by someone other than the learner", () => {
    const r = buildEvidenceBySubject(contexts, [entry("e1", CTX_A, "2026-10-01T08:00:00Z")], [conf("e1", ASSESSOR)]);
    expect(r[LEARNER_A]).toHaveLength(1);
    expect(r[LEARNER_A]![0]).toMatchObject({ entryId: "e1", recordedOn: "2026-10-01", confirmedOn: "2026-10-02" });
  });

  it("never lists an entry only the learner confirmed (self-confirmation is not evidence)", () => {
    const r = buildEvidenceBySubject(contexts, [entry("e1", CTX_A, "2026-10-01T08:00:00Z")], [conf("e1", LEARNER_A)]);
    expect(r[LEARNER_A]).toBeUndefined();
  });

  it("never lists an unconfirmed entry", () => {
    const r = buildEvidenceBySubject(contexts, [entry("e1", CTX_A, "2026-10-01T08:00:00Z")], []);
    expect(Object.keys(r)).toHaveLength(0);
  });

  it("keeps each learner's entries apart — an entry of A never appears under B", () => {
    const r = buildEvidenceBySubject(
      contexts,
      [entry("a1", CTX_A, "2026-10-01T08:00:00Z"), entry("b1", CTX_B, "2026-10-01T09:00:00Z")],
      [conf("a1", ASSESSOR), conf("b1", ASSESSOR)],
    );
    expect(r[LEARNER_A]!.map((o) => o.entryId)).toEqual(["a1"]);
    expect(r[LEARNER_B]!.map((o) => o.entryId)).toEqual(["b1"]);
  });

  it("ignores entries outside the institution's student contexts", () => {
    const r = buildEvidenceBySubject(contexts, [entry("x1", "c0000000-0000-4000-8000-0000000000ff", "2026-10-01T08:00:00Z")], [conf("x1", ASSESSOR)]);
    expect(Object.keys(r)).toHaveLength(0);
  });

  it("uses the earliest confirmation by another person and lists the entry once", () => {
    const r = buildEvidenceBySubject(
      contexts,
      [entry("e1", CTX_A, "2026-10-01T08:00:00Z"), entry("e1", CTX_A, "2026-10-01T08:00:00Z")],
      [conf("e1", ASSESSOR, "2026-10-05T10:00:00Z"), conf("e1", "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "2026-10-03T10:00:00Z"), conf("e1", LEARNER_A, "2026-10-01T09:00:00Z")],
    );
    expect(r[LEARNER_A]).toHaveLength(1);
    expect(r[LEARNER_A]![0]!.confirmedOn).toBe("2026-10-03");
  });

  it("orders newest first and never offers more than the RPC accepts", () => {
    const entries = Array.from({ length: MAX_CITED_ENTRIES + 5 }, (_, i) =>
      entry(`e${i}`, CTX_A, `2026-09-${String((i % 28) + 1).padStart(2, "0")}T08:00:00Z`),
    );
    const confs = entries.map((e) => conf(e.id, ASSESSOR));
    const r = buildEvidenceBySubject(contexts, entries, confs);
    expect(r[LEARNER_A]).toHaveLength(MAX_CITED_ENTRIES);
    const dates = r[LEARNER_A]!.map((o) => o.recordedOn);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe("excerpt", () => {
  it("collapses whitespace and shortens long text", () => {
    expect(excerptOf("  a \n\n b  ")).toBe("a b");
    expect(excerptOf("x".repeat(300)).length).toBeLessThanOrEqual(101);
    expect(excerptOf(null)).toBe("");
  });
});
