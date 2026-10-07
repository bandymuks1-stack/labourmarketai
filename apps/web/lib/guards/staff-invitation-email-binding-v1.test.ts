import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * STAFF-INVITATION E-MAIL BINDING (owner item 6, 2026-10-04).
 *
 * Finding (real browser QA): an invitation addressed to an e-mail was a
 * BEARER capability. A stranger holding a forwarded link was offered Accept
 * and received a real engagement / assignment, consuming the invitee's link.
 *
 * Rule, enforced in the database at every token door: when
 * invitations.invited_email is present, the caller's SESSION e-mail
 * (auth.jwt() ->> 'email', trimmed, case-insensitive) must equal it, else the
 * call returns `email_mismatch` BEFORE anything is created, expired, declined
 * or counted. Invitations with NO invited_email (shareable / campaign links)
 * keep the token-only capability by design.
 *
 * Registration stays frictionless: this binding deliberately consults NO
 * verified-email state (PR #2152). Token possession + address match suffices.
 *
 * Runtime proof (189 assertions on a scratch PostgreSQL 16, BEFORE = live
 * bodies, AFTER = migration, rollback, composition with #2152):
 * scripts/db-proof/staff-invitation-email-binding-v1.sh.
 *
 * These static guards pin the properties a later "cleanup" would delete
 * without noticing.
 */

const ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const NAME = "20261003151100_staff_invitation_email_binding_v1";
const sql = read(`supabase/migrations/${NAME}.sql`);
const downPath = `supabase/rollbacks/${NAME}.down.sql`;
const down = read(downPath);
const stripComments = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
const body = stripComments(sql);

function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`create or replace function public\\.${name}\\(`, "i"));
  expect(start, `function ${name} not found`).toBeGreaterThanOrEqual(0);
  const next = src.indexOf("create or replace function", start + 10);
  const end = next === -1 ? src.length : next;
  return stripComments(src.slice(start, end));
}

const GATE = "invitation_session_email_matches_v1(v_row.invited_email)";

/** Every function that can read or consume an invitation BY TOKEN, and how it is gated. */
const REDEFINED = [
  "accept_invitation_apply_v2", // the v2 choke point: accept_invitation_v2 + accept_invitation_by_id_v2
  "accept_invitation_v1",
  "decline_invitation_v1",
  "decline_invitation_v2",
  "get_invitation_preview_v1",
  "get_invitation_preview_v2",
] as const;

describe("migration: a narrow, reversible, in-place rebinding", () => {
  it("carries the human-gate acknowledgement and says it is not an approval", () => {
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(sql.replace(/\n--\s*/g, " ")).toMatch(/NO OWNER APPROVAL EXISTS FOR THIS FILE YET/);
    expect(existsSync(join(ROOT, downPath))).toBe(true);
    expect(down).not.toMatch(/@human-gate-approved/);
  });

  it("is named by the section 16 convention and sits after the #2152 slot", () => {
    expect(NAME).toMatch(/^\d{14}_[a-z0-9_]+$/);
    expect(NAME > "20261003151000_email_verified_boundary_v1").toBe(true);
  });

  it("redefines exactly the six token-door bodies and nothing else", () => {
    const created = [...body.matchAll(/create or replace function public\.([a-z0-9_]+)\(/gi)].map(
      (m) => m[1],
    );
    expect(created.sort()).toEqual(
      [...REDEFINED, "invitation_session_email_matches_v1", "invitation_mask_email_v1"].sort(),
    );
  });

  it("does NOT redefine what PR #2152 redefines (order-independent composition)", () => {
    for (const fn of [
      "accept_invitation_by_id_v1",
      "accept_invitation_by_id_v2",
      "list_invitations_for_me_v1",
      "accept_invitation_v2",
      "accept_company_worker_invitation",
      "accept_agency_worker_invitation",
      "accept_agency_client_connection_v1",
    ]) {
      expect(body).not.toMatch(new RegExp(`function public\\.${fn}\\(`, "i"));
    }
  });

  it("adds no table, policy, grant to anon/authenticated/public, or data rewrite", () => {
    expect(body).not.toMatch(/\bcreate table\b|\balter table\b|\bpolicy\b/i);
    // The only grants restate the production ACL (authenticated on the RPC
    // doors); nothing is ever granted to anon / public, and the internal
    // apply_v2 stays unreachable from the API.
    const grants = [...body.matchAll(/^grant .*$/gim)].map((m) => m[0]);
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) expect(g).toMatch(/ to authenticated;$/);
    expect(body).toContain(
      "revoke all on function public.accept_invitation_apply_v2(uuid, uuid) from public, anon, authenticated;",
    );
    expect(body).not.toMatch(/grant execute on function public\.accept_invitation_apply_v2/i);
    expect(body).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop (table|column|policy)\b/i);
  });

  it("is SECURITY DEFINER with a pinned search_path on every function", () => {
    const defs = body.split(/create or replace function /i).slice(1);
    expect(defs.length).toBe(8);
    for (const d of defs) {
      // The mask is a pure immutable string function; every other body runs as definer.
      if (!d.startsWith("public.invitation_mask_email_v1")) expect(d).toMatch(/security definer/i);
      expect(d).toMatch(/set search_path to/i);
    }
  });

  it("the two helpers are internal: revoked from public, anon and authenticated", () => {
    for (const h of ["invitation_session_email_matches_v1(text)", "invitation_mask_email_v1(text)"]) {
      expect(body).toContain(
        `revoke all on function public.${h} from public, anon, authenticated;`,
      );
    }
  });
});

