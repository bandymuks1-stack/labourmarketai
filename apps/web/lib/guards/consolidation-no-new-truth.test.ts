import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CONSOLIDATION — no-new-truth guards (Train L slice 1, 2026-08-17).
 *
 * The duplication audit (docs/audits/duplication-freeze-register-2026-08-17.md
 * + the full reality audit of 2026-08-17) found the same fact stored in up to
 * SIX places: three invitation systems, two membership truths, three
 * employment-record models and six candidate-stage stores. Consolidation is
 * ordered work across several trains; THIS file makes sure the count can only
 * go DOWN. Each section pins one closed vocabulary of stores and names the
 * canonical model a new feature must extend instead.
 *
 * These are grep-shape structural scans (single-domain-origin.test.ts style):
 * they read the real migration + app source and fail with a message that
 * points at the canonical model. Widening an allowlist here is an owner-level
 * consolidation decision, not an implementation detail.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const FREEZE_REGISTER = "docs/audits/duplication-freeze-register-2026-08-17.md";

const readWeb = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

/** Strip SQL line comments so headers may NAME forbidden things in prose. */
const sqlCode = (src: string) =>
  src
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();

/** Strip TS comments (same reason — prose may name what code must not do). */
const tsCode = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

interface MigrationFile {
  readonly name: string;
  readonly raw: string;
  readonly code: string;
}

function loadMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((name) => {
      const raw = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
      return { name, raw, code: sqlCode(raw) };
    });
}

const MIGRATIONS = loadMigrations();

/** Every table name created anywhere in the migration tree (executable SQL
 *  only — commented-out DDL does not count). */
function createdTableNames(): Map<string, string[]> {
  const byTable = new Map<string, string[]>();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/g;
  for (const m of MIGRATIONS) {
    for (const hit of m.code.matchAll(re)) {
      const table = hit[1];
      const files = byTable.get(table) ?? [];
      files.push(m.name);
      byTable.set(table, files);
    }
  }
  return byTable;
}

const CREATED_TABLES = createdTableNames();

function tablesMatching(pattern: RegExp): string[] {
  return [...CREATED_TABLES.keys()].filter((t) => pattern.test(t)).sort();
}

/** Recursive TS/TSX source collection over the app's runtime directories.
 *  tests/ and scripts/ are excluded on purpose: e2e fixtures may seed legacy
 *  tables directly, and that is not a production write path. */
function collectAppSources(): Array<{ rel: string; code: string }> {
  const out: Array<{ rel: string; code: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push({
          rel: relative(WEB_ROOT, full).split(sep).join("/"),
          code: tsCode(readFileSync(full, "utf8")),
        });
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(WEB_ROOT, dir));
  return out;
}

const APP_SOURCES = collectAppSources();

// ── 1. Candidate stage stays DERIVED — no seventh store ─────────────────────
//
// Canonical model: lib/pipeline/candidate-pipeline.ts (P4) derives the ONE
// human pipeline stage at read time from the EXISTING facts
// (demand_shortlist, demand_interest_signals, booking_requests,
// conversations). There is deliberately no stored stage column: with a
// stored copy the six existing stores become seven and drift returns.

