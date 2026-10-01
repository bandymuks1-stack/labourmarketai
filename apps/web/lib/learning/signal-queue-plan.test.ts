import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  entrySkillKey,
  planReviewQueueInserts,
  type QueueEntryFacts,
  type QueueSignalRow,
} from "./signal-queue-plan";
import { buildSkillFeedbackSignal } from "./skill-feedback-signal";

const W = "11111111-1111-4111-8111-111111111111";
const ORG = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "44444444-4444-4444-8444-444444444444";
const E1 = "22222222-2222-4222-8222-222222222221";
const SK = "55555555-5555-4555-8555-555555555555";

const signal = (over: Partial<QueueSignalRow> = {}): QueueSignalRow => ({
  id: "66666666-6666-4666-8666-666666666661",
  subject_worker_id: W,
  subject_skill_id: SK,
  organization_id: ORG,
  source: "skill_claim",
  source_object_type: "journal_entry",
  source_object_id: E1,
  signal_kind: "skill_candidate",
  proposed_outcome: { slug: "bricklaying" },
  ...over,
});
const entry = (over: Partial<QueueEntryFacts> = {}): QueueEntryFacts => ({
  workerId: W,
  organizationId: ORG,
  reviewEnabled: true,
  stale: false,
  ...over,
});
const plan = (
  signals: QueueSignalRow[],
  entries: Record<string, QueueEntryFacts>,
  already: string[] = [],
) => planReviewQueueInserts(signals, new Map(Object.entries(entries)), new Set(already));

describe("EDU-5 planReviewQueueInserts — signal to pending suggestion, nothing more", () => {
  it("an accepted skill on a review-enabled entry becomes ONE pending confirm_skill item", () => {
    const rows = plan([signal()], { [E1]: entry() });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: ORG,
      journal_entry_id: E1,
      subject_skill_id: SK,
      suggestion_kind: "confirm_skill",
      status: "pending",
    });
    expect(rows[0].proposed_action.slug).toBe("bricklaying");
  });

  it("never produces anything but a pending item (no confirmation, no auto status)", () => {
    for (const r of plan([signal()], { [E1]: entry() })) {
      expect(r.status).toBe("pending");
    }
  });

  it("a rejection is not a manager matter", () => {
    expect(plan([signal({ signal_kind: "correction" })], { [E1]: entry() })).toEqual([]);
  });

  it("a signal naming a foreign organisation is dropped (the claim is re-derived from the entry)", () => {
    expect(plan([signal({ organization_id: OTHER_ORG })], { [E1]: entry() })).toEqual([]);
  });

  it("drops: no skill, no entry facts, review off, stale entry, other worker's entry", () => {
    expect(plan([signal({ subject_skill_id: null })], { [E1]: entry() })).toEqual([]);
    expect(plan([signal()], {})).toEqual([]);
    expect(plan([signal()], { [E1]: entry({ reviewEnabled: false }) })).toEqual([]);
    expect(plan([signal()], { [E1]: entry({ stale: true }) })).toEqual([]);
    expect(plan([signal()], { [E1]: entry({ workerId: "other" }) })).toEqual([]);
  });

  it("is idempotent: an existing item (any status) and duplicate signals collapse", () => {
    expect(plan([signal()], { [E1]: entry() }, [entrySkillKey(E1, SK)])).toEqual([]);
    const dup = [signal(), signal({ id: "66666666-6666-4666-8666-666666666662" })];
    expect(plan(dup, { [E1]: entry() })).toHaveLength(1);
  });
});

describe("EDU-5 wiring is pinned", () => {
  const APP = join(__dirname, "..", "..");
  const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

  it("the signal builder carries the derived organisation, or null", () => {
    const base = { workerId: W, entryId: E1, slug: "x", decision: "confirmed" as const };
    expect(buildSkillFeedbackSignal(base, SK, ORG).organization_id).toBe(ORG);
    expect(buildSkillFeedbackSignal(base, SK).organization_id).toBeNull();
  });

  it("the writer derives the organisation behind the journal_review_enabled gate", () => {
    const src = read("lib/learning/skill-feedback-signal.ts");
    expect(src).toMatch(/journal_review_enabled/);
    expect(src).toMatch(/deriveEntryReviewOrganization\(supabase, input\.entryId\)/);
  });

  it("the producer runs under the caller's own RLS: no service role, no RPC, no verified write", () => {
    const src = read("lib/learning/signal-queue-producer.ts");
    expect(src).not.toMatch(/service[-_]?role|createAdminClient|\.rpc\(/i);
    expect(src).not.toMatch(/verified/);
    expect(src).toMatch(/learning_review_queue/);
  });

  it("the manager brief states the count and links nowhere (the surface stays unlinked)", () => {
    const src = read("lib/conversation/opening-brief.ts");
    const at = src.indexOf("briefEmployerLearningReview");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at - 300, at + 200)).toMatch(/waiting > 0/);
    expect(src).not.toMatch(/link:\/dashboard\/learning/);
  });
});
