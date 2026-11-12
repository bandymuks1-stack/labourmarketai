import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Declining an invitation from one's own list (RED draft, needs the owner's
 * approval before it is applied). The list holds ids, not link tokens, so the
 * function is the by-id twin of decline_invitation_v2 and must keep BOTH
 * halves it copies: the by-id accept's gate and the token decline's body.
 */
const repo = join(__dirname, "..", "..", "..", "..");
const NAME = "20261112180000_decline_invitation_by_id_v1";
const sql = readFileSync(join(repo, "supabase/migrations", `${NAME}.sql`), "utf8");
const down = readFileSync(join(repo, "supabase/rollbacks", `${NAME}.down.sql`), "utf8");
const code = sql.replace(/^\s*--.*$/gm, "");
const actions = readFileSync(join(repo, "apps/web/lib/invitations/actions.ts"), "utf8");
const list = readFileSync(join(repo, "apps/web/components/app/invitation-list.tsx"), "utf8");

describe("decline_invitation_by_id_v1", () => {
  it("adds exactly one function and touches nothing else", () => {
    expect(code.match(/create or replace function/g)?.length).toBe(1);
    expect(code).not.toMatch(/\b(alter|drop|create)\s+(table|policy|trigger|index)\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("keeps the by-id gate: signed in, verified mailbox, the invited address", () => {
    expect(code).toMatch(/if uid is null then\s+raise exception 'Not authenticated'/);
    expect(code).toMatch(/if not public\.session_email_verified_v1\(\) then\s+return jsonb_build_object\('outcome', 'email_unverified'\)/);
    expect(code).toMatch(/lower\(v_row\.invited_email\) <> v_email then\s+return jsonb_build_object\('outcome', 'not_found'\)/);
  });

  it("an earlier acceptance wins, and a closed or expired invitation is not reopened", () => {
    expect(code).toMatch(/decision = 'accepted'\) then\s+return jsonb_build_object\('outcome', 'already_accepted'\)/);
    expect(code).toMatch(/if v_row\.status <> 'pending' then/);
    expect(code).toMatch(/if v_row\.expires_at <= now\(\) then/);
  });

  it("records the decision and an audit row; no client role but authenticated may call it", () => {
    expect(code).toMatch(/insert into public\.invitation_acceptances[\s\S]+'declined'/);
    expect(code).toMatch(/insert into public\.audit_logs[\s\S]+'decline_invitation_by_id_v1'/);
    expect(code).toMatch(/revoke all on function public\.decline_invitation_by_id_v1\(uuid\) from public, anon;/);
    expect(code).toMatch(/grant execute on function public\.decline_invitation_by_id_v1\(uuid\) to authenticated;/);
    expect(code).not.toMatch(/to anon\b/);
  });

  it("the rollback removes only that function", () => {
    expect(down).toMatch(/drop function if exists public\.decline_invitation_by_id_v1\(uuid\);/);
    expect(down.replace(/^\s*--.*$/gm, "")).not.toMatch(/\b(table|policy|delete|update)\b/i);
  });
});

describe("the list offers Decline through that one door", () => {
  it("the action calls the by-id function and reports a missing function as such", () => {
    expect(actions).toMatch(/rpc\("decline_invitation_by_id_v1", \{\s+p_invitation_id: input\.invitationId,/);
    expect(actions).toMatch(/isMissingSchema\(error\) \|\| isMissingV2\(error\)\s+\? \{ status: "needs-migration" \}/);
  });

  it("the button is withdrawn when the function is not there, never left dead", () => {
    expect(list).toContain("declineInvitationByIdAction({ invitationId: row.id, locale })");
    expect(list).toMatch(/if \(r\.status === "needs-migration"\) \{\s+setDeclineAvailable\(false\);/);
    expect(list).toMatch(/\{declineAvailable \? \(\s+<Button/);
  });
});
