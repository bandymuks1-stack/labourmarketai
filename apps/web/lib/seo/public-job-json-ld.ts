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
import type { ActiveLocale } from "@/lib/i18n/config";
import { isPublisherOccupationOutsideCatalogue } from "@/lib/vacancy-sources/publisher-occupation-conflicts";
import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";

/** Name shown when a public vacancy has neither a catalogue nor publisher label. */
export const PUBLIC_JOB_GENERIC_TITLE: Record<ActiveLocale, string> = {
  en: "Job opening",
  lt: "Darbo pasiūlymas",
  ru: "Вакансия",
  nl: "Vacature",
  de: "Stellenangebot",
  pl: "Oferta pracy",
  sv: "Ledigt jobb",
};

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

type PublicOccupation = Pick<PublicVacancyPreview, "occupation">;

/** Use the publisher label for known outside occupations. The stored slug
 * remains available to the existing search and ranking. */
export function publicJobCatalogueName(
  vacancy: PublicOccupation,
  localizedName: string | null | undefined,
): string | null {
  if (localizedName == null) return null;
  return isPublisherOccupationOutsideCatalogue(vacancy.occupation) ? null : localizedName;
}

/** The signed-out heading uses the catalogue name or the public publisher
 * occupation, with a generic heading when both are absent. */
export function publicJobName(
  vacancy: PublicOccupation,
  localizedName: string | null | undefined,
  genericTitle: string,
): string {
  return publicJobCatalogueName(vacancy, localizedName) ?? (vacancy.occupation?.trim() || genericTitle);
}

export function buildJobsListJsonLd(input: {
  readonly origin: string;
  readonly locale: string;
  readonly name: string;
  readonly description: string;
  readonly previews: readonly PublicVacancyPreview[];
  readonly genericTitle: string;
  readonly localizedName?: (preview: PublicVacancyPreview) => string | null;
  /** The listing's own path after the locale when it is not the board itself,
   *  e.g. `/jobs?profession=welder`. Item URLs never depend on it. */
  readonly path?: string;
}): Record<string, unknown> {
  const root = `${input.origin.replace(/\/$/, "")}/${input.locale}`;
  const base = `${root}/jobs`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: input.path ? `${root}${input.path}` : base,
    inLanguage: input.locale,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.previews.length,
      itemListElement: input.previews.map((p, i) => {
        const item: Record<string, unknown> = {
          "@type": "ListItem",
          position: i + 1,
          url: `${base}/${p.id}`,
          name: publicJobName(p, input.localizedName?.(p), input.genericTitle),
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
  readonly localizedName?: string | null;
}): Record<string, unknown> {
  const p = input.preview;
  const name = publicJobName(p, input.localizedName, input.genericTitle);
  const url = `${input.origin.replace(/\/$/, "")}/${input.locale}/jobs/${p.id}`;
  const about: Record<string, unknown> = {
    "@type": "Occupation",
    name,
  };
  const salary = salaryOf(p);
  if (salary) about.estimatedSalary = salary;
  const page: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description: input.description,
    url,
    inLanguage: input.locale,
    about,
  };
  if (p.publishedAt) page.datePublished = p.publishedAt;
  return page;
}
