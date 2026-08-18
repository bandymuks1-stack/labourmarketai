import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ANON_SECDEF_ALLOWLIST,
  signatureOf,
} from "../security/anon-secdef-allowlist";
import { CANONICAL_APP_RPCS } from "../security/canonical-authenticated-rpcs";

/**
 * Pins the local-reset reproducibility fix for
 * `20260722160000_secdef_anon_reach_revoke_v1.sql`.
 *
 * Root cause it guards (MEASURED on a clean `supabase db reset`, not assumed):
 * the two environments start from different grant baselines. Production had a
 * leftover default PUBLIC grant on 43 hand-analysed functions and nothing else
 * open. A fresh local DB is the opposite: the Supabase bootstrap runs
 * `ALTER DEFAULT PRIVILEGES` granting EXECUTE EXPLICITLY to anon,
 * authenticated and service_role on every new `public` function, so ~235
 * SECURITY DEFINER functions carry an explicit `anon=X`. The migration's
 * fail-closed assertion ("anon reaches exactly the 4 allowlisted RPCs") was
 * written against the production end-state, so the chain was NOT reproducible
 * on a clean local DB — and a `REVOKE ... FROM PUBLIC` alone would not have
 * fixed it, because the local entries are explicit. The §4b block makes the migration the canonical closure
 * point (revoke PUBLIC + anon from every non-allowlisted secdef function),
 * idempotent on prod, deterministic on a fresh DB — with NO environment switch
 * that could weaken the production check.
 *
 * These are static source assertions; the live proof is `supabase db reset`
 * passing on a clean database (documented in the PR).
 */
const MIG = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260722160000_secdef_anon_reach_revoke_v1.sql",
);
const src = readFileSync(MIG, "utf8").replace(/\r/g, "");

/** The 9 trigger functions + 1 dead function §5d requires to hold no grant. */
const TRIGGER_ONLY = [
  "enforce_company_verification_guard()",
  "ensure_org_owner_engagement()",
  "ensure_worker_personal_engagement()",
  "ensure_worker_profile()",
  "handle_new_user()",
  "journal_entry_confirmations_guard()",
  "learning_review_queue_guard_stale()",
  "mirror_agency_to_org()",
  "mirror_company_to_org()",
  "owns_customer(c uuid)",
];

const ALLOWLIST = [
  "get_public_business_profile_v1(p_slug text)",
  "get_public_business_listings_v1(p_org_id uuid)",
  "get_public_business_services_v1(p_org_id uuid)",
  "submit_company_need_public_v1(p_locale text",
];

