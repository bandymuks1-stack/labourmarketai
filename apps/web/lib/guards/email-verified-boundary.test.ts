import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * WORKER_REGISTRATION_FRICTION_REMOVAL — the verified-email boundary, pinned.
 *
 * Registration is frictionless (Supabase "Confirm email" OFF => a live session
 * at signup). That session proves NOTHING about mailbox ownership, so every
 * database path that treats an email as proof must be gated on the SEPARATE
 * verified-email state (migration 20261003151000). The runtime proof lives in
 * scripts/db-proof/email-verified-boundary-v1.sh (real PostgreSQL); this file is
 * the static regression net that makes a re-introduced path fail CI.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(__dirname, "..", "..");
const NAME = "20261003151000_email_verified_boundary_v1";
const MIG = readFileSync(join(REPO, "supabase", "migrations", `${NAME}.sql`), "utf8");
const DOWN = readFileSync(join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`), "utf8");

/** The body of `create or replace function public.<name>(` up to its closing tag. */
function fnBody(sql: string, name: string): string {
  const start = sql.search(new RegExp(`create or replace function public\\.${name}\\(`, "i"));
  expect(start, `${name} is (re)defined`).toBeGreaterThanOrEqual(0);
  const tail = sql.slice(start);
  const ends = [tail.indexOf("$function$;"), tail.indexOf("end $$;")].filter((i) => i >= 0);
  expect(ends.length, `${name} has a closing tag`).toBeGreaterThan(0);
  return tail.slice(0, Math.min(...ends) + 12);
}

/** Source without comments (block + line) — guards read code, not prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("the verified-email surface exists and is locked down", () => {
  it("ships paired, forward-only files", () => {
    expect(existsSync(join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`))).toBe(true);
    expect(/^\d{14}_[a-z0-9_]+$/.test(NAME)).toBe(true);
  });

  it("evidence tables are RLS-on with every client privilege revoked", () => {
    for (const t of [
      "email_verifications_v1",
      "email_verification_requests_v1",
      "email_verification_policy_v1",
    ]) {
      expect(MIG).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
      expect(MIG).toMatch(new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`));
    }
    // No policy and no grant opens them.
    expect(MIG).not.toMatch(/create policy[^;]*email_verif/i);
    expect(MIG).not.toMatch(/grant (insert|update|delete|all)[^;]*email_verif/i);
  });

  it("the internal predicate, resolver and backfill are not callable by clients", () => {
    for (const f of [
      "email_is_verified_v1(uuid, text)",
      "profile_id_by_verified_email_v1(text)",
      "backfill_verified_emails_v1()",
    ]) {
      expect(MIG).toContain(`revoke all on function public.${f} from public, anon, authenticated`);
    }
    expect(MIG).not.toMatch(/grant execute on function public\.(email_is_verified_v1|profile_id_by_verified_email_v1|backfill_verified_emails_v1)/);
  });

  it("the three UI-facing functions grant authenticated only (never anon)", () => {
    for (const f of ["session_email_verified_v1()", "my_email_verification_v1()", "request_email_verification_v1()", "confirm_my_email_v1()"]) {
      expect(MIG).toContain(`revoke all on function public.${f} from public, anon`);
      expect(MIG).toContain(`grant execute on function public.${f} to authenticated`);
      expect(MIG).not.toContain(`grant execute on function public.${f} to anon`);
    }
  });

  it("every function is SECURITY DEFINER with a pinned search_path", () => {
    for (const f of ["email_is_verified_v1", "session_email_verified_v1", "profile_id_by_verified_email_v1", "my_email_verification_v1", "request_email_verification_v1", "confirm_my_email_v1", "backfill_verified_emails_v1"]) {
      const b = fnBody(MIG, f);
      expect(b, f).toMatch(/security definer/i);
      expect(b, f).toMatch(/set search_path to 'public', 'pg_temp'/i);
    }
  });
});

describe("the proof is a real proof of mailbox control, never an inference", () => {
  const confirm = fnBody(MIG, "confirm_my_email_v1");
  it("requires a session minted from a mailed one-time token (signed amr claim)", () => {
    expect(confirm).toMatch(/auth\.jwt\(\) -> 'amr'/);
    expect(confirm).toMatch(/in \('otp', 'magiclink'\)/);
  });
  it("is bound to a pending request, to the LIVE address, and to freshness", () => {
    expect(confirm).toMatch(/email_verification_requests_v1/);
    expect(confirm).toMatch(/from auth\.users u where u\.id = v_uid/);
    expect(confirm).toMatch(/v_proof_at < date_trunc\('second', v_req\.requested_at\)/);
    expect(confirm).toMatch(/interval '1 hour'/);
  });
  it("never infers verification from email_confirmed_at, the JWT email or profiles.email", () => {
    // email_confirmed_at appears ONLY in the one-time, cutover-bounded backfill.
    const outsideBackfill = MIG.replace(fnBody(MIG, "backfill_verified_emails_v1"), "");
    const code = outsideBackfill
      .replace(/select pg_temp\.patch_fn\([\s\S]*?\);/g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/email_confirmed_at/);
    for (const f of ["email_is_verified_v1", "confirm_my_email_v1", "request_email_verification_v1", "profile_id_by_verified_email_v1"]) {
      const b = fnBody(MIG, f).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      expect(b, f).not.toMatch(/email_confirmed_at/);
    }
  });
  it("the backfill is cutover-bounded: a post-flip autoconfirmed signup can never be backfilled", () => {
    const b = fnBody(MIG, "backfill_verified_emails_v1");
    expect(b).toMatch(/u\.email_confirmed_at <= v_cut/);
    expect(b).toMatch(/i\.created_at <= v_cut/);
    expect(b).toMatch(/on conflict \(profile_id, email\) do nothing/);
  });
  it("provider-derived verification is per-provider, explicit, and first-identity only", () => {
    const p = fnBody(MIG, "email_is_verified_v1");
    expect(p).toMatch(/i\.provider in \('google', 'linkedin_oidc'\)/);
    expect(p).not.toMatch(/facebook/);
    expect(p).toMatch(/\(i\.identity_data ->> 'email_verified'\) = 'true'/);
    expect(p).toMatch(/j\.created_at < i\.created_at/); // a LINKED identity proves nothing
  });
});

describe("every email-ASSERTED claim path is fail-closed before any lookup", () => {
  const CLAIMS: ReadonlyArray<readonly [string, string]> = [
    ["accept_invitation_by_id_v1", "'email_unverified'"],
    ["accept_invitation_by_id_v2", "'email_unverified'"],
    ["accept_company_worker_invitation", "'email_unverified'"],
    ["accept_agency_worker_invitation", "'email_unverified'"],
    ["accept_agency_client_connection_v1", "'email_unverified'"],
    ["decline_agency_client_connection_v1", "'email_unverified'"],
    ["list_invitations_for_me_v1", "'email_unverified', true"],
  ];
  for (const [fn, token] of CLAIMS) {
    it(`${fn} gates on session_email_verified_v1() before reading invitations`, () => {
      const b = fnBody(MIG, fn);
      const gate = b.indexOf("public.session_email_verified_v1()");
      expect(gate, "gate present").toBeGreaterThan(0);
      expect(b).toContain(token);
      // The gate precedes the first read of an invitation / connection table.
      const firstRead = b.search(/from public\.(invitations|company_worker_invitations|agency_worker_invitations|agency_client_connections)|update public\.agency_client_connections/);
      expect(firstRead, "reads an invitation table").toBeGreaterThan(0);
      expect(gate).toBeLessThan(firstRead);
    });
  }

  it("the three RLS select policies require a verified mailbox on the email branch", () => {
    for (const t of ["agency_client_connections", "agency_worker_invitations", "company_worker_invitations"]) {
      const re = new RegExp(`alter policy ${t}_select on public\\.${t}[\\s\\S]*?;`, "i");
      const m = MIG.match(re);
      expect(m, t).not.toBeNull();
      expect(m![0], t).toMatch(/lower\(invited_email\) = lower\([^;]*?\)\s+and public\.session_email_verified_v1\(\)\)/);
      // Owner / admin branches are untouched (no weakening).
      expect(m![0], t).toMatch(/is_admin\(\)/);
    }
  });

  it("no claim function trusts profiles.email (user-writable history, not identity)", () => {
    for (const [fn] of CLAIMS) {
      const b = fnBody(MIG, fn).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      // No comparison of profiles.email (or an aliased copy) anywhere in the claim body.
      expect(b, fn).not.toMatch(/\b(p|pr|profiles)\.email\b|lower\(\s*email\s*\)|from public\.profiles[^;]*where[^;]*\bemail\b/i);
    }
  });
});

describe("inviter-side resolution and money-adjacent paths resolve only verified owners", () => {
  it("each resolver is patched fail-closed (exact match count, no guessing)", () => {
    expect(MIG).toMatch(/refusing to guess/);
    for (const [sig, n] of [
      ["assign_training_v1(text,text,text)", 1],
      ["create_management_decision_v1(text,text,text,text,text)", 1],
      ["update_management_decision_v1(text,text,text,text,text)", 1],
      ["create_performance_review_v1(text,text,text)", 2],
      ["delegate_workflow_step_v1(text,text,text)", 1],
      ["membership_invite_v1(uuid,text,text)", 1],
    ] as const) {
      // Plain string search (no regex built from input): the patch call names the
      // signature; the call's expected-count + marker arguments end it.
      const at = MIG.indexOf(`patch_fn('public.${sig}'::regprocedure`);
      expect(at, sig).toBeGreaterThan(0);
      const call = MIG.slice(at, MIG.indexOf(");", at));
      expect(call.trimEnd().endsWith(`${n}, 'profile_id_by_verified_email_v1'`), sig).toBe(true);
    }
  });
  it("the two LMC paths use the verified predicate instead of email_confirmed_at", () => {
    expect(MIG).toMatch(/lmc_admin_grant_v1\(text,bigint,text,text,timestamp with time zone,text\)[\s\S]*?'public\.email_is_verified_v1\(u\.id, u\.email\)'/);
    expect(MIG).toMatch(/lmc_grant_promotional_v1\(text,uuid,text,text\)[\s\S]*?'public\.email_is_verified_v1\(u\.id, u\.email\)'/);
  });
  it("the resolver returns null for unknown, unverified and AMBIGUOUS matches", () => {
    const b = fnBody(MIG, "profile_id_by_verified_email_v1");
    expect(b).toMatch(/cardinality\(v_ids\) <> 1 then return null/);
  });
});

describe("token-proved doors stay token-proved; login/recovery/onboarding never consult the state", () => {
  it("the migration does not redefine the token accept or preview functions", () => {
    for (const f of ["accept_invitation_v1", "accept_invitation_v2", "accept_invitation_apply_v2", "get_invitation_preview_v1", "get_invitation_preview_v2"]) {
      expect(MIG).not.toMatch(new RegExp(`create or replace function public\\.${f}\\(`, "i"));
    }
  });
  it("sign-in, signup, recovery and onboarding code never call the verified-email RPCs", () => {
    for (const f of [
      "components/app/login-form.tsx",
      "components/app/signup-form.tsx",
      "components/app/reset-password-form.tsx",
      "components/app/forgot-password-form.tsx",
    ]) {
      const p = join(WEB, f);
      if (!existsSync(p)) continue;
      const src = readFileSync(p, "utf8");
      expect(stripComments(src), f).not.toMatch(/my_email_verification_v1|confirm_my_email_v1|request_email_verification_v1|lib\/auth\/email-verification/);
    }
  });
  it("the callback runs the proof ONLY for the verify_email flow and never blocks sign-in on it", () => {
    const src = readFileSync(join(WEB, "app", "[locale]", "auth", "callback", "route.ts"), "utf8");
    expect(src).toMatch(/if \(isVerifyEmailFlow\(url\.searchParams\)\)/);
    expect(stripComments(src).match(/rpc\(\s*"confirm_my_email_v1"/g)?.length).toBe(1);
    expect(src).toMatch(/verifyResult = vError \? "failed"/);
  });
});

describe("no UI renders an unverified email as verified", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (["node_modules", ".next", "tests"].includes(e) || e.startsWith(".next")) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e) && !/\.test\.|\.spec\./.test(e) && !/[\\/]lib[\\/]supabase[\\/]types\.ts$/.test(p)) out.push(p);
    }
    return out;
  }
  const files = ["app", "components", "lib"].flatMap((d) => walk(join(WEB, d)));

  it("no app code reads auth.users.email_confirmed_at / emailConfirmedAt as proof of anything", () => {
    const offenders = files.filter((f) => /email_confirmed_at|emailConfirmedAt|\.confirmed_at\b/.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders.map((f) => f.replace(WEB, ""))).toEqual([]);
  });

  it("the only readers of the verified state are the verification module and its prompt", () => {
    const readers = files
      .filter((f) => /my_email_verification_v1/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(WEB, "").replace(/\\/g, "/"));
    // Readers: the action module and the server-only app-layer gate; the RPC inventory only NAMES it.
    expect(readers).toEqual(["/lib/auth/email-verification-actions.ts", "/lib/auth/verified-email-gate.ts", "/lib/security/canonical-authenticated-rpcs.ts"]);
  });
});

describe("forward guard: new SQL may not trust an email without the verified predicate", () => {
  it("every migration after this one that reads the JWT email or email_confirmed_at also uses the verified predicate", () => {
    const dir = join(REPO, "supabase", "migrations");
    const later = readdirSync(dir).filter((f) => f.endsWith(".sql") && f > `${NAME}.sql`);
    const offenders = later.filter((f) => {
      const sql = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      const trusts = /jwt\(\)\s*->>\s*'email'|email_confirmed_at/i.test(sql);
      const gated = /session_email_verified_v1|email_is_verified_v1|profile_id_by_verified_email_v1/.test(sql);
      return trusts && !gated;
    });
    expect(offenders).toEqual([]);
  });
});

describe("rollback is safe and symmetric", () => {
  it("warns that the config flip must be reverted FIRST", () => {
    expect(DOWN).toMatch(/Confirm email" back ON FIRST/);
  });
  it("keeps mailbox_proof evidence instead of dropping it", () => {
    expect(DOWN).toMatch(/method = 'mailbox_proof'/);
  });
  it("restores every changed function and policy", () => {
    for (const f of ["accept_agency_client_connection_v1", "decline_agency_client_connection_v1", "accept_agency_worker_invitation", "accept_company_worker_invitation", "accept_invitation_by_id_v1", "accept_invitation_by_id_v2", "list_invitations_for_me_v1"]) {
      expect(DOWN, f).toMatch(new RegExp(`create or replace function public\\.${f}\\(`));
    }
    for (const t of ["agency_client_connections", "agency_worker_invitations", "company_worker_invitations"]) {
      expect(DOWN).toMatch(new RegExp(`alter policy ${t}_select on public\\.${t}`));
    }
  });
});
