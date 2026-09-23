import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * THE PUBLIC SAMPLE CARD LINKS NOWHERE (owner directive 2026-09-23, landing
 * §22).
 *
 * The landing (and /for-workers) show the REAL `WorkerPlayerCard` with one
 * clearly-labelled sample persona. Its four counter tiles and its skill bars
 * were real links — "/dashboard/journal#journal-entries", "/dashboard/journal
 * ?skill=…" — because on a person's OWN card they open that person's record.
 * On the sample they sent an anonymous visitor into /dashboard (and the login
 * wall) for a journal that is not theirs and does not exist.
 *
 * `sample` keeps the SAME component and the SAME render and withholds only
 * the links. Rendered here, not grepped, so a new link added inside the card
 * later is caught by what the markup actually contains.
 */

vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: Record<string, unknown>) =>
    createElement("a", { href: String(href), ...rest }, children as ReactNode),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (ns: string) =>
    Object.assign((k: string) => `${ns}.${k}`, {
      has: () => false,
      raw: (k: string) => `${ns}.${k}`,
      rich: (k: string) => `${ns}.${k}`,
    }),
}));

vi.mock("@/components/decor/constellation-bg", () => ({ ConstellationBg: () => null }));

const { PlayerCardShowcase } = await import("@/components/marketing/player-card-showcase");
const { WorkerPlayerCard } = await import("@/components/app/worker-player-card");
const { buildSampleWorkerPlayerCard } = await import("@/lib/player-card/sample-card");
const { buildPlayerCardLabels } = await import("@/lib/player-card/labels");

const dashboardLinks = (html: string) => html.match(/href="\/dashboard[^"]*"/g) ?? [];

describe("the landing's sample Player Card", () => {
  it("renders the real card with its tiles, and not one link into /dashboard", async () => {
    const html = renderToStaticMarkup(await PlayerCardShowcase());
    // The card is really there — the tiles still render as facts…
    for (const tile of ["player-card-skills", "player-card-candidate", "player-card-evidence", "player-card-attention"]) {
      expect(html, tile).toContain(`data-testid="${tile}"`);
    }
    // …and none of them, nor any skill bar, opens a dashboard surface.
    expect(dashboardLinks(html)).toEqual([]);
  });

  it("NEGATIVE CONTROL — the same card as a person's OWN card still links its tiles", async () => {
    // Proves the scan can see the links `sample` withholds, and that the
    // signed-in card lost nothing (rule D: every counter tile navigates).
    const card = buildSampleWorkerPlayerCard({
      sampleName: "Sample",
      sampleOrganization: "Sample kitchen",
      now: new Date("2026-09-23T00:00:00Z"),
    });
    const labels = await buildPlayerCardLabels(card);
    const own = renderToStaticMarkup(
      createElement(WorkerPlayerCard, { card, labels, thermometer: null, avatarUrl: null }),
    );
    expect(dashboardLinks(own)).toEqual(
      expect.arrayContaining([
        'href="/dashboard/journal#journal-entries"',
        'href="/dashboard/profile#capabilities"',
      ]),
    );
    const sample = renderToStaticMarkup(
      createElement(WorkerPlayerCard, { card, labels, thermometer: null, avatarUrl: null, sample: true }),
    );
    expect(dashboardLinks(sample)).toEqual([]);
  });
});
