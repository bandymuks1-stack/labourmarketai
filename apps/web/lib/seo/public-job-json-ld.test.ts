import { describe, expect, it } from "vitest";

import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import { buildJobDetailJsonLd, buildJobsListJsonLd } from "./public-job-json-ld";

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

describe("the structured name is the name the page shows (production 2026-10-15)", () => {
  const p = {
    id: "62fc92df-55b4-43f0-821c-96ac3dcaa1e5",
    title: null,
    professionSlug: "teacher",
    occupation: "Specialistofficer",
    employmentForm: null,
    workingTime: null,
    positions: null,
    compensationCurrency: null,
    compensationMin: null,
    compensationMax: null,
    sourceLanguage: "sv",
    sourceName: null,
    publishedAt: "2026-10-15T07:52:06+00:00",
  } as unknown as Parameters<typeof buildJobDetailJsonLd>[0]["preview"];

  it("detail: the localized heading name wins over the publisher's raw label", () => {
    const ld = buildJobDetailJsonLd({ origin: "https://labourmarket.ai", locale: "en", description: "d", preview: p, genericTitle: "Job opening", localizedName: "Teacher" });
    expect(ld.name).toBe("Teacher");
    expect((ld.about as { name: string }).name).toBe("Teacher");
  });

  it("detail: without a localized name the publisher label is still used (no invention)", () => {
    const ld = buildJobDetailJsonLd({ origin: "https://labourmarket.ai", locale: "en", description: "d", preview: p, genericTitle: "Job opening", localizedName: null });
    expect(ld.name).toBe("Specialistofficer");
  });

  it("list: the board's own name per row", () => {
    const ld = buildJobsListJsonLd({ origin: "https://labourmarket.ai", locale: "en", name: "n", description: "d", previews: [p], genericTitle: "Job opening", localizedName: () => "Teacher" });
    const items = (ld.mainEntity as { itemListElement: { name: string }[] }).itemListElement;
    expect(items[0].name).toBe("Teacher");
  });
});
