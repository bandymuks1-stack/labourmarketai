import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSkillFeedbackSignal } from "./skill-feedback-signal";
import { SKILL_FEEDBACK_REASON_MAX, normalizeFeedbackReason } from "./skill-feedback-model";

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("buildSkillFeedbackSignal — an observation, never a confirmation", () => {
  const base = {
    workerId: "11111111-1111-4111-8111-111111111111",
    entryId: "22222222-2222-4222-8222-222222222222",
    slug: "bricklaying",
  };

  it("a rejection is a CORRECTION at confidence zero", () => {
    const row = buildSkillFeedbackSignal({ ...base, decision: "rejected", reason: " wrong trade " }, "s-1");
    expect(row).toMatchObject({
      subject_worker_id: base.workerId,
      subject_skill_id: "s-1",
      source: "skill_claim",
      source_object_type: "journal_entry",
      source_object_id: base.entryId,
      signal_kind: "correction",
      confidence_score: 0,
      confidence_bin: "red",
    });
    expect(row.proposed_outcome).toEqual({
      decision: "rejected",
      slug: "bricklaying",
      reason: "wrong trade",
      surface: "journal_entry_candidate",
    });
  });

  it("an acceptance is a candidate the person stood behind — still not evidence", () => {
    const row = buildSkillFeedbackSignal({ ...base, decision: "confirmed" }, null);
    expect(row.signal_kind).toBe("skill_candidate");
    expect(row.subject_skill_id).toBeNull();
    expect(row.confidence_score).toBe(0);
    expect(row.proposed_outcome.reason).toBeNull();
  });

  it("the reason is optional, trimmed and bounded — never an empty string", () => {
    expect(normalizeFeedbackReason(undefined)).toBeNull();
    expect(normalizeFeedbackReason("   ")).toBeNull();
    expect(normalizeFeedbackReason("  a   b  ")).toBe("a b");
    expect(normalizeFeedbackReason("x".repeat(SKILL_FEEDBACK_REASON_MAX + 50))).toHaveLength(
      SKILL_FEEDBACK_REASON_MAX,
    );
  });

  it("uses only values the ledger's CHECK constraints admit", () => {
    const sql = readFileSync(
      join(APP, "..", "..", "supabase", "migrations", "20260627132759_human_in_loop_learning.sql"),
      "utf8",
    );
    for (const literal of ["'skill_claim'", "'correction'", "'skill_candidate'", "'red'"]) {
      expect(sql, `learning_signals must admit ${literal}`).toContain(literal);
    }
  });
});

describe("the ledger has writers now (it had none until 2026-09-19)", () => {
  const writer = read("lib/learning/skill-feedback-signal.ts");
  const actions = read("lib/journal/skill-pipeline-actions.ts");

  it("the writer only ever INSERTS into learning_signals", () => {
    expect(writer).toMatch(/\.from\("learning_signals"\)\s*\.insert\(/);
    expect(writer).not.toMatch(/\.from\("learning_signals"\)[\s\S]{0,80}\.(update|delete|upsert)\(/);
    // and never touches the skill itself
    expect(writer).not.toMatch(/worker_skills|journal_entry_skills|\.rpc\(/);
  });

  it("both worker decisions on a recognised skill record an observation", () => {
    const confirm = actions.split("export async function confirmJournalSkillCandidate(")[1]?.split("export async function")[0] ?? "";
    const reject = actions.split("export async function rejectJournalSkillCandidate(")[1]?.split("export async function")[0] ?? "";
    expect(confirm).toMatch(/recordSkillFeedbackSignal\(/);
    expect(reject).toMatch(/recordSkillFeedbackSignal\(/);
    expect(reject).toMatch(/decision: "rejected"/);
  });

  it("the optional reason has its own membership-checked action and never changes the marker", () => {
    const note = actions.split("export async function noteSkillRejectReason(")[1]?.split("export async function")[0] ?? "";
    expect(note).toMatch(/ownEntryDerivation\(/);
    expect(note).toMatch(/recordSkillFeedbackSignal\(/);
    expect(note).not.toMatch(/appendEntryMarker\(/);
  });

  it("the saved-entry card offers the optional reason after a rejection", () => {
    const card = read("components/app/journal-entry-candidate-decision.tsx");
    expect(card).toMatch(/noteSkillRejectReason/);
    // A client component may import the model, never the server-only writer.
    expect(card).toMatch(/from "@\/lib\/learning\/skill-feedback-model"/);
    expect(card).not.toMatch(/from "@\/lib\/learning\/skill-feedback-signal"/);
    expect(card).toMatch(/entry-candidate-reject-reason-/);
    expect(card).toMatch(/maxLength=\{SKILL_FEEDBACK_REASON_MAX\}/);
    for (const locale of ["en", "lt", "ru", "nl", "de"]) {
      const j = JSON.parse(read(`messages/${locale}/journal.json`)) as Record<string, string>;
      for (const key of ["candidateRejectWhy", "candidateRejectWhySend", "candidateRejectWhyThanks"]) {
        expect(j[key], `${locale}: journal.${key}`).toBeTruthy();
      }
    }
  });
});
