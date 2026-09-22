import { readProfessionStatement } from "@/lib/structuring/role-label";
import { recognizeSkills, RECOGNITION_LIMIT } from "@/lib/structuring/skill-recognition";
import { guessDocumentType } from "@/lib/conversation/document-type-guess";

/**
 * COMPOUND STATEMENTS — one sentence, several facts (owner P0 2026-09-22 §1).
 *
 * THE MEASURED DEFECT. "Esu suvirintojas, 8 metus dirbu MIG/MAG, turiu VCA."
 * routed ENTIRELY to `add-document`, because "turiu VCA" outscored everything
 * else. The person stated four things and the product answered one of them —
 * the profession, the eight years and the process were dropped on the floor.
 * A natural sentence carries several facts, and forcing it through one route
 * is the defect.
 *
 * NOTHING NEW READS THE SENTENCE. Every fact below comes from a reader that
 * already existed and is already canonical somewhere:
 *
 *   profession + years  `readProfessionStatement`  (the chat's own
 *                       `professionStatement` handler uses it today)
 *   skills              `recognizeSkills`          (the Work Journal's
 *                       deterministic, catalogue-backed, NO-AI recogniser;
 *                       every hit carries the word that triggered it)
 *   credential          `guessDocumentType`        (what `startAddDocument`
 *                       already uses to pre-fill the document form)
 *
 * This module is a COMPOSER, not a fifth parser. It owns no vocabulary, no
 * lexicon and no catalogue, so it cannot invent a skill or a credential: a
 * fact exists here only because one of those readers found it in the text.
 *
 * DELIBERATELY NOT USED: `extractProfileSuggestions`. It is legacy — the
 * profile flow removed it as a proven duplicate system (owner production
 * smoke: it surfaced "Stogdengys" in a second bucket while the canonical one
 * stayed empty), and `lib/guards/profile-text-flow-wiring.test.ts` keeps it
 * out. Reviving it here would resurrect exactly that duplication.
 *
 * ── SELF-DECLARED IS THE ONLY VALUE THIS MODULE CAN PRODUCE ────────────────
 *
 * The owner's rule: "Do NOT automatically mark VCA as verified merely because
 * the user said they have it. Self-declared fact ≠ evidence-backed
 * credential."
 *
 * So `evidence` is the literal type `"self_declared"` — not a union, not a
 * default. There is no value an accident could set it to, and no branch that
 * could promote a sentence into evidence. Saying you hold a safety card is a
 * CLAIM; the card is the evidence, and the credential fact carries
 * `needsDocumentForEvidence: true` so the surface offers the document step
 * instead of congratulating the person on a qualification nobody has seen.
 *
 * SEP-3 (EVIDENCE ≠ VERIFICATION) and SEP-6 (DEMONSTRATED ≠ FORMAL ≠
 * RECOGNISED ≠ VALID) both live on this line.
 *
 * PROVENANCE IS NOT OPTIONAL. Every fact carries `statedAs` — the person's
 * own words that produced it — so a grouped confirmation can show WHY each
 * row appeared, and a persisted claim can say where it came from.
 *
 * Pure: no IO, no env, no clock, no JSX. Slugs and codes only; the surface
 * owns every sentence a human reads.
 */

export type CompoundFactKind = "profession" | "experience" | "skill" | "credential";

export interface CompoundFactV1 {
  readonly kind: CompoundFactKind;
  /**
   * The person's OWN words that produced this fact. Never a generated
   * phrase: a fact with no fragment from the text is a fact we invented.
   */
  readonly statedAs: string;
  /**
   * The canonical catalogue id, or null when the catalogue does not know
   * this yet. Null is honest and common — it must never be filled in with a
   * guess, because a wrong slug is a wrong skill on a person's profile.
   */
  readonly canonicalSlug: string | null;
  /**
   * ALWAYS `"self_declared"`. A sentence is a claim, never evidence — see
   * the header. The type has one member so this cannot drift.
   */
  readonly evidence: "self_declared";
  /** Only on the `experience` fact: the span the person stated. */
  readonly years?: number;
  /**
   * Only on `credential`: this claim becomes evidence when a document is
   * recorded, and not before. The surface uses it to offer that step.
   */
  readonly needsDocumentForEvidence?: true;
}

export interface CompoundStatementV1 {
  readonly facts: readonly CompoundFactV1[];
  /**
   * TWO OR MORE DISTINCT KINDS. One fact is not a compound statement — the
   * existing single-intent route already answers those correctly, and
   * hijacking them would be a regression dressed as a feature.
   */
  readonly isCompound: boolean;
}

