import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkEvidenceDraft } from "@/lib/conversation/evidence-goal";
import { escoConceptLabels, lookupEscoConcepts } from "./esco-lookup";
import {
  ESCO_IS_NOT,
  isDisplayableLabel,
  isSafeLabelMatch,
  type EscoConceptType,
  type EscoLabelMatch,
  type EscoRead,
} from "./esco-semantics";

/**
 * REAL WORK → STANDARDISED MEANING, in the person's own words.
 *
 * This is the join the product has been missing, and it deliberately does NOT
 * use the platform's slug↔ESCO bridge — that bridge is empty (0 of 161 skills
 * carry an `esco_uri`), owner-gated as PR #1355, and reviewed on 2026-09-08 as
 * carrying at least three semantically wrong mappings. Waiting for it would
 * have meant waiting for a gate; using it would have meant inheriting its
 * errors.
 *
 * So the correspondence runs on what the PERSON actually wrote. The
 * deterministic recognizer already records the word that triggered each match
 * (`matchedTerms` — "pastolius", not a whole sentence and not an English
 * slug), and ESCO holds 1,045,186 labels across 28 locales. Looking one up in
 * the other is the whole mechanism: no bridge, no gate, no inference.
 *
 * ── WHAT THIS PRODUCES, AND WHAT IT REFUSES TO ────────────────────────────
 *
 * It produces: "the word you used denotes this ESCO concept, and here is that
 * concept in the language the employer speaks." That is an interoperability
 * fact about vocabulary.
 *
 * It refuses, structurally: every correspondence carries `isNot`, the same
 * `ESCO_IS_NOT` list the semantic core exports, because a standardised meaning
 * is not evidence the person did the work, not a verification, not a
 * qualification, not a credential, and not a measure of how good they are. The
 * evidence itself lives in the Work Journal and its confirmations; this only
 * says what the words mean.
 *
 * ── AND IT IS NOT A CONFIRMATION PATH ─────────────────────────────────────
 *
 * Nothing here writes. A correspondence is recomputed from the catalogue on
 * demand, so there is no stored mapping to go stale and no row that says a
 * person means something they no longer mean. Accepting or correcting a
 * recognised skill stays where it already is — the journal's append-only
 * accept/reject markers — and this module never touches it.
 */

export interface EvidenceEscoCorrespondence {
  /** The person's own word that produced this correspondence. */
  readonly term: string;
  /** The concept it denotes, with the label that matched and in which locale. */
  readonly match: EscoLabelMatch;
  /**
   * The same concept in the languages asked for — the cross-border half.
   * A Lithuanian worker's word and a Norwegian employer's word become
   * comparable here without either being translated away.
   */
  readonly alsoKnownAs: Readonly<Record<string, string>>;
}

export interface EvidenceCorrespondenceResult {
  readonly correspondences: readonly EvidenceEscoCorrespondence[];
  /** Carried on every result so no consumer can render a correspondence
   *  without the disclaimer that bounds it. */
  readonly isNot: readonly string[];
}

/** Cap per draft. These are read by a human, not exported. */
const MAX_TERMS = 3;

export interface EvidenceCorrespondenceInput {
  readonly draft: WorkEvidenceDraft;
  /** The language the person wrote in. REQUIRED — see the locale contract in
   *  esco-lookup.ts: a lookup without one is a ten-second query. */
  readonly sourceLocale: string;
  /** The languages to express the concept back in (an employer's, a
   *  destination country's). Empty is legitimate: the correspondence still
   *  stands, it is simply not translated. */
  readonly alsoIn?: readonly string[];
  readonly conceptType?: EscoConceptType;
}

/**
 * Resolve a work-evidence draft's recognised words to ESCO concepts.
 *
 * Returns `unavailable` rather than an empty list when the catalogue cannot be
 * read (SEP-7): "ESCO has nothing for these words" and "we could not ask ESCO"
 * are different answers, and only one of them means the person's words were
 * unusual.
 */
