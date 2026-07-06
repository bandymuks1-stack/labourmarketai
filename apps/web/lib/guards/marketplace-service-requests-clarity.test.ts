import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 Real-Use Hardening — /dashboard/service-requests clarity + order (PR #534).
 *
 * Pins: ONE top-level title/intro (the page header; the loop section no longer
 * renders a duplicate header), and the real-use journey order inside the loop —
 * find/request (discover) → see what I sent (outgoing) → respond to incoming
 * (provider inbox). Cross-link + seen marker from #533 preserved. Honest empty
 * states, status behaviour and identity tiles unchanged. Pure UI/copy — no DB,
 * RLS, RPC, migration, or status-logic change.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the page has a single top-level header (no duplicate)", () => {
  const section = read("components/app/marketplace-loop-section.tsx");
  const page = read("app/[locale]/dashboard/service-requests/page.tsx");

  it("the loop section no longer renders a title/lead header", () => {
    expect(section).not.toMatch(/labels\.title/);
    expect(section).not.toMatch(/labels\.lead/);
    expect(section).not.toMatch(/<header/);
  });

  it("the MarketplaceLabels type dropped the dead title/lead fields", () => {
    expect(section).not.toMatch(/^\s*title: string;/m);
    expect(section).not.toMatch(/^\s*lead: string;/m);
  });

  it("the page keeps its single title/intro (pageTitle/pageLead)", () => {
    expect(page).toMatch(/t\("pageTitle"\)/);
    expect(page).toMatch(/t\("pageLead"\)/);
    // and no longer threads the removed labels
    expect(page).not.toMatch(/title: t\("title"\)/);
    expect(page).not.toMatch(/lead: t\("lead"\)/);
  });
});

describe("loop sections follow the real-use journey order", () => {
  const section = read("components/app/marketplace-loop-section.tsx");
  const discover = section.indexOf('testId="marketplace-discover-empty"'); // EmptyState (audit PR8)
  const outgoing = section.indexOf('testId="marketplace-outgoing-empty"');
  const incoming = section.indexOf('testId="marketplace-incoming-empty"');

  it("renders discover → outgoing (my requests) → incoming (provider inbox)", () => {
    expect(discover).toBeGreaterThan(-1);
    expect(outgoing).toBeGreaterThan(-1);
    expect(incoming).toBeGreaterThan(-1);
    expect(discover).toBeLessThan(outgoing);
    expect(outgoing).toBeLessThan(incoming);
  });
});

describe("#533 wiring + honest behaviour preserved", () => {
  const page = read("app/[locale]/dashboard/service-requests/page.tsx");
  const section = read("components/app/marketplace-loop-section.tsx");

  it("seen marker + cross-link to manage offerings still present", () => {
    expect(page).toMatch(/<MarkServiceRequestsSeen \/>/);
    expect(page).toMatch(/data-testid="requests-to-services-link"/);
    expect(page).toMatch(/t\("linkToServices"\)/);
  });

  it("honest empty states + status behaviour + identity tile intact", () => {
    expect(section).toMatch(/labels\.discoverEmpty/);
    expect(section).toMatch(/labels\.outgoingEmpty/);
    expect(section).toMatch(/labels\.incomingEmpty/);
    expect(section).toMatch(/data-testid="marketplace-incoming-requester"/);
    expect(section).toMatch(/r\.status === "sent"/);
  });
});

describe("the removed title/lead keys are gone from all active locales", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}: marketplace no longer defines title/lead`, () => {
      const m = (JSON.parse(read(`messages/${loc}.json`)) as { marketplace?: Record<string, unknown> }).marketplace ?? {};
      expect(m.title, `${loc}.title removed`).toBeUndefined();
      expect(m.lead, `${loc}.lead removed`).toBeUndefined();
      // the single page header keys remain
      expect(typeof m.pageTitle).toBe("string");
      expect(typeof m.pageLead).toBe("string");
    });
  }
});