describe("candidate stage is derived at read time — never persisted", () => {
  it("the canonical derivation module still exists and is pure", () => {
    const src = readWeb("lib/pipeline/candidate-pipeline.ts");
    expect(src).toContain("THE STAGE IS DERIVED, NEVER STORED");
    expect(
      tsCode(src),
      "lib/pipeline/candidate-pipeline.ts must stay PURE (no IO) — fact " +
        "loading belongs in candidate-pipeline-facts.ts",
    ).not.toMatch(/\.from\(|createClient|server-only/);
  });

  it("no migration introduces a persisted candidate-stage column or table", () => {
    const offenders: string[] = [];
    for (const m of MIGRATIONS) {
      if (/pipeline_stage|candidate_stage|pipeline_status/.test(m.code)) {
        offenders.push(m.name);
      }
    }
    expect(
      offenders,
      "A persisted candidate-pipeline stage store would be the SEVENTH " +
        "status model on the (demand, worker) pair. The canonical stage is " +
        "derived at read time by lib/pipeline/candidate-pipeline.ts — extend " +
        `its facts loader instead. See ${FREEZE_REGISTER} §4.`,
    ).toEqual([]);
  });

  it("no table named like a candidate pipeline store is ever created", () => {
    expect(
      tablesMatching(/^candidate_/),
      "Closed set: candidate_drafts (manual pre-platform candidates) and " +
        "candidate_skills (frozen, 0 rows) are the only candidate_* tables. " +
        "A new one needs an owner consolidation decision — the stage lens is " +
        `derived, never stored. See ${FREEZE_REGISTER} §4.`,
    ).toEqual(["candidate_drafts", "candidate_skills"]);
  });
});

// ── 2. No fourth invitation system ──────────────────────────────────────────
//
// The repo already carries THREE invitation systems (canonical token
// `invitations`; legacy company/agency worker invites; email-keyed
// company_memberships 'invited' rows). Consolidation train L3 converges them
// on the token system as the single ENTRY POINT. Until then the one hard
// rule is: no FOURTH system, and no new caller of the legacy invite RPCs.

describe("no new invitation system", () => {
  it("invitation-shaped tables are the known three", () => {
    expect(
      tablesMatching(/invit/),
      "Closed set. Canonical transport is the token `invitations` system " +
        "(20260712200000_canonical_invitations_v1.sql, lib/invitations/*); " +
        "company_worker_invitations / agency_worker_invitations are legacy " +
        "(read-compatibility only, convergence in train L3). A new invite " +
        `flow must ride create_invitation_v1. See ${FREEZE_REGISTER} §2.`,
    ).toEqual([
      "agency_worker_invitations",
      "company_worker_invitations",
      "invitations",
    ]);
  });

  it("legacy invite RPCs gain no new callers", () => {
    const allowed = new Set([
      "lib/company/company-workers.ts", // invite_company_worker (legacy writer)
      "lib/agency/agency-workers.ts", // invite_agency_worker (legacy writer)
    ]);
    const offenders = APP_SOURCES.filter(
      ({ rel, code }) =>
        !allowed.has(rel) &&
        /rpc\(\s*["'](invite_company_worker|invite_agency_worker)["']/.test(code),
    ).map(({ rel }) => rel);
    expect(
      offenders,
      "invite_company_worker / invite_agency_worker are LEGACY writers kept " +
        "only for the existing company/agency sections until train L3 " +
        "redirects them through create_invitation_v1. New surfaces must call " +
        `the canonical token system (lib/invitations/actions.ts). See ${FREEZE_REGISTER} §2.`,
    ).toEqual([]);
  });
});

// ── 3. No fourth employment-record model ────────────────────────────────────
//
// Canonical employment record: org-bound `engagement_contexts` rows
// (relationship 'employee') — the only model with live production data and
// the only one wired into journal/evidence/CV. `company_worker_engagements`
// is retained solely as the booking-provenance ledger; the
// company_workers/agency_workers rosters are legacy duplicates (their
// ops-role / journal-review payload already lives on engagement_contexts).

describe("no new employment-record model", () => {
  it("engagement-shaped tables are the known two", () => {
    expect(
      tablesMatching(/engagement/),
      "Closed set: engagement_contexts (THE canonical employment spine) and " +
        "company_worker_engagements (booking-provenance ledger only). A new " +
        "employment model must extend engagement_contexts instead. " +
        `See ${FREEZE_REGISTER} §3.`,
    ).toEqual(["company_worker_engagements", "engagement_contexts"]);
  });

  it("roster-shaped tables are the known two (legacy, frozen)", () => {
    expect(
      tablesMatching(/_workers$/),
      "Closed set: company_workers / agency_workers are the LEGACY rosters " +
        "(kept for read compatibility; redirect + freeze planned in train " +
        "L4). New employment state belongs on org-bound engagement_contexts " +
        `rows. See ${FREEZE_REGISTER} §3.`,
    ).toEqual(["agency_workers", "company_workers"]);
  });

  it("app code never writes the rosters or the provenance ledger directly", () => {
    // Writes to all three are RPC-only by design (invite-accept RPCs mint
    // roster rows; booking accept mints company_worker_engagements). A direct
    // PostgREST write from the app would be a NEW writer outside the closed
    // RPC set.
    const writeRe =
      /\.from\(\s*["'](company_workers|agency_workers|company_worker_engagements)["']\s*\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/;
    const offenders = APP_SOURCES.filter(({ code }) => writeRe.test(code)).map(
      ({ rel }) => rel,
    );
    expect(
      offenders,
      "company_workers / agency_workers / company_worker_engagements are " +
        "written ONLY by their SECURITY DEFINER RPCs (accept_*_invitation, " +
        "assign_*_role, respond_booking_request_v3, " +
        "end_company_worker_engagement_v*). A new write path must go through " +
        `an RPC and an owner decision. See ${FREEZE_REGISTER} §3.`,
    ).toEqual([]);
  });

  it("SQL writers of company_worker_engagements stay the booking accept/end family", () => {
    const allowed = new Set([
      "20260723120000_company_worker_engagements_v1.sql", // respond_booking_request_v3 accept
      "20260802150000_booking_atomic_double_booking_v1.sql", // atomic accept rewrite
      "20260807140000_booking_engagement_org_resolution_v1.sql", // org resolution rewrite
    ]);
    const offenders = MIGRATIONS.filter(
      (m) =>
        !allowed.has(m.name) &&
        /insert\s+into\s+(?:public\.)?company_worker_engagements/.test(m.code),
    ).map((m) => m.name);
    expect(
      offenders,
      "company_worker_engagements is the BOOKING-PROVENANCE ledger: rows are " +
        "minted only when a booking is accepted. Extending it to other hire " +
        "paths recreates the third employment model — provision an org-bound " +
        `engagement_contexts employee row instead. See ${FREEZE_REGISTER} §3.`,
    ).toEqual([]);
  });
});

// ── 4. No third membership truth + the CM/EC boundary ───────────────────────
//
// company_memberships = GOVERNANCE (who may administer/act for the org;
// the only input to authority decisions). engagement_contexts = EMPLOYMENT
// (who works where; feeds journal review, evidence, CV). Both legitimately
// remain — but authorization must never consult EC alone, and
// journal/evidence code must never consult CM. The sanctioned dual-arm merge
// points are `manages_organization` / `belongs_to_organization` (SQL) and
// the workspace/managed-organization resolvers (app).

describe("no new membership truth", () => {
  it("membership-shaped tables are exactly company_memberships", () => {
    expect(
      tablesMatching(/membership/),
      "Closed set: company_memberships is THE governance membership truth " +
        "(roles owner/admin/manager/external_manager/member; " +
        "20260806090000_company_memberships_v1.sql). Employment lives on " +
        "engagement_contexts. A third membership store is forbidden. " +
        `See ${FREEZE_REGISTER} §1.`,
    ).toEqual(["company_memberships"]);
  });

  it("governance modules do not read the employment spine", () => {
    // lib/company/memberships.ts + membership-actions.ts are the CM command
    // layer; reaching into engagement_contexts from there would quietly merge
    // the two truths again.
    for (const rel of [
      "lib/company/memberships.ts",
      "lib/company/membership-actions.ts",
    ]) {
      expect(
        tsCode(readWeb(rel)),
        `${rel} is GOVERNANCE (company_memberships) code — employment reads ` +
          "belong to the engagement_contexts consumers. The sanctioned " +
          "merge points are manages_organization / belongs_to_organization " +
          "(SQL) and the workspace resolvers in " +
          "lib/company/active-organization.ts / managed-organizations.ts. " +
          `See ${FREEZE_REGISTER} §1.`,
      ).not.toMatch(/engagement_contexts/);
    }
  });

  it("journal/evidence modules do not read the governance truth", () => {
    const offenders = APP_SOURCES.filter(
      ({ rel, code }) =>
        rel.startsWith("lib/journal/") && /company_memberships/.test(code),
    ).map(({ rel }) => rel);
    expect(
      offenders,
      "Journal review scoping is an EMPLOYMENT question and consults " +
        "engagement_contexts (the canonical spine), never " +
        "company_memberships. Authorization questions belong to the " +
        `membership layer. See ${FREEZE_REGISTER} §1.`,
    ).toEqual([]);
  });
});
