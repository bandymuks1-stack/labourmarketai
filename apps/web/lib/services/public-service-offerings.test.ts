import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, rpc, getUser } = vi.hoisted(() => ({
  createClient: vi.fn(), rpc: vi.fn(), getUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { getPublicServiceOffering, searchPublicServiceOfferings } from "./public-service-offerings";
import { normalizePublicServiceSearch, PUBLIC_SERVICE_MAX_PAGE } from "./public-service-offerings-shared";

const ID = "11111111-1111-4111-8111-111111111111";
const row = (n = 1) => ({
  id: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`,
  title: "Furniture repair", description: "Restore wooden furniture",
  category_slug: "Repairs", location_country: "LT", remote: false,
  rate_text: "By agreement", created_at: "2026-11-25T10:00:00.000Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockResolvedValue({ rpc, auth: { getUser } });
  rpc.mockResolvedValue({ data: [], error: null });
});

describe("public personal service reader", () => {
  it("does not require authentication and copies only the eight public fields", async () => {
    const source = { ...row(), id: ID, provider_id: "private-person", email: "private@example.test", phone: "private" };
    rpc.mockResolvedValue({ data: [source], error: null });
    expect(await searchPublicServiceOfferings()).toEqual({
      kind: "ok", rows: [{
        id: ID, title: source.title, description: source.description, categorySlug: "Repairs",
        locationCountry: "LT", remote: false, rateText: "By agreement", createdAt: source.created_at,
      }], hasMore: false, page: 1, pageSize: 6,
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("uses bounded server-side filters and a seventh row only as the next-page signal", async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 7 }, (_, n) => row(n + 1)), error: null });
    const result = await searchPublicServiceOfferings({ query: "  wood%_'  ", country: " lt ", category: " Rep ", page: "2" });
    expect(rpc).toHaveBeenCalledWith("search_public_service_offerings_v1", {
      p_query: "wood%_'", p_country: "LT", p_category: "Rep", p_limit: 7, p_offset: 6, p_offering_id: null,
    });
    expect(result).toMatchObject({ kind: "ok", hasMore: true, page: 2, pageSize: 6 });
    if (result.kind === "ok") expect(result.rows).toHaveLength(6);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("keeps the cap and seventh-row fact so the UI can ask to refine instead of looping to page101", async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 7 }, (_, n) => row(n + 1)), error: null });
    expect(await searchPublicServiceOfferings({ page: 101 })).toMatchObject({
      kind: "ok", page: PUBLIC_SERVICE_MAX_PAGE, hasMore: true,
    });
    expect(rpc).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ p_offset: 594, p_limit: 7 }));
  });

  it.each(["42883", "PGRST202", "42P01", "42703", "PGRST204", "PGRST205"])(
    "reports unapplied schema %s rather than an empty market", async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code } });
      expect(await searchPublicServiceOfferings()).toEqual({ kind: "unavailable" });
      expect(await getPublicServiceOffering(ID)).toEqual({ kind: "unavailable" });
    },
  );

  it("distinguishes a successful empty result from a failed read", async () => {
    expect(await searchPublicServiceOfferings()).toMatchObject({ kind: "ok", rows: [], hasMore: false });
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(await searchPublicServiceOfferings()).toEqual({ kind: "unavailable" });
    rpc.mockRejectedValue(new Error("offline"));
    expect(await getPublicServiceOffering(ID)).toEqual({ kind: "unavailable" });
  });

  it.each([
    null, {}, [null], [{ ...row(), remote: "false" }], [{ ...row(), created_at: "invalid" }],
    [{ ...row(), id: "invalid" }], [{ ...row(), description: undefined }],
    [{ ...row(), title: "[E2E] service" }], Array.from({ length: 8 }, (_, n) => row(n + 1)),
  ])("refuses malformed, synthetic or over-budget search payloads (%#)", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    expect(await searchPublicServiceOfferings()).toEqual({ kind: "unavailable" });
  });

  it("fetches only the exact public detail and does not return a different row", async () => {
    rpc.mockResolvedValue({ data: [{ ...row(), id: ID }], error: null });
    expect(await getPublicServiceOffering(ID)).toMatchObject({ kind: "ok", offering: { id: ID } });
    expect(rpc).toHaveBeenCalledWith("get_public_service_offering_v1", { p_id: ID });
    expect(getUser).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: [row(2)], error: null });
    expect(await getPublicServiceOffering(ID)).toEqual({ kind: "unavailable" });
    rpc.mockResolvedValue({ data: [row(1), row(2)], error: null });
    expect(await getPublicServiceOffering(ID)).toEqual({ kind: "unavailable" });
  });

  it("does not query invalid ids and treats a hidden/missing detail as not found", async () => {
    expect(await getPublicServiceOffering("not-a-uuid")).toEqual({ kind: "not-found" });
    expect(createClient).not.toHaveBeenCalled();
    expect(await getPublicServiceOffering(ID)).toEqual({ kind: "not-found" });
  });
});

describe("public search input bounds", () => {
  it("reuses category/country semantics and bounds query length", () => {
    expect(normalizePublicServiceSearch({ query: " x ", category: " Repairs ", country: "lt", page: "3" }))
      .toEqual({ query: "x", category: "Repairs", country: "LT", page: 3 });
    const parsed = normalizePublicServiceSearch({ query: "x".repeat(200), category: "a".repeat(100), country: "Lithuania" });
    expect(parsed.query).toHaveLength(120);
    expect(parsed.category).toHaveLength(80);
    expect(parsed.country).toBeNull();
  });

  it.each([-1, 0, 1.5, "oops", Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "refuses invalid page %s", (page) => expect(normalizePublicServiceSearch({ page }).page).toBe(1),
  );
});
