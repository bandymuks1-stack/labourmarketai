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

/**
 * FORWARD GUARD. A migration after this one may not read the JWT e-mail (or
 * email_confirmed_at) as authority unless it uses the verified predicate —
 * with ONE narrow, structural exemption for TOKEN DOORS.
 *
 * Token door = possession of the one-time mailed secret is the proof; the JWT
 * e-mail is compared ONLY to bind an addressed invitation to its addressee (a
 * stranger with a different address is refused; an unverified registrant whose
 * address matches may accept — registration-friction removal). That is not
 * "e-mail as proof of mailbox", so no verified requirement applies — but only
 * where the e-mail read is structurally subordinate to a token_hash match.
 */
const TOKEN_DOOR_EXEMPT: ReadonlyArray<readonly [string, string]> = [
  [
    "20261003151100_staff_invitation_email_binding_v1.sql",
    "#2155 (owner-approved): addressed-invitation binding inside TOKEN doors; the JWT e-mail is read only in invitation_session_email_matches_v1, called only from bodies that select by token_hash",
  ],
];

/**
 * The shared acceptance CORE: it binds the addressee through the helper but is
 * not itself a door — it is reached only from doors that already proved
 * something (a token_hash match, or the verified predicate). The guard asserts
 * that caller property across every migration at or after this one.
 */
const SHARED_CORES: readonly string[] = ["accept_invitation_apply_v2"];

const VERIFIED_PREDICATE = /session_email_verified_v1|email_is_verified_v1|profile_id_by_verified_email_v1/;
const JWT_EMAIL_READ = /jwt\(\)\s*->>\s*'email'|email_confirmed_at/i;

function sqlCode(sql: string): string {
  return sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
}

/** Split into function chunks: [name, body]. Text before the first function is ignored. */
function functionChunks(code: string): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  const re = /create (?:or replace )?function\s+(?:public\.)?([a-z0-9_]+)/gi;
  const starts = [...code.matchAll(re)].map((m) => [m[1], m.index ?? 0] as const);
  starts.forEach(([name, at], i) => {
    out.push([name, code.slice(at, i + 1 < starts.length ? starts[i + 1][1] : code.length)] as const);
  });
  return out;
}

/** Why a file's JWT-email reads are NOT acceptable as a token door ([] = acceptable). */
function tokenDoorViolations(sql: string, helper: string, cores: readonly string[] = SHARED_CORES): string[] {
  const code = sqlCode(sql);
  const violations: string[] = [];
  const chunks = functionChunks(code);
  for (const [name, body] of chunks) {
    const reads = JWT_EMAIL_READ.test(body);
    const hasToken = /token_hash/i.test(body);
    const isCore = cores.includes(name);
    if (reads && name !== helper && !hasToken) {
      violations.push(`${name}: reads the JWT e-mail with no token_hash match`);
    }
    // The helper may only be CALLED from a body that selects by token_hash.
    if (name !== helper && !isCore && new RegExp(`\\b${helper}\\s*\\(`).test(body) && !hasToken) {
      violations.push(`${name}: calls ${helper} with no token_hash match`);
    }
  }
  // A JWT-email read outside any function body is never acceptable here.
  const firstFn = chunks.length ? code.search(/create (?:or replace )?function/i) : code.length;
  if (JWT_EMAIL_READ.test(code.slice(0, firstFn))) violations.push("top-level: reads the JWT e-mail outside a function");
  return violations;
}

