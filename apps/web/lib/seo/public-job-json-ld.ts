/**
 * Public job pages — JSON-LD that can be emitted ANONYMOUSLY (FINAL COMPLETION
 * Train K3, 2026-09-02).
 *
 * The privacy rule (handoff §26, K1 PASS 2026-09-02): anonymously a job may
 * expose position and salary; employer, location, contact, application link
 * and the full text stay protected until registration/consent. That rules
 * OUT schema.org `JobPosting` (it requires `hiringOrganization`, and search
 * engines expect `jobLocation` — both protected). What CAN be said is the
 * page-level truth: a list of open positions with their salary bands, and a
 * page about one position — `CollectionPage`/`ItemList` and `WebPage`.
 *
 * PURE and built ONLY from `PublicVacancyPreview` — the same anonymous shape
 * the SQL preview functions return — so it is impossible for a protected
 * field to leak here by construction (the guard in
 * lib/guards/public-job-json-ld.test.ts pins the field set).
 */
import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";

type Salary = {
  readonly "@type": "MonetaryAmount";
  readonly currency: string;
  readonly minValue?: number;
  readonly maxValue?: number;
};

function salaryOf(p: PublicVacancyPreview): Salary | null {
  if (!p.compensationCurrency) return null;
  if (p.compensationMin === null && p.compensationMax === null) return null;
  const out: { "@type": "MonetaryAmount"; currency: string; minValue?: number; maxValue?: number } = {
    "@type": "MonetaryAmount",
    currency: p.compensationCurrency,
  };
  if (p.compensationMin !== null) out.minValue = p.compensationMin;
  if (p.compensationMax !== null) out.maxValue = p.compensationMax;
  return out;
}

/** The public name of a position: the ESCO occupation label the preview
 *  carries. The publisher's free-text title is NEVER used (it embeds the
 *  employer and the workplace — null on the anonymous path anyway). */
function positionName(p: PublicVacancyPreview, fallback: string): string {
  return p.occupation?.trim() || fallback;
}

export function buildJobsListJsonLd(input: {
  readonly origin: string;
  readonly locale: string;
  readonly name: string;
  readonly description: string;
  readonly previews: readonly PublicVacancyPreview[];
  readonly genericTitle: string;
}): Record<string, unknown> {
  const base = `${input.origin.replace(/\/$/, "")}/${input.locale}/jobs`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: base,
    inLanguage: input.locale,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.previews.length,
      itemListElement: input.previews.map((p, i) => {
        const item: Record<string, unknown> = {
          "@type": "ListItem",
          position: i + 1,
          url: `${base}/${p.id}`,
          name: positionName(p, input.genericTitle),
        };
        return item;
      }),
    },
  };
}

export function buildJobDetailJsonLd(input: {
  readonly origin: string;
  readonly locale: string;
  readonly description: string;
  readonly preview: PublicVacancyPreview;
  readonly genericTitle: string;
}): Record<string, unknown> {
  const p = input.preview;
  const url = `${input.origin.replace(/\/$/, "")}/${input.locale}/jobs/${p.id}`;
  const about: Record<string, unknown> = {
    "@type": "Occupation",
    name: positionName(p, input.genericTitle),
  };
  const salary = salaryOf(p);
  if (salary) about.estimatedSalary = salary;
  const page: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: positionName(p, input.genericTitle),
    description: input.description,
    url,
    inLanguage: input.locale,
    about,
  };
  if (p.publishedAt) page.datePublished = p.publishedAt;
  return page;
}