describe("secdef migration: local-reset reproducibility (baseline-independent closure)", () => {
  it("keeps the §4b dynamic closure that revokes PUBLIC + anon on non-allowlisted secdef functions", () => {
    // A loop over public SECURITY DEFINER functions …
    expect(src).toMatch(/for\s+r\s+in[\s\S]*prosecdef/i);
    // … that revokes execute from PUBLIC and anon (never authenticated/service_role).
    expect(src).toMatch(/revoke execute on function %s from public, anon/i);
  });

  it("excludes exactly the four intentionally-public RPCs from the closure", () => {
    for (const sig of ALLOWLIST) {
      expect(src, `allowlist signature missing: ${sig}`).toContain(sig);
    }
  });

  it("keeps the fail-closed §5 assertion (not weakened, still raises)", () => {
    expect(src).toMatch(/anon still reaches non-allowlisted SECURITY DEFINER function/i);
    expect(src).toMatch(/raise exception/i);
  });

  it("does NOT introduce an environment / GUC switch that disables the assertion", () => {
    // Owner directive: no production-reachable "skip security assertion" switch.
    expect(src).not.toMatch(/skip_secdef_assert/i);
    expect(src).not.toMatch(/current_setting\([^)]*skip/i);
  });

  it("the closure runs AFTER the §2b authenticated grants (helpers keep access)", () => {
    const grant8 = src.indexOf("grant  execute on function public.can_access_match");
    const closure = src.indexOf("revoke execute on function %s from public, anon");
    expect(grant8, "expected the §2b helper grant").toBeGreaterThan(0);
    expect(closure, "expected the §4b closure").toBeGreaterThan(grant8);
  });

  it("keeps the §4c revoke of `authenticated` on the trigger-only / dead set", () => {
    // The local baseline grants `authenticated` explicitly, so revoking
    // PUBLIC + anon alone leaves these ten granted and §5d cannot hold.
    expect(src).toMatch(/revoke execute on function %s from authenticated/i);
    for (const sig of TRIGGER_ONLY) {
      expect(src, `§4c must name ${sig}`).toContain(`'${sig}'`);
    }
  });

  it("§4c never revokes `authenticated` beyond that closed set", () => {
    const block = src.slice(src.indexOf("-- 4c."), src.indexOf("-- 4d."));
    const named = [...block.matchAll(/^\s*'([a-z0-9_]+\([^']*\))',?$/gim)].map(
      (m) => m[1],
    );
    expect(new Set(named)).toEqual(new Set(TRIGGER_ONLY));
  });

  it("no REVOKE in the migration ever targets service_role or postgres", () => {
    // Comments discuss both roles at length, so strip them before matching —
    // only executable statements count. Normalise CRLF first: `\r` is a line
    // terminator in JS regex, so `--.*$` would never match on a CRLF file.
    const code = src.replace(/\r/g, "").replace(/--.*$/gm, "");
    const revokes = code
      .split(";")
      .filter((s) => /\brevoke\b/i.test(s))
      .map((s) => s.replace(/\s+/g, " ").trim());
    expect(revokes.length, "expected REVOKE statements").toBeGreaterThan(0);
    for (const stmt of revokes) {
      expect(stmt, `REVOKE must not target service_role: ${stmt}`).not.toMatch(
        /\bservice_role\b/i,
      );
      expect(stmt, `REVOKE must not target postgres: ${stmt}`).not.toMatch(
        /\bfrom\b[^,]*\bpostgres\b/i,
      );
    }
  });
});

