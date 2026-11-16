import { describe, expect, it } from "vitest";

import { CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, claimChunkReload, isChunkError } from "./chunk-reload";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("chunk reload: once, never a loop", () => {
  it("recognises the chunk failures browsers and webpack report", () => {
    const named = new Error("x");
    named.name = "ChunkLoadError";
    expect(isChunkError(named)).toBe(true);
    expect(isChunkError(new Error("Loading chunk 4821 failed.\n(error: https://x/_next/static/chunks/a.js)"))).toBe(true);
    expect(isChunkError(new Error("Failed to fetch dynamically imported module: https://x/a.js"))).toBe(true);
    expect(isChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkError(undefined)).toBe(false);
  });

  it("allows the first reload and refuses the second inside the window", () => {
    const store = memoryStore();
    const t0 = 1_800_000_000_000;
    expect(claimChunkReload(store, t0)).toBe(true);
    expect(claimChunkReload(store, t0 + 2_000)).toBe(false);
    expect(claimChunkReload(store, t0 + CHUNK_RELOAD_WINDOW_MS - 1)).toBe(false);
  });

  it("allows a reload again once the window has passed (a tab open across deploys)", () => {
    const store = memoryStore();
    const t0 = 1_800_000_000_000;
    expect(claimChunkReload(store, t0)).toBe(true);
    expect(claimChunkReload(store, t0 + CHUNK_RELOAD_WINDOW_MS + 1)).toBe(true);
  });

  it("treats the earlier untimed mark as used", () => {
    expect(claimChunkReload(memoryStore({ [CHUNK_RELOAD_KEY]: "1" }), 1_800_000_000_000)).toBe(false);
  });

  it("never reloads when the mark cannot be stored", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(claimChunkReload(throwing, 1)).toBe(false);
    const silent = { getItem: () => null, setItem: () => undefined };
    expect(claimChunkReload(silent, 1_800_000_000_000)).toBe(false);
  });
});
