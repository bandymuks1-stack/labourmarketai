import { describe, expect, it } from "vitest";

import {
  FUNNEL_STAGES,
  NOT_MEASURED_STAGES,
  getAcquisitionFunnel,
  stageCount,
  summariseFunnel,
} from "@/lib/admin/conversion-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * SEP-7: UNKNOWN != ZERO != FAILED != NOT_MEASURED. A funnel stage is exactly
 * one of measured (a number, 0 is real), not_measured (no event/source, no
 * number) or unavailable (the read failed, no number).
 */
const row = (event_name: string) => ({ event_name, metadata: null, profile_id: null });

describe("funnel stage measurement state", () => {
  it("an emitter-backed stage with no rows is a REAL zero (measured)", () => {
    const out = summariseFunnel([row(FUNNEL_EVENTS.landingViewed)]);
    const disclosed = out.counts.find((c) => c.key === FUNNEL_EVENTS.contactDisclosed)!;
    expect(disclosed.measurement).toBe("measured");
    expect(disclosed.count).toBe(0);
    const landing = out.counts.find((c) => c.key === FUNNEL_EVENTS.landingViewed)!;
    expect(landing).toMatchObject({ measurement: "measured", count: 1 });
  });

  it("stages with no event or source are not_measured with a reason and NO number", () => {
    const out = summariseFunnel([row(FUNNEL_EVENTS.landingViewed)]);
    for (const def of NOT_MEASURED_STAGES) {
      const s = out.counts.find((c) => c.key === def.key)!;
      expect(s.measurement).toBe("not_measured");
      expect(s.count).toBeNull();
      expect(s.reasonKey).toBe(def.reasonKey);
    }
    const keys = NOT_MEASURED_STAGES.map((s) => s.key as string);
    for (const k of [
      "commercial_value",
      "trial_started",
      "paid_conversion",
      "retention_repeat_use",
      "offer_side",
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("no not_measured stage key collides with a read event name", () => {
    const events = new Set(FUNNEL_STAGES.map((s) => s.key as string));
    for (const s of NOT_MEASURED_STAGES) expect(events.has(s.key)).toBe(false);
  });

  it("a failed read yields unavailable, never 0", () => {
    const s = stageCount({ key: "x", label: "X" }, new Map([["x", 5]]), false);
    expect(s).toMatchObject({ measurement: "unavailable", count: null });
  });

  it("getAcquisitionFunnel on a read error marks every event stage unavailable", async () => {
    const chain: Record<string, unknown> = {};
    const fn = () => chain;
    Object.assign(chain, {
      select: fn,
      in: fn,
      gte: fn,
      order: fn,
      limit: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    });
    const supabase = { from: () => chain } as never;
    const out = await getAcquisitionFunnel(supabase);
    expect(out.available).toBe(false);
    expect(out.rates).toEqual([]);
    const eventStages = out.counts.filter((c) =>
      FUNNEL_STAGES.some((s) => s.key === c.key),
    );
    expect(eventStages.length).toBe(FUNNEL_STAGES.length);
    for (const c of eventStages) {
      expect(c.measurement).toBe("unavailable");
      expect(c.count).toBeNull();
    }
  });

  it("rates stay null when a side is not measured, and a real zero numerator is 0%", () => {
    const zero = summariseFunnel([row(FUNNEL_EVENTS.landingViewed)]);
    const r = zero.rates.find((x) => x.label === "Landing → CTA click")!;
    expect(r.pct).toBe(0);
    expect(r.state).toBe("ok");
    // Downstream rates built on NOT_MEASURED stages are listed, never computed.
    expect(zero.unmeasuredRates.length).toBeGreaterThan(0);
    for (const u of zero.unmeasuredRates) {
      expect(zero.rates.some((x) => x.label === u.label)).toBe(false);
    }
  });
});
