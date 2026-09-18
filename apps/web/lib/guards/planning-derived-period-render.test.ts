import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Rendered-DOM proof for the calendar's DERIVED period band: the 800 h
 * canonical shape (ONE period record, 2025-06-01 → 2025-11-30) drawn on the
 * month view with THIS month's derived share emphasised — and nothing drawn
 * at all when the person has no period record touching the month, when a
 * record is withdrawn, or when the read is not ok.
 *
 * The reader is mocked at the module boundary (no network); the projection
 * is the real `projectPeriodAggregateByMonth`.
 */
const holder: { result: unknown } = { result: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  }),
}));
vi.mock("@/lib/organization-evidence/import-core", () => ({
  listMyOrganizationEvidence: async () => holder.result,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) =>
    Object.assign(
      (k: string, vars?: Record<string, unknown>) =>
        vars ? `${ns}.${k}:${JSON.stringify(vars)}` : `${ns}.${k}`,
      { raw: (k: string) => `${ns}.${k}` },
    ),
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { DerivedPeriodEvidence } = await import(
  "@/components/app/planning/derived-period-evidence"
);

const record = (over: Record<string, unknown> = {}) => ({
  id: "rec-800",
  personId: "op-1",
  hours: 800,
  periodStart: "2025-06-01",
  periodEnd: "2025-11-30",
  text: "Tiling and plastering on site",
  contextLabel: null,
  withdrawn: false,
  ...over,
});

async function render(month: string) {
  const el = await DerivedPeriodEvidence({ month, locale: "en" });
  return el ? renderToStaticMarkup(el) : "";
}

describe("calendar month view — derived period evidence", () => {
  it("draws the ONE 800 h record as a six-month band with this month's 133.33 h share emphasised", async () => {
    holder.result = {
      kind: "ok",
      records: [record()],
      links: [{ id: "op-1", organizationName: "Nonstop" }],
      pendingOffers: [],
    };
    const html = await render("2025-09");
    expect(html).toContain('data-testid="planning-derived-period"');
    expect(html).toContain('data-testid="ww-period-band"');
    expect(html).toContain('data-kind="derived"');
    expect(html).toContain("Nonstop");
    // six month segments, the active one marked, the share stated
    expect(html.match(/data-month="2025-\d\d" data-hours=/g)?.length).toBe(6);
    expect(html).toMatch(/data-month="2025-09"[^>]*data-active="true"/);
    expect(html).toContain('data-share="133.33"');
    expect(html).toContain("planning.derived.thisMonth:{&quot;hours&quot;:&quot;133.33&quot;}");
    // total stays the one canonical figure; the derived warning label is rendered
    expect(html).toContain("800.00 h");
    expect(html).toContain("evidenceImport.records.monthlyShare");
    // it links the source record, never a planning-local page
    expect(html).toContain('href="/dashboard/profile"');
  });

  it("the first month carries the +0.01 remainder (133.34) and the sum stays exactly 800.00", async () => {
    holder.result = { kind: "ok", records: [record()], links: [], pendingOffers: [] };
    const html = await render("2025-06");
    expect(html).toContain('data-share="133.34"');
    const hours = [...html.matchAll(/data-hours="(\d+\.\d\d)"/g)].map((m) => Number(m[1]));
    expect(hours.length).toBe(6);
    expect(Math.round(hours.reduce((a, b) => a + b, 0) * 100)).toBe(80000);
  });

  it("renders NOTHING for a month outside the period — no manufactured share", async () => {
    holder.result = { kind: "ok", records: [record()], links: [], pendingOffers: [] };
    expect(await render("2026-09")).toBe("");
  });

  it("renders NOTHING for a withdrawn record, a day-only record, or a failed read", async () => {
    holder.result = { kind: "ok", records: [record({ withdrawn: true })], links: [], pendingOffers: [] };
    expect(await render("2025-09")).toBe("");
    holder.result = {
      kind: "ok",
      records: [record({ periodStart: null, periodEnd: null, hours: 8 })],
      links: [],
      pendingOffers: [],
    };
    expect(await render("2025-09")).toBe("");
    holder.result = { kind: "unavailable" };
    expect(await render("2025-09")).toBe("");
  });

  it("zero data renders nothing — the honest empty month", async () => {
    holder.result = { kind: "ok", records: [], links: [], pendingOffers: [] };
    expect(await render("2025-09")).toBe("");
  });
});
