import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  anyStandingDispute,
  contestWithdrawnBy,
  deriveEvidenceStanding,
  type RecordLifecycleEvent,
} from "@/lib/organization-evidence/evidence-state";

/**
 * Contest -> withdraw contest -> durable event -> current state -> UI.
 *
 * The contest half (policy + action + DISPUTED derivation) was already live.
 * This slice adds ONLY the way back, and the properties below are the ones a
 * later "cleanup" would delete without noticing:
 *
 *   - a withdrawal APPENDS an event; the contest is never erased;
 *   - pairing is per actor, so one party cannot clear another's contest;
 *   - the RPC authorises exactly as the dispute policy does, NULL-safely,
 *     is idempotent, and is not callable by anon;
 *   - a contest can be raised again after a withdrawal;
 *   - the surface offers withdrawal only for the VIEWER's OWN standing contest.
 *
 * Runtime proof (56 assertions on a scratch PostgreSQL 16):
 * scripts/db-proof/evidence-contest-withdraw-v1.sh.
 */

const ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const NAME = "20261003110000_subject_contest_withdraw_v1";
const sql = read(`supabase/migrations/${NAME}.sql`);
const downPath = `supabase/rollbacks/${NAME}.down.sql`;
const down = read(downPath);
/** Executable statements only; comments name the very things asserted absent. */
const body = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const SUBJECT = "subject-profile";
const ORG = "org-manager-profile";
const ev = (
  eventType: RecordLifecycleEvent["eventType"],
  createdAt: string,
  actorProfileId: string | null = SUBJECT,
): RecordLifecycleEvent => ({ eventType, createdAt, actorProfileId });

describe("migration: a narrow, additive, reversible write path", () => {
  it("carries the human-gate acknowledgement and says it is not an approval", () => {
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(sql).toMatch(/NO OWNER APPROVAL EXISTS FOR THIS FILE YET/);
    expect(existsSync(join(ROOT, downPath))).toBe(true);
  });

  it("widens the event set by exactly one value and keeps the rest", () => {
    expect(body).toContain("'dispute_withdrawn'");
    for (const kept of [
      "attested", "attestation_withdrawn", "independently_verified",
      "verification_withdrawn", "withdrawn", "reinstated", "disputed", "corrected",
    ]) {
      expect(body).toContain(`'${kept}'`);
    }
  });

  it("creates, alters and drops NO policy, and no UPDATE/DELETE authority", () => {
    expect(body).not.toMatch(/create policy/i);
    expect(body).not.toMatch(/alter policy/i);
    expect(body).not.toMatch(/drop policy/i);
    expect(body).not.toMatch(/\bgrant\s+(update|delete|all)\b/i);
  });

  it("never touches the record or deletes anything", () => {
    expect(body).not.toMatch(/update\s+public\.organization_evidence/i);
    expect(body).not.toMatch(/delete\s+from/i);
    expect(body).not.toMatch(/drop\s+table|drop\s+column/i);
  });

  it("hard-codes the event type; the caller cannot choose it", () => {
    expect(body).not.toMatch(/p_event_type/);
    expect(body).toMatch(/v_uid, null, null, null, v_note/);
    expect(body).toMatch(/'dispute_withdrawn', v_uid/);
  });

  it("authorises as the dispute policy does: linked subject, not a manager", () => {
    expect(body).toMatch(/op\.linked_profile_id = v_uid/);
    expect(body).toMatch(/op\.link_state = 'linked'/);
    expect(body).toMatch(/op\.organization_id = r\.organization_id/);
    // fail-closed on NULL, not coalesce(.., false) on a deny-guard
    expect(body).toMatch(/manages_organization\(v_org\) is distinct from false/);
  });

  it("is NULL-safe and gives ONE refusal (no existence oracle)", () => {
    expect(body).toMatch(/if v_uid is null then[\s\S]{0,120}42501/);
    expect(body).toMatch(/if v_org is null\s+or/);
    expect(body).not.toMatch(/record not found/i);
  });

  it("pins search_path, revokes public AND anon by name, grants authenticated only", () => {
    expect(body).toMatch(/security definer\s+set search_path to 'public'/g);
    const fn = "withdraw_organization_evidence_dispute_v1(uuid, text)";
    expect(body).toContain(`revoke all on function public.${fn} from public;`);
    expect(body).toContain(`revoke all on function public.${fn} from anon;`);
    expect(body).toContain(`grant execute on function public.${fn} to authenticated;`);
    expect(body).not.toMatch(/\bgrant\b[^;]*\bto\s+(anon|public)\b/i);
    expect(body).toContain(
      "revoke all on function public.organization_evidence_dispute_state_guard() from authenticated;",
    );
  });

  it("is idempotent: no standing contest appends nothing", () => {
    expect(body).toMatch(/'idempotent', true/);
    expect(body).toMatch(/if v_latest is distinct from 'disputed' then[\s\S]{0,200}return/);
  });

  it("serialises concurrent writers per (record, actor)", () => {
    expect(body.match(/pg_advisory_xact_lock/g)?.length).toBe(2);
  });

  it("replaces the one-contest-ever index so a re-contest is possible, keeping 23505", () => {
    expect(body).toMatch(/drop index if exists public\.organization_evidence_events_one_dispute_per_actor/);
    expect(body).toMatch(/errcode = '23505'/);
    expect(body).toMatch(/before insert on public\.organization_evidence_events/);
  });

  it("rollback refuses rather than failing halfway and never deletes a contest", () => {
    expect(down).toMatch(/^begin;/m);
    expect(down).toMatch(/^commit;/m);
    expect(down).toMatch(/raise exception/i);
    expect(down).toContain("dispute_withdrawn");
    expect(down).toMatch(/having count\(\*\) > 1/);
    expect(down).not.toMatch(/delete\s+from/i);
    expect(down).toContain("drop function if exists public.withdraw_organization_evidence_dispute_v1");
    expect(down).toContain("create unique index if not exists organization_evidence_events_one_dispute_per_actor");
  });
});

