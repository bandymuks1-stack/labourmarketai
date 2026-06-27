import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 learning — audit-event-required guard.
 *
 * Any confirmation-producing path MUST create a REAL confirmation event + audit
 * event, reusing the existing spine — learning must never silently confirm. This
 * pins that the one RPC, before writing `verified`, records a
 * journal_entry_confirmations row AND an audit_logs row, re-checks live authority
 * + the journal_review_enabled gate, and that no other path flips `verified`.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const APP = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

describe("auto-confirmation produces a real confirmation + audit event", () => {
  const sql = read(
    join(REPO, "supabase", "migrations", "20260627132759_human_in_loop_learning.sql"),
  ).toLowerCase();

  it("the RPC writes an append-only confirmation row", () => {
    expect(sql).toMatch(/insert into public\.journal_entry_confirmations/);
    // honestly tagged as an auto-confirm, recording the policy + enabling manager
    expect(sql).toMatch(/'action','auto_confirm'/);
    expect(sql).toMatch(/'policy_id', v_policy_id/);
    expect(sql).toMatch(/'policy_enabled_by', v_enabled_by/);
    expect(sql).toMatch(/'source_signal_id', v_signal/);
  });

  it("the RPC writes an audit_logs row attributing the live actor + policy", () => {
    expect(sql).toMatch(/insert into public\.audit_logs/);
    expect(sql).toMatch(/'auto_confirm_via_learning_policy'/);
  });

  it("the RPC re-checks live authority, policy enabled, scope, threshold, and the review gate", () => {
    expect(sql).toMatch(/manages_organization\(v_org\)/);
    expect(sql).toMatch(/return 'policy_disabled'/);
    expect(sql).toMatch(/return 'out_of_scope'/);
    expect(sql).toMatch(/return 'threshold_not_met'/);
    expect(sql).toMatch(/return 'review_not_enabled'/);
    expect(sql).toMatch(/return 'no_reviewer_engagement'/);
    // the confirmer is the LIVE caller (auth.uid()), not a stored identity
    expect(sql).toMatch(/uid\s+uuid\s*:=\s*auth\.uid\(\)/);
  });

  it("verified is flipped ONLY inside the RPC, never in app/learning code", () => {
    const server = read(join(APP, "lib", "learning", "learning.ts"));
    const section = read(join(APP, "components", "app", "learning-review-section.tsx"));
    expect(server).not.toMatch(/verified\s*[:=]\s*true/i);
    expect(section).not.toMatch(/verified\s*[:=]\s*true/i);
    // the spine update lives in the migration RPC
    expect(sql).toMatch(/update public\.worker_skills\s+set verified = true/);
  });
});
