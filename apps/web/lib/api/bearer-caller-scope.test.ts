import { describe, expect, it, vi } from "vitest";

/**
 * THE BEARER CALLER SCOPE — the property it must keep: inside the scope the
 * product's own `createClient()` IS the verified bearer caller; outside it
 * (every browser request) nothing changes.
 */

const cookieClient = { kind: "cookie-client", auth: { getUser: async () => ({ data: { user: { id: "cookie-user" } } }) } };
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => cookieClient }));
vi.mock("@/lib/env", () => ({ requireSupabaseClientEnv: () => ({ url: "http://x", anonKey: "k" }) }));

import { createClient } from "@/lib/supabase/server";

import { currentBearerCaller, runAsBearerCaller } from "./bearer-caller-scope";
import type { ApiIdentity } from "./api-identity";

const bearerClient = { kind: "bearer-client" } as unknown as ApiIdentity["supabase"];

describe("bearer caller scope", () => {
  it("outside the scope createClient() is the cookie client, unchanged", async () => {
    expect(currentBearerCaller()).toBeUndefined();
    expect(await createClient()).toBe(cookieClient);
  });

  it("inside the scope createClient() is the verified bearer caller's own client", async () => {
    const identity: ApiIdentity = { userId: "bearer-user", transport: "bearer", supabase: bearerClient };
    await runAsBearerCaller(identity, async () => {
      expect(currentBearerCaller()?.userId).toBe("bearer-user");
      // Survives an await — the scope follows the request's async continuation.
      await new Promise((r) => setTimeout(r, 1));
      expect(await createClient()).toBe(bearerClient);
    });
    // …and does not leak past it.
    expect(currentBearerCaller()).toBeUndefined();
    expect(await createClient()).toBe(cookieClient);
  });

  it("a cookie identity never enters the scope", async () => {
    const identity: ApiIdentity = { userId: "cookie-user", transport: "cookie", supabase: bearerClient };
    await runAsBearerCaller(identity, async () => {
      expect(currentBearerCaller()).toBeUndefined();
    });
  });

  it("two concurrent requests each see only their own caller", async () => {
    const a: ApiIdentity = { userId: "user-a", transport: "bearer", supabase: { kind: "a" } as never };
    const b: ApiIdentity = { userId: "user-b", transport: "bearer", supabase: { kind: "b" } as never };
    const seen = await Promise.all([
      runAsBearerCaller(a, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return [currentBearerCaller()?.userId, await createClient()];
      }),
      runAsBearerCaller(b, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return [currentBearerCaller()?.userId, await createClient()];
      }),
    ]);
    expect(seen[0]).toEqual(["user-a", { kind: "a" }]);
    expect(seen[1]).toEqual(["user-b", { kind: "b" }]);
  });
});
