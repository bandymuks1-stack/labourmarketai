import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Rendered-DOM proof for the calendar's DERIVED period band: a SOURCE-stated
 * period (ONE period record, 2025-06-01 → 2025-11-30, the period in the
 * source's own columns, no rate in its words) drawn on the month view with
 * THIS month's derived share emphasised — and nothing drawn at all when the
 * person has no period record touching the month, when a record is
 * withdrawn, when the read is not ok, and (owner rule 2026-09-23 — never
 * manufacture precision) when the period is one a PERSON chose at import:
 * that span has no monthly figure to put on a month.
 *
 * The reader is mocked at the module boundary (no network); the reading is
 * the real `readPeriodEvidence`.
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

/** A period the SOURCE stated: its own period columns, no derivation. */
const record = (over: Record<string, unknown> = {}) => ({
  id: "rec-800",
  personId: "op-1",
  hours: 800,
  periodStart: "2025-06-01",
  periodEnd: "2025-11-30",
  text: "Tiling and plastering on site",
  contextLabel: null,
  withdrawn: false,
  factFields: ["personLabel", "periodStart", "periodEnd", "hours", "workText"],
  derived: {},
  ...over,
});

/** The production shape: the source said "at least 16 month … each month
 *  only 50 hours"; a PERSON chose Jun–Nov 2025 at import. */
const interpreted = (over: Record<string, unknown> = {}) =>
  record({
    text: "Human research and director for at least 16 month calculating each month only 50 hours",
    factFields: ["personLabel", "hours", "projectLabel", "workText"],
    derived: {
      timeSemantics: {
        value: "period_aggregate", method: "human_choice", confidence: 1, sourceHours: 800, note: "month",
        remote: true, periodStart: "2025-06-01", periodEnd: "2025-11-30",
      },
    },
    ...over,
  });

async function render(month: string) {
  const el = await DerivedPeriodEvidence({ month, locale: "en" });
  return el ? renderToStaticMarkup(el) : "";
}

describe("calendar month view — derived period evidence", () => {
  it("a period a PERSON chose at import draws NO monthly figure on the month — nothing manufactured (owner rule 2026-09-23)", async () => {
    holder.result = {
      kind: "ok",
      records: [interpreted()],
      links: [{ id: "op-1", organizationName: "Nonstop" }],
      pendingOffers: [],
    };
    for (const month of ["2025-06", "2025-09", "2025-11"]) {
      const html = await render(month);
      expect(html, month).toBe("");
      expect(html, month).not.toMatch(/133\.3[34]|data-share=/);
    }
    // a period the importer DERIVED is an interpretation too
    holder.result = {
      kind: "ok",
      records: [interpreted({ derived: { timeSemantics: { value: "period_aggregate", method: "month_heading", periodStart: "2025-06-01", periodEnd: "2025-11-30", sourceHours: 800 } } })],
      links: [],
      pendingOffers: [],
    };
    expect(await render("2025-09")).toBe("");
    // a row-level day the source stated never turns a chosen span into a source period
    holder.result = {
      kind: "ok",
      records: [interpreted({ factFields: ["personLabel", "workDate", "hours", "workText"] })],
      links: [],
      pendingOffers: [],
    };
    expect(await render("2025-09")).toBe("");
  });

  it("a SOURCE period whose words state a rate is not divided either — the rate is the source's own monthly figure", async () => {
    holder.result = {
      kind: "ok",
      records: [record({ hours: 300, text: "coordination, 50 hours per month" })],
      links: [],
      pendingOffers: [],
    };
    expect(await render("2025-09")).toBe("");
  });

  it("NEGATIVE CONTROL — a SOURCE period with no stated rate still draws the six-month band with this month's 133.33 h share emphasised", async () => {
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
    // total stays the one canonical figure AS THE SOURCE GAVE IT (no invented
    // decimals); the derived warning label is rendered
    expect(html).toContain("800 h");
    expect(html).not.toContain("800.00 h");
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

  it("a FAILED read is said as unavailable — never rendered as 'no period record' (SEP-7)", async () => {
    holder.result = { kind: "unavailable" };
    const html = await render("2025-09");
    expect(html).toContain('data-testid="planning-source-note-period-error"');
    expect(html).toContain("planning.derived.unavailable");
    expect(html).not.toContain('data-testid="planning-derived-period"');
    // a store that is not provisioned here is an honest nothing, not a failure
    holder.result = { kind: "needs-migration" };
    expect(await render("2025-09")).toBe("");
  });

  it("renders NOTHING for a withdrawn record or a day-only record", async () => {
    holder.result = { kind: "ok", records: [record({ withdrawn: true })], links: [], pendingOffers: [] };
    expect(await render("2025-09")).toBe("");
    holder.result = {
      kind: "ok",
      records: [record({ periodStart: null, periodEnd: null, hours: 8 })],
      links: [],
      pendingOffers: [],
    };
    expect(await render("2025-09")).toBe("");
  });

  it("zero data renders nothing — the honest empty month", async () => {
    holder.result = { kind: "ok", records: [], links: [], pendingOffers: [] };
    expect(await render("2025-09")).toBe("");
  });
});
