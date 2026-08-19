import { Link } from "@/lib/i18n/navigation";
import type { ActiveLocale } from "@/lib/i18n/config";
import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import { formatUtcDate } from "@/lib/time/display";

/**
 * One anonymous vacancy row.
 *
 * Renders ONLY the fields the anonymous projection returns. There is no
 * employer, no location and no apply link to render here — the database
 * function never sends them — so this component cannot leak them by mistake.
 *
 * `employment_form` is `unknown` on ~half of production rows. An "unknown"
 * chip is noise pretending to be information, so unknown values are simply not
 * rendered rather than shown as a label.
 *
 * LANGUAGE OF PARTS (WCAG 3.1.2). The title and the occupation label are the
 * PUBLISHER'S own words — today 100% Swedish — rendered inside a page whose
 * document language is the reader's (`/lt`, `/ru`, …). Without a `lang` of
 * their own, a screen reader pronounces Swedish with Lithuanian or Russian
 * phonetics, which is not an accent but genuinely unintelligible speech. The
 * projection already carries `sourceLanguage`; it had no consumer until now.
 * Everything else on the card — the chips, the date — is OUR text in the
 * reader's language and is deliberately left alone.
 */

type L = Record<ActiveLocale, string>;

const EMPLOYMENT_FORM: Record<string, L> = {
  permanent: {
    en: "Permanent",
    lt: "Neterminuota",
    ru: "Постоянная",
    nl: "Vast",
    de: "Unbefristet",
  },
  temporary: {
    en: "Temporary",
    lt: "Terminuota",
    ru: "Временная",
    nl: "Tijdelijk",
    de: "Befristet",
  },
  seasonal: {
    en: "Seasonal",
    lt: "Sezoninis",
    ru: "Сезонная",
    nl: "Seizoenswerk",
    de: "Saisonal",
  },
};

const WORKING_TIME: Record<string, L> = {
  full_time: {
    en: "Full time",
    lt: "Visa darbo diena",
    ru: "Полная занятость",
    nl: "Voltijd",
    de: "Vollzeit",
  },
  part_time: {
    en: "Part time",
    lt: "Ne visa darbo diena",
    ru: "Частичная занятость",
    nl: "Deeltijd",
    de: "Teilzeit",
  },
};

const POSITIONS: L = {
  en: "positions",
  lt: "vietos",
  ru: "мест",
  nl: "plaatsen",
  de: "Stellen",
};

export function PublicVacancyCard({
  vacancy,
  locale,
  savedLabel,
}: {
  readonly vacancy: PublicVacancyPreview;
  readonly locale: ActiveLocale;
  /** Rendered only when the viewer has this ad in their OWN private bookmark
   *  list. It is a note to the person looking at their own screen — it reaches
   *  no employer and is never rendered for anyone else. */
  readonly savedLabel?: string;
}) {
  const chips: string[] = [];

  const form = vacancy.employmentForm
    ? EMPLOYMENT_FORM[vacancy.employmentForm]?.[locale]
    : undefined;
  if (form) chips.push(form);

  const time = vacancy.workingTime
    ? WORKING_TIME[vacancy.workingTime]?.[locale]
    : undefined;
  if (time) chips.push(time);

  if (vacancy.positions && vacancy.positions > 1) {
    chips.push(`${vacancy.positions} ${POSITIONS[locale]}`);
  }

  const published = formatUtcDate(vacancy.publishedAt, locale);
  // Only a plausible language subtag is emitted: a malformed value in the data
  // would produce invalid markup, and `undefined` correctly means "we do not
  // know", which is a different statement from "it is the page's language".
  const sourceLang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(
    vacancy.sourceLanguage ?? "",
  )
    ? (vacancy.sourceLanguage as string)
    : undefined;

  return (
    <Link
      href={`/jobs/${vacancy.id}`}
      className="block rounded-lg border p-4 transition-colors hover:bg-accent/40 focus-visible:outline focus-visible:outline-2"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 lang={sourceLang} className="text-base font-medium sm:text-lg">
          {vacancy.title}
        </h2>
        {savedLabel && (
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            {savedLabel}
          </span>
        )}
      </div>

      {vacancy.occupation && (
        <p lang={sourceLang} className="mt-1 text-sm text-muted-foreground">
          {vacancy.occupation}
        </p>
      )}

      {chips.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li
              key={c}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {c}
            </li>
          ))}
        </ul>
      )}

      {published && (
        <p className="mt-2 text-xs text-muted-foreground">{published}</p>
      )}
    </Link>
  );
}
