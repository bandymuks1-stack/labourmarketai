import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicBusinessProfileView } from "@/lib/company/public-profile-model";
import { activeLocales } from "@/lib/i18n/config";

/**
 * The team view of the public company profile, rendered through the real page.
 * Pins what the owner order binds: reachable only at `?view=team`, noindex there
 * and nowhere else, the default page untouched, every empty case silent, no
 * invented figure, no score, a contact that says truthfully where it goes.
 */

const WEB = join(__dirname, "..", "..");
const catalog = (locale: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(WEB, "messages", `${locale}.json`), "utf8"));

const reader = vi.hoisted(() => ({ result: null as PublicBusinessProfileView | null }));

vi.mock("@/lib/company/public-profile", () => ({
  getPublicBusinessProfile: async () => reader.result,
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (namespace?: string) =>
    createTranslator({
      locale: "lt",
      messages: catalog("lt") as never,
      namespace: namespace as never,
    }),
}));

const page = await import("@/app/[locale]/business/[slug]/page");
const { CompanyTeamProfile } = await import("@/components/app/company-team-profile");
const { buildCompanyTeamProfile } = await import("@/lib/company/team-profile-model");

const NAME_ONLY: PublicBusinessProfileView = {
  profile: {
    id: "org-1",
    displayName: "Alfa",
    tagline: null,
    description: null,
    country: null,
    website: null,
    contactEmail: null,
    contactPhone: null,
  },
  listings: [],
};

const FULL: PublicBusinessProfileView = {
  profile: {
    id: "org-1",
    displayName: "Alfa statyba",
    tagline: "Stogai ir fasadai",
    description: "Dirbame visoje Lietuvoje.",
    country: "LT",
    website: "alfa.lt",
    contactEmail: "info@alfa.lt",
    contactPhone: "+37060000000",
  },
  listings: [
    { id: "a", listingKind: "rental", category: "machinery", title: "Pastoliai", description: null, locationCountry: "LT", locationLabel: "Kaunas", priceText: null },
    { id: "b", listingKind: "wanted", category: "accommodation", title: "Būstas brigadai", description: "Nuo kovo", locationCountry: null, locationLabel: null, priceText: null },
  ],
};

const args = (search: { view?: string | string[] } = {}) => ({
  params: Promise.resolve({ locale: "lt", slug: "alfa" }),
  searchParams: Promise.resolve(search),
});

const renderPage = async (search: { view?: string | string[] } = {}) =>
  renderToStaticMarkup(await page.default(args(search)));

beforeEach(() => {
  reader.result = FULL;
});

describe("reachable only at ?view=team", () => {
  it("the exact value opens the team view", async () => {
    expect(await renderPage({ view: "team" })).toContain('data-testid="company-team-profile"');
  });

  it("anything else is the default page", async () => {
    for (const search of [{}, { view: "default" }, { view: "TEAM" }, { view: ["team", "x"] }]) {
      const html = await renderPage(search);
      expect(html).not.toContain("company-team-profile");
      expect(html).toContain("Verslo profilis");
    }
  });

  it("no link in the default page opens it", async () => {
    expect(await renderPage()).not.toContain("view=team");
    const panel = readFileSync(join(WEB, "components", "app", "business-public-profile-panel.tsx"), "utf8");
    expect(panel).not.toContain("view=team");
  });

  it("an unknown slug still throws notFound in both views", async () => {
    reader.result = null;
    await expect(page.default(args())).rejects.toThrow();
    await expect(page.default(args({ view: "team" }))).rejects.toThrow();
  });
});

describe("noindex on that view only", () => {
  it("team view is noindex, the canonical stays the default page", async () => {
    const metadata = await page.generateMetadata(args({ view: "team" }));
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(String(metadata.alternates?.canonical)).toMatch(/\/business\/alfa$/);
  });

  it("the default page keeps its metadata", async () => {
    for (const search of [{}, { view: "other" }]) {
      expect((await page.generateMetadata(args(search))).robots).toEqual({ index: true, follow: true });
    }
  });

  it("an unknown slug stays noindex without a profile", async () => {
    reader.result = null;
    expect((await page.generateMetadata(args({ view: "team" }))).robots).toEqual({ index: false, follow: false });
  });
});

