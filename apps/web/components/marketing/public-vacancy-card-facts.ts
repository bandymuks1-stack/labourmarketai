import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import { utcDayKey } from "@/lib/time/display";

/**
 * WHAT `<PublicVacancyCard>` PAINTS FROM A ROW — a pure projection beside
 * the card, with no React and no navigation in it, so the server-only
 * landing reader (`lib/market/live-market-landing.ts`) can ask "would these
 * two rows paint the same card?" without pulling the card's `Link` and its
 * client navigation into its module graph.
 *
 * The card paints an employment-form or working-time chip ONLY for the keys
 * of its two label tables, listed here as the rendered key sets. Any other
 * value — `unknown`, which is about half of production rows, or
 * `assignment` — paints no chip, exactly as `null` does, and so projects to
 * `null` here. The positions chip exists only above one. The date is the
 * UTC day the card prints (`formatUtcDate`, whose day key this is), never
 * the time. The heading is NOT here: it is the caller's `headingFallback`
 * (the profession in the reader's language) or the occupation, so a caller
 * that needs to compare headings compares what it passed.
 *
 * WHY THE KEY SETS ARE DECLARED HERE AND NOT EXPORTED BY THE CARD. The card
 * file is a waived product-gate surface bound to specific pull requests
 * (`.github/scripts/owner-waivers.mjs`, the /jobs record): a PR outside
 * that list which modifies it — even by one export — is rejected as
 * `pr-not-covered`. So the card stays byte-identical and this module states
 * what it paints. The two are held together mechanically, not by memory:
 * `lib/guards/landing-open-jobs-band.test.ts` renders the real card over
 * every combination of the varying facts and proves two rows paint the
 * same markup exactly when they project the same facts, and it pins these
 * key sets to the card's own table keys read from its source. A label added
 * to the card without a key added here fails both.
 */

/** The keys of the card's `EMPLOYMENT_FORM` table — a chip exists for these. */
export const PUBLIC_VACANCY_CARD_EMPLOYMENT_FORMS: readonly string[] = [
  "permanent",
  "temporary",
  "seasonal",
];

/** The keys of the card's `WORKING_TIME` table — a chip exists for these. */
export const PUBLIC_VACANCY_CARD_WORKING_TIMES: readonly string[] = [
  "full_time",
  "part_time",
];

export type PublicVacancyCardFacts = {
  readonly employmentForm: string | null;
  readonly workingTime: string | null;
  readonly positions: number | null;
  readonly publishedDay: string | null;
};

/** The key itself when the card has a label for it, else `null`. */
const renderedKey = (
  painted: readonly string[],
  key: string | null,
): string | null => (key !== null && painted.includes(key) ? key : null);

export function publicVacancyCardFacts(
  vacancy: PublicVacancyPreview,
): PublicVacancyCardFacts {
  return {
    employmentForm: renderedKey(
      PUBLIC_VACANCY_CARD_EMPLOYMENT_FORMS,
      vacancy.employmentForm,
    ),
    workingTime: renderedKey(
      PUBLIC_VACANCY_CARD_WORKING_TIMES,
      vacancy.workingTime,
    ),
    positions:
      vacancy.positions && vacancy.positions > 1 ? vacancy.positions : null,
    publishedDay: utcDayKey(vacancy.publishedAt),
  };
}
