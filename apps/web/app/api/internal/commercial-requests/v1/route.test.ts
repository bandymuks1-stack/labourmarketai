import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reads: { filter: string | null; limit: number | null } = { filter: null, limit: null };
let result: { data: unknown; error: unknown } = { data: [], error: null };
let adminThrows = false;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (adminThrows) throw new Error("no service key");
    const query: Record<string, unknown> = {
      select: () => query,
      order: () => query,
      limit: (n: number) => {
        reads.limit = n;
        return query;
      },
      or: (filter: string) => {
        reads.filter = filter;
        return query;
      },
      then: (done: (r: typeof result) => unknown) => done(result),
    };
    return { from: () => query };
  },
}));

import { encodeFeedCursor } from "@/lib/staffing/commercial-requests-feed";

import { GET } from "./route";

const TOKEN = "t".repeat(40);
const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";
const ID_3 = "33333333-3333-4333-8333-333333333333";
const PRIVATE = ["Private Company", "Private Person", "person@firm.test", "+37060000000", "Private text"];

function row(id: string, createdAt: string, over: Record<string, unknown> = {}) {
  return {
    id,
    created_at: createdAt,
    source_path: "/lt/request/b2b",
    status: "new",
    company_name: PRIVATE[0],
    contact_name: PRIVATE[1],
    contact_email: PRIVATE[2],
    contact_phone: PRIVATE[3],
    description: PRIVATE[4],
    ...over,
  };
}

function get(query = "", authorization: string | null = `Bearer ${TOKEN}`): Promise<Response> {
  const headers: Record<string, string> = authorization ? { authorization } : {};
  return GET(new Request(`https://labourmarket.ai/api/internal/commercial-requests/v1${query}`, { headers }));
}

beforeEach(() => {
  vi.stubEnv("COMMERCIAL_REQUESTS_FEED_TOKEN", TOKEN);
  reads.filter = null;
  reads.limit = null;
  result = { data: [], error: null };
  adminThrows = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("who may read it", () => {
  it("refuses while the token is absent or too short, even with a matching header", async () => {
    vi.stubEnv("COMMERCIAL_REQUESTS_FEED_TOKEN", "");
    const absent = await get("", "Bearer ");
    expect(absent.status).toBe(401);
    expect(await absent.json()).toEqual({ ok: false, reason: "not_configured" });

    vi.stubEnv("COMMERCIAL_REQUESTS_FEED_TOKEN", "short");
    const short = await get("", "Bearer short");
    expect(short.status).toBe(401);
    expect(await short.json()).toEqual({ ok: false, reason: "not_configured" });
    expect(reads.limit).toBeNull();
  });

  it("refuses no header, a wrong token, a wrong scheme and the supply feed's token", async () => {
    vi.stubEnv("SUPPLY_FEED_BEARER_TOKEN", "s".repeat(40));
    for (const header of [null, "Bearer wrong", `Basic ${TOKEN}`, TOKEN, `Bearer ${"s".repeat(40)}`]) {
      const res = await get("", header);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false, reason: "unauthorized" });
    }
    expect(reads.limit).toBeNull();
  });
});

describe("what it returns", () => {
  it("returns exactly the allowed fields and nothing private", async () => {
    result = { data: [row(ID_1, "2026-11-07T10:00:00.123456+00:00")], error: null };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    for (const value of PRIVATE) expect(text).not.toContain(value);
    const body = JSON.parse(text);
    expect(Object.keys(body).sort()).toEqual(["items", "nextCursor", "ok", "schema"]);
    expect(body.items).toEqual([
      {
        id: ID_1,
        type: "b2b",
        createdAt: "2026-11-07T10:00:00.123456+00:00",
        status: "new",
        internalLink: `/lt/dashboard/admin/company-need-intakes#${ID_1}`,
        synthetic: false,
      },
    ]);
  });

  it("names each door, and keeps a row from an unknown door", async () => {
    const paths: Array<[string | null, string]> = [
      ["/de/request/worker-search", "worker-search"],
      ["/lt/request/b2b", "b2b"],
      ["/en/request/project", "project"],
      ["/lt/company-need", "company-need"],
      ["/lt/somewhere", "other"],
      [null, "other"],
    ];
    result = {
      data: paths.map(([p], i) => row(`00000000-0000-4000-8000-00000000000${i}`, "2026-11-07T10:00:00+00:00", { source_path: p })),
      error: null,
    };
    const body = await (await get()).json();
    expect(body.items.map((i: { type: string }) => i.type)).toEqual(paths.map(([, t]) => t));
  });

  it("flags a test row and doesn't hide it", async () => {
    result = {
      data: [
        row(ID_1, "2026-11-07T10:00:00+00:00", { company_name: "[QA-SYNTHETIC] Gama" }),
        row(ID_2, "2026-11-07T10:00:01+00:00", { contact_email: "walk@example.invalid" }),
        row(ID_3, "2026-11-07T10:00:02+00:00"),
      ],
      error: null,
    };
    const body = await (await get()).json();
    expect(body.items.map((i: { synthetic: boolean }) => i.synthetic)).toEqual([true, true, false]);
  });

  it("doesn't pass on a status outside the known list", async () => {
    result = { data: [row(ID_1, "2026-11-07T10:00:00+00:00", { status: "Call Jonas" })], error: null };
    const body = await (await get()).json();
    expect(body.items[0].status).toBe("unknown");
  });
});

describe("paging", () => {
  it("reads one past the limit and gives a cursor only when more exist", async () => {
    result = {
      data: [
        row(ID_1, "2026-11-07T10:00:00.111111+00:00"),
        row(ID_2, "2026-11-07T10:00:00.222222+00:00"),
        row(ID_3, "2026-11-07T10:00:00.333333+00:00"),
      ],
      error: null,
    };
    const body = await (await get("?limit=2")).json();
    expect(reads.limit).toBe(3);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([ID_1, ID_2]);
    expect(body.nextCursor).toBe(encodeFeedCursor({ createdAt: "2026-11-07T10:00:00.222222+00:00", id: ID_2 }));

    result = { data: [row(ID_3, "2026-11-07T10:00:00.333333+00:00")], error: null };
    const last = await (await get(`?limit=2&after=${body.nextCursor}`)).json();
    expect(last.items.map((i: { id: string }) => i.id)).toEqual([ID_3]);
    expect(last.nextCursor).toBeNull();
    // The microseconds survive, or rows inside one millisecond would be skipped.
    expect(reads.filter).toBe(
      `created_at.gt."2026-11-07T10:00:00.222222+00:00",and(created_at.eq."2026-11-07T10:00:00.222222+00:00",id.gt.${ID_2})`,
    );
  });

  it("refuses a bad limit and a bad cursor without reading", async () => {
    const forged = Buffer.from(`2026-11-07T10:00:00Z),id.gt.x|${ID_1}`).toString("base64url");
    const cases: Array<[string, string]> = [
      ["?limit=0", "bad_limit"],
      ["?limit=201", "bad_limit"],
      ["?limit=abc", "bad_limit"],
      ["?after=!!!", "bad_cursor"],
      [`?after=${forged}`, "bad_cursor"],
    ];
    for (const [query, reason] of cases) {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, reason });
    }
    expect(reads.limit).toBeNull();
  });
});

describe("a failed read is never an empty feed", () => {
  it("answers 503 on a query error and on a missing service key", async () => {
    result = { data: null, error: { message: "42501" } };
    const failed = await get();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ ok: false, reason: "unavailable" });

    adminThrows = true;
    expect((await get()).status).toBe(503);
  });
});
