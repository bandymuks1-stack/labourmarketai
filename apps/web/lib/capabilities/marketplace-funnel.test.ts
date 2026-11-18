import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("@/lib/company/employer-company-context", () => ({ requireEmployerCompanyForCaller: async () => ({ ok: false }) }));
vi.mock("@/lib/company/company-workers", () => ({ listActiveCompanyWorkers: async () => ({ kind: "ok", rows: [] }) }));
vi.mock("@/lib/scouting/scouting", () => ({ runScoutingCore: vi.fn(), setShortlistCore: vi.fn() }));

import { MARKETPLACE_CAPABILITIES } from "./marketplace-capabilities";
import type { CapabilityCaller } from "./contract";

type Outcome = { data: unknown; error: { code?: string; message: string } | null };

function caller(script: Record<string, Outcome>, discoverable: (profile: string) => boolean | "error" = () => false) {
  const supabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(script[table] ?? { data: [], error: null });
      return chain;
    },
    async rpc(fn: string, args?: { p_profile?: string }) {
      if (fn === "worker_profile_discoverable") {
        const d = discoverable(args?.p_profile ?? "");
        return d === "error" ? { data: null, error: { message: "x" } } : { data: d, error: null };
      }
      return script[`rpc:${fn}`] ?? { data: null, error: { message: "unscripted" } };
    },
  } as unknown as CapabilityCaller["supabase"];
  return { userId: "admin", transport: "bearer", supabase, locale: "lt" } as CapabilityCaller;
}

const funnel = MARKETPLACE_CAPABILITIES.find((c) => c.id === "marketplace.funnel.get")!;

const worker = (id: string, profile: string, over: Record<string, unknown> = {}) => ({
  id,
  profile_id: profile,
  display_name: null,
  headline: null,
  current_location_country: "LT",
  preferred_countries: ["SE"],
  availability_status: "available",
  ...over,
});

const BASE: Record<string, Outcome> = {
  "rpc:is_admin": { data: true, error: null },
  account_classifications: {
    data: [
      { profile_id: "p-real-1", account_class: "real" },
      { profile_id: "p-real-2", account_class: "real" },
      { profile_id: "p-test", account_class: "test" },
      { profile_id: "p-team", account_class: "internal" },
    ],
    error: null,
  },
  workers: {
    data: [
      worker("w1", "p-real-1"),
      worker("w2", "p-real-2", { availability_status: null }),
      // A complete, consenting TEST account must not lift any real stage.
      worker("w3", "p-test"),
      worker("w4", "p-team"),
      worker("w5", "p-unclassified"),
    ],
    error: null,
  },
  worker_professions: { data: [{ worker_id: "w1" }, { worker_id: "w2" }, { worker_id: "w3" }], error: null },
  worker_skills: { data: [{ worker_id: "w1" }, { worker_id: "w3" }], error: null },
  worker_languages: { data: [], error: null },
  profiles: { data: [], error: null },
  demand_shortlist: { data: [{ worker_id: "w1" }], error: null },
  conversation_participants: { data: [], error: null },
  project_worker_assignments: { data: [], error: null },
  agency_candidate_offers: { data: [], error: null },
};

describe("marketplace.funnel.get — real accounts only, facts only", () => {
  it("counts REAL accounts only; test, internal and unknown are reported apart", async () => {
    const r = await funnel.run(caller(BASE, (p) => p === "p-real-1" || p === "p-test"), {});
    expect(r.ok).toBe(true);
    const d = r.ok ? (r.data as { accountsByClass: Record<string, number>; funnel: Record<string, number | null> }) : null;
    expect(d!.accountsByClass).toEqual({ real: 2, test: 1, internal: 1, unknown: 1 });
    expect(d!.funnel).toMatchObject({
      REAL_WORKER: 2,
      PROFESSION_COMPLETE: 2,
      AVAILABILITY_COMPLETE: 1,
      SKILLS_COMPLETE: 1,
      DISCOVERABILITY_GRANTED: 1,
      MATCHABLE: 1,
      DISCOVERABLE: 1,
      EMPLOYER_SEARCH_RESULT: null,
      SHORTLIST: 1,
      CONVERSATION: 0,
      OFFER_OR_ASSIGNMENT: 0,
    });
  });

  it("an unreadable consent is NOT_MEASURED, never 0", async () => {
    const r = await funnel.run(caller(BASE, () => "error"), {});
    const f = r.ok ? (r.data as { funnel: Record<string, number | null> }).funnel : null;
    expect(f!.DISCOVERABILITY_GRANTED).toBeNull();
    expect(f!.DISCOVERABLE).toBeNull();
  });

  it("a failed downstream read is null, not 0", async () => {
    const r = await funnel.run(
      caller({ ...BASE, conversation_participants: { data: null, error: { message: "rls" } } }),
      {},
    );
    expect(r.ok && (r.data as { funnel: Record<string, number | null> }).funnel.CONVERSATION).toBeNull();
  });

  it("administrators only", async () => {
    const r = await funnel.run(caller({ ...BASE, "rpc:is_admin": { data: false, error: null } }), {});
    expect(r.ok === false && r.code).toBe("not_authorized");
  });
});
