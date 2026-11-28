import { describe, expect, it } from "vitest";

import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import { buildJobDetailJsonLd, buildJobsListJsonLd, PUBLIC_JOB_GENERIC_TITLE } from "./public-job-json-ld";

/**
 * K3 — anonymous JSON-LD for the public job pages must carry ONLY what the
 * privacy rule allows (position + salary) and never a JobPosting (which would
 * require the employer and the workplace).
 */
const preview: PublicVacancyPreview = {
  id: "a0191a16-0000-4000-8000-000000000001",
  title: null,
  professionSlug: "electrician",
  occupation: "Elektrikas",
  employmentForm: "permanent",
  workingTime: "full_time",
  positions: 2,
  compensationCurrency: "EUR",
  compensationMin: 2200,
  compensationMax: 2800,
  sourceLanguage: "lt",
  attributionCode: null,
  publishedAt: "2026-09-01T08:00:00Z",
};

const FORBIDDEN = /hiringOrganization|jobLocation|addressLocality|employer|application|description_raw|title_raw|JobPosting|arbetsformedlingen|contact/i;

describe("public job JSON-LD (K3)", () => {
  it("the list is a CollectionPage/ItemList of positions by occupation label — no employer, no location, no JobPosting", () => {
    const ld = buildJobsListJsonLd({
      origin: "https://labourmarket.ai/",
      locale: "lt",
      name: "Laisvos darbo vietos",
      description: "Gyvos darbo vietos.",
      previews: [preview, { ...preview, id: "a0191a16-0000-4000-8000-000000000002", occupation: null }],
      genericTitle: "Darbo pasiūlymas",
    });
    expect(ld["@type"]).toBe("CollectionPage");
    const list = ld.mainEntity as { numberOfItems: number; itemListElement: { name: string; url: string }[] };
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement[0]).toMatchObject({ position: 1, name: "Elektrikas", url: "https://labourmarket.ai/lt/jobs/a0191a16-0000-4000-8000-000000000001" });
    expect(list.itemListElement[1].name).toBe("Darbo pasiūlymas");
    expect(JSON.stringify(ld)).not.toMatch(FORBIDDEN);
  });

  it("the detail is a WebPage about an Occupation with the salary band only", () => {
    const ld = buildJobDetailJsonLd({ origin: "https://labourmarket.ai", locale: "en", description: "d", preview, genericTitle: "Job" });
    expect(ld["@type"]).toBe("WebPage");
    expect(ld.about).toEqual({
      "@type": "Occupation",
      name: "Elektrikas",
      estimatedSalary: { "@type": "MonetaryAmount", currency: "EUR", minValue: 2200, maxValue: 2800 },
    });
    expect(ld.datePublished).toBe("2026-09-01T08:00:00Z");
    expect(JSON.stringify(ld)).not.toMatch(FORBIDDEN);
  });

  it("never uses the publisher title even when present, and omits salary without a currency", () => {
    const ld = buildJobDetailJsonLd({
      origin: "https://labourmarket.ai",
      locale: "lt",
      description: "d",
      preview: { ...preview, title: "Väktare till Lunds Universitet", occupation: null, compensationCurrency: null },
      genericTitle: "Darbo pasiūlymas",
    });
    expect(JSON.stringify(ld)).not.toContain("Lunds");
    expect((ld.about as { name: string }).name).toBe("Darbo pasiūlymas");
    expect((ld.about as { estimatedSalary?: unknown }).estimatedSalary).toBeUndefined();
  });
});

describe("public headings in job structured data", () => {
  it.each([
    ["en", "Warehouse worker", "Job opening"],
    ["lt", "Sandėlio darbuotojas", "Darbo pasiūlymas"],
  ] as const)("uses the same %s heading on the list and detail", (locale, localizedName, fallback) => {
    const genericTitle = PUBLIC_JOB_GENERIC_TITLE[locale];
    expect(genericTitle).toBe(fallback);
    const origin = "https://labourmarket.ai";
    const description = "Open positions.";
    const vacancy = { ...preview, occupation: "Lagerarbetare", professionSlug: "warehouse_worker", title: "Private publisher title" };
    const outsideCatalogue = { ...vacancy, id: "a0191a16-0000-4000-8000-000000000002", occupation: "Specialistofficer", professionSlug: null };
    const missing = [null, "", "   "].map((occupation, index) => ({
      ...outsideCatalogue,
      id: `a0191a16-0000-4000-8000-00000000000${index + 3}`,
      occupation,
    }));
    const list = buildJobsListJsonLd({
      origin,
      locale,
      description,
      name: "Jobs",
      genericTitle,
      previews: [vacancy, outsideCatalogue, ...missing],
      localizedName: (row) => row.professionSlug === "warehouse_worker" ? localizedName : null,
    });
    const items = (list.mainEntity as { itemListElement: { name: string }[] }).itemListElement;
    expect(items.map(({ name }) => name)).toEqual([
      localizedName, "Specialistofficer", genericTitle, genericTitle, genericTitle,
    ]);

    const publicNames = [
      [vacancy, localizedName],
      [outsideCatalogue, "Specialistofficer"],
      ...missing.map((row) => [row, genericTitle] as const),
    ] as const;
    for (const [row, heading] of publicNames) {
      const detail = buildJobDetailJsonLd({
        origin, locale, description, preview: row, genericTitle,
        localizedName: row.professionSlug ? localizedName : null,
      });
      expect(detail.name).toBe(heading);
      expect(detail.about).toMatchObject({ name: heading });
      expect(JSON.stringify(detail)).not.toContain("Private publisher title");
      expect(JSON.stringify(detail)).not.toMatch(FORBIDDEN);
    }
    expect(JSON.stringify(list)).not.toContain("Private publisher title");
    expect(JSON.stringify(list)).not.toMatch(FORBIDDEN);
  });
});