/** Diacritic-insensitive lowercase, for comparing fragments of one sentence. */
function flat(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * THE PROFESSION WORD IS NOT ALSO A SKILL.
 *
 * `recognizeSkills` is built for Work Journal text, where "suvirintojas" in a
 * sentence about the day's work is good evidence of welding. In a PROFILE
 * statement it is the person naming their trade, and echoing it back as a
 * separate skill claim would turn one stated fact into two — an inference
 * dressed as something they said. Measured: a bare "Esu suvirintojas" came
 * back as profession + skill and was therefore treated as compound.
 *
 * So a skill whose trigger word IS the profession word is dropped. A skill
 * the person actually named separately ("MIG/MAG") is untouched, because its
 * trigger is a different fragment.
 */
function isSameFragmentAsProfession(matched: string, professionLabel: string | null): boolean {
  if (!professionLabel) return false;
  const a = flat(matched);
  const b = flat(professionLabel);
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}

/** The fragment of the original text around a matched word, for provenance. */
function statedFragment(text: string, matched: string): string {
  const trimmed = (matched ?? "").trim();
  if (!trimmed) return "";
  const at = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (at === -1) return trimmed;
  return text.slice(at, at + trimmed.length);
}

/**
 * Decompose ONE sentence into the facts it actually states.
 *
 * Returns `isCompound: false` for anything with fewer than two kinds, so the
 * caller leaves single-fact sentences on the route that already handles them.
 */
export function readCompoundStatement(text: string): CompoundStatementV1 {
  const raw = (text ?? "").trim();
  if (!raw) return { facts: [], isCompound: false };

  const facts: CompoundFactV1[] = [];

  // ── PROFESSION and the YEARS attached to it ────────────────────────────
  // One reader answers both, because "dirbu suvirintoju 8 metus" states them
  // in one clause. They are recorded as SEPARATE facts: a person can be a
  // welder with the span unstated, and the experience is its own claim.
  const profession = readProfessionStatement(raw);
  if (profession) {
    facts.push({
      kind: "profession",
      statedAs: profession.label,
      canonicalSlug: profession.professionSlug ?? null,
      evidence: "self_declared",
    });
    if (typeof profession.years === "number" && profession.years > 0) {
      facts.push({
        kind: "experience",
        statedAs: profession.label,
        canonicalSlug: profession.professionSlug ?? null,
        evidence: "self_declared",
        years: profession.years,
      });
    }
  }

  // ── SKILLS / PROCESSES ─────────────────────────────────────────────────
  // The Work Journal's recogniser, unchanged and uncapped-by-us beyond its
  // own limit. Only catalogue slugs come back, so "MIG/MAG" becomes
  // `mig-mag-welding` and an unknown process simply does not appear —
  // there is no branch here that could mint one.
  for (const skill of recognizeSkills(raw).slice(0, RECOGNITION_LIMIT)) {
    if (isSameFragmentAsProfession(skill.matchedText, profession?.label ?? null)) continue;
    facts.push({
      kind: "skill",
      statedAs: statedFragment(raw, skill.matchedText) || skill.matchedText,
      canonicalSlug: skill.slug,
      evidence: "self_declared",
    });
  }

  // ── CREDENTIAL ─────────────────────────────────────────────────────────
  // A stated card/certificate is a CLAIM about a document. It is recorded as
  // needing the document before it is evidence — the whole point of the
  // owner's VCA rule.
  const documentTypeSlug = guessDocumentType(raw);
  if (documentTypeSlug) {
    facts.push({
      kind: "credential",
      statedAs: raw,
      canonicalSlug: documentTypeSlug,
      evidence: "self_declared",
      needsDocumentForEvidence: true,
    });
  }

  const kinds = new Set(facts.map((f) => f.kind));
  return { facts, isCompound: kinds.size >= 2 };
}

/** The distinct kinds present, in the fixed order a surface should render. */
export const COMPOUND_FACT_ORDER: readonly CompoundFactKind[] = [
  "profession",
  "experience",
  "skill",
  "credential",
];

/**
 * i18n codes for each kind's row label. Codes, never sentences — a technical
 * kind must never reach a screen.
 */
export const COMPOUND_FACT_LABEL_CODE: Readonly<Record<CompoundFactKind, string>> = {
  profession: "compoundStatement.kind.profession",
  experience: "compoundStatement.kind.experience",
  skill: "compoundStatement.kind.skill",
  credential: "compoundStatement.kind.credential",
};
