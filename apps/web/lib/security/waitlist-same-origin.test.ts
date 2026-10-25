import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public waitlist POST writes a row as `anon`. Before 2026-10-25 it had no
 * same-origin check, so any foreign page could make every visitor's browser
 * insert addresses (walk-spec finding). It now uses the ONE shared check
 * (`isSameOriginRequest`, the one `/api/assistant/transcript` uses) and these
 * cases pin that a refused request never reaches the insert.
 */

const insertMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: () => ({ insert: insertMock }) })),
}));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  requireSupabaseClientEnv: () => ({ url: "https://example.supabase.co", anonKey: "anon" }),
}));

import { POST } from "@/app/api/waitlist/route";

const ORIGIN = "https://labourmarket.ai";
let ip = 0;

function post(headers: Record<string, string>): Request {
  // A distinct client key per request so the in-memory rate limiter never
  // decides the outcome of these cases.
  ip += 1;
  return new Request(`${ORIGIN}/api/waitlist`, {
    method: "POST",
    headers: {
      host: "labourmarket.ai",
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${ip}`,
      ...headers,
    },
    body: JSON.stringify({ email: "someone@example.com", locale: "lt" }),
  });
}

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
});

describe("POST /api/waitlist — same-origin only", () => {
  const refused: Array<[string, Record<string, string>]> = [
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["a cross-site fetch", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
    ["a same-site (other subdomain) fetch", { origin: ORIGIN, "sec-fetch-site": "same-site" }],
    ["a missing Origin without fetch metadata", {}],
    ["a look-alike host", { origin: "https://labourmarket.ai.evil.example" }],
  ];
  for (const [name, headers] of refused) {
    it(`${name}: 403, nothing inserted`, async () => {
      const res = await POST(post(headers));
      expect(res.status).toBe(403);
      expect(insertMock).not.toHaveBeenCalled();
    });
  }

  it("the site's own waitlist modal (same-origin fetch) still saves", async () => {
    const res = await POST(post({ origin: ORIGIN, "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
