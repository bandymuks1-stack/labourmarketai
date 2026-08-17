import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  WORK_OBJECT_STATUSES,
  isObjectMigrationMissingCode,
  workObjectPlace,
} from "@/lib/objects/objects-model";
import { deriveProjectProgress } from "@/lib/projects/progress-model";

/**
 * TRAIN D guards — objects/sites entity + project responsible + progress
 * (full-reality audit 2026-08-17: "object/site PARTIAL — no object entity").
 *
 * Pins:
 *   - EXACTLY the train-D migration pair owns work_objects; authority is
 *     MEMBERSHIP-based (both truths), never the legacy companies.profile_id
 *     single-owner pattern (Train M verdict — company_locations stays
 *     superseded and UNAPPLIED);
 *   - writes are RPC-only at both the SQL and the app layer;
 *   - the app reads are RLS-scoped (server client, bounded);
 *   - progress is DERIVED (no stored number anywhere);
 *   - honest degradation everywhere pre-apply.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const readRepo = (rel: string): string =>
  readFileSync(join(REPO, rel), "utf8");

const OBJECTS_MIG = "supabase/migrations/20260817150000_work_objects_v1.sql";
const OBJECTS_DOWN = "supabase/rollbacks/20260817150000_work_objects_v1.down.sql";
const RESP_MIG = "supabase/migrations/20260817152000_project_responsible_v1.sql";
const RESP_DOWN = "supabase/rollbacks/20260817152000_project_responsible_v1.down.sql";
const V4_MIG =
  "supabase/migrations/20260817153000_notification_events_v4_task_types.sql";

const OBJECT_RPCS = [
  "create_work_object_v1",
  "update_work_object_v1",
  "set_work_object_status_v1",
  "set_work_object_responsible_v1",
] as const;

const MODEL = read("lib/objects/objects-model.ts");
const READS = read("lib/objects/objects.ts");
const ACTIONS = read("lib/objects/objects-actions.ts");
const SECTION = read("components/app/work-objects-section.tsx");
const PROGRESS = read("lib/projects/progress.ts");
const ADMIN_ACTIONS = read("lib/projects/project-admin-actions.ts");
const EVENTS = read("lib/notifications/events.ts");

describe("1. exactly one migration pair owns work_objects", () => {
  it("the pair exists, is gated, and no other file claims the names", () => {
    const up = readRepo(OBJECTS_MIG);
    const down = readRepo(OBJECTS_DOWN);
    expect(up).toContain("needs-human-gate");
    expect(up).toContain("@human-gate-approved");
    expect(up).toMatch(/create table if not exists public\.work_objects/);
    for (const fn of OBJECT_RPCS) {
      expect(up).toContain(`create or replace function public.${fn}`);
      expect(down).toContain(`drop function if exists public.${fn}`);
    }
    expect(down).toMatch(/drop table if exists public\.work_objects/);

    for (const dir of ["migrations", "rollbacks"]) {
      const abs = join(REPO, "supabase", dir);
      for (const f of readdirSync(abs).filter((f) => f.endsWith(".sql"))) {
        if (f.startsWith("20260817150000_work_objects_v1")) continue;
        const src = readFileSync(join(abs, f), "utf8");
        for (const fn of OBJECT_RPCS) {
          expect(src, `${dir}/${f} must not define ${fn}`).not.toContain(fn);
        }
      }
    }
  });

  it("authority is MEMBERSHIP-based, never the legacy single-owner pattern", () => {
    const up = readRepo(OBJECTS_MIG);
    // Reads: BOTH membership truths through the one helper.
    expect(up).toContain(
      "create or replace function public.is_org_member_or_engaged_v1",
    );
    expect(up).toMatch(/company_memberships/);
    expect(up).toMatch(/engagement_contexts/);
    // Writes: the existing managing-role predicate.
    expect(up).toMatch(/has_org_demand_access/);
    // NEVER the stale companies.profile_id owner check (Train M verdict).
    expect(up).not.toMatch(/companies\s+c?\s*where.*profile_id\s*=\s*auth\.uid\(\)/);
    expect(up).not.toMatch(/owns_company/);
  });

  it("writes are RPC-only at the SQL layer", () => {
    const up = readRepo(OBJECTS_MIG);
    expect(up).toMatch(
      /revoke insert, update, delete on public\.work_objects from authenticated/,
    );
    // No write policy exists — SELECT is the only policy verb.
    expect(up).not.toMatch(/create policy \w+ on public\.work_objects\s+for (insert|update|delete|all)/);
  });

  it("the superseded company_locations draft stays in-tree, and the ledger says MUST NOT BE APPLIED", () => {
    expect(
      existsSync(join(REPO, "supabase/migrations/20260713120000_company_locations_v1.sql")),
    ).toBe(true);
    const ledger = readRepo("docs/APPLIED_LEDGER.md");
    expect(ledger).toMatch(/20260713120000_company_locations_v1\.sql.*SUPERSEDED, MUST NOT BE APPLIED/);
    // And no app code reads the superseded table any more.
    expect(existsSync(join(ROOT, "lib/company/company-locations.ts"))).toBe(false);
  });
});

describe("2. app layer: RPC-only writes, RLS-scoped bounded reads, honest degradation", () => {
  it("the actions call exactly the four gated RPCs, nothing else", () => {
    for (const fn of OBJECT_RPCS) {
      expect(ACTIONS).toMatch(new RegExp(`\\.rpc\\(\\s*"${fn}"`));
    }
    const rpcCalls = [...ACTIONS.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(rpcCalls)).toEqual(new Set(OBJECT_RPCS));
    for (const src of [MODEL, READS, ACTIONS, SECTION]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.delete\(/);
    }
  });

  it("the org is resolved server-side (employer context), never trusted from the client", () => {
    expect(ACTIONS).toMatch(/resolveEmployerCompanyContext/);
    expect(ACTIONS).not.toMatch(/formData\.get\("organizationId"\)/);
  });

  it("reads use the server client, bounded, never the admin client", () => {
    expect(READS).toMatch(/from "@\/lib\/supabase\/server"/);
    expect(READS).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    expect(READS).toMatch(/WORK_OBJECT_READ_LIMIT/);
  });

  it("degradation codes map to the honest needs-migration state", () => {
    expect(isObjectMigrationMissingCode("42P01")).toBe(true);
    expect(isObjectMigrationMissingCode("PGRST205")).toBe(true);
    expect(isObjectMigrationMissingCode("23505")).toBe(false);
    expect(READS).toMatch(/"needs-migration"/);
    expect(SECTION).toMatch(/work-objects-gated/);
  });

  it("statuses are exactly active/archived; place summary is pure", () => {
    expect([...WORK_OBJECT_STATUSES]).toEqual(["active", "archived"]);
    expect(
      workObjectPlace({
        addressLine: "Main st 1",
        city: "Vilnius",
        region: null,
        country: "LT",
      }),
    ).toBe("Main st 1, Vilnius, LT");
  });
});

describe("3. project responsible + lifecycle actions", () => {
  it("the responsible migration pair exists, gated, guarded rollback", () => {
    const up = readRepo(RESP_MIG);
    const down = readRepo(RESP_DOWN);
    expect(up).toContain("@human-gate-approved");
    expect(up).toContain(
      "create or replace function public.set_project_responsible_v1",
    );
    expect(up).toMatch(/add column if not exists responsible_profile_id/);
    expect(up).toMatch(/can_manage_project/);
    expect(up).toMatch(/caller_manages_worker/);
    // One audit row per real change — the W11 idiom.
    expect(up).toMatch(/insert into public\.audit_logs/);
    // Rollback refuses to erase a real accountability decision.
    expect(down).toMatch(/responsible_profile_id is not null/);
    expect(down).toMatch(/raise exception/);
  });

  it("the admin actions call ONLY the gated RPCs and always redirect with a notice", () => {
    expect(ADMIN_ACTIONS).toMatch(/\.rpc\(\s*"set_project_status_v1"/);
    expect(ADMIN_ACTIONS).toMatch(/\.rpc\(\s*"set_project_responsible_v1"/);
    const rpcCalls = [
      ...ADMIN_ACTIONS.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g),
    ].map((m) => m[1]);
    expect(new Set(rpcCalls)).toEqual(
      new Set(["set_project_status_v1", "set_project_responsible_v1"]),
    );
    expect(ADMIN_ACTIONS).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(ADMIN_ACTIONS).toMatch(/notice=/);
  });
});

describe("4. progress is DERIVED, never stored", () => {
  it("no migration stores a progress number", () => {
    for (const f of readdirSync(join(REPO, "supabase", "migrations")).filter(
      (f) => f.startsWith("202608171"),
    )) {
      const src = readFileSync(join(REPO, "supabase", "migrations", f), "utf8");
      expect(src, `${f} must not store a progress column`).not.toMatch(
        /progress\s+(int|numeric|double)/i,
      );
    }
  });

  it("the derivation is pure and honest about the empty case", () => {
    expect(deriveProjectProgress([], [])).toEqual({
      taskDone: 0,
      taskTotal: 0,
      stageDone: 0,
      stageTotal: 0,
      percent: null, // NOT 0% and NOT 100% — nothing measurable exists
    });
    expect(
      deriveProjectProgress(["done", "todo", "cancelled"], ["done", "planned"]),
    ).toEqual({
      taskDone: 1,
      taskTotal: 2, // cancelled excluded from BOTH sides
      stageDone: 1,
      stageTotal: 2,
      percent: 50,
    });
  });

  it("the read is status-only (no task/stage bodies flow into progress)", () => {
    expect(PROGRESS).toMatch(/select\("project_id, status"\)/);
    expect(PROGRESS).not.toMatch(/title|description|note/);
  });
});

describe("5. notification v4 — the assignment type is additive and mapped", () => {
  it("the widening is a strict superset carrying every earlier type", () => {
    const up = readRepo(V4_MIG);
    for (const t of [
      "booking_proposed",
      "booking_accepted",
      "booking_declined",
      "booking_withdrawn",
      "absence_requested",
      "absence_approved",
      "absence_rejected",
      "engagement_created",
      "engagement_ended",
      "work_task_assigned",
    ]) {
      expect(up).toContain(`'${t}'`);
    }
    for (const e of ["booking_request", "worker_absence", "engagement", "work_task"]) {
      expect(up).toContain(`'${e}'`);
    }
  });

  it("the entity href points at the EXISTING tasks surface", () => {
    expect(EVENTS).toMatch(/work_task: "\/dashboard\/tasks"/);
    expect(EVENTS).toMatch(/"work_task_assigned"/);
  });
});
