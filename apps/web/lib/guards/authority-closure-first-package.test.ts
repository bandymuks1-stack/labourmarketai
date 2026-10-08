import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AUTHORITY CLOSURE - FIRST PACKAGE guard (audit 2026-10-06: A1, F-1, F-4, F-8).
 *
 * Static and secret-free. The RUNTIME proof (every exploit denied, every
 * legitimate workflow preserved, against a real PostgreSQL as a real role) is
 * scripts/db-proof/authority-closure-first-package.sh; this guard keeps the
 * closure from being quietly undone:
 *   1. the four migrations + paired rollbacks exist, carry the human gate and
 *      state the closure;
 *   2. the creation authority is minted ONLY by the §8.1 gate modules, and the
 *      service client in the communication core writes ONLY other participants;
 *   3. any FUTURE lmc_* money function must be server-only (feature flags are a
 *      kill switch, not authorization).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const rd = (rel: string, root = REPO) => readFileSync(resolve(root, rel), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const M = {
  hours: "20261006100000_work_hour_allocations_integrity_guard_v1",
  conv: "20261006100100_conversation_participants_server_authority_v1",
  emp: "20261006100200_employer_authority_not_self_asserted_v1",
  lmc: "20261006100300_lmc_ledger_server_only_execute_v1",
} as const;

describe("the four migrations ship paired, gated and stated", () => {
  for (const [key, name] of Object.entries(M)) {
    it(`${key}: migration + rollback exist, carry the RED human-gate route and are NOT an approval`, () => {
      const up = rd(`supabase/migrations/${name}.sql`);
      expect(existsSync(resolve(REPO, `supabase/rollbacks/${name}.down.sql`))).toBe(true);
      expect(up).toMatch(/^-- @human-gate-approved/m);
      expect(up).toMatch(/NO OWNER APPROVAL[\s-]*EXISTS/);
      expect(up).toMatch(/ROLLBACK: supabase\/rollbacks\//);
      expect(up).toMatch(/\bbegin;[\s\S]*\bcommit;/i);
    });
  }

  it("timestamps sort after the last pending migration (apply order is preserved)", () => {
    const names = readdirSync(resolve(REPO, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
    // Sibling migrations that landed from other PRs of the same 2026-10-06
    // train carry later versions but are NOT pending work this package must
    // sort behind: 100400 (append-only privilege closure, #2164, which itself
    // revokes on tables created by this package's neighbours) and 100500
    // (invitation signup context, already applied). Every other migration still
    // must sort strictly before these four.
    const SIBLINGS = [
      "20261006100400_",
      "20261006100500_",
      // 2026-10-07 RED tiers A2-G release: later-train siblings, applied individually.
      "20261006120000_",
      "20261006130000_",
      "20261007100000_",
      "20261007120000_",
      "20261007130000_",
      // 2026-10-08 owner-approved work-plan scope extension (roster + engagement).
      "20261007140000_",
      // 2026-10-08 (#2191, owner-approved RED): unshare withdraws live agency offers.
      "20261008090000_",
    ];
    const before = names.filter(
      (n) => !Object.values(M).some((m) => n.startsWith(m)) && !SIBLINGS.some((s) => n.startsWith(s)),
    );
    const latestOther = before.sort().at(-1)!;
    for (const name of Object.values(M)) expect(name > latestOther).toBe(true);
  });
});

describe("A1 - hours ledger: end users record, they do not approve or move tenants", () => {
  const sql = strip(rd(`supabase/migrations/${M.hours}.sql`));
  it("worker branch is tied to the organization (is_org_member_or_engaged_v1) on insert AND update", () => {
    expect(sql.match(/public\.owns_worker\(worker_id\)\s*and\s*public\.is_org_member_or_engaged_v1\(organization_id\)/g)?.length).toBe(2);
    expect(sql).toMatch(/alter policy work_hour_allocations_insert/);
    expect(sql).toMatch(/alter policy work_hour_allocations_update/);
  });
  it("the guard pins status on insert and status/organization/worker/entered_by on update, for end-user roles only", () => {
    expect(sql).toMatch(/current_user not in \('authenticated', 'anon'\)/);
    expect(sql).toMatch(/new\.status is distinct from 'recorded'/);
    for (const col of ["status", "organization_id", "worker_id", "entered_by"]) {
      expect(sql).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(sql).toMatch(/before insert or update on public\.work_hour_allocations/);
  });
  it("no application writer sends a status (so the pin cannot break a legitimate workflow)", () => {
    for (const f of ["lib/work-hours/allocations-actions.ts", "lib/timesheet-import/import-confirm-actions.ts"]) {
      const src = strip(rd(f, APP));
      const inserts = src.match(/\.insert\(([\s\S]*?)\)\s*\.select/g) ?? [];
      expect(inserts.length).toBeGreaterThan(0);
      expect(inserts.join("\n")).not.toMatch(/\bstatus\s*:/);
    }
  });
  it("the allocation-writing code paths never grow a definer side door: only the two actions write the table", () => {
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (["node_modules", ".next", "tests", ".evidence"].includes(e.name)) continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
          const s = readFileSync(p, "utf8");
          if (/from\("work_hour_allocations"\)\s*\.(insert|update|upsert|delete)\(/.test(s.replace(/\s+/g, " ").replace(/\) \./g, ")."))) {
            writers.push(p.slice(APP.length + 1).replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(resolve(APP, "lib"));
    walk(resolve(APP, "app"));
    walk(resolve(APP, "components"));
    expect(writers.sort()).toEqual(
      ["lib/timesheet-import/import-confirm-actions.ts", "lib/work-hours/allocations-actions.ts"].sort(),
    );
  });
});

describe("F-1 - conversation creation: the server decides, the database refuses everyone else", () => {
  const sql = strip(rd(`supabase/migrations/${M.conv}.sql`));
  it("an end-user session may insert only its OWN participant row into a thread it created (admin branch kept)", () => {
    expect(sql).toMatch(/alter policy conversation_participants_insert/);
    // production: service_role holds no privilege on tables created through the
    // migration API, so the server-side participant add needs this one grant
    expect(sql).toMatch(/grant insert on public\.conversation_participants to service_role;/);
    expect(sql).toMatch(/c\.created_by = auth\.uid\(\)\s*and\s*conversation_participants\.profile_id = auth\.uid\(\)/);
    expect(sql).toMatch(/public\.is_admin\(\)/);
  });
  it("the authority is minted only by the two gate modules", () => {
    const issuers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (["node_modules", ".next", "tests", ".evidence"].includes(e.name)) continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== "contact-authority.ts") {
          if (/issueContactAuthority\(/.test(readFileSync(p, "utf8"))) {
            issuers.push(p.slice(APP.length + 1).replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(resolve(APP, "lib"));
    walk(resolve(APP, "app"));
    walk(resolve(APP, "components"));
    expect(issuers.sort()).toEqual(
      ["lib/communication/direct-conversation-core.ts", "lib/communication/direct-conversation.ts"].sort(),
    );
  });
  it("the browser-callable actions file never imports the authority and never touches the service client", () => {
    const actions = strip(rd("lib/communication/actions.ts", APP));
    expect(actions).not.toMatch(/contact-authority/);
    expect(actions).not.toMatch(/createAdminClient/);
  });
  it("in the core, the service client is used ONLY to add the OTHER participants, after the authority gate", () => {
    const core = strip(rd("lib/communication/communication-core.ts", APP));
    const uses = core.match(/createAdminClient\(\)/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(core.indexOf("isContactAuthority(authority)")).toBeGreaterThan(-1);
    expect(core.indexOf("!isContactAuthority(authority)")).toBeLessThan(core.indexOf("createAdminClient()"));
    expect(core).toMatch(/createAdminClient\(\)\)\s*\.from\("conversation_participants"\)/);
  });
  it("the service client's whole footprint is ONE insert, with no read-back, and the grant is exactly that (INSERT, this table)", () => {
    const core = strip(rd("lib/communication/communication-core.ts", APP));
    const at = core.indexOf("createAdminClient()");
    const call = core.slice(at, core.indexOf(");", at));
    expect(call).toMatch(/\.insert\(/);
    // no .select()/.update()/.delete()/.upsert()/.rpc() chained on the service client: an insert without a
    // read-back is PostgREST return=minimal and needs no SELECT privilege
    expect(call).not.toMatch(/\.(select|update|delete|upsert|rpc)\(/);
    const sql = strip(rd(`supabase/migrations/${M.conv}.sql`));
    const toService = sql.match(/grant [^;]*to service_role;/g) ?? [];
    expect(toService).toEqual(["grant insert on public.conversation_participants to service_role;"]);
    // and no migration in this package grants service_role anything on the other chat tables
    for (const f of Object.values(M)) {
      const body = strip(rd(`supabase/migrations/${f}.sql`));
      expect(body, f).not.toMatch(/grant [^;]*on (table )?public\.(conversations|conversation_messages)\b[^;]*to service_role/);
    }
  });
});

describe("F-4 - employer authority is held (an organization relationship), not asserted (a column the user writes)", () => {
  const sql = strip(rd(`supabase/migrations/${M.emp}.sql`));
  it("is_employer() requires an active management relationship in addition to the workspace pointer", () => {
    expect(sql).toMatch(/in \('company', 'agency'\)/);
    expect(sql).toMatch(/engagement_contexts ec/);
    expect(sql).toMatch(/ec\.relationship_slug in \('manager', 'owner', 'external_manager'\)/);
    expect(sql).toMatch(/company_memberships m/);
    expect(sql).toMatch(/m\.role in \('owner', 'admin', 'manager', 'external_manager'\)/);
  });
  it("uses the SAME management sources manages_organization() trusts (no new vocabulary)", () => {
    const base = strip(rd("supabase/migrations/20261003151000_email_verified_boundary_v1.sql"));
    expect(base).toBeTruthy();
    // manages_organization lives in earlier migrations; both source sets are re-asserted here
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path to 'public'/);
  });
  it("rollback restores the previous body", () => {
    const down = strip(rd(`supabase/rollbacks/${M.emp}.down.sql`));
    expect(down).toMatch(/active_role[\s\S]*in \('company','agency'\)/);
  });
});

describe("F-8 - lmc_* money functions: server-only; flags are a kill switch, not authorization", () => {
  const sql = strip(rd(`supabase/migrations/${M.lmc}.sql`));
  const SERVER_ONLY = [...sql.matchAll(/revoke all on function public\.(lmc_\w+)\(([^)]*)\) from public, anon, authenticated;/g)].map((m) => m[1]);
  const AUTHENTICATED_OK = ["lmc_admin_grant_v1", "lmc_flag_enabled", "lmc_flag_policy_v1"];

  it("revokes EXECUTE from public, anon and authenticated and grants service_role on the twelve server-only functions", () => {
    expect(SERVER_ONLY.sort()).toEqual(
      [
        "lmc_admin_grant_existing_v1",
        "lmc_assert_external_idempotency_key_v1",
        "lmc_compensate_spend_v1",
        "lmc_ensure_account_v1",
        "lmc_existing_by_idempotency_v1",
        "lmc_expire_lots_v1",
        "lmc_grant_promotional_v1",
        "lmc_record_purchase_v1",
        "lmc_require_flag_v1",
        "lmc_reverse_v1",
        "lmc_set_flag_v1",
        "lmc_spend_v1",
      ].sort(),
    );
    for (const fn of SERVER_ONLY) {
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
    }
  });

  it("the two authenticated-callable money functions are exactly the ones the app calls, and the app calls no other lmc_ RPC", () => {
    const callers = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (["node_modules", ".next", "tests", ".evidence", "guards"].includes(e.name)) continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && !p.endsWith("types.ts")) {
          for (const m of readFileSync(p, "utf8").matchAll(/\.rpc\(\s*["'](lmc_\w+)["']/g)) callers.add(m[1]);
        }
      }
    };
    walk(resolve(APP, "lib"));
    walk(resolve(APP, "app"));
    walk(resolve(APP, "components"));
    // admin grant = authenticated admin (in-body is_admin); compensate = service client
    expect([...callers].sort()).toEqual(["lmc_admin_grant_v1", "lmc_compensate_spend_v1"]);
  });

  it("FUTURE-PROOF: every lmc_* function defined anywhere is server-only, an allowlisted authenticated function, or a trigger", () => {
    const dir = resolve(REPO, "supabase/migrations");
    const defined = new Map<string, boolean>(); // name -> isTrigger
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
      const text = readFileSync(resolve(dir, f), "utf8");
      for (const m of text.matchAll(/create (?:or replace )?function public\.(lmc_\w+)\s*\(/gi)) {
        const head = text.slice(m.index!, m.index! + 900).toLowerCase();
        const isTrigger = /returns\s+trigger/.test(head);
        defined.set(m[1], (defined.get(m[1]) ?? false) || isTrigger);
      }
    }
    expect(defined.size).toBeGreaterThan(10);
    const offenders = [...defined.entries()]
      .filter(([name, isTrigger]) => !isTrigger && !SERVER_ONLY.includes(name) && !AUTHENTICATED_OK.includes(name))
      .map(([name]) => name);
    expect(
      offenders,
      "a new lmc_* function must be revoked from authenticated (add it to 20261006100300's list or a later migration) or be explicitly allowlisted here",
    ).toEqual([]);
  });
});

describe("the runtime proof exists and is local-only", () => {
  const sh = rd("scripts/db-proof/authority-closure-first-package.sh");
  it("refuses a non-loopback host and rolls every probe back", () => {
    expect(sh).toMatch(/refusing non-local host/);
    expect(sh.match(/rollback;/g)?.length).toBeGreaterThan(0);
    expect(sh).toMatch(/PHASE/);
  });
});
