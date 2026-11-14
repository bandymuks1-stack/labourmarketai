import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Register 2.24 — experience records + disputes + right of reply.
 *
 * The v1 schema gives a dispute TWO moderator steps (opened → under_review →
 * resolved_*) and a reply its OWN moderation decision. The web app called
 * neither `review_experience_dispute` nor `moderate_experience_response`, so:
 *   - a dispute could be opened and never decided (`resolve_experience_dispute`
 *     refuses anything that is not `under_review`);
 *   - a reply could be written and never published.
 * Behaviour is proven on PostgreSQL 16 by
 * scripts/db-proof/experience-dispute-flow.sh; this file pins the wiring.
 */
const WEB = join(__dirname, "..", "..");
const ROOT = resolve(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const sql = readFileSync(
  join(ROOT, "supabase", "migrations", "20260802120000_experience_records_v1.sql"),
  "utf8",
);
const records = read("lib", "trust", "experience-records.ts");
const actions = read("lib", "trust", "experience-actions.ts");
const disputeItem = read("components", "app", "experience-dispute-item.tsx");
const replyItem = read("components", "app", "experience-response-moderation-item.tsx");
const panel = read("components", "app", "experience-moderation-panel.tsx");

describe("the database contract this wiring follows (unchanged v1 schema)", () => {
  it("a decision is accepted only from under_review, and review only from opened", () => {
    expect(sql).toMatch(/where id = p_id and dispute_status = 'under_review';/);
    expect(sql).toMatch(/set dispute_status = 'under_review', updated_at = now\(\)\s+where id = p_id and dispute_status = 'opened';/);
  });
  it("review, decision and reply moderation are admin-only in the RPC itself", () => {
    for (const fn of ["review_experience_dispute", "resolve_experience_dispute", "moderate_experience_response"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}(`));
      expect(body.slice(0, 600), fn).toMatch(/if not public\.is_admin\(\) then return jsonb_build_object\('ok', false, 'code', 'not_authorized'\)/);
    }
  });
});

describe("a dispute can be decided", () => {
  it("every dispute and reply RPC of the schema has a caller", () => {
    for (const fn of [
      "open_experience_dispute",
      "review_experience_dispute",
      "resolve_experience_dispute",
      "submit_experience_response",
      "moderate_experience_response",
    ]) {
      expect(records, fn).toContain(`"${fn}"`);
    }
  });
  it("the moderator item offers the review step while the dispute is opened", () => {
    expect(actions).toMatch(/export async function startDisputeReviewAction\(/);
    expect(disputeItem).toContain("startDisputeReviewAction");
    expect(disputeItem).toMatch(/status === "opened" \? \(/);
    expect(disputeItem).toContain('data-testid="experience-dispute-start-review"');
  });
  it("the moderator reads the subject's reason; no other list selects it", () => {
    expect(records).toMatch(/\.in\("dispute_status", \["opened", "under_review"\]\)[\s\S]{0,400}", dispute_reason,/);
    expect(records.match(/", dispute_reason,/g)?.length).toBe(1);
    expect(disputeItem).toContain('data-testid="experience-dispute-reason"');
    expect(panel).toContain("disputeReason={r.disputeReason}");
  });
  it("the item never claims a role: no client-side admin check, the RPC decides", () => {
    expect(disputeItem).not.toMatch(/isAdmin|role ===|superadmin/i);
    expect(replyItem).not.toMatch(/isAdmin|role ===|superadmin/i);
  });
});

describe("a reply can be published", () => {
  it("there is a reply queue and it never shows a failed read as empty", () => {
    expect(records).toMatch(/export async function listResponseQueue\(/);
    expect(panel).toContain('data-testid="experience-response-queue"');
    expect(panel).toMatch(/responses\.state !== "list" \? \(/);
  });
  it("the reply queue never hands the reply's author to the page", () => {
    // The author id is read on the server for the conflict check only; the
    // item type the page receives does not carry it.
    const type = records.slice(records.indexOf("export type ExperienceResponseQueueItem = {"));
    expect(type.slice(0, type.indexOf("};"))).not.toMatch(/author/i);
    expect(replyItem).not.toMatch(/author_profile_id|authorProfileId/);
  });
  it("a decision needs a reason before the RPC is called", () => {
    const fn = records.slice(records.indexOf("export async function moderateExperienceResponse("));
    expect(fn.slice(0, 500)).toMatch(/if \(args\.reason\.trim\(\)\.length < 1\) return \{ ok: false, code: "reason_required" \};/);
    expect(actions).toMatch(/decision !== "published" && decision !== "rejected"/);
  });
});

describe("owner rules of 2026-11-13", () => {
  const result = read("components", "app", "workspace", "experiences-result.tsx");
  it("1 — every moderator step refuses a party before the RPC is called", () => {
    // Record moderation is covered too: publishing one's own experience, or
    // rejecting one about oneself, is the same conflict.
    for (const fn of [
      "startExperienceModeration",
      "decideExperienceModeration",
      "startExperienceDisputeReview",
      "resolveExperienceDispute",
      "moderateExperienceResponse",
    ]) {
      const body = records.slice(records.indexOf(`export async function ${fn}(`));
      const call = body.indexOf("await rpc(");
      const refuse = body.indexOf("if (refused) return refused;");
      expect(refuse, fn).toBeGreaterThan(-1);
      expect(refuse, `${fn}: the refusal must come before the RPC`).toBeLessThan(call);
    }
    // The same code from the database maps to the same message.
    expect(records).toMatch(/const KNOWN_CODES = new Set\(\[[\s\S]*?"conflict_of_interest",[\s\S]*?\]\);/);
    // Unknown is not clear, and a refusal leaves a server trace (ids only).
    expect(records).toMatch(/if \(conflict === "clear"\) return null;/);
    expect(records).toMatch(/console\.warn\("\[experience\] moderator step refused", \{ step, recordId, conflict \}\);/);
    // A failed check is shown as "could not check", never as "you are a party".
    expect(records).toMatch(/if \(!viewerId \|\| managed === null\) return "unknown";/);
    expect(disputeItem).toContain('"moderation.conflictUnknown"');
    expect(read("components", "app", "experience-moderation-item.tsx")).toContain(
      'data-testid="experience-moderation-conflict"',
    );
    expect(disputeItem).toContain('data-testid="experience-dispute-conflict"');
    expect(replyItem).toContain('data-testid="experience-response-moderation-conflict"');
  });
  it("2 — the moderator sees the date and the age of the dispute's current step", () => {
    expect(disputeItem).toContain('data-testid="experience-dispute-age"');
    expect(disputeItem).toMatch(/format\.relativeTime\(new Date\(stepAt\), new Date\(now\)\)/);
    // The same date on the server and in any browser time zone.
    expect(disputeItem).toMatch(/dateStyle: "medium", timeZone: "UTC"/);
    // No automatic decision: nothing in this domain decides by elapsed time.
    expect(records).not.toMatch(/deadline|expires|auto_?resolve/i);
  });
  it("3 — a disputed record keeps its marker on the parties' own list", () => {
    expect(result).toContain('data-testid="experience-dispute-marker"');
  });
  it("4 — 'changed' is neither offered nor accepted", () => {
    expect(disputeItem).toMatch(/\(\["upheld", "removed"\] as const\)\.map/);
    expect(disputeItem).not.toMatch(/"changed"\]/);
    expect(actions).toMatch(/if \(resolution !== "upheld" && resolution !== "removed"\) \{\s+return \{ ok: false, code: "invalid" \};/);
    expect(records).toMatch(/resolution: "upheld" \| "removed";/);
  });
  it("5 — the moderator is told the decision's reason is shown to both sides", () => {
    expect(disputeItem).toContain('"moderation.disputeReasonShared"');
    expect(disputeItem).not.toContain('"moderation.reasonNotPublic"');
  });
  it("5 — both parties read the decision's reason", () => {
    expect(records).toMatch(/", dispute_resolution_reason"/);
    expect(result).toContain('data-testid="experience-dispute-decision"');
    expect(result).toMatch(/row\.disputeStatus\.startsWith\("resolved_"\) && row\.disputeResolutionReason/);
  });
  it("a failed dispute read is not shown as an empty queue", () => {
    expect(panel).toContain('data-testid="experience-dispute-queue-unavailable"');
  });
});

describe("copy and proof", () => {
  const KEYS = [
    "takeDispute",
    "disputeReasonLabel",
    "responseQueueTitle",
    "responseQueueEmpty",
    "replyToLabel",
    "disputeOpenedLabel",
    "disputeReviewStartedLabel",
    "conflictNotice",
    "conflictUnknown",
    "disputeReasonShared",
  ];
  for (const loc of ["en", "lt", "lv", "et", "de", "nl", "pl", "ru", "da", "no", "sv"]) {
    it(`${loc} carries the moderator strings`, () => {
      const m = JSON.parse(read("messages", `${loc}.json`)).experience.moderation;
      for (const k of KEYS) expect(m[k], `${loc}.${k}`).toBeTruthy();
      const exp = JSON.parse(read("messages", `${loc}.json`)).experience;
      expect(exp.dispute.decisionReasonLabel, loc).toBeTruthy();
      expect(m.errors.conflict_of_interest, loc).toBeTruthy();
    });
  }
  it("the PG16 proof ships with the change", () => {
    expect(existsSync(join(ROOT, "scripts", "db-proof", "experience-dispute-flow.sh"))).toBe(true);
  });
});
