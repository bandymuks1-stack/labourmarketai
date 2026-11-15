import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PARTNER REGISTRATION SLICE 1 — the company takeover rules stay in the SQL and stay reachable only
 * through the doors the owner approved (2026-11-10). The behaviour itself is proven against a real
 * PostgreSQL by scripts/db-proof/organization-claim-invitation-v1.sh; this guard keeps the shape from
 * drifting in later edits.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const NAME = "20261110190000_organization_claim_invitation_v1";
const sql = readFileSync(join(ROOT, "supabase", "migrations", `${NAME}.sql`), "utf8");
const down = readFileSync(join(ROOT, "supabase", "rollbacks", `${NAME}.down.sql`), "utf8");
const code = sql.replace(/^\s*--.*$/gm, "");
const fn = (name: string): string => {
  const start = code.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf("end $$;", start));
};

describe("company takeover: one invitation, one company, one address", () => {
  it("a claim invitation names its company and address and is single-use", () => {
    expect(code).toMatch(/invitation_type = 'claim_organization' and organization_id is not null\s+and invited_email is not null and max_uses = 1/);
  });

  it("only an operator can send one, and only for a company with no owner", () => {
    const f = fn("create_claim_invitation_v1");
    expect(f).toMatch(/is_admin\(\) or public\.has_platform_capability\('marketplace_company_ingest'\)/);
    expect(f).toMatch(/claim_state not in \('discovered', 'invited'\) or v_org\.owner_profile_id is not null/);
  });

  it("the generic accept doors can never accept it", () => {
    expect(code).toMatch(/claim_invitation_wrong_door/);
    expect(code).toMatch(/before update on public\.invitations/);
  });
});

describe("the representative proves the mailbox, never a timestamp", () => {
  it("acceptance and the request use the mailbox-proof boundary", () => {
    expect(fn("accept_claim_invitation_v1")).toMatch(/session_email_verified_v1\(\)/);
    expect(fn("submit_organization_verification_request_v1")).toMatch(/session_email_verified_v1\(\)/);
    expect(code).not.toMatch(/email_confirmed_at/);
  });

  it("acceptance is bound to the invited address and stated authority", () => {
    const f = fn("accept_claim_invitation_v1");
    expect(f).toMatch(/invitation_session_email_matches_v1\(v_inv\.invited_email\)/);
    expect(f).toMatch(/p_authority_confirmed is not true/);
    expect(f).toMatch(/inviter_cannot_claim/);
  });

  it("a request without an invitation leaves the company as it is", () => {
    expect(fn("submit_organization_verification_request_v1")).not.toMatch(/update public\.organizations/);
  });
});

describe("two operators, and no operator ever owns", () => {
  it("the inviting operator and the claimant cannot decide", () => {
    const f = fn("decide_organization_claim_v2");
    expect(f).toMatch(/v_claim\.claimant_profile_id = uid/);
    expect(f).toMatch(/i\.inviter_profile_id = uid/);
  });

  it("the link sets the claimant as owner and writes the membership itself", () => {
    const f = fn("link_verified_organization_claim_v1");
    expect(f).toMatch(/owner_profile_id = v_claim\.claimant_profile_id/);
    expect(f).toMatch(/insert into public\.company_memberships/);
    expect(f).toMatch(/insert into public\.engagement_contexts/);
    expect(f).toMatch(/if v_claim\.state = 'linked' then return 'already_linked'/);
  });

  it("a claimant with operator rights is refused at every step", () => {
    expect(fn("claimant_is_operator_v1")).toMatch(/platform_capability_grants g\s+where g\.profile_id = p_profile_id and g\.revoked_at is null/);
    for (const name of ["accept_claim_invitation_v1", "submit_organization_verification_request_v1", "decide_organization_claim_v2", "link_verified_organization_claim_v1"]) {
      expect(fn(name), name).toMatch(/claimant_is_operator_v1\(/);
    }
    expect(code).toMatch(/revoke all on function public\.claimant_is_operator_v1\(uuid\) from public, anon, authenticated;/);
  });

  it("no client role can call the link, and the old open doors are closed", () => {
    expect(code).toMatch(/revoke all on function public\.link_verified_organization_claim_v1\(uuid, uuid\) from public, anon, authenticated;/);
    expect(code).not.toMatch(/grant execute on function public\.link_verified_organization_claim_v1/);
    expect(code).toMatch(/revoke execute on function public\.request_organization_claim_v1\(uuid, text, text\) from public, anon, authenticated;/);
    expect(code).toMatch(/revoke execute on function public\.decide_organization_claim_v1\(uuid, text, text, text\) from public, anon, authenticated;/);
  });
});

describe("rollback", () => {
  it("is one transaction", () => {
    expect(down).toMatch(/^begin;$/m);
    expect(down).toMatch(/^commit;$/m);
  });

  // Owner rule 2026-11-11: a rollback never reopens the old open claim doors.
  it("keeps the old claim doors closed and never grants them back", () => {
    const code = down.replace(/^\s*--.*$/gm, "");
    expect(code).toMatch(/revoke execute on function public\.request_organization_claim_v1\(uuid, text, text\) from public, anon, authenticated;/);
    expect(code).toMatch(/revoke execute on function public\.decide_organization_claim_v1\(uuid, text, text, text\) from public, anon, authenticated;/);
    expect(code).not.toMatch(/\bgrant\b/i);
  });

  it("pauses with claim rows present: closes the new doors and keeps the data", () => {
    const code = down.replace(/^\s*--.*$/gm, "");
    expect(code).toMatch(/company takeover paused/);
    for (const fn of ["create_claim_invitation_v1", "accept_claim_invitation_v1", "submit_organization_verification_request_v1", "decide_organization_claim_v2", "get_claim_invitation_preview_v1"]) {
      expect(code).toContain(`revoke execute on function public.${fn}(`);
      expect(code).toMatch(new RegExp(`public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
    }
  });

  it("restores mirror_company_to_org without the claim-link guard", () => {
    const restored = down.slice(down.lastIndexOf("create or replace function public.mirror_company_to_org()"));
    expect(restored).not.toMatch(/lm\.claim_link/);
  });
});
