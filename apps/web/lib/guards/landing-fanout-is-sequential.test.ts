import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFreshLiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
import { __resetPublicVacancyCache } from "@/lib/vacancy-store/public-vacancy-preview";

/**
 * THE LANDING WAS THE FAN-OUT.
 *
 * Production evidence, 2026-09-08: `canceling statement due to statement
 * timeout` arrived in groups of EXACTLY TEN inside one second (14:58:41,
 * 15:07:04). Ten is the number of profession slugs this landing renders, and
 * the reader issued all ten through `Promise.all` — so ONE render was ten
 * concurrent anonymous statements. They are ten DIFFERENT queries, so the
 * RPC-result coalescing shipped for the same symptom could never merge them.
 *
 * These tests drive the real reader with an injected client and count what
 * actually reaches the database, and — the point of the fix — how many are in
 * flight at the same moment.
 */

type Call = { readonly name: string; readonly slug: unknown };

function makeClient(opts: {
  /** Milliseconds of SIMULATED database time each call consumes. */
  costMs?: number;
  rows?: Record<string, unknown>[];
  throwOn?: (call: number) => boolean;
}) {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const client = {
    rpc: async (name: string, params?: Record<string, unknown>) => {
      calls.push({ name, slug: params?.p_profession_slug ?? null });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        // Yield the microtask queue so a parallel caller WOULD overlap here.
        // Without this the test could pass on a fan-out that simply never
        // suspends, which would make the assertion unable to fail.
        await Promise.resolve();
        await Promise.resolve();
        if (opts.costMs) vi.setSystemTime(Date.now() + opts.costMs);
        if (opts.throwOn?.(calls.length)) throw new Error("rpc exploded");
        return { data: opts.rows ?? [], error: null };
      } finally {
        inFlight -= 1;
      }
    },
  };

  return {
    client: client as never,
    calls,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}

const VACANCY_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  profession_slug: "electrician",
  occupation_raw: "Elektriker",
  employment_form: null,
  working_time: null,
  positions: 1,
  compensation_currency: null,
  compensation_min: null,
  compensation_max: null,
  source_language: "sv",
  published_at: "2026-09-01T00:00:00Z",
  total_count: 848,
};

beforeEach(() => {
  __resetPublicVacancyCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
});

describe("one landing snapshot never puts ten statements in flight", () => {
  it("issues the profession reads ONE AT A TIME", async () => {
    const c = makeClient({ rows: [VACANCY_ROW] });
    await readFreshLiveMarketLandingSnapshot(c.client);

    // THE FIX, measured. Before: 10. A regression to `Promise.all` fails here.
    expect(c.maxInFlight).toBe(1);
  });

  it("reads each profession exactly once — no duplicated work", async () => {
    const c = makeClient({ rows: [VACANCY_ROW] });
    await readFreshLiveMarketLandingSnapshot(c.client);

    const professionCalls = c.calls.filter(
      (call) => call.name === "search_public_vacancy_previews_v1",
    );
    expect(professionCalls).toHaveLength(10);
    expect(new Set(professionCalls.map((call) => call.slug)).size).toBe(10);
  });

  it("NEGATIVE CONTROL — the concurrency probe can actually observe overlap", async () => {
    // If the probe could not see a fan-out, the assertion above would be
    // vacuous. Ten deliberately parallel calls through the SAME probe must
    // register ten in flight.
    const c = makeClient({ rows: [VACANCY_ROW] });
    await Promise.all(
      Array.from({ length: 10 }, (_unused, i) =>
        (c.client as unknown as { rpc: (n: string, p: unknown) => Promise<unknown> }).rpc(
          "search_public_vacancy_previews_v1",
          { p_profession_slug: `probe_${i}` },
        ),
      ),
    );
    expect(c.maxInFlight).toBe(10);
  });
});

describe("the snapshot stops working instead of spending forever", () => {
  it("declines to START further reads once the budget is spent", async () => {
    // Each simulated call costs 1 s of database time against a 6 s budget.
    const c = makeClient({ costMs: 1_000, rows: [VACANCY_ROW] });
    const snapshot = await readFreshLiveMarketLandingSnapshot(c.client);

    const professionCalls = c.calls.filter(
      (call) => call.name === "search_public_vacancy_previews_v1",
    );
    expect(professionCalls.length).toBeLessThan(10);
    expect(professionCalls.length).toBeGreaterThan(0);

    // Every profession still appears — the panel loses freshness, not slugs.
    expect(snapshot.professions).toHaveLength(10);
  });

  it("a profession that was not read is `unavailable`, NEVER a zero", async () => {
    const c = makeClient({ costMs: 1_000, rows: [VACANCY_ROW] });
    const snapshot = await readFreshLiveMarketLandingSnapshot(c.client);

    const unread = snapshot.professions.filter((p) => p.basis === "unavailable");
    expect(unread.length).toBeGreaterThan(0);
    for (const profession of unread) {
      // The distinction the whole public-vacancy contract exists for: an
      // unread profession must not claim there are no such jobs.
      expect(profession.totalCount).toBeNull();
      expect(profession.totalCount).not.toBe(0);
    }
  });
});

