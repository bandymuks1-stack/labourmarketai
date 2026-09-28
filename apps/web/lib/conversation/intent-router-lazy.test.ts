import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Home imports the router through the chat. Building its ~700 Unicode
 * patterns at import was the largest main-thread cost of opening Home
 * (production profile 2026-09-28), so patterns now compile on first use.
 * This pins both halves of that contract: importing compiles almost nothing,
 * and the first sentence still compiles and routes exactly as before (the
 * routing itself is pinned by intent-router.test.ts).
 */
describe("intent router — patterns compile on first use, not at import", () => {
  const RealRegExp = globalThis.RegExp;
  let constructed = 0;

  afterEach(() => {
    globalThis.RegExp = RealRegExp;
    vi.resetModules();
  });

  function countRegExpConstruction() {
    constructed = 0;
    globalThis.RegExp = new Proxy(RealRegExp, {
      construct(target, args) {
        constructed++;
        return Reflect.construct(target, args);
      },
      apply(target, thisArg, args) {
        constructed++;
        return Reflect.apply(target, thisArg, args);
      },
    });
  }

  it("importing the router builds only its few module-level expressions", async () => {
    vi.resetModules();
    countRegExpConstruction();
    await import("./intent-router");
    // A handful of eager constants (seek guard, availability-change, journal
    // request, …) — never the rule table.
    expect(constructed).toBeLessThan(50);
  });

  it("the first sentence compiles the rule table and routes as before", async () => {
    vi.resetModules();
    countRegExpConstruction();
    const router = await import("./intent-router");
    const atImport = constructed;
    expect(router.classifyIntent("Šiandien dirbau nuo 8 iki 17.").intent).toBe("log-work");
    expect(constructed - atImport).toBeGreaterThan(500);
    // Memoised: a second sentence builds nothing new.
    const afterFirst = constructed;
    router.classifyIntent("Parodyk zinutes");
    expect(constructed).toBe(afterFirst);
  }, 30_000);

  it("prewarm is a no-op without a window (server render, tests)", async () => {
    const router = await import("./intent-router");
    const cancel = router.prewarmIntentRouter();
    expect(typeof cancel).toBe("function");
    cancel();
  });
});
