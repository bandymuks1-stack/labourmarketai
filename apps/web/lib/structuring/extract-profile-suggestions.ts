import {
  PROFESSION_HINTS_LT,
  SKILL_HINTS_LT,
  WORK_DIRECTION_HINTS_LT,
} from "./keywords";

/**
 * RULE-BASED suggestion extractor for free-text career narratives or pasted
 * CV text on the profile / skills onboarding step. This is NOT AI — it's a
 * lexicon + regex pass. Every suggestion must be confirmed by the user before
 * the platform treats it as a fact (§7).
 */
export type ProfileSuggestions = {
  /** Skill slugs the parser believes the worker mentioned. */
  skillSlugs: string[];
  /** Work-direction slugs (profession-style buckets). */
  workDirectionSlugs: string[];
  /** Profession slugs that match the narrative (possible roles). */
  professionSlugs: string[];
  /** Soft mention of years of experience (e.g. "8 metus", "5 metai"). */
  yearsOfExperience: number | null;
  /** Soft mention of headcount they led (e.g. "vadovavau 4 žmonių komandai"). */
  teamSize: number | null;
  /** Quick free-text CV entry candidates ("vadovavo 4 žmonių komandai"). */
  cvEntries: string[];
  /** Did the parser find anything at all worth showing? */
  hasAny: boolean;
};

const EMPTY: ProfileSuggestions = {
  skillSlugs: [],
  workDirectionSlugs: [],
  professionSlugs: [],
  yearsOfExperience: null,
  teamSize: null,
  cvEntries: [],
  hasAny: false,
};

function pickSlug(
  haystack: string,
  table: { slug: string; needles: string[] }[],
): string[] {
  const found = new Set<string>();
  for (const row of table) {
    for (const n of row.needles) {
      if (n && haystack.includes(n)) {
        found.add(row.slug);
        break;
      }
    }
  }
  return [...found];
}

export function extractProfileSuggestions(text: string): ProfileSuggestions {
  if (!text || text.trim().length === 0) return EMPTY;
  const lower = text.toLowerCase();

  const skillSlugs = pickSlug(lower, SKILL_HINTS_LT);
  const workDirectionSlugs = pickSlug(lower, WORK_DIRECTION_HINTS_LT);
  const professionSlugs = pickSlug(lower, PROFESSION_HINTS_LT);

  let yearsOfExperience: number | null = null;
  const years = lower.match(/(\d{1,2})\s*(?:met[uųaiosį]+|years|yrs?\.?)/i);
  if (years) {
    const v = Number(years[1]);
    if (Number.isFinite(v) && v >= 0 && v <= 60) yearsOfExperience = v;
  }

  let teamSize: number | null = null;
  const team = lower.match(
    /(?:vadovav\w*\s+|komand\w*\s+|brigad\w*\s+)(\d{1,3})\s*(?:žmonių|zmoniu|žmoni[uų]|asmen[uų]|narių|nariu)/i,
  );
  const teamFallback = lower.match(
    /(\d{1,3})\s*(?:žmonių|zmoniu|asmen[uų])\s*komand/i,
  );
  const t = team ?? teamFallback;
  if (t) {
    const v = Number(t[1]);
    if (Number.isFinite(v) && v > 0 && v < 1000) teamSize = v;
  }

  // CV entries — keep sentences that look like work history clauses (team /
  // years / supervised). Trimmed and de-duplicated.
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 240);
  const cvEntrySet = new Set<string>();
  for (const s of sentences) {
    const sl = s.toLowerCase();
    if (
      /vadovav|komand|brigad|met[uųaios]|projekt|objekt|dirba/.test(sl) ||
      sentences.length === 1
    ) {
      cvEntrySet.add(s);
    }
  }
  const cvEntries = [...cvEntrySet].slice(0, 6);

  const hasAny =
    skillSlugs.length > 0 ||
    workDirectionSlugs.length > 0 ||
    professionSlugs.length > 0 ||
    yearsOfExperience !== null ||
    teamSize !== null ||
    cvEntries.length > 0;

  return {
    skillSlugs,
    workDirectionSlugs,
    professionSlugs,
    yearsOfExperience,
    teamSize,
    cvEntries,
    hasAny,
  };
}
