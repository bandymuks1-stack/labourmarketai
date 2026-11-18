import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));
// The cookie client must never be reached from the door: both capabilities
// pass the caller's own client into the core. If this were called the test
// would throw, which is the assertion.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    throw new Error("jobs.* must use the caller's client, not the cookie client");
  },
}));

import { __resetPublicVacancyCache } from "@/lib/vacancy-store/public-vacancy-preview";

import type { CapabilityCaller } from "./contract";
import { exposedCapabilities, runCapability } from "./registry";

type RpcScript = Record<string, { data: unknown; error: { code?: string; message: string } | null }>;

function callerWith(script: RpcScript, locale = "lt"): CapabilityCaller {
  const calls: { fn: string; args: unknown }[] = [];
  const supabase = {
    async rpc(fn: string, args: unknown) {
      calls.push({ fn, args });
      return script[fn] ?? { data: null, error: { message: `unscripted rpc ${fn}` } };
    },
  } as unknown as CapabilityCaller["supabase"];
  const c = {
    userId: "00000000-0000-4000-8000-0000000000aa",
    transport: "bearer",
    supabase,
    locale,
  } as CapabilityCaller;
  (c as unknown as { calls: typeof calls }).calls = calls;
  return c;
}

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  title_raw: "Väktare till Lunds Universitet",
  profession_slug: "security_guard",
  occupation_raw: "Väktare",
  employment_form: "permanent",
  working_time: "full_time",
  positions: 2,
  compensation_currency: "SEK",
  compensation_min: "28000",
  compensation_max: null,
  source_language: "sv",
  attribution_code: "AF",
  published_at: "2026-10-10T08:00:00Z",
  total_count: "41",
};

describe("jobs.search / jobs.get — the public board through the door", () => {
  it("both are exposed, read-only reads", () => {
    const byId = Object.fromEntries(exposedCapabilities().map((c) => [c.id, c]));
    for (const id of ["jobs.search", "jobs.get"]) {
      expect(byId[id], id).toBeDefined();
      expect(byId[id].kind).toBe("read");
      expect(byId[id].annotations.readOnlyHint).toBe(true);
      expect(byId[id].annotations.destructiveHint).toBe(false);
    }
  });

  it("search runs the canonical RPC with the caller's client and returns the anonymous projection only", async () => {
    __resetPublicVacancyCache();
    const c = callerWith({ search_public_vacancy_previews_v1: { data: [ROW], error: null } });
    const r = await runCapability("jobs.search", c, { query: "väktare", page: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const calls = (c as unknown as { calls: { fn: string; args: Record<string, unknown> }[] }).calls;
    expect(calls[0].fn).toBe("search_public_vacancy_previews_v1");
    expect(calls[0].args).toEqual({ p_query: "väktare", p_profession_slug: null, p_limit: 20, p_offset: 20 });
    expect(r.data).toMatchObject({ status: "ok", page: 2, pageSize: 20, totalCount: 41, hasMore: true });
    const job = (r.data as { jobs: Record<string, unknown>[] }).jobs[0];
    // The raw title and the named source never cross the door (owner 2026-08-24).
    expect(job).not.toHaveProperty("title");
    expect(job).not.toHaveProperty("attributionCode");
    expect(job).toMatchObject({
      id: ROW.id,
      occupation: "Väktare",
      compensationMin: 28000,
      compensationMax: null,
      webPath: `/lt/jobs/${ROW.id}`,
    });
  });

  it("the last allowed page never advertises a next page the schema would refuse", async () => {
    __resetPublicVacancyCache();
    const c = callerWith({
      search_public_vacancy_previews_v1: { data: [{ ...ROW, total_count: "5000" }], error: null },
    });
    const r = await runCapability("jobs.search", c, { page: 100 });
    expect(r).toMatchObject({ ok: true, data: { page: 100, totalCount: 5000, hasMore: false } });
  });

  it("a page beyond the bound, or an unknown argument, is refused before any read", async () => {
    const c = callerWith({});
    expect(await runCapability("jobs.search", c, { page: 101 })).toMatchObject({ ok: false, code: "invalid" });
    expect(await runCapability("jobs.search", c, { country: "SE" })).toMatchObject({ ok: false, code: "invalid" });
    expect((c as unknown as { calls: unknown[] }).calls).toEqual([]);
  });

  it("a statement timeout is 'unavailable', never an empty board (#1314)", async () => {
    __resetPublicVacancyCache();
    const c = callerWith({
      search_public_vacancy_previews_v1: { data: null, error: { code: "57014", message: "canceling statement" } },
    });
    expect(await runCapability("jobs.search", c, { query: "slow" })).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("get answers the one job, or not_found by name", async () => {
    const c = callerWith({ get_public_vacancy_preview_v1: { data: [ROW], error: null } }, "en");
    const r = await runCapability("jobs.get", c, { id: ROW.id });
    expect(r).toMatchObject({ ok: true, data: { job: { id: ROW.id, webPath: `/en/jobs/${ROW.id}` } } });
    const none = callerWith({ get_public_vacancy_preview_v1: { data: [], error: null } });
    expect(await runCapability("jobs.get", none, { id: ROW.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await runCapability("jobs.get", none, { id: "not-a-uuid" })).toMatchObject({ ok: false, code: "invalid" });
  });
});