describe.each(activeLocales)("%s: rendered copy", (locale) => {
  const t = createTranslator({ locale, messages: catalog(locale) as never });
  const translate = t as unknown as Parameters<typeof CompanyTeamProfile>[0]["t"];
  const render = (view: PublicBusinessProfileView) =>
    renderToStaticMarkup(CompanyTeamProfile({ view: buildCompanyTeamProfile(view, locale), t: translate }));
  const copy = (catalog(locale) as { businessProfile: { team: Record<string, string> } }).businessProfile.team;

  it("a name-only company shows the hero and an honest no-contact line, nothing else", () => {
    const html = render(NAME_ONLY);
    expect(html).toContain("Alfa");
    expect(html).toContain(`data-testid="company-team-no-contact"`);
    expect(html).toContain(copy.contactNone.replace(/'/g, "&#x27;"));
    for (const absent of ["company-team-about", "company-team-offers", "company-team-seeking", "<a ", "<img"]) {
      expect(html).not.toContain(absent);
    }
  });

  it("empty data puts no digit on the page: no placeholder figure", () => {
    expect(render(NAME_ONLY).replace(/<[^>]*>/g, "")).not.toMatch(/\d/);
  });

  it("a full company shows every region and only real contact links", () => {
    const html = render(FULL);
    for (const region of ["company-team-about", "company-team-offers", "company-team-seeking", "company-team-contact"]) {
      expect(html).toContain(region);
    }
    expect(html).toContain('href="mailto:info@alfa.lt"');
    expect(html).toContain('href="tel:+37060000000"');
    expect(html).toContain('href="https://alfa.lt/"');
    expect(html).toContain(copy.contactNote.replace(/'/g, "&#x27;"));
    expect(html).not.toContain("company-team-no-contact");
  });

  it("every link stays on the company's own channel or this page", () => {
    const hrefs = [...render(FULL).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(/^(mailto:|tel:|https:\/\/alfa\.lt\/|#company-team-contact$)/);
  });

  it("the hero offers the contact door only when one exists", () => {
    expect(render(FULL)).toContain("#company-team-contact");
    expect(render(NAME_ONLY)).not.toContain("#company-team-contact");
  });

  it("wanted listings are never called a hiring list by their region", () => {
    expect(render({ ...NAME_ONLY, listings: [FULL.listings[1]] })).toContain(copy.seekingSub.replace(/'/g, "&#x27;"));
  });

  it("every team string is written", () => {
    expect(Object.keys(copy).sort()).toEqual(
      Object.keys((catalog("en") as { businessProfile: { team: Record<string, string> } }).businessProfile.team).sort(),
    );
    for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(0);
  });
});

describe("what the view must not touch", () => {
  const component = readFileSync(join(WEB, "components", "app", "company-team-profile.tsx"), "utf8");
  const model = readFileSync(join(WEB, "lib", "company", "team-profile-model.ts"), "utf8");
  const pageSource = readFileSync(join(WEB, "app", "[locale]", "business", "[slug]", "page.tsx"), "utf8");

  it("uses no global company score (doctrine §19)", () => {
    for (const source of [component, model, pageSource]) {
      expect(source).not.toContain("company-score-ring");
      expect(source).not.toMatch(/CompanyScoreRing|trust_score|overall_score/);
    }
  });

  it("does not read the later slots: nothing to render until a source exists", () => {
    expect(component).not.toMatch(/view\.later|later\.|finishedWork|rosterByRole|proofFigures|openRoles|coverImageUrl/);
  });

  it("does not link the operator queue's request doors", () => {
    expect(component).not.toMatch(/\/requests?\b|customer_requests|\/intake|\/contact\b|<Link\b/);
  });

  it("brings no raw colour", () => {
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
