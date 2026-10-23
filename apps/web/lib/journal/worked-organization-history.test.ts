import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readHistoricalOrgNames } from "@/lib/company/historical-org-names";
import { readWorkedOrganizationPeriods } from "./professional-experience-read";

type Answer = { data: unknown; error: { code?: string } | null };
function rpcClient(answers: Record<string, Answer>) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      rpc: (fn: string) => {
        calls.push(fn);
        return Promise.resolve(answers[fn] ?? { data: null, error: { code: "42883" } });
      },
    } as never,
  };
}

describe("names of organizations the person worked for (claimed roster rows included)", () => {
  it("reads v2 when installed", async () => {
    const { client, calls } = rpcClient({
      my_historical_organization_names_v2: {
        data: [{ organization_id: "o1", display_name: "Labour market ai", legal_name: null }],
        error: null,
      },
    });
    const names = await readHistoricalOrgNames(client, ["o1"]);
    expect(names.get("o1")?.display_name).toBe("Labour market ai");
    expect(calls).toEqual(["my_historical_organization_names_v2"]);
  });

  it("falls back to v1 while v2 is not installed", async () => {
    const { client, calls } = rpcClient({
      my_historical_organization_names_v1: {
        data: [{ organization_id: "o1", display_name: null, legal_name: "LMA Sp. z o.o." }],
        error: null,
      },
    });
    const names = await readHistoricalOrgNames(client, ["o1"]);
    expect(names.get("o1")?.legal_name).toBe("LMA Sp. z o.o.");
    expect(calls).toEqual(["my_historical_organization_names_v2", "my_historical_organization_names_v1"]);
  });

  it("a real failure is no names, never a guess", async () => {
    const { client } = rpcClient({ my_historical_organization_names_v2: { data: null, error: { code: "57014" } } });
    expect((await readHistoricalOrgNames(client, ["o1"])).size).toBe(0);
  });
});

describe("stated earlier periods of organizations the person worked for", () => {
  it("maps the periods and drops superseded statements", async () => {
    const row = (id: string, label: string, supersedes: string | null = null) => ({
      id,
      organization_id: "o1",
      period_label: label,
      legal_entity_label: null,
      legal_entity_relation: "not_asserted",
      basis: "owner_statement",
      period_start: null,
      period_end: null,
      source_labels: ["Vivat Rex PL"],
      supersedes_id: supersedes,
    });
    const { client } = rpcClient({
      my_worked_organization_periods_v1: { data: [row("p1", "Vivat Rex"), row("p2", "Vivat Rex (stated)", "p1")], error: null },
    });
    const periods = await readWorkedOrganizationPeriods(client, ["o1"]);
    expect(periods.get("o1")?.map((p) => p.label)).toEqual(["Vivat Rex (stated)"]);
    expect(periods.get("o1")?.[0]).toMatchObject({ from: null, to: null, sourceLabels: ["Vivat Rex PL"], basis: "owner_statement" });
  });

  it("no function / failure → no periods (the leaders-only read still applies)", async () => {
    const { client } = rpcClient({});
    expect((await readWorkedOrganizationPeriods(client, ["o1"])).size).toBe(0);
  });

  it("the experience read asks only for organizations the person does not lead", () => {
    const src = readFileSync(join(__dirname, "professional-experience-read.ts"), "utf8");
    expect(src).toMatch(/\.filter\(\s*\(id\): id is string => !!id && !periodsByOrg\.has\(id\),?\s*\)/);
    expect(src).toMatch(/readWorkedOrganizationPeriods\(supabase, workedOnly\)/);
  });

  it("a roster row the PERSON CONFIRMED is part of their history (name + periods, no invented dates)", () => {
    const src = readFileSync(join(__dirname, "professional-experience-read.ts"), "utf8");
    // only their own, linked AND worker-confirmed rows — the integrity-door rule
    expect(src).toMatch(/\.eq\("linked_profile_id", userId\)\s*\.eq\("link_state", "linked"\)\s*\.eq\("link_method", "worker_confirmed"\)/);
    // the organizations reach the periods read and the names read
    expect(src).toMatch(/\.\.\.roster\.map\(\(r\) => r\.organizationId\)/);
    expect(src).toMatch(/readHistoricalOrgNames\(\s*supabase,\s*rosterOnly\.map/);
    // recorded by the organization, undated, not current
    const block = src.slice(src.indexOf("const rosterOnly"), src.indexOf("return out;\n}\n\n/** Roster kinds"));
    expect(block).toMatch(/startedAt: null,\s*endedAt: null,\s*current: false,\s*source: "membership"/);
    // a candidate is not a working relationship; an unclassified kind is never re-labelled
    expect(src).not.toMatch(/candidate: "/);
    expect(src).toMatch(/  other: "other",/);
  });

  it("the migration exposes names and stated periods only, to authenticated callers only", () => {
    const sql = readFileSync(
      join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20261020100000_worked_organization_history_v1.sql"),
      "utf8",
    );
    const body = sql.replace(/--[^\n]*/g, "");
    expect(body).not.toMatch(/\bstatement\b|basis_reference|created_by/);
    expect(body).toMatch(/revoke all on function public\.my_worked_organization_periods_v1\(uuid\[\]\) from public, anon;/);
    expect(body).toMatch(/revoke all on function public\.my_historical_organization_names_v2\(uuid\[\]\) from public, anon;/);
    expect(body).toMatch(/op\.link_state = 'linked'/);
  });
});
