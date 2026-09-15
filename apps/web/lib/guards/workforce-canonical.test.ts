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
  // P10: the planning-zone view model — pure shaping behind the ONE visual
  // workforce-planning surface (page: dashboard/company/planning).
  "planning-zone-view.ts",
  // CAL-7 (owner-approved 2026-09-14): the ONE capacity-reservation rule.
  // Pure by the same contract as the rest of this list — it imports the
  // calendar's inclusive-range overlap from planning-model rather than
  // forking it, reads nothing, and cannot express a refusal (SEP-2). The
  // authorized reads it is fed live in lib/planning, not here, so no new
  // table or data path enters the workforce layer.
  "commitment-reservation.ts",
  // CAL-10 (owner-approved 2026-09-14): the ONE learned-duration reading.
  // Pure, and deliberately storeless — a forecast may never be persisted as
  // a fact (SEP-1), so the reading is derived from finished project_stages
  // rows on every render. The authorized read lives in lib/projects.
  "learned-duration.ts",
  // CAL-9 (owner-approved 2026-09-14): utilisation over a window, read from
  // the SAME commitment vocabulary CAL-7 defines. Pure. It names its
  // denominator (calendar days) because the schema records no contracted
  // hours, and it withholds a ratio rather than build one on a floor.
  "utilisation.ts",
  // J-TIME-FREEDOM step 4 (2026-09-15): feasible alternatives once a clash
  // is KNOWN — the nearest free window of the same length for the same
  // person, and roster candidates whose own reservation verdict is clear.
  // Pure by the same contract: it imports the overlap rule and the verdict
  // type from the modules above, reads nothing, stores nothing, and cannot
  // express "you must" (SEP-2). The one roster read behind it lives in
  // lib/planning/assignment-alternatives.ts.
  "commitment-alternatives.ts",
  // J-TIME-FREEDOM step 7 (2026-09-15): the learned reading carried forward
  // as a FORECAST. Pure and storeless by construction — it is derived from
  // `learned-duration.ts` readings at render and offered as a prefill; the
  // value the planner adopts becomes a PLAN by their act, and the forecast
  // itself is never a column, a row or a cache (SEP-1).
  "duration-forecast.ts",
] as const;

const sourceFiles = readdirSync(WORKFORCE_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);

function src(file: string): string {
  return readFileSync(join(WORKFORCE_DIR, file), "utf8");
}

describe("Guard: workforce module inventory", () => {
  it("ships exactly the declared pure modules + one server service", () => {
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

describe("Guard: user-entered facts stay authoritative (constitution §1.2)", () => {
  it("the workforce service selects the team_size column (the 5→1 root cause)", () => {
    const s = src("workforce.ts");
    expect(s).toMatch(/select\("id, title, status, payload, team_size"\)/);
  });

  it("the projection prefers the user-entered column over payload keys", () => {
    const s = src("future-work-model.ts");
    expect(s).toMatch(/columnTeamSize\s*\?\?\s*payloadTeamSize/);
    expect(s).toContain('"user_entered"');
  });

  it("derivation never presents the fallback as a fact — it is a labelled system suggestion", () => {
    const s = src("work-breakdown.ts");
    expect(s).toContain("user-entered fact, kept authoritative");
    expect(s).toContain("SYSTEM SUGGESTION");
    expect(s).toMatch(/systemSuggestedHeadcount\s*=\s*1/);
  });

  it("a human edit clears the competing system suggestion", () => {
    const s = src("work-breakdown.ts");
    expect(s).toMatch(
      /headcountEdited[\s\S]{0,300}userEnteredHeadcount:\s*patch\.headcount[\s\S]{0,100}systemSuggestedHeadcount:\s*null/,
    );
  });

  it("the view separates the five named headcount values", () => {
    const s = src("planning-zone-view.ts");
    for (const field of [
      "userEnteredHeadcount",
      "systemSuggestedHeadcount",
      "confirmedRequiredHeadcount",
      "coveredHeadcount",
      "shortfall",
    ]) {
      expect(s).toContain(field);
    }
  });
});
