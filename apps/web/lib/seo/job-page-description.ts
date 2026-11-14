/**
 * A job page's meta description from the ANONYMOUS projection only.
 *
 * Every /jobs/[id] page in a locale carried the SAME description ("Open
 * vacancy on LabourMarket.ai. Sign in to see …"), about 54,000 identical
 * descriptions per locale, with titles that are only the profession name. A
 * crawler then sees one page repeated, not 54,000 distinct ads.
 *
 * This builds the description from facts a signed-out reader is already shown
 * on the page: the occupation, the fact chips (pay, form, working time,
 * positions — exactly `vacancyFactChips`) and the publication date. Nothing
 * member-only (employer, place, raw title) can reach it, because the caller
 * passes the anonymous preview. Pure.
 */
import type { ActiveLocale } from "@/lib/i18n/config";

type L = Record<ActiveLocale, string>;

export const JOB_DESCRIPTION_MAX = 160;

const PUBLISHED: L = {
  en: "Published",
  lt: "Paskelbta",
  ru: "Опубликовано",
  nl: "Gepubliceerd",
  de: "Veröffentlicht",
  pl: "Opublikowano",
};

const TAIL: L = {
  en: "Sign in to see the employer, place and how to apply.",
  lt: "Prisijunk ir matysi darbdavį, vietą ir kaip kandidatuoti.",
  ru: "Войдите, чтобы увидеть работодателя, место и как откликнуться.",
  nl: "Log in voor werkgever, locatie en hoe te solliciteren.",
  de: "Anmelden für Arbeitgeber, Ort und Bewerbungsweg.",
  pl: "Zaloguj się, by zobaczyć pracodawcę, miejsce i jak aplikować.",
};

export function jobPageDescription(input: {
  readonly locale: ActiveLocale;
  readonly title: string;
  readonly chips: readonly string[];
  readonly published: string | null;
}): string {
  const { locale, title, published } = input;
  const date = published ? `${PUBLISHED[locale]} ${published}.` : "";
  // Drop chips from the end until it fits; then the date; the tail always stays.
  for (let n = input.chips.length; n >= 0; n--) {
    const head = n > 0 ? `${title} — ${input.chips.slice(0, n).join(" · ")}.` : `${title}.`;
    for (const d of [date, ""]) {
      const s = [head, d, TAIL[locale]].filter(Boolean).join(" ");
      if (s.length <= JOB_DESCRIPTION_MAX) return s;
    }
  }
  return `${title.slice(0, JOB_DESCRIPTION_MAX - TAIL[locale].length - 3)}. ${TAIL[locale]}`;
}
