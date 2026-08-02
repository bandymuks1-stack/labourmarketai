import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deriveExperienceCounts } from "@/lib/trust/experience-records";

/**
 * W6 slice 3 guard — the ONE experience domain (DRAFT migration
 * 20260802120000, owner-gated apply).
 *
 * Pins: draft header without a self-added approval; paired rollback + ledger
 * Deferred entry; sentiment binary; moderation and dispute as SEPARATE
 * dimensions; RPC-only writes with anon revoked; reason-mandatory decisions;
 * audit on every action; count-only aggregation with the explicit disputed
 * rule; fail-closed app side with no legacy fallback.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIG = "supabase/migrations/20260802120000_experience_records_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260802120000_experience_records_v1.down.sql";
const sql = readFileSync(join(REPO, MIG), "utf8");

describe("human-gate approval hygiene", () => {
  /**
   * This test used to assert that `@human-gate-approved` was ABSENT — the
   * "an agent never approves its own migration" rule, and it did its job for
   * the whole of slices 3A–3D.
   *
   * The owner reviewed the human-gate package on PR #974 and gave Owner
   * Decision 2 on 2026-08-02, approving the four migration-safety findings.
   * So the marker is now legitimately present, and the rule it enforced has to
   * MOVE rather than disappear: an approval that does not say what it covers
   * is indistinguishable from a self-added one six months later. What is
   * pinned now is that the marker never travels alone — it must carry its
   * scope, and that scope must still exclude the two things the owner did NOT
   * grant.
   */
  it("the approval marker is present and canonical", () => {
    expect(sql).toMatch(/^--\s*@human-gate-approved\s*$/m);
  });

  it("the approval names the PR and the four findings it covers", () => {
    expect(sql).toMatch(/Owner Decision 2/);
    expect(sql).toMatch(/pull request #974/i);
    for (const finding of [
      "security-definer-function",
      "grant-or-revoke",
      "RLS policy changes",
      "DML inside function bodies",
    ]) {
      expect(sql, `approval must name: ${finding}`).toContain(finding);
    }
  });

  it("the approval EXCLUDES production apply and destructive rollback", () => {
    // The two limits the owner stated explicitly. If either sentence is ever
    // dropped, the marker would read as blanket permission — which it is not.
    expect(sql).toMatch(/APPROVAL DOES \*\*NOT\*\* COVER|APPROVAL DOES NOT COVER/);
    expect(sql).toMatch(/APPLYING THIS MIGRATION IN PRODUCTION/);
    expect(sql).toMatch(/Owner Decision 3[\s\S]{0,120}has NOT been given/);
    expect(sql).toMatch(/ROLLBACK AGAINST REAL PRODUCTION DATA/);
    expect(sql).toMatch(/W6_SLICE_3_MERGED_PENDING_PRODUCTION_MIGRATION_APPROVAL/);
  });

  it("still forbids `db push` and points at the gated apply path", () => {
    expect(sql).toMatch(/Never `db push`/);
    expect(sql).toMatch(/apply_migration/);
  });
  it("has a paired rollback and a ledger Deferred entry", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    const ledger = readFileSync(join(REPO, "docs/APPLIED_LEDGER.md"), "utf8");
    expect(ledger).toContain("20260802120000_experience_records_v1.sql");
    expect(ledger).toMatch(/experience_records_v1[^\n]*HUMAN GATE/);
  });
});

describe("domain invariants in the SQL", () => {
  it("sentiment is binary — no stars, no numbers, no neutral", () => {
    expect(sql).toMatch(/sentiment\s+text not null check \(sentiment in \('positive','negative'\)\)/);
    expect(sql).not.toMatch(/\brating\b|score integer|score numeric|1\s*to\s*5/i);
  });
  it("moderation and dispute are SEPARATE dimensions", () => {
    expect(sql).toMatch(/moderation_status[\s\S]{0,120}'submitted','in_moderation','published','rejected'/);
    expect(sql).toMatch(/dispute_status[\s\S]{0,160}'none','opened','under_review'/);
    // disputed is NOT a moderation state
    expect(sql).not.toMatch(/moderation_status[\s\S]{0,160}disputed/);
  });
  it("one record per author+subject+interaction (both subject shapes)", () => {
    expect(sql).toMatch(/experience_records_one_per_interaction_worker/);
    expect(sql).toMatch(/experience_records_one_per_interaction_org/);
  });
  it("no self-review at the DB layer", () => {
    expect(sql).toMatch(/subject_profile_id <> author_profile_id/);
  });
  it("writes are RPC-only; anon has NOTHING (revoke all, then grant back one)", () => {
    // Supabase's default privileges hand every new public table SELECT to BOTH
    // anon and authenticated. A `revoke insert, update, delete` alone leaves
    // anon holding SELECT — RLS still returns no rows, but anon evaluating the
    // policy hits is_admin(), which anon cannot execute, so the read ERRORS
    // instead of coming back empty. The behavioural proof caught this; the
    // migration now revokes ALL first.
    expect(sql).toMatch(/revoke all on public\.experience_records from anon, authenticated/);
    expect(sql).toMatch(/revoke all on public\.experience_responses from anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.experience_records to authenticated/);
    expect(sql).not.toMatch(/grant select on public\.experience_\w+ to anon/);
    for (const fn of [
      "submit_experience_record",
      "decide_experience_moderation",
      "open_experience_dispute",
      "resolve_experience_dispute",
      "get_experience_counts",
    ]) {
      expect(sql, fn).toMatch(new RegExp(`revoke execute on function public\\.${fn}[^;]*from public, anon`));
    }
    // definer functions pin their search_path
    const definers = sql.match(/security definer/g) ?? [];
    const pinned = sql.match(/security definer set search_path = public/g) ?? [];
    expect(definers.length).toBe(pinned.length);
  });
  it("server-side eligibility is re-derived inside the submit RPC", () => {
    expect(sql).toMatch(/booking_requests[\s\S]{0,400}start_date <= current_date/);
    expect(sql).toMatch(/engagement_contexts[\s\S]{0,300}(status = 'ended' or ec\.ended_at is not null)/);
    expect(sql).toMatch(/service_offering_requests[\s\S]{0,200}status = 'accepted'/);
    expect(sql).toMatch(/duplicate_for_interaction/);
  });
  it("moderator decisions require a reason; author can never self-publish", () => {
    expect(sql).toMatch(/reason_required/);
    // the ONLY path to published is the admin-gated decide RPC
    const decide = sql.slice(sql.indexOf("decide_experience_moderation"));
    expect(decide).toMatch(/is_admin\(\)/);
    expect(sql).toMatch(/moderation_status <> 'rejected' or moderation_reason is not null/);
  });
  it("every action audits into the ONE audit chain, and nothing DELETEs", () => {
    for (const action of [
      "experience_submitted",
      "moderation_started",
      "moderation_decided",
      "response_submitted",
      "response_moderated",
      "dispute_opened",
      "dispute_review_started",
      "dispute_resolved",
    ]) {
      expect(sql, action).toContain(action);
    }
    expect(sql).toMatch(/insert into public\.audit_logs/);
    // no DELETE statement anywhere in the domain SQL (hide-by-state only)
    expect(sql).not.toMatch(/\bdelete from\b/i);
  });
  it("the count derivation counts ONLY published, disputed surfaced, removed excluded", () => {
    const counts = sql.slice(sql.indexOf("get_experience_counts"));
    expect(counts).toMatch(/moderation_status = 'published'/);
    expect(counts).toMatch(/dispute_status <> 'resolved_removed'/);
    expect(counts).toMatch(/dispute_status in \('opened','under_review'\)/);
    // nothing else feeds it
    expect(counts).not.toMatch(/worker_skills|journal_entry|learning_signals|confidence/);
  });
});

