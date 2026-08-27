import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LEARNER VISIBILITY — least privilege (owner ruling 2026-08-27).
 *
 * 20260827200000 made the relationship an invitation establishes into DATA, and
 * DISCLOSED that one auth-core predicate did not look at which relationship it
 * was: `public.can_view_worker` treated every active `engagement_contexts` row
 * alike, so a school enrolling a student would have inherited exactly the scope
 * an employer holds over an employee.
 *
 * That was not theoretical. Measured on PRODUCTION, 2026-08-27, inside a
 * rolled-back transaction with a real organization owner and a real worker:
 *
 *     BEFORE_FIX__learner_visible_to_institution  ->  true
 *     BEFORE_FIX__employee_visible (control)      ->  true
 *
 * The owner ruled: least privilege, without weakening existing worker privacy
 * and without redesigning the authorization system. 20260827210000 is that fix.
 *
 * THE THREE WAYS IT COULD ROT, each guarded below with a NEGATIVE CONTROL
 * (a guard that would pass against an empty file proves nothing — the
 * vacuous-guard class recorded after the backspace-escape incident):
 *
 *   HARDCODING   someone writes `ec.relationship_slug <> 'student'` instead of
 *                joining the registry, and the next education relationship
 *                (apprentice, trainee, mentee) silently re-opens the hole;
 *   FAIL-OPEN    the new column gains `default true`, so every future
 *                relationship inherits employer-grade visibility by accident —
 *                the exact bug class this exists to end;
 *   REGRESSION   the seed narrows a slug that carries visibility today, and an
 *                employer or company quietly loses access it has always had.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260827210000_learner_visibility_least_privilege_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260827210000_learner_visibility_least_privilege_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const rollbackSql = readFileSync(ROLLBACK, "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ");
const sqlFlat = norm(sql);
/**
 * The migration WITHOUT its `--` commentary. The file EXPLAINS why the
 * hardcoded form was refused, so a whole-file "must not contain" check would
 * fail on the rationale that documents the very rule it enforces. Assertions
 * about what the migration DOES run against this; assertions about what it SAYS
 * run against `sqlFlat`.
 */
const sqlCode = norm(sql.replace(/--[^\n]*/g, " "));
const rollbackCode = norm(rollbackSql.replace(/--[^\n]*/g, " "));
/**
 * The commentary with its `--` markers REMOVED but its words kept, so a
 * sentence that wraps across two comment lines still reads as one sentence.
 * Without this, asserting on prose silently depends on where the line broke.
 */
const prose = (s: string) => norm(s.replace(/^\s*--\s?/gm, ""));

/**
 * Every relationship slug the production registry held when the ruling was
 * made. `student` is the ONLY one whose visibility changes.
 */
const SLUGS_KEEPING_VISIBILITY = [
  "employee",
  "owner",
  "manager",
  "freelancer",
  "consultant",
  "collaborator",
  "volunteer",
  "viewer",
  "unemployed",
] as const;