describe("secdef migration: no application RPC relies on an inherited/default grant", () => {
  /**
   * The §4b closure revokes PUBLIC from every non-allowlisted SECURITY DEFINER
   * function. Any application RPC whose only path for `authenticated` was that
   * inherited PUBLIC grant would therefore break under the production grant
   * model. This is the regression pin: every canonical RPC must hold an
   * EXPLICIT grant somewhere in the chain.
   *
   * A fresh `supabase db reset` CANNOT catch this class of defect on its own —
   * the local Supabase bootstrap grants `authenticated` explicitly on every new
   * function, masking the missing grant. Hence a static assertion.
   */
  const migrationsDir = join(MIG, "..");
  const allSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");

  // The one dynamic grant in the chain (agency-client bridge) grants every
  // function it creates, so its names count as explicitly granted.
  const dynamicallyGranted = /execute format\('grant execute on function public\.%s to authenticated', fn\)/.test(
    allSql,
  )
    ? [...allSql.matchAll(/^\s*'([a-z0-9_]+)\(/gim)].map((m) => m[1])
    : [];

  for (const rpc of CANONICAL_APP_RPCS) {
    it(`${rpc} has an explicit authenticated EXECUTE grant`, () => {
      const literal = new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+(public\\.)?${rpc}\\s*\\(`,
        "i",
      ).test(allSql);
      const inClosure = new RegExp(`'public\\.${rpc}\\(`, "i").test(src);
      expect(
        literal || inClosure || dynamicallyGranted.includes(rpc),
        `${rpc} is called by the app but no migration grants EXECUTE to authenticated — it would rely on an inherited/default grant`,
      ).toBe(true);
    });
  }
});

/**
 * The four signatures this 2026-07-22 CLOSURE migration knows about. Its §4b
 * block revokes anon from every secdef function outside this list, so the list
 * is a statement about the state of the schema AT CLOSURE TIME — not a cap on
 * the product forever.
 *
 * A function created by a LATER migration is not covered by, and must not be
 * added to, this file: the closure runs first in timestamp order and the later
 * migration re-grants afterwards, which is exactly why a fresh `supabase db
 * reset` still ends with the right ACLs. Widened 2026-08-18 when the public
 * vacancy preview functions (20260818140000) became the first legitimately
 * anon-reachable functions added after closure.
 *
 * The security property is NOT weakened: every allowlist entry — closure-era or
 * later — still has to carry a written contract (condition 6 of
 * check-anon-secdef-allowlist.mts), still has to be granted explicitly by a real
 * migration (lib/guards/secdef-anon-allowlist.test.ts), and is still diffed
 * against the live catalog in both directions by that same live guard.
 */
// Keyed by NAME, not by full signature: the argument list is the migration's
// business to state, and pinning it twice invites a copy that drifts from the
// real one (it did — an earlier revision of this guard hardcoded a wrong
// argument list for submit_company_need_public_v1).
const CLOSURE_ERA_NAMES: ReadonlySet<string> = new Set([
  "get_public_business_profile_v1",
  "get_public_business_listings_v1",
  "get_public_business_services_v1",
  "submit_company_need_public_v1",
]);

describe("secdef migration: the closure-era anon allowlist is intact", () => {
  it("every closure-era signature is still named by the migration", () => {
    const closure = ANON_SECDEF_ALLOWLIST.filter((e) =>
      CLOSURE_ERA_NAMES.has(e.name),
    ).map(signatureOf);
    // None of the four may quietly leave the allowlist: the migration would
    // then revoke a function the public product still calls.
    expect(closure).toHaveLength(CLOSURE_ERA_NAMES.size);
    for (const sig of closure) {
      expect(src, `migration must name ${sig}`).toContain(sig);
    }
  });

  it("post-closure additions are granted by their OWN migration, not this one", () => {
    const later = ANON_SECDEF_ALLOWLIST.filter(
      (e) => !CLOSURE_ERA_NAMES.has(e.name),
    ).map(signatureOf);
    const migrationsDir = join(MIG, "..");
    for (const sig of later) {
      const name = sig.slice(0, sig.indexOf("("));
      const grantedSomewhere = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql") && f > "20260722160000")
        .some((f) =>
          new RegExp(
            `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\([^)]*\\)\\s+to[^;]*\\banon\\b`,
            "i",
          ).test(readFileSync(join(migrationsDir, f), "utf8")),
        );
      expect(
        grantedSomewhere,
        `${sig} is allowlisted for anon but no migration after the closure grants it — it would rely on an inherited grant`,
      ).toBe(true);
    }
  });

  it("contact_demand_owner_v1 is revoked from anon explicitly, not just PUBLIC", () => {
    // Created AFTER the §4b closure, so the closure cannot cover it. Revoking
    // only PUBLIC left an explicit `anon=X` on a fresh reset — a fifth
    // anon-reachable secdef function.
    const contact = readFileSync(
      join(MIG, "..", "20260723053000_contact_demand_owner_v1.sql"),
      "utf8",
    );
    expect(contact).toMatch(
      /revoke execute on function public\.contact_demand_owner_v1\(uuid\) from anon/i,
    );
  });

  it("no migration grants EXECUTE to anon outside the allowlist", () => {
    const migrationsDir = join(MIG, "..");
    const allowed = ANON_SECDEF_ALLOWLIST.map((e) => e.name);
    for (const file of readdirSync(migrationsDir).filter((f) =>
      f.endsWith(".sql"),
    )) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      for (const m of sql.matchAll(
        /grant\s+execute\s+on\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)\s+to\s+([^;]+);/gim,
      )) {
        const [, fn, roles] = m;
        if (/\banon\b/i.test(roles)) {
          expect(
            allowed,
            `${file} grants EXECUTE to anon on non-allowlisted ${fn}`,
          ).toContain(fn);
        }
      }
    }
  });
});

describe("secdef: a new SECURITY DEFINER function cannot inherit a default EXECUTE grant", () => {
  /**
   * THE GAP THIS CLOSES (proven by mutation, 2026-07-25): the §4b closure in
   * 20260722160000 can only reach functions that already exist when it runs.
   * Adding a migration afterwards that merely does
   * `create function public.x() ... security definer` — with no grant lines at
   * all — yields an anon-reachable SECURITY DEFINER function, and BOTH
   * `supabase db reset` and every existing static guard still pass, because
   * nothing in the file grants anon explicitly for a guard to flag. The
   * reachability comes from the environment's default privileges.
   *
   * Rule: any migration ordered AFTER the closure that creates a SECURITY
   * DEFINER function in `public` must explicitly revoke anon on it (directly
   * or via a dynamic loop that names it), unless it is anon-allowlisted.
   */
  const CLOSURE_VERSION = "20260722160000";
  const migrationsDir = join(MIG, "..");
  const allowlisted = new Set(ANON_SECDEF_ALLOWLIST.map((e) => e.name));

  const later = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (f.split("_")[0] ?? "") > CLOSURE_VERSION);

  it("finds the post-closure migrations to check", () => {
    expect(later.length).toBeGreaterThan(0);
  });

  for (const file of later) {
    const sql = readFileSync(join(migrationsDir, file), "utf8").replace(
      /\r/g,
      "",
    );
    // Strip comments so documentation prose cannot satisfy the check.
    const code = sql.replace(/--.*$/gm, "");
    // Collapse whitespace so the checks below are plain substring tests —
    // dynamic RegExp built from a function name is easy to get subtly wrong.
    const flat = code.replace(/\s+/g, " ").toLowerCase();

    // Capture each CREATE FUNCTION's header — everything from `create` up to
    // the body delimiter `$$`. Slicing to the delimiter (rather than stopping
    // at `language`) is deliberate: `language sql security definer` and
    // `security definer language plpgsql` are both legal orderings, and cutting
    // at `language` would silently miss the first form.
    const secdefCreated: string[] = [];
    for (const m of flat.matchAll(
      /create (?:or replace )?function (?:public\.)?([a-z0-9_]+) ?\(/g,
    )) {
      const rest = flat.slice(m.index ?? 0, (m.index ?? 0) + 2000);
      const header = rest.includes("$$")
        ? rest.slice(0, rest.indexOf("$$"))
        : rest;
      if (header.includes("security definer")) secdefCreated.push(m[1]);
    }

    for (const fn of [...new Set(secdefCreated)]) {
      if (allowlisted.has(fn)) continue;

      it(`${file}: ${fn}() explicitly revokes anon`, () => {
        // Direct: "revoke all|execute on function [public.]fn(...) ... from ... anon"
        const direct = flat.includes(`on function public.${fn}(`)
          ? flat
              .split(`on function public.${fn}(`)
              .slice(1)
              .some((seg) => {
                const stmt = seg.slice(0, seg.indexOf(";"));
                return stmt.includes("from") && stmt.includes("anon");
              })
          : false;
        // Looped: a dynamic revoke that names this function in its array.
        const looped =
          flat.includes(
            "execute format('revoke all on function public.%s from anon'",
          ) && flat.includes(`'${fn}(`);
        expect(
          direct || looped,
          `${fn}() is SECURITY DEFINER and created after the ${CLOSURE_VERSION} closure, so the closure cannot reach it. Without an explicit "revoke ... from anon" it stays anon-reachable through the environment's default privileges.`,
        ).toBe(true);
      });
    }
  }
});
