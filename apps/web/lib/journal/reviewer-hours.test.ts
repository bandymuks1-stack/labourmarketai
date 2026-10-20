import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { reviewerHoursOf } from "./reviewer-hours";
import type { WorkTimeMetricRow } from "./work-time";

const m = (row: Partial<WorkTimeMetricRow> & { metric_slug: string }): WorkTimeMetricRow => ({
  value_text: null,
  value_numeric: null,
  unit_slug: null,
  ...row,
});
const frag = (index: number, value: number, unit = "hours") =>
  m({ metric_slug: "fragment_time", value_text: String(index), value_numeric: value, unit_slug: unit });
const entry = (metrics: WorkTimeMetricRow[]) => ({ id: "e1", createdAt: "2026-10-20T08:00:00Z", metrics });

describe("the reviewer sees the stored hours", () => {
  it("text says one thing, the entry stores another: the stored value wins", () => {
    // original_text "8 h" is never read — only the metrics.
    expect(reviewerHoursOf(entry([m({ metric_slug: "quantity", value_numeric: 6, unit_slug: "hours" })]))).toEqual({
      value: 6,
      unit: "hours",
      certain: true,
    });
  });

  it("two activities with their own times sum (the text parse showed nothing)", () => {
    expect(reviewerHoursOf(entry([frag(1, 2), frag(2, 3)]))).toEqual({ value: 5, unit: "hours", certain: true });
  });

  it("per-activity times AND an entry duration: the fragments count, flagged for a closer look", () => {
    const r = reviewerHoursOf(
      entry([frag(1, 2), frag(2, 3), m({ metric_slug: "quantity", value_numeric: 9, unit_slug: "hours" })]),
    );
    expect(r).toEqual({ value: 5, unit: "hours", certain: false });
  });

  it("no stored duration: no number is invented", () => {
    expect(reviewerHoursOf(entry([m({ metric_slug: "quantity", value_numeric: 40, unit_slug: "square_meters" })]))).toBeNull();
    expect(reviewerHoursOf(entry([]))).toBeNull();
  });

  it("days stay days (no invented workday length)", () => {
    expect(reviewerHoursOf(entry([m({ metric_slug: "quantity", value_numeric: 2, unit_slug: "days" })]))).toEqual({
      value: 2,
      unit: "days",
      certain: true,
    });
  });
});

describe("no reviewer surface re-parses hours from the text", () => {
  const WEB = join(__dirname, "..", "..");
  const SURFACES = [
    "app/[locale]/dashboard/inbox/page.tsx",
    "app/[locale]/dashboard/inbox/counterparty/page.tsx",
    "lib/journal/review-report.ts",
  ];
  it.each(SURFACES)("%s reads reviewerHoursOf, never depth.hours", (file) => {
    const src = readFileSync(join(WEB, file), "utf8");
    expect(src).toMatch(/reviewerHoursOf\(/);
    expect(src).not.toMatch(/depth\.hours/);
  });
});

describe("the counterparty review keeps the real metric order", () => {
  it("of two entry quantities, the later one (created_at, then id) counts", () => {
    const rows = [6, 8].map((v, i) => ({
      metric_slug: "quantity",
      value_text: null,
      value_numeric: v,
      unit_slug: "hours",
      created_at: "2026-10-20T08:00:00Z",
      id: `00000000-0000-4000-8000-00000000000${i}`,
    }));
    expect(reviewerHoursOf({ id: "e1", createdAt: "2026-10-20T08:00:00Z", metrics: rows })?.value).toBe(8);
  });
  it("the page passes the RPC's real created_at and id, never an invented order", () => {
    const WEB = join(__dirname, "..", "..");
    const page = readFileSync(join(WEB, "app", "[locale]", "dashboard", "inbox", "counterparty", "page.tsx"), "utf8");
    expect(page).toMatch(/created_at: mm\.createdAt \?\? null,\s*id: mm\.id \?\? null,/);
    expect(page).not.toMatch(/rpc-order-/);
  });
});