describe("NEGATIVE CONTROL — this reader adds no retries of its own", () => {
  it("a throwing read is not repeated", async () => {
    // Only the FIRST profession read throws. A one-shot retry would issue an
    // eleventh call and re-ask the same slug; that is what doubled every wave.
    let thrown = 0;
    const c = makeClient({
      rows: [VACANCY_ROW],
      throwOn: (call) => {
        if (call === 2 && thrown === 0) {
          thrown += 1;
          return true;
        }
        return false;
      },
    });
    const snapshot = await readFreshLiveMarketLandingSnapshot(c.client);

    const slugs = c.calls
      .filter((call) => call.name === "search_public_vacancy_previews_v1")
      .map((call) => call.slug);
    expect(slugs).toHaveLength(10);
    expect(new Set(slugs).size).toBe(10);

    // The failed one degrades honestly rather than being retried.
    const failed = snapshot.professions.find((p) => p.basis === "unavailable");
    expect(failed?.totalCount).toBeNull();
  });
});

describe("FOCUS does not pay for reads it never renders", () => {
  /**
   * Every consumer of the snapshot was enumerated: `/` (FOCUS) reads
   * activeVacancies, distinctEmployers and lastRefreshedAt, and reads
   * `professions` NOWHERE. Its profession chips come from the static
   * TOP_PROFESSION_FAMILY_SLUGS list in market-proof-band.tsx, a different
   * set from PROFESSION_FILTER_SLUGS and not derived from live data.
   */
  it("issues ONE read, and zero profession reads", async () => {
    const c = makeClient({ rows: [VACANCY_ROW] });
    await readFreshLiveMarketLandingSnapshot(c.client, false);

    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].name).toBe("count_public_vacancies_v1");
    expect(
      c.calls.filter((call) => call.name === "search_public_vacancy_previews_v1"),
    ).toHaveLength(0);
  });

  it("LIVE still gets every profession it genuinely renders", async () => {
    // /live-market-review renders a per-profession count AND one sample
    // vacancy, so its reads must survive this optimisation untouched.
    const c = makeClient({ rows: [VACANCY_ROW] });
    const snapshot = await readFreshLiveMarketLandingSnapshot(c.client, true);

    expect(
      c.calls.filter((call) => call.name === "search_public_vacancy_previews_v1"),
    ).toHaveLength(10);
    expect(snapshot.professions.every((p) => p.basis === "live")).toBe(true);
    expect(snapshot.professions.some((p) => p.jobs.length > 0)).toBe(true);
  });

  it("every field FOCUS actually consumes is semantically identical", async () => {
    __resetPublicVacancyCache();
    const focus = await readFreshLiveMarketLandingSnapshot(
      makeClient({ rows: [VACANCY_ROW] }).client,
      false,
    );
    __resetPublicVacancyCache();
    const live = await readFreshLiveMarketLandingSnapshot(
      makeClient({ rows: [VACANCY_ROW] }).client,
      true,
    );

    expect(focus.activeVacancies).toBe(live.activeVacancies);
    expect(focus.distinctEmployers).toBe(live.distinctEmployers);
    expect(focus.lastRefreshedAt).toBe(live.lastRefreshedAt);
    expect(focus.basis).toBe(live.basis);
    expect(focus.professions).toHaveLength(live.professions.length);
  });

  it("an unresolved profession is `unavailable` and null, NEVER zero", async () => {
    const c = makeClient({ rows: [VACANCY_ROW] });
    const snapshot = await readFreshLiveMarketLandingSnapshot(c.client, false);

    // "We did not ask" is not "there are none". A zero here would be a
    // fabricated market claim on the most-visited page in the product.
    expect(snapshot.professions).toHaveLength(10);
    for (const profession of snapshot.professions) {
      expect(profession.basis).toBe("unavailable");
      expect(profession.totalCount).toBeNull();
      expect(profession.totalCount).not.toBe(0);
      expect(profession.jobs).toEqual([]);
    }
  });

  it("the default is still the FULL read - skipping must be explicit", async () => {
    // A caller that forgets the flag must get MORE data, never less: a silent
    // default of `false` would strip /live-market-review without a diff.
    const c = makeClient({ rows: [VACANCY_ROW] });
    await readFreshLiveMarketLandingSnapshot(c.client);
    expect(
      c.calls.filter((call) => call.name === "search_public_vacancy_previews_v1"),
    ).toHaveLength(10);
  });

  it("FOCUS wires the skip - restoring the fan-out there fails here", async () => {
    // The behavioural tests above prove the READER honours the flag. This
    // pins that the FOCUS page actually passes it, which is the half a reader
    // test cannot see.
    const focusPage = readFileSync(
      join(__dirname, "..", "..", "app", "[locale]", "focus-landing", "focus-landing.tsx"),
      "utf8",
    );
    expect(focusPage).toContain("readLiveMarketLandingSnapshot");
    expect(focusPage).toMatch(/resolveProfessions:\s*false/);
  });
});
