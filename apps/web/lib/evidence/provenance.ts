import { deriveEvidenceTier } from "@/lib/evidence/evidence-tier";
import { deriveReviewResult, type ConfirmationRow } from "@/lib/journal/review-status";

/**
 * PROVENANCE — THE ONE derivation of "why believe this" (frozen design
 * contract 2026-09-05 §2.9, §5 P2/P6; design system A.5 and M; owner
 * contract §14 evidence classes).
 *
 * Extends the canonical evidence-tier ladder (`lib/evidence/evidence-tier.ts`)
 * — it does NOT reinterpret a `worker_skills` row; it composes the tier with
 * the other canonical evidence rows into the design's provenance CLASSES and
 * carries the facts the text equivalent needs (who confirmed, when, how many
 * entries, valid until, derived from what).
 *
 * Classes (design system M):
 *   SELF_DECLARED       dashed grey edge   · "iš CV, nepatvirtinta"
 *   EVIDENCE_SUPPORTED  cyan edge          · "N žurnalo įrašų" / "sertifikatas iki …"
 *   EMPLOYER_CONFIRMED  gold edge          · "patvirtino <org>, <date>"
 *   SYSTEM_DERIVED      dotted edge        · "išvesta iš …"
 * THIRD_PARTY_CONFIRMED is NOT derived here: no canonical third-party source
 * exists yet, so the class is left out rather than faked (§1.9).
 *
 * Rules, in precedence order:
 *   1. a derived value is SYSTEM_DERIVED, whatever backs its inputs — the
 *      reader must see that it is a computation, not a record;
 *   2. EMPLOYER_CONFIRMED only from real confirmation rows whose latest-wins
 *      review result is `approved` (the SAME rule the journal list uses), or
 *      from `worker_skills.verified === true` (the tier ladder's only path to
 *      its top rung). The confirming organisation is whatever the caller could
 *      READ — an unreadable name stays `null` and renders as a dash, never as
 *      an invented confirmer. AI never raises the class (M: "AI siūlo,
 *      niekada nepakelia");
 *   3. EVIDENCE_SUPPORTED from the person's own journal entries linked to the
 *      subject, a `work_journal`-tier skill row, or a recorded document;
 *   4. otherwise SELF_DECLARED — never inflated.
 *
 * PURE: no IO, no clock, no copy. Text comes from the `provenance` i18n
 * namespace through `provenanceTextKey` + `provenanceTextParams`; the edge
 * material lives in ONE component (components/app/provenance/provenance-edge).
 */

export type ProvenanceClass =
  | "SELF_DECLARED"
  | "EVIDENCE_SUPPORTED"
  | "EMPLOYER_CONFIRMED"
  | "SYSTEM_DERIVED";

/** A confirmation row as the caller read it, plus the readable organisation. */
export interface ProvenanceConfirmation extends ConfirmationRow {
  /** The confirming organisation's readable name, or null when the caller
   *  could not read it. Never a placeholder. */
  readonly organizationName: string | null;
}

export interface ProvenanceInput {
  /** The canonical `worker_skills` row for the subject, when there is one. */
  readonly skill?: { readonly verified?: boolean | null; readonly source?: string | null } | null;
  /** Real `journal_entry_confirmations` rows that cover the subject. */
  readonly confirmations?: readonly ProvenanceConfirmation[] | null;
  /** Count of the person's own journal entries linked to the subject. */
  readonly journalEntries?: number | null;
  /** A recorded document that covers the subject (validity as stored). */
  readonly document?: { readonly validUntil: string | null } | null;
  /** Set when the value is a computation over records — names its source
   *  (a slug the consumer localises), e.g. "requirement-ledger". */
  readonly derivedFrom?: string | null;
}

export type Provenance =
  | { readonly class: "SELF_DECLARED" }
  | {
      readonly class: "EVIDENCE_SUPPORTED";
      readonly journalEntries: number;
      readonly validUntil: string | null;
    }
  | {
      readonly class: "EMPLOYER_CONFIRMED";
      /** Readable confirming organisation, or null → rendered as a dash. */
      readonly confirmedBy: string | null;
      /** ISO timestamp of the newest approving row, or null (verified flag only). */
      readonly confirmedAt: string | null;
    }
  | { readonly class: "SYSTEM_DERIVED"; readonly derivedFrom: string };

/** Strongest-real-class-wins comparisons (a person's edge = the strongest
 *  class among their own evidence). SYSTEM_DERIVED is not on the ladder: a
 *  derivation never outranks or underranks a record — it is a different kind. */
export const PROVENANCE_RANK: Record<Exclude<ProvenanceClass, "SYSTEM_DERIVED">, number> = {
  SELF_DECLARED: 0,
  EVIDENCE_SUPPORTED: 1,
  EMPLOYER_CONFIRMED: 2,
};