describe("forward guard: new SQL may not trust an email without the verified predicate", () => {
  const dir = join(REPO, "supabase", "migrations");
  const later = readdirSync(dir).filter((f) => f.endsWith(".sql") && f > `${NAME}.sql`);
  const exempt = new Map(TOKEN_DOOR_EXEMPT);

  it("every migration after this one that reads the JWT email or email_confirmed_at uses the verified predicate (or is a structurally proven token door)", () => {
    const offenders = later.filter((f) => {
      const sql = sqlCode(readFileSync(join(dir, f), "utf8"));
      if (!JWT_EMAIL_READ.test(sql)) return false;
      if (VERIFIED_PREDICATE.test(sql)) return false;
      return !exempt.has(f);
    });
    expect(offenders).toEqual([]);
  });

  it("an exempt file must STRUCTURALLY be a token door: every JWT-email read is in the helper or in a token_hash body", () => {
    for (const f of exempt.keys()) {
      const path = join(dir, f);
      if (!existsSync(path)) continue; // exemption applies only where the file exists
      const v = tokenDoorViolations(readFileSync(path, "utf8"), "invitation_session_email_matches_v1");
      expect(v, `${f} is not a token door`).toEqual([]);
      // and it must not read email_confirmed_at at all
      expect(sqlCode(readFileSync(path, "utf8")), f).not.toMatch(/email_confirmed_at/i);
    }
  });

  it("the shared acceptance core is reached only from doors that proved something (token_hash or the verified predicate)", () => {
    const callers: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql") && x >= `${NAME}.sql`)) {
      for (const [name, body] of functionChunks(sqlCode(readFileSync(join(dir, f), "utf8")))) {
        if (SHARED_CORES.includes(name)) continue;
        if (!/accept_invitation_apply_v2\s*\(/.test(body)) continue;
        callers.push(`${f}:${name}`);
        expect(/token_hash/i.test(body) || VERIFIED_PREDICATE.test(body), `${f}:${name} calls the shared core without a token_hash match or the verified predicate`).toBe(true);
      }
    }
    expect(callers.length).toBeGreaterThan(0); // this migration's by-id door at least
  });

  it("every exemption is explicit, justified and references its decision", () => {
    expect(TOKEN_DOOR_EXEMPT.map(([f]) => f)).toContain("20261003151100_staff_invitation_email_binding_v1.sql");
    for (const [f, why] of TOKEN_DOOR_EXEMPT) {
      expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
      expect(why).toMatch(/#\d+/);
    }
  });

  describe("self-test of the structural check (synthetic migrations)", () => {
    const HELPER = "invitation_session_email_matches_v1";
    it("NEGATIVE: a function reading the JWT e-mail with no verified predicate and no token check is flagged", () => {
      const bad = `create or replace function public.claim_stuff(p_id uuid) returns text language plpgsql security definer as $$
        begin if lower(auth.jwt() ->> 'email') = (select invited_email from public.x where id = p_id) then return 'ok'; end if; return 'no'; end $$;`;
      expect(JWT_EMAIL_READ.test(sqlCode(bad))).toBe(true);
      expect(VERIFIED_PREDICATE.test(bad)).toBe(false);
      expect(tokenDoorViolations(bad, HELPER).length).toBeGreaterThan(0);
    });
    it("NEGATIVE: calling the helper from a body with no token_hash match is flagged", () => {
      const bad = `create or replace function public.invitation_session_email_matches_v1(p text) returns boolean language sql as $$ select lower(auth.jwt() ->> 'email') = p $$;
        create or replace function public.by_id_door(p_id uuid) returns text language plpgsql as $$
        begin if public.invitation_session_email_matches_v1('a@b.c') then return 'ok'; end if; return 'no'; end $$;`;
      expect(tokenDoorViolations(bad, HELPER).join("|")).toMatch(/by_id_door: calls invitation_session_email_matches_v1 with no token_hash/);
    });
    it("NEGATIVE: a top-level JWT e-mail read (policy / default) is flagged", () => {
      const bad = `alter policy p on public.t using (lower(auth.jwt() ->> 'email') = invited_email);
        create or replace function public.invitation_session_email_matches_v1(p text) returns boolean language sql as $$ select true $$;`;
      expect(tokenDoorViolations(bad, HELPER).join("|")).toMatch(/top-level/);
    });
    it("NEGATIVE: a core-named function does not excuse a DIFFERENT function reading the JWT e-mail", () => {
      const bad = `create or replace function public.accept_invitation_apply_v2(a uuid, b uuid) returns jsonb language plpgsql as $$ begin perform public.invitation_session_email_matches_v1('x'); return '{}'::jsonb; end $$;
        create or replace function public.sneaky(a uuid) returns text language sql as $$ select auth.jwt() ->> 'email' $$;`;
      expect(tokenDoorViolations(bad, HELPER).join("|")).toMatch(/sneaky: reads the JWT e-mail/);
    });
    it("POSITIVE: the helper plus a token_hash door is accepted", () => {
      const good = `create or replace function public.invitation_session_email_matches_v1(p text) returns boolean language sql as $$ select lower(trim(coalesce(auth.jwt() ->> 'email',''))) = lower(trim(p)) $$;
        create or replace function public.accept_invitation_v1(p_token text) returns text language plpgsql as $$
        begin perform 1 from public.invitations where token_hash = encode(digest(p_token,'sha256'),'hex') and public.invitation_session_email_matches_v1(invited_email); return 'ok'; end $$;`;
      expect(tokenDoorViolations(good, HELPER)).toEqual([]);
    });
    it("the verified-predicate path still passes without any exemption", () => {
      const gated = `create or replace function public.f() returns text language sql as $$ select case when public.session_email_verified_v1() and lower(auth.jwt() ->> 'email') = 'x' then 'ok' end $$;`;
      expect(VERIFIED_PREDICATE.test(gated)).toBe(true);
    });
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
