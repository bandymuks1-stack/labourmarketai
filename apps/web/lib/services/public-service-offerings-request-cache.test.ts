import { beforeEach, describe, expect, it, vi } from "vitest";

// Same request-scoped React cache stand-in as people-page-request-count.test.ts.
// These readers have one primitive UUID argument; no object-key emulation needed.
const { createClient, rpc, stores } = vi.hoisted(() => ({
  createClient: vi.fn(), rpc: vi.fn(), stores: [] as Map<string, unknown>[],
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("react", async (orig) => ({
  ...await orig<typeof import("react")>(),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const store = new Map<string, R>();
    stores.push(store);
    return (...args: A): R => {
      const key = JSON.stringify(args);
      if (!store.has(key)) store.set(key, fn(...args));
      return store.get(key) as R;
    };
  },
}));

import { getPublicServiceOffering } from "./public-service-offerings";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const row = (id = ID) => ({
  id, title: "Furniture repair", description: null, category_slug: "repair",
  location_country: "LT", remote: false, rate_text: null, created_at: "2026-11-25T10:00:00Z",
});
const beginRequest = () => { for (const store of stores) store.clear(); };
beforeEach(() => {
  vi.clearAllMocks();
  beginRequest();
  createClient.mockResolvedValue({ rpc });
  rpc.mockResolvedValue({ data: [row()], error: null });
});

describe("public detail metadata and page share only their request's read", () => {
  it("coalesces concurrent same-id reads into one detail RPC", async () => {
    const [metadataRead, pageRead] = await Promise.all([
      getPublicServiceOffering(ID), getPublicServiceOffering(ID),
    ]);
    expect(metadataRead).toEqual(pageRead);
    expect(pageRead).toMatchObject({ kind: "ok", offering: { id: ID } });
    expect(createClient).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_public_service_offering_v1", { p_id: ID });
  });

  it("does not share cached content with the next request after an owner opts out", async () => {
    expect(await getPublicServiceOffering(ID)).toMatchObject({ kind: "ok" });
    beginRequest();
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await getPublicServiceOffering(ID)).toEqual({ kind: "not-found" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("uses independent keys for distinct service ids", async () => {
    rpc.mockImplementation(async (_name: string, args: { p_id: string }) => ({
      data: [row(args.p_id)], error: null,
    }));
    expect(await getPublicServiceOffering(ID)).toMatchObject({ kind: "ok", offering: { id: ID } });
    expect(await getPublicServiceOffering(OTHER)).toMatchObject({ kind: "ok", offering: { id: OTHER } });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does not retain a failed read across requests", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await getPublicServiceOffering(ID)).toEqual({ kind: "unavailable" });
    beginRequest();
    rpc.mockResolvedValue({ data: [row()], error: null });
    expect(await getPublicServiceOffering(ID)).toMatchObject({ kind: "ok" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
