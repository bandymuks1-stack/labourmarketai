import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activeLocales } from "@/lib/i18n/config";
import { brandedTitle, buildPageMetadata } from "./metadata";
import { jobsCanonicalPath } from "./jobs-canonical";
import { buildJobsListJsonLd } from "./public-job-json-ld";
import {
  PROFESSION_PAGE_MIN_LIVE_ADS,
  browseByProfessionHeading,
  isProfessionPageIndexable,
  knownLiveCount,
  professionPageCopy,
} from "./jobs-profession-page";

const catalogue = (locale: string): Record<string, string> =>
  JSON.parse(
    readFileSync(join(process.cwd(), "messages", locale, "professions.json"), "utf8"),
  ) as Record<string, string>;

describe("profession page indexing follows real demand", () => {
  it("is indexable from the minimum number of live ads", () => {
    expect(isProfessionPageIndexable({ status: "ok", totalCount: PROFESSION_PAGE_MIN_LIVE_ADS })).toBe(true);
    expect(isProfessionPageIndexable({ status: "ok", totalCount: 4642 })).toBe(true);
  });

  it("a thin or empty profession is noindex", () => {
    expect(isProfessionPageIndexable({ status: "ok", totalCount: PROFESSION_PAGE_MIN_LIVE_ADS - 1 })).toBe(false);
    expect(isProfessionPageIndexable({ status: "ok", totalCount: 0 })).toBe(false);
    expect(isProfessionPageIndexable({ status: "not_provisioned" })).toBe(false);
  });

  it("a search that did not answer is unknown, never zero", () => {
    expect(isProfessionPageIndexable({ status: "unavailable" })).toBe(true);
    expect(knownLiveCount({ status: "unavailable" })).toBeNull();
    expect(knownLiveCount({ status: "ok", totalCount: 0 })).toBe(0);
  });
});

describe("profession page copy", () => {
  it("names the profession and the live count in every active locale", () => {
    for (const locale of activeLocales) {
      const name = catalogue(locale).welder;
      const copy = professionPageCopy(locale, name, 329);
      expect(copy.heading, locale).toContain(name);
      expect(copy.description, locale).toContain(name);
      expect(copy.description, locale).toContain("329");
      expect(copy.scopeNote, locale).toContain(name);
      expect(copy.allJobsLink.length, locale).toBeGreaterThan(0);
      expect(browseByProfessionHeading(locale).length, locale).toBeGreaterThan(0);
    }
  });

  it("states no count when the count is unknown", () => {
    for (const locale of activeLocales) {
      const copy = professionPageCopy(locale, catalogue(locale).cook, null);
      expect(copy.description, locale).not.toMatch(/\d/);
    }
  });

  it("no two professions share a title or a description", () => {
    for (const locale of activeLocales) {
      const names = Object.values(catalogue(locale));
      const headings = new Set(names.map((n) => professionPageCopy(locale, n, 50).heading));
      const descriptions = new Set(names.map((n) => professionPageCopy(locale, n, 50).description));
      expect(headings.size, locale).toBe(new Set(names).size);
      expect(descriptions.size, locale).toBe(new Set(names).size);
    }
  });

  it("every catalogue profession fits a search result (SEO-7)", () => {
    for (const locale of activeLocales) {
      for (const [slug, name] of Object.entries(catalogue(locale))) {
        for (const count of [null, 10, 123_456]) {
          const copy = professionPageCopy(locale, name, count);
          expect(brandedTitle(copy.heading).length, `${locale}.${slug} title`).toBeLessThanOrEqual(70);
          expect(copy.description.length, `${locale}.${slug} description`).toBeLessThanOrEqual(160);
          expect(copy.description.length, `${locale}.${slug} description`).toBeGreaterThanOrEqual(70);
        }
      }
    }
  });
});

describe("profession page head and structured data", () => {
  it("canonical and hreflang name the profession page in each locale", () => {
    const m = buildPageMetadata({
      locale: "en",
      path: jobsCanonicalPath({ profession: "welder" }),
      title: "Welder: open jobs",
    });
    expect(m.alternates?.canonical).toBe("https://labourmarket.ai/en/jobs?profession=welder");
    const langs = m.alternates?.languages as Record<string, string>;
    for (const locale of activeLocales) {
      expect(langs[locale]).toBe(`https://labourmarket.ai/${locale}/jobs?profession=welder`);
    }
    expect(langs["x-default"]).toBe("https://labourmarket.ai/en/jobs?profession=welder");
  });

  it("the list's own URL is the profession page; item URLs stay job pages", () => {
    const ld = buildJobsListJsonLd({
      origin: "https://labourmarket.ai",
      locale: "en",
      name: "Welder: open jobs",
      description: "d",
      previews: [],
      genericTitle: "Job opening",
      path: "/jobs?profession=welder",
    });
    expect(ld.url).toBe("https://labourmarket.ai/en/jobs?profession=welder");
    const board = buildJobsListJsonLd({
      origin: "https://labourmarket.ai",
      locale: "en",
      name: "Open jobs",
      description: "d",
      previews: [],
      genericTitle: "Job opening",
    });
    expect(board.url).toBe("https://labourmarket.ai/en/jobs");
  });
});

describe("the board page wires the profession page (source guard)", () => {
  const page = readFileSync(
    join(process.cwd(), "app", "[locale]", "(marketing)", "jobs", "page.tsx"),
    "utf8",
  );

  it("indexing is decided from the live read, with noindex,follow below the bar", () => {
    expect(page).toContain("isProfessionPageIndexable(read)");
    expect(page).toContain("robots: { index: false, follow: true }");
  });

  it("the slug reaches the canonical only through the closed catalogue set", () => {
    expect(page).toContain("jobsCanonicalPath({ ...sp, profession })");
    expect(page).toContain("const profession = readProfessionSlugParam(sp.profession);");
  });

  it("each profession is a plain crawlable link on the board", () => {
    expect(page).toContain("href={`/jobs?profession=${o.slug}`}");
    expect(page).toContain('data-testid="public-jobs-by-profession"');
  });
});
