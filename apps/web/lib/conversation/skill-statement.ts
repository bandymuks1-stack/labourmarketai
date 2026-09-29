import { recognizeSkills } from "@/lib/structuring/skill-recognition";

/**
 * A SKILL SAID IN WORDS (owner continuation 2026-09-29, PERSON chat walk).
 * "Išmokau skaityti techninius brėžinius." scored 0 and the fallback showed
 * the profile-completeness card. The person's words are the claim; the one
 * write for a stated skill is the profile's own (`saveProfileSkillClaimsAction`
 * + catalogue promotion). This only reads the phrase after the learn/know verb
 * and which catalogue skills the journal's recogniser sees in it — nothing is
 * written here, nothing is marked verified. Pure.
 */
export interface SkillStatement {
  /** The person's own words for the skill (what is saved). */
  readonly phrase: string;
  /** Catalogue slugs the recogniser finds in the phrase (may be empty). */
  readonly slugs: readonly string[];
}

const VERB =
  /(?:^|[^\p{L}])(išmokau|ismokau|išmokęs|išmokusi|moku|gebu|sugebu|learned|learnt|i know how to|skilled in|научился|научилась|умею|gelernt|beherrsche|geleerd|beheers|nauczyłem się|nauczyłam się|potrafię|umiem)(?![\p{L}])/iu;

export function readSkillStatement(text: string): SkillStatement | null {
  const m = VERB.exec(text ?? "");
  if (!m) return null;
  const phrase = (text ?? "")
    .slice(m.index + m[0].length)
    .replace(/^[\s,:–—-]+/u, "")
    .replace(/[\s.!?;,]+$/u, "")
    .trim();
  if (phrase.length < 3 || phrase.length > 200) return null;
  return { phrase, slugs: recognizeSkills(phrase).map((r) => r.slug) };
}