export async function escoCorrespondenceForEvidence(
  input: EvidenceCorrespondenceInput,
  client?: SupabaseClient,
): Promise<EscoRead<EvidenceCorrespondenceResult>> {
  const terms = [...new Set(input.draft.derived.matchedTerms)].slice(0, MAX_TERMS);
  if (terms.length === 0) {
    return { status: "ok", value: { correspondences: [], isNot: ESCO_IS_NOT } };
  }

  const conceptType: EscoConceptType = input.conceptType ?? "skill";
  const out: EvidenceEscoCorrespondence[] = [];

  for (const term of terms) {
    const found = await lookupEscoConcepts(
      { text: term, locales: [input.sourceLocale], conceptType, limit: 5 },
      client,
    );
    // One unreadable lookup makes the whole answer unavailable. Returning the
    // successful half would quietly present a PARTIAL correspondence as the
    // complete one, which is the failure mode this separation exists to stop.
    if (found.status !== "ok") return found;
    // EXACT LABELS ONLY, and this is the most important line in the file.
    //
    // Measured on production 2026-09-08, prefix-matching one recognizer term
    // against ESCO SKILL labels fails in two directions at once:
    //
    //   MISSES — ESCO phrases skills as ACTIONS ("statyti pastolius" = build
    //   scaffolding), while the recognizer's matched term is usually the NOUN
    //   from the person's sentence. Of four real terms taken from the live
    //   recognizer (klojinius, laminatą, metalo konstrukcij, Suvirinau), three
    //   matched nothing at all.
    //
    //   FALSE POSITIVES, which are worse — a bare verb prefix matches whatever
    //   skill happens to start with it. "montuoti" (to install) resolves to
    //   "montuoti ekranus", mount visual displays. A person who installed wall
    //   formwork would be told their work denotes display mounting, in an
    //   authoritative European vocabulary, with a straight face.
    //
    // A wrong signal is worse than none (the recognizer's own owner rule), so
    // this path accepts only a SAFE match: the exact label, or the term
    // followed by a parenthetical sense ("scaffolder (construction)"). See
    // isSafeLabelMatch, which was measured in both directions. That returns
    // few correspondences and no invented ones. The rich, reliable
    // direction is the other one — an occupation phrase resolves cleanly
    // ("pastolių montuotojas" → no "stillasarbeider") and an occupation
    // decomposes into its essential skills — and it is reached through
    // `lookupEscoConcepts` with conceptType "occupation", not through here.
    const best = found.value.find((m) => isSafeLabelMatch(term, m.matchedLabel));
    if (!best) continue;

    // The other half is a lookup BY CONCEPT, not by text: once the concept is
    // known, its label in every other language is already stored. Searching
    // each language by text again would be both slower and wrong — it could
    // land on a different concept that merely starts with the same letters.
    const alsoKnownAs: Record<string, string> = {};
    const wanted = (input.alsoIn ?? []).filter((l) => l !== input.sourceLocale);
    if (wanted.length > 0) {
      const labels = await escoConceptLabels(best.conceptId, conceptType, client);
      if (labels.status !== "ok") return labels;
      for (const locale of wanted) {
        const label = labels.value.preferredByLocale[locale];
        // A language ESCO has no preferred label for is simply absent. An
        // empty string would read as "this concept has no name there".
        if (label) alsoKnownAs[locale] = label;
      }
    }

    out.push({ term, match: best, alsoKnownAs });
  }

  return { status: "ok", value: { correspondences: out, isNot: ESCO_IS_NOT } };
}

/**
 * The label a human should be shown for a correspondence.
 *
 * ESCO's `hidden` labels are misspellings and deprecated forms: excellent for
 * RECOGNISING what someone typed, wrong for telling them what it is. When the
 * match came through one, the caller is told there is nothing displayable
 * rather than being handed a typo to render as a competency name.
 */
export function displayableLabelFor(c: EvidenceEscoCorrespondence): string | null {
  return isDisplayableLabel(c.match.labelType) ? c.match.matchedLabel : null;
}
