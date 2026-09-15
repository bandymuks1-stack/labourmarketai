import type { ReadinessRequirement } from "@/lib/country-readiness/types";

/**
 * FORMAL REQUIREMENT → WORKER EVIDENCE (A1).
 *
 * WHAT THIS IS. A reading. It looks at what a formal requirement asks for and
 * at what a person has actually recorded, and says whether the second covers
 * the first. Nothing more.
 *
 * ── WHAT THIS IS NOT, AND MUST NEVER BECOME ────────────────────────────────
 *
 * This is NOT recognition, NOT a qualification, NOT RPL, and NOT a statement
 * that the platform has certified anybody. The vocabulary is deliberately
 * evidential — `evidenced` / `not_evidenced` / `unknown` — and there is no way
 * to spell "qualified", "certified", "approved" or "recognised" in the output
 * type, because a derived reading that can be rendered as an authority act is
 * how a platform ends up vouching for competence it never assessed.
 *
 * Formal recognition requires an INDEPENDENT AUTHORIZED ASSESSOR and has legal
 * standing. That is a different capability with a different authority model,
 * and it is an open owner decision. This module is what can honestly be built
 * without one: show where the gap is, and leave the deciding to a competent
 * authority.
 *
 * ── ESCO IS NOT USED ON THIS PATH, AND SAYING SO IS THE POINT ──────────────
 *
 * The brief asked for an ESCO-linked comparison. `ReadinessRequirement` carries
 * `documentTypeSlug` and no ESCO concept, so there is nothing on the
 * requirement side to link TO: a legal requirement for an A1 certificate is a
 * document, not an occupation or a skill. Writing a mapping that silently
 * failed, or a `matches()` branch that always returned false under an ESCO
 * comment, would have described a capability this code does not have.
 *
 * So the only join used is the EXPLICIT one the requirement model already
 * guarantees. Requirements without it are `unknown` and say why. If ESCO-linked
 * comparison is wanted, the requirement model must first carry a concept — a
 * change to curated data, and an owner decision, not something to fake here.
 *
 * NO SCORE, NO RANK, on any path: no percentage, no confidence, no ordering.
 * A "72% match" against a legal requirement is a fabricated measurement with
 * real consequences for the person it is about.
 *
 * ── PROVENANCE TRAVELS, OR THE ANSWER DOES NOT ─────────────────────────────
 *
 * Every `evidenced` answer cites the rows that produced it, each carrying the
 * provenance the platform already records. A requirement covered only by a
 * self-declaration is `evidenced` AND says so — the caller decides what that
 * is worth. Stripping provenance would make a self-claim and a confirmed
 * record look identical, which is the one thing a requirement surface must
 * never do.
 *
 * ── UNKNOWN IS AN ANSWER (SEP-7) ───────────────────────────────────────────
 *
 * Issued when a source could not be read, or when the requirement carries no
 * machine-checkable link. Never `not_evidenced`: telling somebody they are
 * missing a document when the truth is that nobody looked is the same defect
 * as telling an employer a booked worker is free.
 *
 * PURE. No IO, no clock, no database.
 */

/** Evidential, never authoritative. There is deliberately no fourth state. */
export type RequirementEvidenceState = "evidenced" | "not_evidenced" | "unknown";

/** How the platform came to hold this evidence. Mirrors what is recorded. */
export type EvidenceProvenance =
  | "held_document"
  | "self_declared"
  | "work_journal"
  | "manager_confirmed";

/** One recorded thing the person actually has. */
export interface HeldEvidence {
  /** `document_types.slug` — the vocabulary requirements are keyed in. */
  readonly slug: string;
  readonly provenance: EvidenceProvenance;
  /** The row this came from, so a surface can link to it. Opaque. */
  readonly sourceId: string;
}

/** Why an answer could not be given. Each case named; none silent. */
export type EvidenceGap =
  /** The requirement carries no `documentTypeSlug`, so nothing about it is
   *  machine-checkable. This is a limit of the requirement DATA, and it is
   *  explicitly NOT the person's failing. */
  | { readonly reason: "requirement_not_checkable"; readonly key: string }
  /** A source of the person's evidence did not answer. */
  | { readonly reason: "evidence_unreadable"; readonly source: string };

export interface RequirementEvidenceRow {
  readonly requirementKey: string;
  readonly state: RequirementEvidenceState;
  /** The rows that produced an `evidenced` answer, provenance intact. */
  readonly citedEvidence: readonly HeldEvidence[];
  readonly gaps: readonly EvidenceGap[];
  /** Carried whole so a surface shows the official source, confidence and
   *  review date the requirement model already guarantees — never restated,
   *  never summarised, never separated from the claim it backs. */
  readonly requirement: ReadinessRequirement;
}

export interface RequirementEvidenceReading {
  readonly rows: readonly RequirementEvidenceRow[];
  readonly evidencedCount: number;
  readonly notEvidencedCount: number;
  readonly unknownCount: number;
  /**
   * True only when every requirement is affirmatively evidenced. Named for
   * what it is — a reading of evidence — and never "ready", "qualified" or
   * "compliant", none of which this module is entitled to say.
   */
  readonly allRequirementsEvidenced: boolean;
}

/**
 * Read a person's evidence against a set of formal requirements.
 *
 * `unreadableSources` is the caller's honest report of which evidence reads did
 * not answer. When it is non-empty, every requirement not already affirmatively
 * evidenced becomes `unknown` rather than `not_evidenced` — a missing document
 * and an unread document store are different facts, and only one of them is
 * about the person.
 */
export function readRequirementEvidence(input: {
  readonly requirements: readonly ReadinessRequirement[];
  readonly held: readonly HeldEvidence[];
  readonly unreadableSources?: readonly string[];
}): RequirementEvidenceReading {
  const unreadable = input.unreadableSources ?? [];
  const sourceGaps: readonly EvidenceGap[] = unreadable.map((source) => ({
    reason: "evidence_unreadable" as const,
    source,
  }));

  const rows: RequirementEvidenceRow[] = input.requirements.map((req) => {
    const base = { requirementKey: req.key, requirement: req } as const;

    // Not checkable at all — a limit of the requirement data, asked first so
    // it can never be reported as the person missing something.
    if (req.documentTypeSlug === null) {
      return {
        ...base,
        state: "unknown",
        citedEvidence: [],
        gaps: [{ reason: "requirement_not_checkable", key: req.key }, ...sourceGaps],
      };
    }

    const cited = input.held.filter((e) => e.slug === req.documentTypeSlug);
    if (cited.length > 0) {
      return { ...base, state: "evidenced", citedEvidence: cited, gaps: sourceGaps };
    }

    // Nothing matched. Only call that a miss if everything was actually read.
    if (unreadable.length > 0) {
      return { ...base, state: "unknown", citedEvidence: [], gaps: sourceGaps };
    }

    return { ...base, state: "not_evidenced", citedEvidence: [], gaps: [] };
  });

  const count = (s: RequirementEvidenceState) => rows.filter((r) => r.state === s).length;
  const evidencedCount = count("evidenced");

  return {
    rows,
    evidencedCount,
    notEvidencedCount: count("not_evidenced"),
    unknownCount: count("unknown"),
    allRequirementsEvidenced: rows.length > 0 && evidencedCount === rows.length,
  };
}
