import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P5 agency client management guard (canonical journey, Direction A).
 *
 * Owner decision: an agency stays `companies.company_type='staffing_agency'`
 * inside the SAME canonical company workspace. The client-management slice
 * must therefore:
 *   1. render ONLY under the staffing_agency type — never a new dashboard,
 *      never a third identity;
 *   2. REUSE the canonical demand model (customer_requests) — the demand
 *      list reads it directly and the (owner-gated) link is ONE nullable FK
 *      column on it; NO parallel client/candidate/demand model in code;
 *   3. never auto-communicate — client records are private CRM rows; nothing
 *      is sent to anyone;
 *   4. stay honest about the owner gate — the migration is a committed DRAFT
 *      (needs-human-gate header + paired rollback + ledger Deferred entry)
 *      and the UI degrades to a truthful "prepared" state until applied.
 *
 * Investigation record (2026-07-13): public.customers could NOT be reused —
 * `unique (profile_id)` + owns_customer(profile_id = auth.uid()) make it a
 * SELF-owned buyer identity (one row per profile), and
 * customer_requests.customer_id is only auto-resolved to the caller's own
 * customers row inside save_customer_request. The full record lives in the
 * draft migration header.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MIGRATION = "supabase/migrations/20260713160000_agency_clients_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260713160000_agency_clients_v1.down.sql";

const companyPage = read("app/[locale]/dashboard/company/page.tsx");
const clientsLib = read("lib/agency/clients.ts");
const clientsModel = read("lib/agency/clients-model.ts");
const clientsActions = read("lib/agency/clients-actions.ts");
const section = read("components/app/agency-clients-section.tsx");
const migration = readFileSync(join(REPO, MIGRATION), "utf8");

describe("1. renders ONLY under the staffing_agency company type", () => {
  it("the section mounts exactly once, inside the staffing_agency conditional", () => {
    expect(
      companyPage.match(/<AgencyClientsSection/g) ?? [],
    ).toHaveLength(1);
    const condIdx = companyPage.indexOf(
      'companyRow.companyType === "staffing_agency" ? (',
    );
    const sectionIdx = companyPage.indexOf("<AgencyClientsSection");
    expect(condIdx).toBeGreaterThan(-1);
    expect(sectionIdx).toBeGreaterThan(condIdx);
  });

  it("client/demand data is fetched only in staffing-agency mode", () => {
    expect(companyPage).toMatch(
      /const isStaffingAgency = companyRow\?\.companyType === "staffing_agency"/,
    );
    // The invariant is the CONDITIONAL — never the `await` keyword. Both
    // reads now sit inside the page's batched `Promise.all` (the serial
    // waterfall this dashboard used to run was the measured reason it felt
    // slow), so the call is no longer individually awaited. The gate itself is
    // unchanged and still pinned: in any mode but staffing-agency the
    // expression is `null` and NOTHING is fetched. `await` is optional here
    // precisely so batching stays allowed; the ternary is not.
    expect(companyPage).toMatch(
      /isStaffingAgency \? (await )?listAgencyClients\(\) : null/,
    );
    expect(companyPage).toMatch(
      /isStaffingAgency \? (await )?listAgencyDemands\(\) : null/,
    );
  });

  it("no new agency dashboard route exists — the legacy trio stays redirect stubs", () => {
    // The Direction A guard pins the stub contents; here we pin that this
    // slice added no page under an agency path.
    for (const rel of [
      "app/[locale]/dashboard/agency/clients",
      "app/[locale]/dashboard/company/clients",
    ]) {
      expect(existsSync(join(APP, rel)), `${rel} must not exist`).toBe(false);
    }
  });
});