describe("least privilege — the rule is DATA, not a hardcoded slug", () => {
  it("the predicate joins the registry instead of naming a relationship", () => {
    expect(sqlCode).toContain("join public.relationship_types rt");
    expect(sqlCode).toContain("on rt.slug = ec.relationship_slug");
    expect(sqlCode).toContain("and rt.grants_worker_visibility");
  });

  it("NEGATIVE CONTROL — the same assertions fail on an empty migration", () => {
    const empty = "";
    expect(empty).not.toContain("and rt.grants_worker_visibility");
  });

  it("the predicate never tests a relationship slug literally", () => {
    // The hardcoded shape ARCHITECTURE §6.2 rejects, in any spelling the
    // engagement branch could take.
    expect(sqlCode).not.toMatch(/ec\.relationship_slug\s*(<>|!=|=)\s*'/);
    expect(sqlCode).not.toMatch(/relationship_slug\s+not\s+in\s*\(/i);
  });

  it("NEGATIVE CONTROL — that regex does catch the hardcoded form", () => {
    const bad = norm("where ec.status = 'active' and ec.relationship_slug <> 'student'");
    expect(bad).toMatch(/ec\.relationship_slug\s*(<>|!=|=)\s*'/);
  });
});

describe("least privilege — fail closed, so nothing inherits by accident", () => {
  it("the new column defaults to FALSE", () => {
    expect(sqlCode).toContain(
      "add column if not exists grants_worker_visibility boolean not null default false",
    );
    // The fail-OPEN spelling must never appear.
    expect(sqlCode).not.toMatch(/grants_worker_visibility\s+boolean[^;]*default\s+true/);
  });

  it("NEGATIVE CONTROL — the fail-open spelling is detectable", () => {
    const bad = norm(
      "add column if not exists grants_worker_visibility boolean not null default true;",
    );
    expect(bad).toMatch(/grants_worker_visibility\s+boolean[^;]*default\s+true/);
  });

  it("`student` is set false EXPLICITLY, not merely left at the default", () => {
    // Stating the ruling beats relying on a default: a later reseed that
    // touches every row must still land on the owner's answer.
    expect(sqlCode).toContain(
      "set grants_worker_visibility = false where slug = 'student'",
    );
  });
});

describe("least privilege — zero narrowing of what works today", () => {
  it("every slug except `student` is seeded TRUE in one statement", () => {
    expect(sqlCode).toContain(
      "set grants_worker_visibility = true where slug <> 'student'",
    );
  });

  it("the seed is written so no existing relationship can be missed", () => {
    // `where slug <> 'student'` covers slugs that do not exist yet at write
    // time, which an enumerated IN-list could not. This test states WHY the
    // negated form is the correct one, so a later "tidy-up" into an explicit
    // list is a visible decision rather than a silent narrowing.
    expect(sqlCode).not.toMatch(/set grants_worker_visibility = true where slug in \(/);
    for (const slug of SLUGS_KEEPING_VISIBILITY) {
      expect(slug).not.toBe("student");
    }
  });

  it("no other branch of the predicate is touched", () => {
    // Provenance: each arm that existed before must still be present verbatim.
    // If a future edit drops one, an employer, agency, company or project loses
    // access it has always had — review question B, and invisible to any test
    // that only checks the learner case.
    expect(sqlCode).toContain("public.owns_worker(w)");
    expect(sqlCode).toContain("public.is_admin()");
    expect(sqlCode).toContain("public.worker_profile_discoverable(x.profile_id)");
    expect(sqlCode).toContain("from public.company_workers cw");
    expect(sqlCode).toContain("from public.agency_workers aw");
    expect(sqlCode).toContain("from public.company_worker_engagements e");
    expect(sqlCode).toContain("from public.project_worker_assignments pwa");
  });

  it("the institution keeps the PURPOSE-BOUND practice path", () => {
    // The ruling allows "learner information legitimately required for the
    // education/practice/project relationship". That is this arm, and it must
    // survive: without it an institution running a real practice project would
    // be blind to the learners on it.
    expect(sqlCode).toContain("and public.can_manage_project(pwa.project_id)");
    expect(sqlCode).toContain("pwa.status = 'active'");
    expect(sqlCode).toContain("pwa.ended_at is null");
  });
});

describe("least privilege — the migration is reversible and honest", () => {
  it("a rollback exists and restores the pre-migration predicate", () => {
    expect(rollbackCode).toContain("create or replace function public.can_view_worker(w uuid)");
    expect(rollbackCode).toContain("from public.engagement_contexts ec");
    // The restored branch is the UNJOINED one.
    expect(rollbackCode).not.toContain("join public.relationship_types rt");
  });

  it("the rollback states what it re-opens rather than reading as routine", () => {
    expect(rollbackSql).toMatch(/re-?opens?/i);
    expect(prose(rollbackSql)).toContain("Do not run this without a superseding ruling");
  });

  it("the rollback deletes no relationship a person agreed to", () => {
    expect(rollbackCode).not.toMatch(/delete\s+from/i);
    expect(rollbackCode).not.toMatch(/drop\s+(table|column)/i);
  });

  it("the migration records the measured production evidence, not a claim", () => {
    // The ruling demanded the map be made before the fix. The file carries it,
    // so a later reader can check the reasoning instead of trusting it.
    expect(sqlFlat).toContain("worker_skills_select");
    expect(sqlFlat).toContain("salary_min_eur");
    expect(sqlFlat).toContain("40 `employee`, 13 `owner`");
  });

  it("it names the volunteer/viewer/unemployed question it deliberately did NOT answer", () => {
    // Preserved, not endorsed. Silently narrowing them would have been a
    // product decision taken by side effect.
    expect(sqlFlat).toContain("PRESERVED, NOT ENDORSED");
  });
});
