import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S5 agency pool guard — the agency is a full player WITHOUT a trust bypass:
 *   - the pool is ALWAYS the caller's own agency (foreign pool = empty);
 *   - journal evidence renders only through the provisioned bridge (locked
 *     hint otherwise — never a fake zero);
 *   - country readiness is AGGREGATES only (no worker_documents read here);
 *   - "galim pasiūlyti" is a PROPOSAL marker, never a match;
 *   - the S5 demand-visibility migration stays a needs-human-gate DRAFT
 *     with curated columns and zero RLS change.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const readRepo = (rel: string) =>
  readFileSync(join(root, "..", "..", rel), "utf8");
const stripSql = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const lib = read("lib/agency/pool.ts");
const page = read("app/[locale]/dashboard/agency/pool/page.tsx");
const actions = read("lib/agency/pool-actions.ts");
const migration = readRepo(
  "supabase/migrations/20260611150000_s5_agency_demand_visibility.sql",
);

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];

describe("pool visibility boundary — own agency only", () => {
  it("every read starts at getOwnAgency (no-agency → no pool)", () => {
    expect(lib).toMatch(/const agency = await getOwnAgency\(\);/);
    expect(lib).toMatch(/if \(!agency\) return \{ kind: "no-agency" \};/);
  });
  it("rows come from the owns_agency-gated list (no broad workers scan)", () => {
    expect(lib).toMatch(/listActiveAgencyWorkers\(agency\.id\)/);
    // The only workers read is scoped to the pool's own worker ids.
    expect(lib).toMatch(/\.in\("id", workerIds\)/);
  });
  it("evidence reads cover ONLY bridge-linked workers; unlinked stay null", () => {
    expect(lib).toMatch(/\.filter\(\(r\) => r\.engagementContextLinked\)/);
    expect(lib).toMatch(/journalEntries: entriesByWorker\.get\(r\.workerId\) \?\? null/);
  });
  // Direction A (2026-07-05): the pool PAGE became a redirect stub into the
  // canonical company workspace (roster = company_workers, #company-team).
  // The lib boundary assertions above stay — lib/agency is untouched until
  // the owner-gated agencies→companies data task.
  it("the pool route is a redirect stub to the canonical company roster", () => {
    expect(page).toMatch(
      /redirect\(`\/\$\{locale\}\/dashboard\/company#company-team`\)/,
    );
    expect(page).not.toMatch(/getAgencyPool|CanOfferButton/);
  });
});

describe("readiness is aggregates only", () => {
  it("the pool lib never reads worker_documents", () => {
    expect(lib).not.toMatch(/worker_documents/);
  });
});

describe("'galim pasiūlyti' is a proposal, never a match", () => {
  it("the action wraps the gated RPC and never touches status/match_log", () => {
    expect(actions).toMatch(/markAgencyCanOffer/);
    expect(actions).not.toMatch(/match_log|status_set|recordHumanMatch/);
  });
  it("the lib degrades to an honest needs-gate state", () => {
    expect(lib).toMatch(/kind: "needs-gate"/);
  });
});

describe("S5 demand-visibility migration is applied-marked, narrow, reversible", () => {
  it("carries the APPLIED-to-prod ledger mark with a rollback", () => {
    expect(migration).toMatch(/APPLIED to prod via Supabase MCP apply_migration/);
    expect(migration).toMatch(/20260611091820/);
    expect(migration).toMatch(/-- ROLLBACK/);
  });
  it("returns ONLY curated, non-personal demand columns", () => {
    const code = stripSql(migration).toLowerCase();
    expect(code).not.toMatch(/profile_id\s*,/); // never projected to agencies
    expect(code).toMatch(/role_or_work_type/);
    expect(code).toMatch(/status = 'submitted'/);
  });
  it("the marker is append-only and never touches status or match_log", () => {
    const code = stripSql(migration).toLowerCase();
    expect(code).toMatch(/agency_offers/);
    expect(code).not.toMatch(/match_log/);
    expect(code).not.toMatch(/set\s+status/);
  });
  it("never loosens RLS (no policy change, no anon, no using(true))", () => {
    const code = stripSql(migration).toLowerCase();
    expect(code).not.toMatch(/create policy|alter policy|using\s*\(\s*true\s*\)/);
    expect(code).not.toMatch(/\bto\s+anon\b/);
  });
});

describe("pool copy exists in all 10 locales and the room is reachable", () => {
  it("agencyPool namespace present everywhere", () => {
    for (const locale of LOCALES) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      for (const k of ["eyebrow", "title", "poolTitle", "empty", "evidenceLocked"]) {
        expect(j.agencyPool?.[k], `${locale} agencyPool.${k}`).toBeTruthy();
      }
      expect(
        j.agencyPool?.readiness?.docsNote,
        `${locale} readiness.docsNote`,
      ).toBeTruthy();
      expect(
        j.agencyPool?.demand?.humanNote,
        `${locale} demand.humanNote`,
      ).toBeTruthy();
    }
  });
  it("the legacy agency dashboard route redirects into the company room", () => {
    // Direction A: the pool is reached through the canonical company
    // workspace; the legacy dashboard no longer links a separate pool room.
    const dash = read("app/[locale]/dashboard/agency/page.tsx");
    expect(dash).toMatch(/redirect\(`\/\$\{locale\}\/dashboard\/company`\)/);
  });
});
