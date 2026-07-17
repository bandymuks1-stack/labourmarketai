import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RENDER PROOF for the Opportunity Discovery card.
 *
 * The worker dashboard is behind Supabase auth and cannot be driven
 * autonomously without live credentials + a seeded worker, so — exactly like
 * `journal-card-render-order.test.ts` — this renders the REAL
 * `OpportunityDirectionsCard` to static markup with the REAL LT/EN copy and
 * asserts the actual DOM the worker sees: the ok state (heading, direction
 * names, shared-skill basis, "show more", both CTAs) and the honest
 * insufficient state. No fake routes, no auth bypass, no production data.
 */

const h = vi.hoisted(() => ({ locale: "lt" as string }));

vi.mock("next-intl", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");
  const cache: Record<string, Record<string, string>> = {};
  const ns = (): Record<string, string> => {
    if (!cache[h.locale]) {
      cache[h.locale] = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), `messages/${h.locale}.json`), "utf8"),
      ).opportunityDirections;
    }
    return cache[h.locale];
  };
  return { useTranslations: () => (key: string) => ns()[key] ?? key };
});
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));
vi.mock("@/lib/telemetry/task", () => ({ recordEvent: () => {} }));

const { OpportunityDirectionsCard } = await import(
  "@/components/app/dashboard/opportunity-directions-card"
);

const copy = (loc: string): Record<string, string> =>
  JSON.parse(readFileSync(join(process.cwd(), `messages/${loc}.json`), "utf8"))
    .opportunityDirections;

const FOUR = [
  { professionId: "customer_service_specialist", professionName: "Customer service specialist", sharedSkills: ["Cashier", "Customer service"], missingSkills: ["Call centre"] },
  { professionId: "waiter", professionName: "Waiter", sharedSkills: ["Cashier", "Customer service"], missingSkills: ["Bartending"] },
  { professionId: "receptionist", professionName: "Receptionist", sharedSkills: ["Customer service", "Reception"], missingSkills: [] },
  { professionId: "barista", professionName: "Barista", sharedSkills: ["Cashier", "Customer service"], missingSkills: ["Barista work"] },
];

/** Decode the HTML entities renderToStaticMarkup emits (e.g. ' → &#x27;) so
 *  substring checks match the raw locale copy. */
const deEntity = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

function render(loc: string, props: Parameters<typeof OpportunityDirectionsCard>[0]) {
  h.locale = loc;
  return deEntity(renderToStaticMarkup(createElement(OpportunityDirectionsCard, props)));
}

describe.each(["lt", "en"])("Opportunity Discovery card renders in %s", (loc) => {
  const c = () => copy(loc);

  it("ok state shows heading, directions, shared-skill basis, show-more and both CTAs", () => {
    const html = render(loc, { directions: FOUR, limitationState: "ok" });
    const t = c();
    expect(html).toContain(t.heading);
    expect(html).toContain(t.intro);
    expect(html).toContain("Customer service specialist");
    expect(html).toContain(t.fitBecause);
    expect(html).toContain("Cashier, Customer service"); // real shared-skill basis
    expect(html).toContain(t.viewOpportunities);
    expect(html).toContain(t.addSkills);
    // 4 directions > INITIAL_VISIBLE(3) → the show-more control is present.
    expect(html).toContain(t.showMore);
    // CTAs point at the real existing routes.
    expect(html).toContain('href="/dashboard/opportunities"');
    expect(html).toContain('href="/dashboard/profile"');
    // No fabricated numbers / percentages / AI wording.
    expect(html).not.toMatch(/\d+\s*%/);
    expect(html.toLowerCase()).not.toContain("ai ");
  });

  it("insufficient state is honest (add-skills nudge, no fake list)", () => {
    const html = render(loc, { directions: [], limitationState: "insufficient_skills" });
    const t = c();
    expect(html).toContain(t.insufficientBody);
    expect(html).toContain(t.addProfileCta);
    expect(html).not.toContain(t.viewOpportunities); // no jobs CTA in the empty state
  });

  it("no_reliable_directions renders the honest limitation, not a pretend list", () => {
    const html = render(loc, { directions: [], limitationState: "no_reliable_directions" });
    const t = c();
    expect(html).toContain(t.noneBody);
  });
});
