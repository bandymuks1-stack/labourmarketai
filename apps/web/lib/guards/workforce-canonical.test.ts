import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the workforce layer (Labour Market OS P1–P4) stays canonical.
 *
 * The program hard-forbids a 4th demand model: future work is a READ
 * COMPOSITION of customer_requests (structured_v2) + projects, workforce
 * requirements live as additive JSON on the canonical demand payload, and
 * capacity is compared against the EXISTING worker/assignment/brigade
 * stores. This guard pins:
 *   1. lib/workforce never imports a supabase admin/service-role client —
 *      only the caller's RLS-scoped client (workforce.ts) and pure modules;
 *   2. no new table is referenced: every `from("...")` in lib/workforce
 *      names a KNOWN existing table (closed allowlist), and no migration
 *      was added for a workforce store;
 *   3. no auto-confirm: `status: "confirmed"` is only ever ASSIGNED inside
 *      the human transition file (work-breakdown.ts confirmRequirement) —
 *      derivation and composition can only produce "suggested";
 *   4. recommendActions gates create_position on a HUMAN-CONFIRMED gap.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const WORKFORCE_DIR = join(APP_ROOT, "lib", "workforce");

const PURE_MODULES = [
  "future-work-model.ts",
  "work-breakdown.ts",
  "capacity-model.ts",
  "gap-timeline.ts",
] as const;

const sourceFiles = readdirSync(WORKFORCE_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);

function src(file: string): string {
  return readFileSync(join(WORKFORCE_DIR, file), "utf8");
}

describe("Guard: workforce module inventory", () => {
  it("ships exactly the four pure modules + one server service", () => {
    expect([...sourceFiles].sort()).toEqual(
      [...PURE_MODULES, "workforce.ts"].sort(),
    );
  });
});

describe("Guard: no admin client, RLS-scoped reads only", () => {
  it("no workforce source touches an admin/service-role client", () => {
    for (const file of sourceFiles) {
      const s = src(file);
      expect(s, `${file} imports an admin client`).not.toMatch(
        /supabase\/admin|createAdminClient|service[-_]?role/i,
      );
      expect(s, `${file} reads service-role env`).not.toMatch(
        /SUPABASE_SERVICE_ROLE/,
      );
    }
  });

  it("the four pure modules import no server-only, supabase or IO", () => {
    for (const file of PURE_MODULES) {
      const s = src(file);
      expect(s, `${file} must stay pure`).not.toMatch(/["']server-only["']/);
      expect(s, `${file} must stay pure`).not.toMatch(/@supabase\//);
      expect(s, `${file} must stay pure`).not.toMatch(/@\/lib\/supabase/);
      expect(s, `${file} must stay pure`).not.toMatch(/node:fs/);
      expect(s, `${file} must stay pure`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it("the server service declares server-only on its first line", () => {
    expect(src("workforce.ts").startsWith(`import "server-only";`)).toBe(true);
  });
});

describe("Guard: no new table, no new migration (no 4th demand model)", () => {
  // The ONLY tables the workforce layer may read — all pre-existing.
  const ALLOWED_TABLES = new Set([
    "customer_requests",
    "projects",
    "project_worker_assignments",
    "workers",
    "worker_skills",
    "worker_professions",
    "worker_languages",
    "worker_documents",
    "profile_skill_claims",
    "organizations",
  ]);

  it("every from(\"...\") in lib/workforce names a known existing table", () => {
    for (const file of sourceFiles) {
      const s = src(file);
      for (const match of s.matchAll(/\.from\(\s*["']([^"']+)["']\s*\)/g)) {
        expect(
          ALLOWED_TABLES.has(match[1]),
          `${file} reads unknown table "${match[1]}"`,
        ).toBe(true);
      }
    }
  });

  it("workforce sources contain no SQL DDL and no RPC writes", () => {
    for (const file of sourceFiles) {
      const s = src(file);
      expect(s, `${file} contains DDL`).not.toMatch(/CREATE\s+TABLE/i);
      expect(s, `${file} contains DDL`).not.toMatch(/ALTER\s+TABLE/i);
      // Read composition only — no insert/update/delete/rpc calls.
      expect(s, `${file} writes`).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
      expect(s, `${file} calls an RPC`).not.toMatch(/\.rpc\s*\(/);
    }
  });

  it("no migration introduces a workforce/future-work store", () => {
    const migrations = readdirSync(join(REPO_ROOT, "supabase", "migrations"));
    const offenders = migrations.filter((name) =>
      /workforce|future[_-]?work|gap[_-]?timeline|capacity[_-]?assessment/i.test(name),
    );
    expect(offenders).toEqual([]);
  });

  it("the plan is documented as ADDITIVE payload JSON, a sibling of structured_v2", () => {
    const s = src("future-work-model.ts");
    expect(s).toMatch(/workforce_plan/);
    expect(s).toMatch(/SIBLING/);
    expect(s).toMatch(/save_demand_draft/);
  });
});

describe("Guard: no auto-confirm", () => {
  it(`'status: "confirmed"' is only ASSIGNED in the human transition file`, () => {
    const assignRx = /status\s*:\s*["']confirmed["']/;
    for (const file of sourceFiles) {
      if (file === "work-breakdown.ts") continue;
      expect(
        assignRx.test(src(file)),
        `${file} assigns status "confirmed" outside confirmRequirement`,
      ).toBe(false);
    }
    // ...and work-breakdown.ts assigns it exactly once (confirmRequirement).
    const matches = src("work-breakdown.ts").match(
      /status\s*:\s*["']confirmed["']/g,
    );
    expect(matches).toHaveLength(1);
  });

  it("derivation emits only suggested lines (documented + tested)", () => {
    const s = src("work-breakdown.ts");
    expect(s).toMatch(/status:\s*"suggested"/);
    expect(s).toMatch(/NEVER confirms/i);
  });
});

describe("Guard: create_position requires a human-confirmed gap", () => {
  it("the gate exists in recommendActions source", () => {
    const s = src("gap-timeline.ts");
    // The literal gate: shortfall AND requirementStatus === "confirmed".
    expect(s).toMatch(
      /requirementStatus\s*===\s*["']confirmed["'][\s\S]{0,200}create_position/,
    );
    expect(s).toMatch(/HARD GATE/);
  });

  it("recommendation types are the closed realistic set", () => {
    const s = src("gap-timeline.ts");
    for (const t of [
      "assign_existing_worker",
      "transfer_from_project",
      "form_brigade",
      "train_existing_worker",
      "create_position",
      "engage_staffing_agency",
      "engage_partner",
    ]) {
      expect(s).toContain(`"${t}"`);
    }
    // No invented outreach/auto-hire action sneaks in.
    expect(s).not.toMatch(/auto[_-]?hire|send[_-]?offer|contact[_-]?worker/i);
  });
});
