/**
 * VACANCY CATEGORIZATION — publisher text → the platform's own profession and
 * skill vocabulary.
 *
 * THIS MODULE ADDS NO ENGINE. It composes `deriveNeedSkills`
 * (lib/market/need-skills.ts) — the exact derivation the platform's own
 * demand intake uses — so an imported Swedish vacancy and a Lithuanian
 * employer's typed request are categorized by ONE recognizer, with one
 * catalogue, one profession lexicon and one set of offline language packs
 * (Swedish included: lib/structuring/language-packs/sv.ts). A second
 * categorizer would guarantee the two sides of the marketplace drift apart.
 *
 * WHY THERE IS NO LLM HERE (doctrine §7 / §7.1): the result of this stage
 * becomes a matching requirement. A requirement invented by a generative
 * model — non-deterministic, unattributable, unreproducible — cannot be shown
 * to a worker as "what this job needs". The recognition is deterministic and
 * every derived slug carries the publisher fragment that produced it.
 *
 * The output is ALWAYS suggestion-grade. `origin` is `"derived"` unless the
 * publisher's own taxonomy supplied the profession, and callers must render
 * it as a suggestion, never as an employer-stated requirement.
 *
 * Pure module: no IO, no env, no fetch, no Date.now.
 */
import {
  deriveNeedSkills,
  detectNeedProfession,
  type NeedSkillSource,
  type RecognizedNeedSkill,
} from "@/lib/market/need-skills";
import {
  VACANCY_IMPORT_BOUNDS,
  type VacancyFieldOrigin,
} from "./vacancy-contract";

export interface VacancyCategorizationInput {
  readonly titleRaw: string;
  readonly descriptionRaw: string;
  /** The publisher's own occupation label (e.g. a Swedish SSYK label). It is
   *  a publisher FACT and is tried first — it is a cleaner signal than a long
   *  ad body full of company boilerplate. */
  readonly occupationRaw: string | null;
}

export interface VacancyCategorizationV1 {
  readonly professionSlug: string | null;
  readonly skillSlugs: readonly string[];
  /** `publisher` only when the profession came from the publisher's own
   *  occupation label; `derived` in every other case. */
  readonly origin: VacancyFieldOrigin;
  /** Which tier of the shared derivation produced the skill set — null when
   *  nothing was derivable. Carried through so the UI can be honest about
   *  strength instead of presenting every set identically. */
  readonly skillSource: NeedSkillSource | null;
  /** The publisher fragments that triggered each recognized skill — the
   *  "why", so a human can check the pipeline rather than trust it. */
  readonly evidence: readonly RecognizedNeedSkill[];
  /** True when nothing at all was recognizable. An honest, common outcome
   *  for a short or boilerplate ad — NOT an error, and never backfilled. */
  readonly unrecognized: boolean;
}

/**
 * Categorize one vacancy. Deterministic: identical input always yields
 * identical output, which is what makes the derived slugs reproducible and
 * therefore auditable.
 */
/**
 * Publisher occupation labels (Arbetsförmedlingen's taxonomy) that name an
 * occupation NO catalogue profession covers, so a title word may not be used
 * to file the ad under one. MEASURED, not imagined: each entry was a
 * production title-fallback collision on 2026-10-15 (active ads where the
 * publisher's label was unrecognised and the title needle picked a different
 * trade). Matched case-insensitively on the WHOLE label, or the label's first
 * "/"-separated part. Extend only with a measured collision.
 */
export const PUBLISHER_OCCUPATIONS_OUTSIDE_CATALOGUE: readonly string[] = [
  "specialistofficer", //   "Militär lärare sjösäkerhet" → teacher
  "affärsutvecklare", //    "Business Developer" → software_developer
  "doktorand", //           "… elektroteknik" → electrician
  "bilrekonditionerare", // "Bil vårdare" → caregiver
  "hundtrimmare", //        "hundfrisör" → hairdresser
];

export function isPublisherOccupationOutsideCatalogue(label: string): boolean {
  const l = label.trim().toLocaleLowerCase("sv");
  if (!l) return false;
  const head = l.split("/")[0].trim();
  return PUBLISHER_OCCUPATIONS_OUTSIDE_CATALOGUE.some((o) => l === o || head === o);
}

export function categorizeVacancy(
  input: VacancyCategorizationInput,
): VacancyCategorizationV1 {
  const occupation = input.occupationRaw?.trim() ?? "";
  const title = input.titleRaw.trim();

  // 1. The publisher's own occupation label, if the profession lexicon knows
  //    it. This is the only path that yields origin "publisher".
  const fromOccupation =
    occupation.length > 0 ? detectNeedProfession(occupation) : null;

  // 2. Title-only fallback. The DESCRIPTION is deliberately EXCLUDED from
  //    profession detection: ad bodies routinely name OTHER professions
  //    ("our electricians", "kontakta din chef") and everyday words that
  //    collide with profession needles across languages (Swedish "chef" =
  //    manager, "driver" = runs). The 2026-08-14 production audit measured
  //    systematic mistags from exactly this — hundreds of nurse/retail ads
  //    tagged cook or driver by their body text. A title is short and, when
  //    it names a profession, names THIS ad's profession.
  //    EXCEPT when the publisher's label names an occupation that is known to
  //    lie OUTSIDE the catalogue (see PUBLISHER_OCCUPATIONS_OUTSIDE_CATALOGUE).
  //    Then the publisher has already said what the job is, and a title word
  //    must not overrule them: "Militär lärare sjösäkerhet" filed under
  //    "Specialistofficer" became `teacher`, "Business Developer" filed under
  //    "Affärsutvecklare" became `software_developer` (production 2026-10-15).
  //    The honest answer there is "no catalogue profession", not a guess.
  const publisherOutsideCatalogue =
    fromOccupation === null && isPublisherOccupationOutsideCatalogue(occupation);
  const fromTitle =
    fromOccupation ??
    (title.length > 0 && !publisherOutsideCatalogue ? detectNeedProfession(title) : null);
  const professionSlug = fromTitle;

  // 3. The shared derivation over the ad's own words — for SKILLS only.
  //    Skill recognition stays full-text: it matches curated activity
  //    phrases (fuzzy tier filtered out), which do not have the everyday-word
  //    collision problem profession needles have.
  const derived = deriveNeedSkills({
    title: input.titleRaw,
    needSummary: input.descriptionRaw,
    roleOrWorkType: occupation.length > 0 ? occupation : null,
    notes: null,
  });

  // A profession-expanded skill set is only as good as the profession it was
  // expanded FROM. When the full-text detection disagrees with the safe
  // label/title profession, the expansion inherited the body-text pollution
  // above — drop it rather than ship requirements from the wrong trade.
  const expansionPolluted =
    derived.source === "profession_expanded" &&
    derived.professionSlug !== professionSlug;
  const skillSlugs = (expansionPolluted ? [] : derived.skillSlugs).slice(
    0,
    VACANCY_IMPORT_BOUNDS.maxDerivedSkills,
  );

  return {
    professionSlug,
    skillSlugs,
    origin: fromOccupation !== null ? "publisher" : "derived",
    skillSource: skillSlugs.length > 0 ? derived.source : null,
    evidence: expansionPolluted ? [] : derived.recognized,
    unrecognized: professionSlug === null && skillSlugs.length === 0,
  };
}