describe("derived state: latest wins PER ACTOR, history is never erased", () => {
  it("a withdrawn contest stops standing but the contest event remains", () => {
    const events = [
      ev("disputed", "2026-10-01T10:00:00Z"),
      ev("dispute_withdrawn", "2026-10-02T10:00:00Z"),
    ];
    expect(anyStandingDispute(events)).toBe(false);
    expect(deriveEvidenceStanding("ORGANIZATION_REPORTED", events).state).toBe(
      "ORGANIZATION_REPORTED",
    );
    // The fact that the contest existed is still in the record.
    expect(events.some((e) => e.eventType === "disputed")).toBe(true);
    expect(contestWithdrawnBy(events, SUBJECT)).toBe(true);
  });

  it("re-contesting after a withdrawal stands again", () => {
    const events = [
      ev("disputed", "2026-10-01T10:00:00Z"),
      ev("dispute_withdrawn", "2026-10-02T10:00:00Z"),
      ev("disputed", "2026-10-03T10:00:00Z"),
    ];
    expect(anyStandingDispute(events)).toBe(true);
    expect(deriveEvidenceStanding("ORGANIZATION_REPORTED", events).state).toBe("DISPUTED");
    expect(contestWithdrawnBy(events, SUBJECT)).toBe(false);
  });

  it("one party's withdrawal cannot clear another party's contest", () => {
    const events = [
      ev("disputed", "2026-10-01T10:00:00Z", ORG),
      ev("disputed", "2026-10-02T10:00:00Z", SUBJECT),
      ev("dispute_withdrawn", "2026-10-03T10:00:00Z", SUBJECT),
    ];
    expect(anyStandingDispute(events)).toBe(true);
  });

  it("an unattributable contest is its own party and still stands", () => {
    const events = [
      ev("disputed", "2026-10-02T10:00:00Z", null),
      ev("dispute_withdrawn", "2026-10-03T10:00:00Z", SUBJECT),
    ];
    expect(anyStandingDispute(events)).toBe(true);
  });

  it("a withdrawal with nothing to withdraw changes nothing", () => {
    const events = [ev("dispute_withdrawn", "2026-10-03T10:00:00Z")];
    expect(anyStandingDispute(events)).toBe(false);
    expect(contestWithdrawnBy(events, SUBJECT)).toBe(false);
  });

  it("a timestamp tie goes to the withdrawal, as the database orders it", () => {
    const t = "2026-10-02T10:00:00Z";
    expect(anyStandingDispute([ev("disputed", t), ev("dispute_withdrawn", t)])).toBe(false);
  });

  it("a standing contest still outranks an attestation (precedence unchanged)", () => {
    const events = [
      ev("attested", "2026-10-05T10:00:00Z", ORG),
      ev("disputed", "2026-10-06T10:00:00Z"),
    ];
    expect(deriveEvidenceStanding("ORGANIZATION_REPORTED", events).state).toBe("DISPUTED");
  });
});

