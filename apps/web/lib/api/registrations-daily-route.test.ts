import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcCalls: Array<{ fn: string; args: unknown }> = [];
let adminThrows = false;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (adminThrows) throw new Error("no service key");
    return {
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return rpcResult;
      },
    };
  },
}));

import {
  REGISTRATION_GROUPS,
  REGISTRATION_METRICS,
  REGISTRATIONS_DAILY_DEFINITION_VERSION,
} from "@/lib/api/registrations-daily";

import { GET } from "@/app/api/internal/registrations-daily/v1/route";

const TOKEN = "s".repeat(40);
const NOW = Date.parse("2026-11-14T09:30:00Z");
const TODAY = "2026-11-14";
const YESTERDAY = "2026-11-13";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type Split = { REAL: number; TEST: number; INTERNAL: number } | null;
const split = (REAL: number, TEST = 0, INTERNAL = 0): Split => ({ REAL, TEST, INTERNAL });

function aggregate(over: Partial<Record<string, Partial<Record<string, Split>>>> = {}) {
  const groups: Record<string, Record<string, Split>> = {};
  for (const g of REGISTRATION_GROUPS) {
    groups[g] = { new: split(5, 7, 4), active7d: split(10, 9, 6), active30d: split(20, 11, 8), ...(over[g] ?? {}) };
  }
  return { groups };
}