describe("the ONE aggregation rule (pure mirror truth table)", () => {
  const row = (
    sentiment: "positive" | "negative",
    moderationStatus: "submitted" | "in_moderation" | "published" | "rejected",
    disputeStatus:
      | "none"
      | "opened"
      | "under_review"
      | "resolved_upheld"
      | "resolved_changed"
      | "resolved_removed" = "none",
  ) => ({ sentiment, moderationStatus, disputeStatus });

  it("only PUBLISHED rows count; positive and negative separately", () => {
    const counts = deriveExperienceCounts([
      row("positive", "published"),
      row("positive", "submitted"),
      row("positive", "in_moderation"),
      row("positive", "rejected"),
      row("negative", "published"),
    ]);
    expect(counts).toEqual({ positive: 1, negative: 1, disputed: 0, totalConsidered: 2 });
  });

  it("a disputed published row STAYS counted and is surfaced as disputed", () => {
    const counts = deriveExperienceCounts([
      row("positive", "published", "opened"),
      row("negative", "published", "under_review"),
    ]);
    expect(counts.positive).toBe(1);
    expect(counts.negative).toBe(1);
    expect(counts.disputed).toBe(2);
  });

  it("resolved_removed leaves the counts entirely (hide-by-state, no delete)", () => {
    const counts = deriveExperienceCounts([
      row("negative", "published", "resolved_removed"),
      row("positive", "published", "resolved_upheld"),
    ]);
    expect(counts).toEqual({ positive: 1, negative: 0, disputed: 0, totalConsidered: 1 });
  });

  it("insufficient data is ABSENCE, not a zero-reputation", () => {
    const counts = deriveExperienceCounts([row("positive", "submitted")]);
    expect(counts.totalConsidered).toBe(0);
    // the app maps totalConsidered 0 → state "none" (never renders 0/0 as a
    // reputation) — pinned on the source:
    const src = readFileSync(join(WEB, "lib/trust/experience-records.ts"), "utf8");
    expect(src).toMatch(/totalConsidered === 0\) return \{ state: "none" \}/);
  });

  it("evidence/skills/confidence/signals can never leak into the derivation", () => {
    const src = readFileSync(join(WEB, "lib/trust/experience-records.ts"), "utf8");
    expect(src).not.toMatch(/worker_skills|journal_entry|learning_signal|computeConfidence/);
  });
});

describe("fail-closed app side", () => {
  const src = readFileSync(join(WEB, "lib/trust/experience-records.ts"), "utf8");
  it("absent migration maps to needs_migration — never a fake success", () => {
    expect(src).toMatch(/42883.*PGRST202.*42P01.*PGRST205|ABSENT_CODES/);
    expect(src).toMatch(/needs_migration/);
  });
  it("no fallback write path into legacy artifacts", () => {
    expect(src).not.toMatch(/journal_entry_confirmations|booking_request_events|learning_review_queue/);
    // Reads go through RLS-scoped .from().select(); WRITES are RPC-only —
    // no .insert/.update/.upsert/.delete anywhere in the domain module.
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    // and the only tables it reads are its own
    const tables = [...src.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["experience_records"]));
  });
  it("old subjective artifacts stay unmigrated (no backfill anywhere)", () => {
    // The only INSERT into experience_records is the submit RPC's VALUES
    // insert — never an INSERT..SELECT backfill from legacy artifacts.
    expect(sql).not.toMatch(/insert into public\.experience_records[\s\S]{0,300}\bselect\b[\s\S]{0,200}from public\.(journal_entry_confirmations|booking_request_events|learning_review_queue)/i);
    expect(sql).not.toMatch(/from public\.journal_entry_confirmations/);
  });
});
