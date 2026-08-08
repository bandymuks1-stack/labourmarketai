import { describe, expect, it } from "vitest";

import {
  FUNNEL_MAX_ROWS,
  FUNNEL_WINDOW_DAYS,
  funnelWindowStart,
  getAcquisitionFunnel,
  summariseFunnel,
} from "@/lib/admin/conversion-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Guard for W14 item 4 — the acquisition funnel's POPULATION.
 *
 * THE DEFECT. The funnel read was:
 *
 *   .from("pilot_events").select("event_name, metadata")
 *     .in("event_name", names)
 *     .limit(5000)
 *
 * No `ORDER BY` and no time predicate. Postgres makes no promise about which
 * rows an unordered LIMIT returns, so once `pilot_events` passed 5000 rows the
 * numerator and denominator of every rate were drawn from an ARBITRARY subset
 * of all history — and the panel kept printing a confident percentage.
 *
 * Both the module doc and the admin panel already told the owner these were
 * "event occurrences over the recent window". There was no window. The claim
 * was in the prose, never in the query.
 *
 * Why it is not merely imprecise: the truncation is BIASED. Within one
 * visitor's journey `landing_viewed` precedes `registration_started`, so
 * dropping an arbitrary/oldest slice removes disproportionately many
 * top-of-funnel events — which INFLATES every conversion rate. An owner
 * deciding whether to spend on ads reads a number that is wrong in the
 * flattering direction.
 *
 * THE RULE. A rate needs a stated population. Numerator and denominator must
 * come from the same window, that window must exist in the QUERY rather than
 * in a sentence, and when the window cannot be read completely the answer is
 * UNKNOWN — never a percentage computed from whatever rows came back.
 */

const ROW = (event: string, extra: Record<string, unknown> = {}) => ({
  event_name: event,
  metadata: extra as Record<string, unknown> | null,
});

const rows = (event: string, n: number) => Array.from({ length: n }, () => ROW(event));

describe("W14 — the funnel window is real, not prose", () => {
  it("exposes the window it actually queried", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const since = funnelWindowStart(now);
    expect(since).toBe(
      new Date(now.getTime() - FUNNEL_WINDOW_DAYS * 86_400_000).toISOString(),
    );
    // A window of zero/negative days would silently empty the funnel.
    expect(FUNNEL_WINDOW_DAYS).toBeGreaterThan(0);
  });

  it("asks the database for an ordered, time-bounded, capped read", async () => {
    // A RECORDING fake: it exercises the real code path and records what the
    // module actually asked the database for. Not a source-text assertion —
    // #1085 showed why reading the caller's text proves nothing.
    // The funnel reads more than one table — it also resolves the platform
    // admin set for the W14 item-5 population boundary. So calls are recorded
    // PER TABLE: a single shared `calls` object recorded whichever read
    // happened to run last, which made this assert the wrong query.
    type Rec = Record<string, unknown[]>;
    const byTable = new Map<string, Rec>();
    const fake = {
      from: (t: string) => {
        const calls: Rec = byTable.get(t) ?? {};
        byTable.set(t, calls);
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "in", "gte", "order", "eq"]) {
          chain[m] = (...args: unknown[]) => {
            calls[m] = args;
            return chain;
          };
        }
        chain.limit = (...args: unknown[]) => {
          calls.limit = args;
          return Promise.resolve({ data: [], error: null });
        };
        // The admin reads end at `.eq(...)` rather than `.limit(...)`, so the
        // chain has to be awaitable at any point.
        chain.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(res);
        return chain;
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getAcquisitionFunnel(fake as any);

    expect([...byTable.keys()]).toContain("pilot_events");
    const calls = byTable.get("pilot_events")!;
    // created_at must be SELECTED — a window cannot be applied to a column
    // the read does not carry.
    expect(String(calls.select?.[0])).toContain("created_at");
    // …and profile_id, without which internal activity cannot be classified.
    expect(String(calls.select?.[0])).toContain("profile_id");
    // …bounded in time,
    expect(calls.gte?.[0]).toBe("created_at");
    expect(typeof calls.gte?.[1]).toBe("string");
    // …deterministically ordered, so the cap keeps the MOST RECENT rows
    // instead of an arbitrary slice,
    expect(calls.order?.[0]).toBe("created_at");
    expect(calls.order?.[1]).toMatchObject({ ascending: false });
    // …and still capped.
    expect(calls.limit?.[0]).toBe(FUNNEL_MAX_ROWS);
  });
});

