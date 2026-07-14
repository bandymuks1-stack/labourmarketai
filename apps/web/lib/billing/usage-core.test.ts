/**
 * Usage event validation guard (Sprint v2 §11) — bounds + honesty.
 */
import { describe, it, expect } from "vitest";

import {
  USAGE_CATEGORIES,
  CREDIT_TYPES,
  USAGE_METADATA_MAX_CHARS,
  buildUsageEventRow,
} from "./usage-core";

const valid = {
  category: "emails" as const,
  quantity: 3,
  unit: "messages",
  source: "transactional-mailer",
};

describe("registries", () => {
  it("the 9 owner cost categories exist exactly", () => {
    expect([...USAGE_CATEGORIES]).toEqual([
      "ai",
      "storage",
      "emails",
      "bandwidth",
      "database",
      "payments",
      "media",
      "voice",
      "video",
    ]);
  });
  it("credit types registry", () => {
    expect([...CREDIT_TYPES]).toEqual(["ad_credits", "ai_credits"]);
  });
});

describe("buildUsageEventRow bounds", () => {
  it("builds a valid row (cost unknown → null, never 0)", () => {
    const r = buildUsageEventRow(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.cost_usd).toBeNull();
      expect(r.row.category).toBe("emails");
      expect(r.row.quantity).toBe(3);
      expect(r.row.profile_id).toBeNull();
    }
  });

  it("rejects unknown categories", () => {
    const r = buildUsageEventRow({
      ...valid,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category: "crypto" as any,
    });
    expect(r).toEqual({ ok: false, reason: "unknown_category" });
  });

  it("rejects negative / non-finite quantities and costs", () => {
    expect(buildUsageEventRow({ ...valid, quantity: -1 })).toEqual({
      ok: false,
      reason: "invalid_quantity",
    });
    expect(buildUsageEventRow({ ...valid, quantity: Number.NaN })).toEqual({
      ok: false,
      reason: "invalid_quantity",
    });
    expect(buildUsageEventRow({ ...valid, costUsd: -0.01 })).toEqual({
      ok: false,
      reason: "invalid_cost",
    });
  });

  it("truncates label fields but rejects empty ones", () => {
    const r = buildUsageEventRow({ ...valid, unit: "x".repeat(100) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.unit.length).toBe(32);
    expect(buildUsageEventRow({ ...valid, unit: "   " })).toEqual({
      ok: false,
      reason: "empty_unit",
    });
    expect(buildUsageEventRow({ ...valid, source: "" })).toEqual({
      ok: false,
      reason: "empty_source",
    });
  });

  it("REJECTS oversized metadata (no silent truncation of structured data)", () => {
    const big = { blob: "y".repeat(USAGE_METADATA_MAX_CHARS + 1) };
    expect(buildUsageEventRow({ ...valid, metadata: big })).toEqual({
      ok: false,
      reason: "metadata_too_large",
    });
  });

  it("normalizes occurred_at and rejects garbage timestamps", () => {
    const r = buildUsageEventRow({
      ...valid,
      occurredAtIso: "2026-07-14T10:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.occurred_at).toBe("2026-07-14T10:00:00.000Z");
    expect(buildUsageEventRow({ ...valid, occurredAtIso: "yesterday" })).toEqual(
      { ok: false, reason: "invalid_occurred_at" },
    );
  });
});
