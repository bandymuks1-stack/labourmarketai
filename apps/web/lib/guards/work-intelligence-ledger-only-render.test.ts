import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Rendered proof (decision 0020, owner 2026-10-07): a person whose only
 * recorded work is the organization's ledger - no journal entry, and possibly
 * no account at all - is NOT shown "no recorded work yet". The organization's
 * hours are real work; they render, labelled as the organization's ledger.
 */
const tr = Object.assign((k: string, v?: Record<string, unknown>) => `${k}${v ? JSON.stringify(v) : ""}`, {
  has: () => true,
});
vi.mock("next-intl/server", () => ({ getTranslations: async () => tr, setRequestLocale: () => {} }));
vi.mock("next-intl", () => ({
  useTranslations: () => tr,
  useLocale: () => "en",
  useFormatter: () => ({ number: (n: number) => String(n), dateTime: (d: unknown) => String(d) }),
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ children }: { children: unknown }) => createElement("a", null, children as never),
}));

const { JournalWorkIntelligence } = await import("@/components/app/journal-work-intelligence");
const { historicalPersonIntelligence } = await import("@/lib/journal/work-intelligence-read");

const labels = {
  skillName: () => null,
  professionName: () => null,
  unitName: () => null,
  contextLabel: () => "",
  primaryProfessionSlug: null,
};
const today = { todayIso: "2026-10-07", horizonIso: "2026-10-07" } as never;

const ok = (rows: unknown[], periodRows: unknown[] = []) =>
  ({ kind: "ok", rows, periodRows }) as never;

async function render(wi: never, audience: "self" | "organization" = "organization") {
  const el = await JournalWorkIntelligence({ wi, locale: "en", labels, audience });
  return renderToStaticMarkup(el);
}

describe("Work Intelligence with an organization ledger and no journal entries", () => {
  const day = {
    id: "r1",
    organizationId: "o1",
    workDate: "2026-03-02",
    hours: 8,
    context: undefined,
  };

  it("shows the ledger, not 'no recorded work yet'", async () => {
    const wi = historicalPersonIntelligence(ok([day]), today)!;
    const html = await render(wi as never);
    expect(html).toContain('data-testid="wi-ledger-only"');
    expect(html).not.toContain('data-testid="wi-empty"');
    expect(html).toContain("wi-org-records");
  });

  it("works for the claimed person's own view too (no entries, organization hours)", async () => {
    const wi = historicalPersonIntelligence(ok([day]), today)!;
    const html = await render(wi as never, "self");
    expect(html).toContain('data-testid="wi-ledger-only"');
  });

  it("a ledger holding nothing still says 'no recorded work' (unchanged)", async () => {
    const wi = historicalPersonIntelligence(ok([]), today)!;
    const html = await render(wi as never);
    expect(html).toContain('data-testid="wi-empty"');
    expect(html).not.toContain('data-testid="wi-ledger-only"');
  });

  it("a period-only ledger counts as recorded work", async () => {
    const wi = historicalPersonIntelligence(
      ok([], [
        {
          id: "r2",
          organizationId: "o1",
          periodStart: "2025-06-01",
          periodEnd: "2025-11-30",
          hours: 800,
          provenance: "source_stated",
          context: undefined,
        },
      ]),
      today,
    )!;
    const html = await render(wi as never);
    expect(html).toContain('data-testid="wi-ledger-only"');
  });

  it("an unreadable ledger is not drawn as work or as emptiness of work", () => {
    expect(historicalPersonIntelligence({ kind: "error" }, today)).toBeNull();
  });
});
