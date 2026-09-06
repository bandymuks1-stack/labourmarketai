import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6 — the FormData wrapper (`saveWorkerCardAction`) and the domain core's
 * list normalizer, the two layers between the chat executor and the RPC
 * `save_worker_card` (production definition read 2026-09-06: every column is
 * `coalesce(param, column)`, so a null parameter KEEPS the recorded value and
 * an empty array `{}` empties it). Pins: a blank list text → null (keep); the
 * explicit clear flag → `[]` (clear); the core keeps `[]` as `[]` and turns an
 * all-invalid list into null (keep), never a silent clear.
 */

const { coreMock } = vi.hoisted(() => ({ coreMock: vi.fn() }));
vi.mock("@/lib/worker/work-card-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/worker/work-card-core")>();
  return { ...actual, saveWorkerCardCore: coreMock };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } } }) },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveWorkerCardAction } from "@/lib/worker/work-card-actions";
import { normalizeCountryList } from "@/lib/worker/work-card-core";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function coreInput(): Record<string, unknown> {
  const call = coreMock.mock.calls.at(-1);
  if (!call) throw new Error("saveWorkerCardCore was not called");
  return call[1] as Record<string, unknown>;
}

describe("saveWorkerCardAction — blank keeps, the clear flag clears", () => {
  beforeEach(() => {
    coreMock.mockReset();
    coreMock.mockResolvedValue({ ok: true });
  });

  it("an empty submission reaches the core as all-null (every column kept)", async () => {
    const r = await saveWorkerCardAction(null, form({}));
    expect(r).toEqual({ ok: true });
    expect(coreInput()).toEqual({
      availabilityStatus: null,
      availableFrom: null,
      salaryMin: null,
      salaryMax: null,
      locationCountry: null,
      preferredCountries: null,
    });
  });

  it("a blank list text is null (keep) even when other fields are set", async () => {
    await saveWorkerCardAction(null, form({ availability_status: "available", preferred_countries: "" }));
    expect(coreInput().preferredCountries).toBeNull();
    expect(coreInput().availabilityStatus).toBe("available");
  });

  it("the explicit clear flag is the ONLY way the list reaches the core empty", async () => {
    await saveWorkerCardAction(null, form({ preferred_countries: "", preferred_countries_clear: "1" }));
    expect(coreInput().preferredCountries).toEqual([]);
  });

  it("a filled list replaces whole", async () => {
    await saveWorkerCardAction(null, form({ preferred_countries: "NO,SE,DE" }));
    expect(coreInput().preferredCountries).toEqual(["NO", "SE", "DE"]);
  });
});

describe("normalizeCountryList — null keeps, [] clears, garbage keeps", () => {
  it("absent → null (keep)", () => {
    expect(normalizeCountryList(null)).toBeNull();
    expect(normalizeCountryList(undefined)).toBeNull();
  });
  it("explicit [] → [] (clear)", () => {
    expect(normalizeCountryList([])).toEqual([]);
  });
  it("an all-invalid list → null (keep), never a silent clear", () => {
    expect(normalizeCountryList(["xyz", ""])).toBeNull();
  });
  it("valid codes are uppercased, capped at 12", () => {
    expect(normalizeCountryList(["no", " se "])).toEqual(["NO", "SE"]);
    expect(normalizeCountryList(Array.from({ length: 15 }, () => "DE"))).toHaveLength(12);
  });
});
