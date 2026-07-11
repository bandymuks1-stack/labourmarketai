import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * HANDOVER PASSPORT SHELL guards (product-tree branch 19, train §8.8).
 *
 * The wagon rule (reality-map 2026-07-05 row 6): "handover passport shell on
 * projects/[id]/operations; closes branch 19" — build ON the existing
 * projects/assignments/bookings spine, never a parallel booking or project
 * system. These pins keep that true:
 *
 *   - ADDITIVE-ONLY migration: ONE new append-only table + ONE new gated
 *     write RPC; NO existing table/policy/grant/constraint is altered.
 *   - ONLY NEW names: project_handover_entries and
 *     add_project_handover_entry_v1 are brand-new — the migration recreates
 *     NO existing RPC/trigger/table, so the ROLLBACK-CHAIN RULE is satisfied
 *     structurally: the down file restores no function body (there is none
 *     to restore) and must contain no create-function at all.
 *   - MANAGER-ONLY read: the select policy is can_manage_project/is_admin —
 *     free-text passport bodies never reach any cross-user read path (the
 *     six-point privacy gate), and the read service never selects created_by
 *     (no profile ids leave the service).
 *   - APPEND-ONLY: no update/delete in the migration, no update/delete
 *     policy, no edit/delete action app-side.
 *   - HONEST STATUSES: the stage enum is declaration-shaped
 *     ('handover_declared', never 'completed'/'verified'/'certified'), and
 *     the copy carries the manager-declaration disclaimer. No defect/
 *     warranty fields (not honest without an evidence model).
 *   - Honest degradation pre-apply (42P01 → applied:false → "not yet
 *     available" state, nothing faked).
 *   - i18n en/lt/ru presence for the new namespace.
 */

const APP = join(process.cwd());
const REPO = join(APP, "..", "..");
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");
const MIGRATION_FILE = "20260705230000_project_handover_passport.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_FILE}`;
const ROLLBACK =
  "supabase/rollbacks/20260705230000_project_handover_passport.down.sql";

const NEW_TABLE = "project_handover_entries";
const NEW_FUNCTION = "add_project_handover_entry_v1";

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const readWeb = (rel: string) => readFileSync(join(APP, rel), "utf8");
// CRLF-safe comment strip — prose comments may legitimately DISCUSS banned
// shapes; only executable SQL is checked.
const stripSql = (src: string) =>
  src
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

describe("passport migration — one new append-only table + one new gated RPC on the EXISTING project spine", () => {
  const migration = read(MIGRATION);
  const code = stripSql(migration);

  it("creates ONLY the new passport table (no existing table/column touched)", () => {
    const created = [
      ...code.matchAll(/create table if not exists public\.([a-z_]+)/gi),
    ].map((m) => m[1]);
    expect(created).toEqual([NEW_TABLE]);
    // No existing table is altered, no column added anywhere, nothing dropped.
    expect(code).not.toMatch(/alter table(?! public\.project_handover_entries)/i);
    expect(code).not.toMatch(/add column/i);
    expect(code).not.toMatch(/drop table/i);
    expect(code).not.toMatch(/drop column/i);
    expect(code).not.toMatch(/drop constraint/i);
  });

  it("creates ONLY the one brand-new function (no existing RPC recreated)", () => {
    const created = [
      ...code.matchAll(/create (?:or replace )?function public\.([a-z0-9_]+)/gi),
    ].map((m) => m[1]);
    expect(created).toEqual([NEW_FUNCTION]);
    expect(code).not.toMatch(/create (or replace )?trigger/i);
  });

  it("both new names are NEW to the repo — never defined by a prior migration", () => {
    const others = readdirSync(MIGRATIONS_DIR).filter(
      (f) => f.endsWith(".sql") && f !== MIGRATION_FILE,
    );
    expect(others.length).toBeGreaterThan(100);
    for (const f of others) {
      const src = read(`supabase/migrations/${f}`);
      expect(src, `${f} must not define ${NEW_FUNCTION}`).not.toContain(NEW_FUNCTION);
      expect(src, `${f} must not define ${NEW_TABLE}`).not.toContain(NEW_TABLE);
    }
  });

  it("SELECT policy is MANAGER-ONLY — no worker/cross-user read path for free text", () => {
    // Exactly one policy, on the new table, gated by the EXISTING
    // can_manage_project helper (20260601091000) or admin.
    const policies = [
      ...code.matchAll(/create policy ([a-z_]+) on public\.([a-z_]+)/gi),
    ];
    expect(policies.length).toBe(1);
    expect(policies[0][2]).toBe(NEW_TABLE);
    expect(code).toMatch(
      /for select to authenticated\s+using \(public\.can_manage_project\(project_id\) or public\.is_admin\(\)\)/i,
    );
    // Never a worker-side or anon read of the manager free text.
    expect(code).not.toMatch(/w\.profile_id = auth\.uid\(\)/i);
    expect(code).not.toMatch(/\bto anon\b|\bto public\b/i);
  });

  it("is APPEND-ONLY: RPC-only insert path, no update/delete anywhere", () => {
    // The only DML is the RPC's single insert into the new table.
    const inserts = [...code.matchAll(/insert into public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    expect(inserts).toEqual([NEW_TABLE]);
    expect(code).not.toMatch(/\bupdate public\./i);
    expect(code).not.toMatch(/\bdelete from\b/i);
    expect(code).not.toMatch(/on conflict/i);
    // Direct writes are revoked; only select is granted on the table.
    expect(code).toMatch(
      /revoke insert, update, delete on public\.project_handover_entries from authenticated/i,
    );
    expect(code).toMatch(/grant select on public\.project_handover_entries to authenticated/i);
    // No insert/update/delete policy exists (the single policy is select-only).
    expect(code).not.toMatch(/for (insert|update|delete)/i);
  });

  it("the write RPC re-checks the manager gate, validates honestly and is capped", () => {
    expect(code).toMatch(/public\.can_manage_project\(pid\) or public\.is_admin\(\)/i);
    expect(code).toMatch(/'not_allowed'/);
    expect(code).toMatch(/'invalid_entry'/);
    expect(code).toMatch(/'entry_limit_reached'/);
    expect(code).toMatch(/>= 500/);
    expect(code).toMatch(/char_length\(v_body\) > 1000/i);
  });

  it("statuses are HONEST declaration stages — no fake completion vocabulary", () => {
    // The enum is exactly the declaration-shaped set.
    expect(code).toMatch(
      /\('preparation','in_progress','handover_declared','closed'\)/,
    );
    // Never a claim-shaped value and no defect/warranty fields (§8.8: only if
    // honest and gated — they are not in this slice).
    expect(code).not.toMatch(/'completed'|'certified'|'verified'/);
    expect(code).not.toMatch(/defect|warranty/i);
  });

  it("is a human-gated DRAFT (owner-gated prod apply, never db push)", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(migration).toMatch(/needs-human-gate/);
    expect(migration).toMatch(/DO NOT APPLY automatically/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = public/i);
    expect(migration).toMatch(/revoke all on function/i);
  });
});

describe("passport rollback chain — nothing recreated, nothing stale to restore", () => {
  const down = read(ROLLBACK);
  const downCode = stripSql(down);

  it("the down file exists and drops ONLY the new function and the new table", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    const fnDrops = [
      ...downCode.matchAll(/drop function if exists public\.([a-z0-9_]+)/gi),
    ].map((m) => m[1]);
    expect(fnDrops).toEqual([NEW_FUNCTION]);
    const tableDrops = [
      ...downCode.matchAll(/drop table if exists public\.([a-z_]+)/gi),
    ].map((m) => m[1]);
    expect(tableDrops).toEqual([NEW_TABLE]);
  });

  it("ROLLBACK-CHAIN RULE: no existing RPC was recreated, so the down file restores NO function body", () => {
    // If this wagon HAD recreated an existing RPC, the down file would need
    // that RPC's CURRENT repo-latest body verbatim. It did not — so the down
    // file must contain zero create-function statements (a stale-body restore
    // is impossible by construction).
    expect(downCode).not.toMatch(/create (or replace )?function/i);
    expect(downCode).not.toMatch(/create (or replace )?trigger/i);
    expect(downCode).not.toMatch(/create table/i);
    // Feature rows live ONLY in the dropped table: no delete touches any
    // existing table.
    expect(downCode).not.toMatch(/delete from/i);
    // Existing spine functions are untouched in both directions.
    for (const untouched of [
      "can_manage_project",
      "set_worker_operational_status",
      "upsert_worker_readiness_item",
      "propose_booking",
    ]) {
      expect(downCode, `down must not touch ${untouched}`).not.toContain(untouched);
    }
  });
});

describe("app surface — passport shell reuses the EXISTING operations spine", () => {
  const lib = readWeb("lib/projects/handover-passport.ts");
  const actions = readWeb("lib/projects/handover-passport-actions.ts");
  const panel = readWeb("components/app/handover-passport-panel.tsx");
  const page = readWeb(
    "app/[locale]/dashboard/projects/[id]/operations/page.tsx",
  );

  it("reads ONLY the new passport table and never selects created_by (no profile ids leave the service)", () => {
    expect(lib).toMatch(/\.from\("project_handover_entries"\)/);
    expect(lib).toMatch(/"id, entry_type, status_value, body, created_at"/);
    expect(lib).not.toMatch(/created_by/);
    // No parallel booking/project read model in the passport service.
    expect(lib).not.toMatch(/\.from\("booking_requests"\)/);
    expect(lib).not.toMatch(/\.from\("projects"\)/);
  });

  it("writes ONLY through the gated RPC — append-only app-side (no edit/delete action)", () => {
    expect(actions).toMatch(/add_project_handover_entry_v1/);
    for (const src of [lib, actions]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("degrades honestly pre-apply: 42P01 probe → applied:false → 'not yet available' state", () => {
    expect(lib).toMatch(/RELATION_NOT_FOUND_CODE = "42P01"/);
    expect(lib).toMatch(/applied: false/);
    expect(panel).toMatch(/!data\.applied/);
    expect(panel).toMatch(/handover-passport-preapply/);
    expect(panel).toMatch(/t\("preApply"\)/);
  });

  it("renders on the EXISTING operations page, responsible parties from the real assignments already loaded", () => {
    // Control room PR G: the passport read moved into the operations-centre
    // composition the page consumes — the SAME degrading getHandoverPassport
    // read, called once per project.
    const centre = readWeb("lib/projects/operations-centre.ts");
    expect(centre).toMatch(/getHandoverPassport\(projectId\)/);
    expect(page).toMatch(/data=\{passport\}/);
    expect(page).toMatch(/<HandoverPassportPanel/);
    expect(page).toMatch(/ops\.workers\.map\(\(w\) => \(\{ name: w\.name \}\)\)/);
  });

  it("copy stays honest: disclaimer present, no completion/certification claim in the shell", () => {
    expect(panel).toMatch(/t\("honestNote"\)/);
    expect(panel).toMatch(/t\("statusDisclaimer"\)/);
    const en = JSON.parse(readWeb("messages/en.json")).handoverPassport;
    expect(en.statuses.handover_declared).toBe("Handover declared");
    for (const s of Object.values(en.statuses) as string[]) {
      expect(s.toLowerCase()).not.toMatch(/certified|verified|completed/);
    }
  });
});

describe("i18n — handoverPassport namespace present in en/lt/ru", () => {
  for (const locale of ["en", "lt", "ru"]) {
    it(`${locale} carries the full handoverPassport catalogue`, () => {
      const messages = JSON.parse(readWeb(`messages/${locale}.json`));
      const ns = messages.handoverPassport;
      expect(ns, `${locale} handoverPassport namespace`).toBeTruthy();
      for (const key of [
        "title",
        "intro",
        "honestNote",
        "responsibleHeading",
        "responsibleEmpty",
        "checklistNote",
        "preApply",
        "statusHeading",
        "statusNone",
        "statusDisclaimer",
        "historyHeading",
        "historyEmpty",
        "entryStatusLabel",
        "entryNoteLabel",
      ]) {
        expect(String(ns[key] ?? "").length, `${locale} handoverPassport.${key}`).toBeGreaterThan(0);
      }
      for (const key of ["preparation", "in_progress", "handover_declared", "closed"]) {
        expect(
          String(ns.statuses?.[key] ?? "").length,
          `${locale} handoverPassport.statuses.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of [
        "typeLabel",
        "typeNote",
        "typeStatus",
        "statusLabel",
        "bodyLabel",
        "bodyPlaceholder",
        "bodyOptionalPlaceholder",
        "saving",
        "submit",
      ]) {
        expect(
          String(ns.form?.[key] ?? "").length,
          `${locale} handoverPassport.form.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of [
        "added",
        "needsMigration",
        "notAuthorized",
        "limitReached",
        "invalid",
        "error",
      ]) {
        expect(
          String(ns.outcome?.[key] ?? "").length,
          `${locale} handoverPassport.outcome.${key}`,
        ).toBeGreaterThan(0);
      }
    });
  }
});