function cleanName(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function newestApproved(
  rows: readonly ProvenanceConfirmation[],
): ProvenanceConfirmation | null {
  // Latest-wins per the journal's own rule: the SET must currently read as
  // approved, and then the newest approving row names the confirmer/time.
  if (deriveReviewResult(rows) !== "approved") return null;
  let best: ProvenanceConfirmation | null = null;
  for (const r of rows) {
    if (deriveReviewResult([r]) !== "approved") continue;
    if (best === null) {
      best = r;
      continue;
    }
    const tb = best.created_at ? Date.parse(best.created_at) : 0;
    const tr = r.created_at ? Date.parse(r.created_at) : 0;
    if (tr > tb) best = r;
  }
  return best;
}

/** THE provenance derivation. */
export function deriveProvenance(input: ProvenanceInput): Provenance {
  const derivedFrom = cleanName(input.derivedFrom);
  if (derivedFrom) return { class: "SYSTEM_DERIVED", derivedFrom };

  const confirmations = input.confirmations ?? [];
  const approved = confirmations.length > 0 ? newestApproved(confirmations) : null;
  const tier = input.skill ? deriveEvidenceTier(input.skill) : "self_declared";

  if (approved || tier === "manager_confirmed") {
    return {
      class: "EMPLOYER_CONFIRMED",
      confirmedBy: approved ? cleanName(approved.organizationName) : null,
      confirmedAt: approved?.created_at ?? null,
    };
  }

  const journalEntries = Math.max(0, Math.floor(input.journalEntries ?? 0));
  const document = input.document ?? null;
  if (journalEntries > 0 || tier === "work_journal" || document) {
    return {
      class: "EVIDENCE_SUPPORTED",
      journalEntries,
      validUntil: document?.validUntil ?? null,
    };
  }

  return { class: "SELF_DECLARED" };
}

/** The strongest of several provenances (a person over their skills). A
 *  derivation is skipped — it is not a record about the person. */
export function strongestProvenance(list: readonly Provenance[]): Provenance {
  let best: Provenance = { class: "SELF_DECLARED" };
  for (const p of list) {
    if (p.class === "SYSTEM_DERIVED") continue;
    if (best.class === "SYSTEM_DERIVED") {
      best = p;
      continue;
    }
    if (PROVENANCE_RANK[p.class] > PROVENANCE_RANK[best.class]) best = p;
  }
  return best;
}

/**
 * The i18n key (namespace `provenance`) of the text equivalent — the edge is
 * NEVER the only signal (design M; a11y S). One key per rendered fact shape.
 */
export type ProvenanceTextKey =
  | "selfDeclared"
  | "evidenceEntries"
  | "evidenceDocument"
  | "evidenceEntriesAndDocument"
  | "employerConfirmed"
  | "employerConfirmedNoDate"
  | "systemDerived";

export function provenanceTextKey(p: Provenance): ProvenanceTextKey {
  switch (p.class) {
    case "SELF_DECLARED":
      return "selfDeclared";
    case "EVIDENCE_SUPPORTED":
      if (p.validUntil && p.journalEntries > 0) return "evidenceEntriesAndDocument";
      if (p.validUntil) return "evidenceDocument";
      return "evidenceEntries";
    case "EMPLOYER_CONFIRMED":
      return p.confirmedAt ? "employerConfirmed" : "employerConfirmedNoDate";
    case "SYSTEM_DERIVED":
      return "systemDerived";
  }
}

/** The dash that stands for a confirmer the caller could not read. */
export const PROVENANCE_UNREADABLE_CONFIRMER = "—";

/**
 * Parameters for the text key. Dates are formatted by the caller-supplied
 * formatter so the same fact reads in the viewer's locale; `source` for a
 * derivation is passed through already localised by the caller.
 */
export function provenanceTextParams(
  p: Provenance,
  format: { readonly date: (iso: string) => string; readonly source?: (slug: string) => string },
): Record<string, string | number> {
  switch (p.class) {
    case "SELF_DECLARED":
      return {};
    case "EVIDENCE_SUPPORTED":
      return {
        count: p.journalEntries,
        ...(p.validUntil ? { until: format.date(p.validUntil) } : {}),
      };
    case "EMPLOYER_CONFIRMED":
      return {
        org: p.confirmedBy ?? PROVENANCE_UNREADABLE_CONFIRMER,
        ...(p.confirmedAt ? { date: format.date(p.confirmedAt) } : {}),
      };
    case "SYSTEM_DERIVED":
      return { source: format.source ? format.source(p.derivedFrom) : p.derivedFrom };
  }
}