describe("the helper: the one rule", () => {
  const helper = fnBody(sql, "invitation_session_email_matches_v1");

  it("passes an invitation that carries NO address (shareable / campaign link)", () => {
    expect(helper).toMatch(/nullif\(trim\(coalesce\(p_invited, ''\)\), ''\) is null then true/);
  });

  it("compares the SESSION e-mail, trimmed and lower-cased on BOTH sides", () => {
    expect(helper).toMatch(/lower\(trim\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\)\)/);
    expect(helper).toMatch(/= lower\(trim\(p_invited\)\)/);
  });

  it("an empty session e-mail never matches an addressed invitation (fail closed)", () => {
    expect(helper).toMatch(/nullif\(lower\(trim\(coalesce\(auth\.jwt\(\)/);
    expect(helper).toMatch(/false\)/);
  });

  it("never consults profiles.email (user-writable) and requires NO verification", () => {
    expect(helper).not.toMatch(/profiles/i);
    for (const forbidden of [
      "session_email_verified_v1",
      "email_is_verified_v1",
      "email_confirmed_at",
      "email_verifications_v1",
      "profile_id_by_verified_email_v1",
    ]) {
      expect(body, `registration must stay frictionless: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the mask mirrors maskEmail() in the app model (first char + domain)", () => {
    const mask = fnBody(sql, "invitation_mask_email_v1");
    expect(mask).toMatch(/substr\(v, 1, 1\) \|\| '\*\*\*@'/);
    const model = read("apps/web/lib/invitations/model.ts");
    expect(model).toMatch(/return `\$\{local\[0\]\}\*\*\*@\$\{domain\}`/);
  });
});

describe("every door: the check precedes any read of state and any write", () => {
  for (const fn of REDEFINED) {
    it(`${fn} refuses BEFORE it creates, stamps, declines or counts anything`, () => {
      const b = fnBody(sql, fn);
      const gateAt = b.indexOf(GATE);
      expect(gateAt, `${fn} must call the gate`).toBeGreaterThan(0);
      // The first mutation / state-dependent branch of each body. Previews
      // only read: their effect is the full-shape return for the invitee.
      const effects = fn.startsWith("get_invitation_preview")
        ? ["'outcome', 'ok'"]
        : [
            "update public.",
            "insert into public.",
            "v_row.status",
            "v_row.expires_at",
            "from public.invitation_acceptances",
            "engagement_contexts",
            "project_worker_assignments",
            "demand_interest_signals",
          ];
      const firstEffect = Math.min(
        ...effects.map((n) => b.indexOf(n)).filter((i) => i >= 0),
      );
      expect(gateAt).toBeLessThan(firstEffect);
    });
  }

  it("the v2 token door and the v2 by-id door both reach the gate through apply_v2", () => {
    const live = read("supabase/migrations/20260917120000_universal_invitation_referral_network_v1.sql");
    const tokenDoor = fnBody(live, "accept_invitation_v2");
    const byIdDoor = fnBody(live, "accept_invitation_by_id_v2");
    expect(tokenDoor).toContain("accept_invitation_apply_v2(");
    expect(byIdDoor).toContain("accept_invitation_apply_v2(");
  });

  it("the mismatch answer is a clean outcome that names nothing", () => {
    for (const fn of ["accept_invitation_apply_v2", "accept_invitation_v1", "decline_invitation_v2"]) {
      expect(fnBody(sql, fn)).toContain("jsonb_build_object('outcome', 'email_mismatch')");
    }
    expect(fnBody(sql, "decline_invitation_v1")).toContain("return 'email_mismatch';");
  });

  it("apply_v2 gates before the same-person idempotency branch (nothing is read back to a stranger)", () => {
    const b = fnBody(sql, "accept_invitation_apply_v2");
    expect(b.indexOf(GATE)).toBeLessThan(b.indexOf("from public.invitation_acceptances"));
  });
});

describe("previews: a stranger gets a masked hint, never the address", () => {
  for (const fn of ["get_invitation_preview_v1", "get_invitation_preview_v2"]) {
    it(`${fn} returns the minimal email_mismatch shape`, () => {
      const b = fnBody(sql, fn);
      const start = b.indexOf("'email_mismatch'");
      expect(start).toBeGreaterThan(0);
      const block = b.slice(start, b.indexOf("end if;", start));
      expect(block).toContain("'invited_email_hint', public.invitation_mask_email_v1(v_row.invited_email)");
      for (const leaked of [
        "'invited_email'",
        "'invited_name'",
        "'personal_message'",
        "'proposed_role'",
        "'declared_context'",
        "'demand_role_text'",
        "'campaign_label'",
        "'invitation_id'",
        "'max_uses'",
      ]) {
        expect(block, `${fn} mismatch shape leaks ${leaked}`).not.toContain(leaked);
      }
      // ...and the full shape stays for the real invitee.
      expect(b).toContain("'invited_email', v_row.invited_email");
    });
  }

  it("the anonymous public preview is untouched: it never carried the address", () => {
    expect(body).not.toContain("get_invitation_public_preview_v1");
    const live = read("supabase/migrations/20260917120000_universal_invitation_referral_network_v1.sql");
    expect(fnBody(live, "get_invitation_public_preview_v1")).not.toContain("invited_email");
  });
});

describe("rollback: restores the live bodies and drops only the helpers", () => {
  it("re-creates all six functions and then drops the two helpers (order matters)", () => {
    for (const fn of REDEFINED) {
      expect(down).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`, "i"));
      expect(fnBody(down, fn).split("end $function$")[0]).not.toContain(
        "invitation_session_email_matches_v1",
      );
    }
    const dropAt = down.indexOf("drop function if exists public.invitation_session_email_matches_v1");
    expect(dropAt).toBeGreaterThan(down.lastIndexOf("create or replace function"));
    expect(down).toContain("drop function if exists public.invitation_mask_email_v1(text);");
  });
});

describe("app: every acceptance door the product calls is one of the gated doors", () => {
  const actions = read("apps/web/lib/invitations/actions.ts");
  const rpcs = [...actions.matchAll(/rpc\("((?:accept|decline)_invitation[a-z0-9_]*|get_invitation_preview[a-z0-9_]*)"/g)].map(
    (m) => m[1],
  );
  const page = read("apps/web/app/[locale]/invite/[token]/page.tsx");
  const previewRpcs = [...page.matchAll(/rpc\("(get_invitation_preview[a-z0-9_]*)"/g)].map((m) => m[1]);

  const GATED_OR_ADDRESS_BOUND = new Set([
    "accept_invitation_v2", // -> apply_v2 (gated here)
    "accept_invitation_v1", // gated here
    "accept_invitation_by_id_v2", // -> apply_v2 (gated here) and already requires invited_email = session e-mail
    "accept_invitation_by_id_v1", // already requires invited_email = session e-mail
    "decline_invitation_v2", // gated here
    "decline_invitation_v1", // gated here
    "get_invitation_preview_v2", // gated here
    "get_invitation_preview_v1", // gated here
  ]);

  it("finds the doors (a rename must not silently empty this guard)", () => {
    expect(new Set(rpcs).size).toBeGreaterThanOrEqual(6);
    expect(previewRpcs.length).toBeGreaterThanOrEqual(2);
  });

  it("no door exists in the app that this migration (or the live core) does not bind", () => {
    for (const r of [...rpcs, ...previewRpcs]) {
      expect(GATED_OR_ADDRESS_BOUND.has(r), `unreviewed invitation door: ${r}`).toBe(true);
    }
  });

  it("the by-id doors stay bound to the session e-mail in their own bodies", () => {
    const live = read("supabase/migrations/20260917120000_universal_invitation_referral_network_v1.sql");
    expect(fnBody(live, "accept_invitation_by_id_v2")).toMatch(/v_invited <> v_email/);
    const v1 = read("supabase/migrations/20260827200000_relationship_invitations_v1.sql");
    expect(fnBody(v1, "accept_invitation_by_id_v1")).toMatch(/invited_email\) <> v_email|v_email/);
  });

  it("the server actions pass the database outcome through unmapped (no swallowed refusal)", () => {
    expect(actions).toMatch(/const outcome = \(data\?\.outcome \?\? "error"\) as string;/);
    const pageActions = read("apps/web/lib/invitations/invite-page-actions.ts");
    expect(pageActions).toMatch(/\?notice=\$\{encodeURIComponent\(\s*result\.status === "ok" \? result\.outcome : "error"/);
  });
});

describe("app: the landing page shows the mismatch honestly", () => {
  const page = read("apps/web/app/[locale]/invite/[token]/page.tsx");

  it("handles outcome email_mismatch BEFORE the generic invalid state and before any accept form", () => {
    const mismatchAt = page.indexOf('preview.outcome === "email_mismatch"');
    expect(mismatchAt).toBeGreaterThan(0);
    expect(mismatchAt).toBeLessThan(page.indexOf('preview.outcome !== "ok"'));
    expect(mismatchAt).toBeLessThan(page.indexOf("acceptInviteFormAction}"));
  });

  it("renders only the MASKED hint and offers switching account", () => {
    const start = page.indexOf('preview.outcome === "email_mismatch"');
    const block = page.slice(start, page.indexOf('preview.outcome !== "ok"'));
    expect(block).toContain("preview.invited_email_hint");
    expect(block).not.toMatch(/preview\.invited_email\b(?!_hint)/);
    expect(block).not.toMatch(/invited_name|personal_message/);
    expect(block).toContain('data-testid="invite-email-mismatch"');
    expect(block).toContain('data-testid="invite-switch-account"');
    expect(block).not.toContain("invite-accept");
  });

  it("knows the notice token the accept/decline redirect carries", () => {
    expect(page).toMatch(/"email_mismatch",/);
  });

  const LOCALES = ["en", "lt", "de", "nl", "pl", "ru"] as const;
  for (const loc of LOCALES) {
    it(`${loc}: every key is present, real copy, no "demo"`, () => {
      const msgs = JSON.parse(read(`apps/web/messages/${loc}.json`));
      const ip = msgs.network.invitePage;
      for (const k of ["title", "body", "bodyNoHint", "untouched"]) {
        expect(typeof ip.emailMismatch[k], `${loc}.emailMismatch.${k}`).toBe("string");
        expect(ip.emailMismatch[k].length).toBeGreaterThan(20);
        expect(ip.emailMismatch[k]).not.toMatch(/demo/i);
      }
      expect(ip.emailMismatch.body).toContain("{email}");
      expect(ip.emailMismatch.bodyNoHint).not.toContain("{email}");
      expect(typeof ip.notices.email_mismatch).toBe("string");
      expect(ip.notices.email_mismatch).not.toMatch(/demo/i);
    });
  }
});

/**
 * CONVERGENCE AUDIT F3 (P2): the v1 accept/decline doors were a full parallel
 * implementation with no multi-use ledger -- ONE authenticated caller could
 * exhaust (or decline) a shareable multi-use link for everybody through
 * PostgREST. 20261003151500 takes them off the API; the app falls back to v1
 * ONLY when v2 is absent and never on a permission error.
 * Runtime proof: scripts/db-proof/invitation-v1-doors-not-api-callable-v1.sh.
 */
describe("F3: the v1 doors are not API-callable and the app never downgrades to them", () => {
  const N2 = "20261003151500_invitation_v1_doors_not_api_callable_v1";
  const sql2 = read(`supabase/migrations/${N2}.sql`);
  const down2 = read(`supabase/rollbacks/${N2}.down.sql`);
  const body2 = stripComments(sql2);
  const V1_DOORS = [
    "accept_invitation_v1(text)",
    "accept_invitation_by_id_v1(uuid)",
    "decline_invitation_v1(text)",
  ];

  it("is ordered after #2152 (151000) and #2155 (151100), is gated and has a rollback", () => {
    expect(N2 > NAME).toBe(true);
    expect(sql2.startsWith("-- @human-gate-approved")).toBe(true);
    expect(sql2.replace(/\n--\s*/g, " ")).toMatch(/NO OWNER APPROVAL EXISTS FOR THIS FILE YET/);
    expect(down2).not.toMatch(/@human-gate-approved/);
  });

  it("revokes EXECUTE on exactly the three v1 doors from public, anon and authenticated", () => {
    const stmts = body2.split(";").map((s) => s.trim()).filter(Boolean);
    expect(stmts).toEqual(
      V1_DOORS.map((d) => `revoke all on function public.${d} from public, anon, authenticated`),
    );
  });

  it("changes no body and grants nothing", () => {
    expect(body2).not.toMatch(/create or replace|\bgrant\b|\bdrop\b|\balter\b|\bupdate\b|\bdelete\b/i);
  });

  it("does NOT revoke the functions that still have legitimate callers", () => {
    expect(body2).not.toContain("create_invitation_v1");
    expect(body2).not.toContain("get_invitation_preview_v1");
    expect(body2).not.toContain("_v2");
  });

  it("the rollback restores the prior ACL (authenticated only, never anon / public)", () => {
    const grants = stripComments(down2).split(";").map((s) => s.trim()).filter(Boolean);
    expect(grants).toEqual(V1_DOORS.map((d) => `grant execute on function public.${d} to authenticated`));
  });

  const actions = read("apps/web/lib/invitations/actions.ts");

  it("isMissingV2 is function-absent ONLY (PGRST202 / 42883) -- never a permission error", () => {
    const fn = actions.slice(actions.indexOf("function isMissingV2("), actions.indexOf("function sha256Hex"));
    expect(fn).toContain('error.code === "PGRST202" || error.code === "42883"');
    const inner = fn.slice(fn.indexOf("if (!error)"));
    expect(inner).not.toMatch(/42501|permission|\.message/);
  });

  it("every v1 retry in the server actions sits behind isMissingV2", () => {
    for (const door of ["accept_invitation_v1", "decline_invitation_v1", "accept_invitation_by_id_v1"]) {
      const at = actions.indexOf(`rpc("${door}"`);
      expect(at, door).toBeGreaterThan(0);
      const lead = actions.slice(Math.max(0, at - 160), at);
      expect(lead, `${door} must only be retried when v2 is absent`).toMatch(/error && isMissingV2\(error\)/);
    }
  });

  it("the page's preview fallback is function-absent only too", () => {
    const page = read("apps/web/app/[locale]/invite/[token]/page.tsx");
    expect(page).toMatch(/error\.code === "PGRST202" \|\| error\.code === "42883"/);
    expect(page).toMatch(/if \(isMissingFunction\(error\)\) \{\s*\(\{ data, error \} = await asAny\(supabase\)\.rpc\("get_invitation_preview_v1"/);
  });
});

/** CONVERGENCE AUDIT F5 (P3): the token door and the by-id door do the same afterwards. */
describe("F5: one shared post-accept helper for the token and by-id doors", () => {
  const actions = read("apps/web/lib/invitations/actions.ts");
  const helperAt = actions.indexOf("async function afterInvitationAccepted(");
  const helper = actions.slice(helperAt, actions.indexOf("export async function acceptInvitationAction("));

  it("the helper notifies the inviter, the demand owner, records the funnel event and revalidates", () => {
    expect(helperAt).toBeGreaterThan(0);
    expect(helper).toContain("await emitInvitationAcceptedNotification(");
    expect(helper).toContain("await emitDemandInterestNotification(");
    expect(helper).toContain("emitServerFunnelEvent(FUNNEL_EVENTS.invitationAccepted");
    expect(helper).toContain("revalidatePath(`/${locale}/dashboard/network`)");
  });

  it("both doors call it, and neither emits those effects itself any more", () => {
    expect(actions.match(/await afterInvitationAccepted\(/g)?.length).toBe(2);
    expect(actions.match(/emitInvitationAcceptedNotification\(/g)?.length).toBe(1);
    expect(actions.match(/emitDemandInterestNotification\(/g)?.length).toBe(1);
    expect(actions.match(/FUNNEL_EVENTS\.invitationAccepted/g)?.length).toBe(1);
  });

  it("the invite page passes the locale so the network page refreshes after a token accept", () => {
    expect(read("apps/web/lib/invitations/invite-page-actions.ts")).toContain(
      "acceptInvitationAction({ token, locale })",
    );
  });
});