function get(query = `?day=${YESTERDAY}`, authorization: string | null = `Bearer ${TOKEN}`): Promise<Response> {
  const headers: Record<string, string> = authorization ? { authorization } : {};
  return GET(new Request(`https://labourmarket.ai/api/internal/registrations-daily/v1${query}`, { headers }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SUPPLY_FEED_BEARER_TOKEN", TOKEN);
  rpcResult = { data: aggregate(), error: null };
  rpcCalls = [];
  adminThrows = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("who may read it", () => {
  it.each([
    ["no Authorization header", null],
    ["an empty Bearer", "Bearer "],
    ["a wrong token of the same length", `Bearer ${"x".repeat(40)}`],
    ["the right token with a suffix", `Bearer ${TOKEN}x`],
    ["the right token under another scheme", `Basic ${TOKEN}`],
  ])("401 with %s — no data, and the aggregate is never read", async (_why, authorization) => {
    const res = await get(`?day=${YESTERDAY}`, authorization);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: "unauthorized" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a too-short secret as unset (503), never as open", async () => {
    vi.stubEnv("SUPPLY_FEED_BEARER_TOKEN", "short");
    const res = await get(`?day=${YESTERDAY}`, "Bearer short");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "not_configured" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("503 while the secret is unset (fail closed), and it never reads", async () => {
    vi.stubEnv("SUPPLY_FEED_BEARER_TOKEN", "");
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "not_configured" });
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("which day", () => {
  it.each([
    ["missing", ""],
    ["malformed", "?day=2026-11-1"],
    ["not a calendar day", "?day=2026-02-30"],
    ["free text", "?day=yesterday"],
    ["future", "?day=2026-11-15"],
  ])("400 invalid_day when %s", async (_why, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "invalid_day" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("passes the UTC day to the aggregate", async () => {
    expect((await get(`?day=${TODAY}`)).status).toBe(200);
    expect(rpcCalls).toEqual([{ fn: "lm_registrations_daily_v1", args: { p_day: TODAY } }]);
  });
});

describe("503 is never an empty body", () => {
  it.each([
    ["the read errors (function not applied yet)", () => (rpcResult = { data: null, error: { code: "PGRST202" } })],
    ["the admin client throws", () => (adminThrows = true)],
    ["the aggregate is empty", () => (rpcResult = { data: {}, error: null })],
    ["a group is missing", () => {
      const a = aggregate();
      delete (a.groups as Record<string, unknown>).students;
      rpcResult = { data: a, error: null };
    }],
    ["a metric is missing", () => {
      const a = aggregate();
      delete (a.groups.workers as Record<string, unknown>).active30d;
      rpcResult = { data: a, error: null };
    }],
    ["a count is negative", () => (rpcResult = { data: aggregate({ agencies: { new: split(-1) } }), error: null })],
    ["a count is not an integer", () => (rpcResult = { data: aggregate({ agencies: { new: split(1.5) } }), error: null })],
    ["a count is text", () => (rpcResult = { data: aggregate({ agencies: { new: { REAL: "4", TEST: 0, INTERNAL: 0 } as never } }), error: null })],
  ])("503 when %s — with no counts and no zeros", async (_why, arrange) => {
    arrange();
    const res = await get();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(body)).not.toMatch(/count|groups|\b0\b/);
  });
});

describe("the 200 body", () => {
  it("has the fixed definitionVersion, REAL population and every group with every metric", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.definitionVersion).toBe("lm-registrations-daily/v1");
    expect(body.definitionVersion).toBe(REGISTRATIONS_DAILY_DEFINITION_VERSION);
    expect(body.day).toBe(YESTERDAY);
    expect(body.population).toBe("REAL");
    expect(body.generatedAt).toBe(new Date(NOW).toISOString());
    expect(Object.keys(body).sort()).toEqual(["day", "definitionVersion", "generatedAt", "groups", "population"]);
    expect(Object.keys(body.groups).sort()).toEqual(["agencies", "education", "employers", "students", "workers"]);
    for (const g of REGISTRATION_GROUPS) {
      expect(Object.keys(body.groups[g]).sort()).toEqual([...REGISTRATION_METRICS].sort());
    }
  });

  it("publishes REAL only — TEST and INTERNAL counts never leak", async () => {
    rpcResult = {
      data: aggregate({ workers: { new: split(4, 900, 800), active7d: split(0, 901, 801), active30d: split(6, 902, 802) } }),
      error: null,
    };
    const body = await (await get()).json();
    expect(body.groups.workers).toEqual({
      new: { count: 4, suppressed: false },
      active7d: { count: 0, suppressed: false },
      active30d: { count: 6, suppressed: false },
    });
    const text = JSON.stringify(body);
    for (const leaked of ["900", "901", "902", "800", "801", "802", "TEST", "INTERNAL"]) expect(text).not.toContain(leaked);
  });

  it("withholds 1 and 2; publishes 0 and 3 exactly", async () => {
    rpcResult = {
      data: aggregate({
        workers: { new: split(1), active7d: split(2), active30d: split(3) },
        employers: { new: split(0) },
      }),
      error: null,
    };
    const body = await (await get()).json();
    expect(body.groups.workers.new).toEqual({ count: null, suppressed: true });
    expect(body.groups.workers.active7d).toEqual({ count: null, suppressed: true });
    expect(body.groups.workers.active30d).toEqual({ count: 3, suppressed: false });
    expect(body.groups.employers.new).toEqual({ count: 0, suppressed: false });
  });

  it("an explicit null from the aggregate is an unmeasured group, not a zero", async () => {
    rpcResult = { data: aggregate({ students: { new: null, active7d: null, active30d: null } }), error: null };
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const m of REGISTRATION_METRICS) {
      expect(body.groups.students[m]).toEqual({ count: null, suppressed: false, unmeasured: true });
    }
    expect(body.groups.workers.new).toEqual({ count: 5, suppressed: false });
  });

  it("ACTIVE is measured for today and yesterday, and unmeasured for older days (only the latest sign-in is stored)", async () => {
    for (const day of [TODAY, YESTERDAY]) {
      const body = await (await get(`?day=${day}`)).json();
      expect(body.groups.employers.active7d).toEqual({ count: 10, suppressed: false });
      expect(body.groups.employers.active30d).toEqual({ count: 20, suppressed: false });
    }
    const old = await (await get("?day=2026-11-12")).json();
    for (const g of REGISTRATION_GROUPS) {
      expect(old.groups[g].new).toEqual({ count: 5, suppressed: false });
      expect(old.groups[g].active7d).toEqual({ count: null, suppressed: false, unmeasured: true });
      expect(old.groups[g].active30d).toEqual({ count: null, suppressed: false, unmeasured: true });
    }
  });

  it("contains no name and no per-person timestamp — the only timestamp is generatedAt", async () => {
    const a = aggregate() as Record<string, unknown>;
    a.person = { display_name: "Jonas Jonaitis", last_sign_in_at: "2026-11-12T08:15:00.000Z", created_at: "2026-11-13T10:00:00Z" };
    (a.groups as Record<string, Record<string, unknown>>).employers.legal_name = "UAB Privati Firma";
    rpcResult = { data: a, error: null };
    const text = await (await get()).text();
    for (const leaked of ["Jonas", "Jonaitis", "Privati", "display_name", "legal_name", "last_sign_in_at", "created_at"]) {
      expect(text).not.toContain(leaked);
    }
    const timestamps = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g) ?? [];
    expect(timestamps).toEqual([new Date(NOW).toISOString().slice(0, 16)]);
  });

  it("contains no e-mail and no uuid, even when the aggregate carries extra fields", async () => {
    const a = aggregate() as Record<string, unknown>;
    a.leak = { email: "person@firm.test", id: "11111111-1111-4111-8111-111111111111" };
    (a.groups as Record<string, Record<string, unknown>>).workers.extra = "22222222-2222-4222-8222-222222222222";
    rpcResult = { data: a, error: null };
    const text = await (await get()).text();
    expect(text).not.toContain("@");
    expect(text).not.toMatch(UUID_RE);
  });
});

describe("the database aggregate (owner-gated migration)", () => {
  const root = join(__dirname, "..", "..", "..", "..");
  const migDir = join(root, "supabase", "migrations");
  const sql = readFileSync(join(migDir, "20261114120000_lm_registrations_daily_v1.sql"), "utf8");
  const ops = readFileSync(join(migDir, "20261013140000_ops_product_metrics_staff_acceptance_v2.sql"), "utf8");
  const peopleRule = (text: string) => {
    const m = /case\s+when coalesce\(u\.raw_app_meta_data[\s\S]*?end as pop/.exec(text);
    return m ? m[0].replace(/\s+/g, " ") : null;
  };
  const orgRule = (text: string) => {
    const m = /case\s+when coalesce\(o\.legal_name[\s\S]*?end as pop/.exec(text);
    return m ? m[0].replace(/\s+/g, " ") : null;
  };

  it("uses the ops_product_metrics_v1 REAL/TEST/INTERNAL rule verbatim, for people and organizations", () => {
    expect(peopleRule(sql)).not.toBeNull();
    expect(peopleRule(sql)).toBe(peopleRule(ops));
    expect(orgRule(sql)).not.toBeNull();
    expect(orgRule(sql)).toBe(orgRule(ops));
  });

  it("is a definer-rights, read-only function callable by service_role only", () => {
    expect(sql).toMatch(/stable\s+security definer\s+set search_path = ''/);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke all on function public.lm_registrations_daily_v1(date) from ${role};`);
    }
    expect(sql).toContain("grant execute on function public.lm_registrations_daily_v1(date) to service_role;");
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\b\s+(into|public\.|from)/i);
  });

  it("returns counts only — no person-level column in the output", () => {
    const output = sql.slice(sql.indexOf("counted as ("));
    for (const forbidden of ["email", "u.id", "profile_id", "display_name", "legal_name", "phone"]) {
      expect(output).not.toContain(forbidden);
    }
  });

  it("every published value is an aggregate count(*) — no row-level column leaves the database", () => {
    const counted = sql.slice(sql.indexOf("counted as ("), sql.indexOf("select jsonb_build_object('groups'"));
    const values = [...counted.matchAll(/'(REAL|TEST|INTERNAL)',\s+([^\n]+)/g)].map((m) => m[2]);
    expect(values).toHaveLength(9); // 3 metrics x 3 populations
    for (const v of values) expect(v).toMatch(/^count\(\*\) filter \(where s\.pop = '(REAL|TEST|INTERNAL)'\s+and /);
    expect(sql.slice(sql.indexOf("select jsonb_build_object('groups'"))).toMatch(
      /^select jsonb_build_object\('groups', jsonb_object_agg\(c\.grp, c\.metrics\)\)\s+from counted c;/,
    );
  });

  it("the route reads only through the aggregate RPC — never a table", () => {
    const route = readFileSync(join(__dirname, "..", "..", "app", "api", "internal", "registrations-daily", "v1", "route.ts"), "utf8");
    expect(route).not.toMatch(/\.from\(/);
    expect([...route.matchAll(/\.rpc\("([a-z0-9_]+)"/g)].map((m) => m[1])).toEqual(["lm_registrations_daily_v1"]);
  });

  it("counts only claimed organizations and every one of the five groups", () => {
    expect(sql).toContain("o.claim_state = 'claimed'");
    expect(sql).toContain("(values ('workers'), ('employers'), ('agencies'), ('students'), ('education'))");
  });

  it("ships its rollback", () => {
    const down = readFileSync(join(root, "supabase", "rollbacks", "20261114120000_lm_registrations_daily_v1.down.sql"), "utf8");
    expect(down).toContain("drop function if exists public.lm_registrations_daily_v1(date);");
  });
});