describe("server action, domain operation and surface", () => {
  const action = read("apps/web/lib/organization-evidence/dispute-actions.ts");
  const core = read("apps/web/lib/organization-evidence/import-core.ts");
  const section = read("apps/web/components/app/organization-evidence-section.tsx");

  it("the action calls the RPC through the domain core and re-derives the caller", () => {
    expect(action).toMatch(/export async function withdrawEvidenceContestAction/);
    expect(action).toMatch(/auth\.getUser\(\)/);
    expect(action).toMatch(/withdrawEvidenceRecordDispute\(/);
    expect(action).not.toMatch(/form\.get\(\s*["']organization_id["']/);
    expect(action).not.toMatch(/event_type:\s*["']dispute_withdrawn["']/);
  });

  it("the domain operation maps 42501 to a refusal, never to success", () => {
    expect(core).toMatch(/withdraw_organization_evidence_dispute_v1/);
    expect(core).toMatch(/code === "42501"[\s\S]{0,80}not_subject/);
    expect(action).toMatch(/not_subject[\s\S]{0,80}not_allowed/);
  });

  it("withdraw is offered only for the viewer's OWN standing contest", () => {
    expect(section).toMatch(/rec\.disputedByViewer \? \(\s*<WithdrawContest/);
    expect(section).toMatch(/data-testid="evidence-dispute-withdraw"/);
    expect(section).toMatch(/data-testid="evidence-dispute-withdrawn"/);
    expect(section).toMatch(/data-testid="evidence-dispute-withdrawn-history"/);
    expect(section).toMatch(/rec\.contestWithdrawnByViewer/);
  });

  it("the view derives disputedByViewer per viewer from the standing, not from mere existence", () => {
    expect(core).toMatch(/anyStandingDispute\(\s*events\.filter\(\(e\) => e\.actorProfileId === filter\.viewerProfileId\)/);
  });

  const KEYS = [
    "disputeWithdraw", "disputeWithdrawHint", "disputeWithdrawn",
    "disputeNotStanding", "disputeWithdrawnHistory", "disputeWithdrawFailed",
  ];
  it("every locale carrying the section has all the keys, and the copy never claims erasure", () => {
    const withFeature = ["en", "lt", "ru", "de", "nl", "pl"].filter((l) =>
      Boolean(JSON.parse(read(`apps/web/messages/${l}.json`)).evidenceImport),
    );
    expect(withFeature.length).toBe(6);
    for (const loc of withFeature) {
      const r = JSON.parse(read(`apps/web/messages/${loc}.json`)).evidenceImport.records;
      for (const k of KEYS) expect(r[k], `${loc}.${k}`).toBeTruthy();
    }
    const en = JSON.parse(read("apps/web/messages/en.json")).evidenceImport.records;
    expect(en.disputeWithdrawHint).toMatch(/stays on file/i);
    expect(en.disputeWithdrawn).toMatch(/stays on file/i);
    expect(en.disputeWithdrawnHistory).toMatch(/both are on file/i);
  });
});
