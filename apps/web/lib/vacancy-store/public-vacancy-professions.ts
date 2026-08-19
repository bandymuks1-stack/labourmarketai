import "server-only";

/**
 * THE PROFESSIONS A VISITOR CAN FILTER THE PUBLIC BOARD BY.
 *
 * WHY THIS FILE EXISTS. `search_public_vacancy_previews_v1` has taken a
 * `p_profession_slug` argument since the day it shipped, `searchPublicVacancyPreviews`
 * forwards it, and 17,145 of the browsable ads carry a `profession_slug` the
 * categorizer derived. The board never passed the argument. So the only way to
 * search 46,000 Swedish ads was to type the publisher's own Swedish words: a
 * Lithuanian welder had to guess "svetsare" to reach the 252 welding jobs the
 * platform had already classified for them. The taxonomy, the translations and
 * the query were all in place; the parameter was simply never wired.
 *
 * THE REGISTRY IS THE CATALOGUE, NOT A LIST HERE (doctrine §10). Profession
 * slugs live in `messages/{locale}/professions.json` — slug → per-locale name,
 * all 49 present in every active locale. This module reads the EN file for the
 * KEY SET only and hands the labelling back to next-intl, so adding a
 * profession stays a catalogue edit. A hardcoded array here would be exactly
 * the parallel structure the doctrine forbids, and it would drift the first
 * time the catalogue grew: `lib/skills/skill-groups.ts` already carries a
 * partial mirror of these slugs that is missing eleven of the professions with
 * live ads today (auto_mechanic, baker, barber, barista, hairdresser,
 * kitchen_helper, merchandiser, nail_technician, receptionist, recruiter,
 * handyman) — a working demonstration of the failure mode.
 *
 * ON OFFERING A PROFESSION WITH NO ADS. Ten catalogue professions have no live
 * vacancy right now, and this module does not hide them. Knowing which ten
 * would need a facet count per profession, which needs a new SECURITY DEFINER
 * function (`anon` holds no grant on `public_vacancies`) — a RED-class
 * migration, for a UI nicety. A filter that returns nothing is not a dead
 * button either: it is a search that answers honestly, and the board says so
 * by name ("No open jobs for Welder right now") with one click to clear it.
 */
import professionCatalogue from "../../messages/en/professions.json";

/** Every profession slug the catalogue defines. Sorted for a stable render. */
export const PUBLIC_VACANCY_PROFESSION_SLUGS: readonly string[] = Object.keys(
  professionCatalogue as Record<string, string>,
).sort();

const SLUG_SET = new Set(PUBLIC_VACANCY_PROFESSION_SLUGS);

/**
 * A URL parameter → a slug the catalogue knows, or null.
 *
 * CLOSED SET, not a clamp. The value reaches a SQL function argument, so an
 * unknown string must become "no filter" rather than be passed through: the
 * same rule the demand intake applies to its structured columns, and the same
 * reason `sanitizeSearchTerm` exists one layer down.
 */
export function readProfessionSlugParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw.trim();
  return SLUG_SET.has(slug) ? slug : null;
}
