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
}: {
  readonly vacancy: PublicVacancyPreview;
  readonly locale: ActiveLocale;
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

  return (
    <Link
      href={`/jobs/${vacancy.id}`}
      className="block rounded-lg border p-4 transition-colors hover:bg-accent/40 focus-visible:outline focus-visible:outline-2"
    >
      <h2 className="text-base font-medium sm:text-lg">{vacancy.title}</h2>

      {vacancy.occupation && (
        <p className="mt-1 text-sm text-muted-foreground">{vacancy.occupation}</p>
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