describe("W14 — a saturated window reports UNKNOWN, not a percentage", () => {

  it("refuses every rate when the read hit the row cap", () => {
    // Exactly at the cap → there are almost certainly more events in the
    // window than were read, so the population is incomplete.
    const all = [
      ...rows(FUNNEL_EVENTS.landingViewed, FUNNEL_MAX_ROWS - 10),
      ...rows(FUNNEL_EVENTS.ctaClicked, 10),
    ];
    expect(all).toHaveLength(FUNNEL_MAX_ROWS);

    const out = summariseFunnel(all);
    expect(out.truncated).toBe(true);
    expect(out.countsAreLowerBound).toBe(true);
    for (const r of out.rates) {
      expect(r.pct, r.label).toBeNull();
    }
    // …and it says why, rather than rendering a bare dash.
    expect(out.rates.every((r) => /incomplete|truncat/i.test(r.note))).toBe(true);
  });

  it("computes rates normally when the window was read completely", () => {
    const all = [
      ...rows(FUNNEL_EVENTS.landingViewed, 200),
      ...rows(FUNNEL_EVENTS.ctaClicked, 50),
    ];
    const out = summariseFunnel(all);
    expect(out.truncated).toBe(false);
    expect(out.countsAreLowerBound).toBe(false);
    const cta = out.rates.find((r) => r.label === "Landing → CTA click")!;
    expect(cta.pct).toBe(25);
  });

  it("still returns a null rate for a zero denominator (UNKNOWN, not 0%)", () => {
    const out = summariseFunnel(rows(FUNNEL_EVENTS.ctaClicked, 5));
    expect(out.truncated).toBe(false);
    const cta = out.rates.find((r) => r.label === "Landing → CTA click")!;
    // 5 clicks, 0 landings — the honest answer is "unknown", never 0% and
    // never Infinity.
    expect(cta.pct).toBeNull();
  });

  it("never turns a missing denominator into zero", () => {
    const out = summariseFunnel([]);
    for (const r of out.rates) expect(r.pct).toBeNull();
    expect(out.rates.some((r) => r.pct === 0)).toBe(false);
  });
});

describe("W14 — preview traffic is excluded, and excluding it cannot fake completeness", () => {

  it("drops preview_host events from both numerator and denominator", () => {
    const out = summariseFunnel(
      [
        ...rows(FUNNEL_EVENTS.landingViewed, 100),
        ROW(FUNNEL_EVENTS.landingViewed, { preview_host: true }),
        ...rows(FUNNEL_EVENTS.ctaClicked, 25),
        ROW(FUNNEL_EVENTS.ctaClicked, { preview_host: true }),
      ],
    );
    expect(out.excludedPreview).toBe(2);
    expect(out.rates.find((r) => r.label === "Landing → CTA click")!.pct).toBe(25);
  });

  it("judges truncation on rows READ, not on rows kept after filtering", () => {
    // THE TRAP: filtering preview rows shrinks the array below the cap. If
    // truncation were judged after filtering, a fully saturated read would
    // look complete again and the rates would come back as confident numbers.
    const all = [
      ...rows(FUNNEL_EVENTS.landingViewed, FUNNEL_MAX_ROWS - 1),
      ROW(FUNNEL_EVENTS.ctaClicked, { preview_host: true }),
    ];
    expect(all).toHaveLength(FUNNEL_MAX_ROWS);
    const out = summariseFunnel(all);
    expect(out.truncated).toBe(true);
    expect(out.rates.every((r) => r.pct === null)).toBe(true);
  });
});

describe("W14 — counts stay honest about what they are", () => {

  it("reports the window length it used so the panel can state it", () => {
    const out = summariseFunnel(rows(FUNNEL_EVENTS.landingViewed, 3));
    expect(out.windowDays).toBe(FUNNEL_WINDOW_DAYS);
  });

  it("counts every declared stage, including zero ones", () => {
    const out = summariseFunnel(rows(FUNNEL_EVENTS.landingViewed, 3));
    const landing = out.counts.find((c) => c.key === FUNNEL_EVENTS.landingViewed)!;
    expect(landing.count).toBe(3);
    // A stage with no events reads 0, not absent — an absent row would hide
    // the fact that the stage is instrumented and simply never fired.
    expect(out.counts.length).toBeGreaterThan(1);
    expect(out.counts.every((c) => typeof c.count === "number")).toBe(true);
  });
});