describe("2. reuses the canonical demand model — no parallel client model", () => {
  it("the demand list reads the CANONICAL customer_requests table", () => {
    expect(clientsLib).toMatch(/from\("customer_requests"\)/);
    expect(clientsLib).toMatch(/eq\("profile_id", user\.id\)/);
  });

  it("touches only agency_clients + customer_requests — no candidate/demand duplicates", () => {
    const code = clientsLib + clientsModel + clientsActions + section;
    // The only .from() reads in the slice:
    const froms = [...code.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(new Set(froms)).toEqual(new Set(["agency_clients", "customer_requests"]));
    // No parallel models: candidates, shortlists, pools, pipelines stay owned
    // by their canonical modules.
    expect(code).not.toMatch(
      /candidate_drafts|demand_shortlist|candidate_pool|agency_workers|job_demands/,
    );
    expect(code).not.toMatch(/@\/lib\/(candidates|staffing|pipeline|scouting)\//);
    // The legacy agencies-table world stays out.
    expect(code).not.toMatch(/from\("agencies"\)|@\/lib\/agency\/pool/);
  });

  it("the demand→client link is ONE additive FK column on customer_requests (draft migration)", () => {
    expect(migration).toMatch(
      /alter table public\.customer_requests\s+add column if not exists agency_client_id uuid\s+references public\.agency_clients\(id\) on delete set null/,
    );
    // Client ownership rides the CANONICAL company profile (Direction A).
    expect(migration).toMatch(
      /company_id\s+uuid not null references public\.companies\(id\) on delete cascade/,
    );
    // Fail-closed: owner-or-admin SELECT, writes RPC-only.
    expect(migration).toMatch(
      /using \(public\.owns_company\(company_id\) or public\.is_admin\(\)\)/,
    );
    expect(migration).not.toMatch(/to anon/);
  });

  it("candidates/status/communication link into the existing scouting surface (link only)", () => {
    expect(section).toMatch(/dashboard\/company\/scouting\?request=/);
    // Link only — the section never imports or re-implements scouting.
    expect(section).not.toMatch(/runScouting|listCompanyDemands|@\/lib\/scouting/);
  });
});

describe("3. no auto-communication", () => {
  it("the slice never opens conversations, sends mail, or calls outbound APIs", () => {
    const code = clientsLib + clientsModel + clientsActions + section;
    expect(code).not.toMatch(
      /conversation|sendMessage|nodemailer|smtp|telegram|webhook|mailto:/i,
    );
    expect(code).not.toMatch(/fetch\(/);
    // contact_email is a stored note field, never an auto-send target.
    expect(migration).not.toMatch(/notify|http|net\.|pg_net/i);
  });
});

describe("4. the owner gate is honest", () => {
  it("the migration is a DRAFT with the needs-human-gate header", () => {
    expect(migration).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
  });

  it("a paired rollback exists", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    const rollback = readFileSync(join(REPO, ROLLBACK), "utf8");
    for (const obj of [
      "set_demand_agency_client_v1",
      "remove_agency_client_v1",
      "save_agency_client_v1",
      "agency_client_id",
      "agency_clients",
    ]) {
      expect(rollback).toContain(obj);
    }
  });

  it("APPLIED_LEDGER.md carries the Deferred entry", () => {
    const ledger = readFileSync(join(REPO, "docs/APPLIED_LEDGER.md"), "utf8");
    const deferredIdx = ledger.indexOf("## Deferred");
    const entryIdx = ledger.indexOf("20260713160000_agency_clients_v1");
    expect(deferredIdx).toBeGreaterThan(-1);
    expect(entryIdx).toBeGreaterThan(deferredIdx);
  });

  it("the read service degrades honestly (42P01/PGRST205 → needs-migration; 42703 → not linkable)", () => {
    expect(clientsModel).toMatch(/42P01/);
    expect(clientsModel).toMatch(/PGRST205/);
    expect(clientsModel).toMatch(/42703/);
    expect(clientsLib).toMatch(/needs-migration/);
    expect(clientsLib).toMatch(/linkable = false/);
    expect(section).toMatch(/data-testid="agency-clients-gated"/);
  });
});
