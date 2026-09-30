import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));

import { COMPANY_INGEST_CAPABILITIES } from "./company-ingest-capabilities";
import type { CapabilityCaller } from "./contract";

type Outcome = { data: unknown; error: { code?: string; message: string } | null; count?: number };

function caller(script: Record<string, Outcome>) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => resolve(script[table] ?? { data: [], error: null });
      return chain;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return script[`rpc:${fn}`] ?? { data: null, error: { message: "unscripted" } };
    },
  } as unknown as CapabilityCaller["supabase"];
  return { c: { userId: "op", transport: "bearer", supabase, locale: "lt" } as CapabilityCaller, rpcCalls };
}

const preview = COMPANY_INGEST_CAPABILITIES[0];
const confirm = COMPANY_INGEST_CAPABILITIES[1];
const SRC = { kind: "public_register", ref: "register", observedAt: "2026-09-30" };
const ROWS = [
  { ref: "new", name: "Naujas Rangovas UAB", country: "LT", registrationCode: "300000001", classes: ["contractor"], source: SRC },
  { ref: "known", name: "Jau Esama", country: "LT", registrationCode: "300000002", classes: ["direct_employer"], source: SRC },
  { ref: "maybe", name: "Panaši Įmonė", country: "LT", source: SRC },
];
const IDS: Outcome = {
  data: [
    { organization_id: "org-known", scheme: "registration_code", country: "LT", value_normalized: "300000002" },
    { organization_id: "org-similar", scheme: "name_country", country: "LT", value_normalized: "panasi imone" },
  ],
  error: null,
};
const CAN: Outcome = { data: true, error: null };

describe("company.ingest — capability, plan, confirm", () => {
  it("without the marketplace_company_ingest capability nothing is even previewed", async () => {
    const { c, rpcCalls } = caller({ "rpc:has_platform_capability": { data: false, error: null } });
    const r = await preview.run(c, { rows: ROWS });
    expect(r.ok === false && r.code).toBe("not_authorized");
    expect(rpcCalls.map((x) => x.fn)).toEqual(["has_platform_capability"]);
  });

  it("the plan: new → create, strong match → facts only, weak name → possible duplicate (skipped)", async () => {
    const { c } = caller({ "rpc:has_platform_capability": CAN, organization_identifiers: IDS });
    const r = await preview.run(c, { rows: ROWS });
    expect(r.ok).toBe(true);
    const d = r.ok ? (r.data as { rows: { ref: string; action: string; knownOrganizationId: string | null }[]; summary: Record<string, number> }) : null;
    expect(d!.rows.map((x) => [x.ref, x.action])).toEqual([
      ["new", "create"],
      ["known", "add_facts_to_known"],
      ["maybe", "possible_duplicate"],
    ]);
    expect(d!.rows[1].knownOrganizationId).toBe("org-known");
    expect(d!.summary).toMatchObject({ create: 1, addFactsToKnown: 1, possibleDuplicate: 1, directEmployersOrContractors: 2 });
  });

  it("confirm writes ONLY the previewed plan, in one call, and a changed row voids the token", async () => {
    const script: Record<string, Outcome> = {
      "rpc:has_platform_capability": CAN,
      organization_identifiers: IDS,
      "rpc:ingest_discovered_organizations_v1": {
        data: {
          created: 1,
          known: 1,
          conflict: 0,
          rows: [
            { ref: "new", outcome: "created", organization_id: "org-new" },
            { ref: "known", outcome: "known", organization_id: "org-known" },
          ],
        },
        error: null,
      },
      organizations: {
        data: [{ id: "org-new", display_name: "Naujas Rangovas UAB", claim_state: "discovered", owner_profile_id: null, country: "LT" }],
        error: null,
      },
      organization_facts: { data: null, error: null, count: 4 },
    };
    const { c, rpcCalls } = caller(script);
    const p = await preview.run(c, { rows: ROWS });
    const token = p.ok ? (p.data as { confirmationToken: string }).confirmationToken : "";

    const changed = [...ROWS.slice(0, 2), { ...ROWS[2], name: "Kita" }];
    const bad = await confirm.run(c, { rows: changed, confirmationToken: token });
    expect(bad.ok === false && bad.code).toBe("confirmation_rejected");
    expect(rpcCalls.some((x) => x.fn === "ingest_discovered_organizations_v1")).toBe(false);

    const ok = await confirm.run(c, { rows: ROWS, confirmationToken: token });
    expect(ok.ok).toBe(true);
    const writes = rpcCalls.filter((x) => x.fn === "ingest_discovered_organizations_v1");
    expect(writes).toHaveLength(1);
    const sent = writes[0].args.p_rows as { ref: string }[];
    expect(sent.map((s) => s.ref)).toEqual(["new", "known"]);
    const d = ok.ok ? (ok.data as { readBack: { claimState: string; ownerAssigned: boolean }[] }) : null;
    expect(d!.readBack).toEqual([{ id: "org-new", name: "Naujas Rangovas UAB", claimState: "discovered", ownerAssigned: false, country: "LT" }]);
  });

  it("an explicitly accepted possible duplicate becomes a create", async () => {
    const { c } = caller({ "rpc:has_platform_capability": CAN, organization_identifiers: IDS });
    const r = await preview.run(c, { rows: ROWS, includePossibleDuplicates: ["maybe"] });
    const rows = r.ok ? (r.data as { rows: { ref: string; action: string }[] }).rows : [];
    expect(rows.find((x) => x.ref === "maybe")?.action).toBe("create");
  });
});
