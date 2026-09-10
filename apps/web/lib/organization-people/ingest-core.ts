/**
 * BRINGING MANY REAL PEOPLE INTO AN ORGANIZATION'S ROSTER. Pure: no
 * server-only import, no IO, no env, no model call.
 *
 * ── WHAT THIS IS FOR ──────────────────────────────────────────────────────
 * `organization_people` is the canonical ORGANIZATION ↔ PERSON relationship:
 * a person an organization vouches for who NEED NOT HAVE AN ACCOUNT, with a
 * consent lifecycle (`unlinked` → `link_proposed` → `linked`) for connecting
 * them to a real LabourMarket person later. It is applied in production and
 * held 0 rows, because the evidence import READS the roster and nothing ever
 * populated it. This module is the missing half.
 *
 * It serves every actor from one architecture — a company's employees, an
 * agency's candidates and supplied workers, an institution's learners — by
 * saying nothing about who the organization is. The only thing that varies is
 * the RELATIONSHIP, and that is supplied, never inferred.
 *
 * ── WHAT IT REFUSES TO DO ─────────────────────────────────────────────────
 * It never invents a person. `ambiguous` and `unusable` are real, returnable
 * outcomes, and the only thing that may follow either is a question. Writing
 * one human's record under another's name is the worst failure available to
 * this feature, and a similar name is not an identity — the same rule the
 * evidence import already states, enforced with the same matcher rather than
 * a second opinion about the same names.
 *
 * It also never decides a relationship. An unresolved relationship makes a
 * row uncommittable; nothing is silently filed as `employee` because that is
 * the commonest value. `candidate → employee` and `student → employee` are
 * promotions only a human may make.
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────
 * Not a second CV or profile database. A roster row carries a NAME, an
 * optional employer-side reference and a provenance note. Professional
 * history, skills and qualifications belong to the person's own record and to
 * the evidence architecture — an organization's claim about someone is not
 * that person's claim about themselves, and neither is verified evidence.
 *
 * Not a governance path. Nothing here touches `company_memberships`: an
 * ordinary worker is never made a governance member to be represented.
 */
import {
  matchPerson,
  personKey,
  type PersonMatch,
  type PersonMatchMethod,
  type RosterPerson,
} from "@/lib/organization-evidence/person-matching";
import {
  MAX_ROWS_PER_SESSION,
  MAX_ROWS_PER_SUBMIT,
} from "@/lib/organization-evidence/source-rows";

/**
 * Bounds are REUSED from the evidence import rather than re-chosen, so one
 * organization's people and one organization's work records cannot disagree
 * about what "too much at once" means. 500 per batch, 20 000 per session —
 * a 5 000-person roster is forty batches, not a special case, and no number
 * of people is hard-coded anywhere in the product.
 */
export const MAX_PEOPLE_PER_BATCH = MAX_ROWS_PER_SUBMIT;
export const MAX_PEOPLE_PER_SESSION = MAX_ROWS_PER_SESSION;

/** Longest name the column accepts (`organization_people_display_name_check`). */
export const MAX_PERSON_NAME = 200;
/** Longest employer-side reference (`organization_people_external_ref_check`). */
export const MAX_EXTERNAL_REF = 120;

/**
 * The truthful relationships an organization may record.
 *
 * Mirrors `organization_people_relationship_kind_check`. `candidate` is added
 * by migration 20260910120000 (owner approval 2026-09-10) and is the reason
 * an agency no longer has to file a represented person as an `employee`.
 */
export const INGEST_RELATIONSHIPS = [
  "candidate",
  "employee",
  "former_employee",
  "agency_worker",
  "subcontractor",
  "contractor",
  "student",
  "graduate",
  "trainee",
  "apprentice",
  "programme_participant",
  "volunteer",
  "other",
] as const;
export type IngestRelationship = (typeof INGEST_RELATIONSHIPS)[number];

/**
 * Relationships that exist only once the `candidate` migration is applied.
 * Kept explicit so a caller can degrade honestly instead of writing a value
 * the database will refuse.
 */
export const RELATIONSHIPS_NEEDING_MIGRATION: readonly IngestRelationship[] = ["candidate"];

/** One person as a source file stated them. Nothing derived, nothing guessed. */
export interface PersonSource {
  readonly name: string;
  /** The organization's own reference (employee number, candidate id). */
  readonly externalRef?: string | null;
  /** Where this row came from — file and row. Provenance, never display. */
  readonly sourceNote?: string | null;
}

export type IngestDisposition =
  /** Not on the roster and not seen earlier in this batch: a new roster row. */
  | { readonly kind: "new" }
  /** Already a roster person. Re-importing does NOT create a second record. */
  | {
      readonly kind: "already_on_roster";
      readonly personId: string;
      readonly displayName: string;
      readonly method: PersonMatchMethod;
      readonly confidence: number;
    }
  /** The same person appears earlier in THIS batch (one file, or several). */
  | { readonly kind: "duplicate_in_batch"; readonly firstIndex: number }
  /** Several roster people could be meant. A question, never a guess. */
  | {
      readonly kind: "ambiguous";
      readonly candidates: readonly { readonly id: string; readonly displayName: string }[];
    }
  /** Not a usable person at all. Never written, never counted as a person. */
  | { readonly kind: "unusable"; readonly reason: "empty_name" | "name_too_long" };

export interface IngestPlanRow {
  readonly index: number;
  readonly source: PersonSource;
  /** The key both this matcher and the database index agree on. */
  readonly normalizedName: string;
  readonly disposition: IngestDisposition;
  /** `null` until a human says what these people are to the organization. */
  readonly relationship: IngestRelationship | null;
}

export interface IngestCounts {
  readonly total: number;
  readonly toCreate: number;
  readonly alreadyOnRoster: number;
  readonly duplicateInBatch: number;
  readonly ambiguous: number;
  readonly unusable: number;
}

export type IngestPlan =
  | {
      readonly kind: "plan";
      readonly rows: readonly IngestPlanRow[];
      readonly counts: IngestCounts;
      /** True when a human must answer something before anything may commit. */
      readonly needsReconciliation: boolean;
      /** True when the relationship is still unresolved. */
      readonly needsRelationship: boolean;
    }
  | { readonly kind: "too_many_rows"; readonly limit: number; readonly received: number };

const tidyName = (raw: string): string => String(raw ?? "").trim().replace(/\s+/g, " ");

/**
 * PLAN, DO NOT WRITE. Given what a file said and who is already on the
 * roster, decide for every row what it would mean — and say plainly which
 * rows a human still has to settle.
 *
 * Deterministic and offline: no model is consulted to decide who someone is.
 * That is not only cheaper, it is the only defensible way to answer a
 * question whose wrong answer attaches one person's record to another.
 */
export function planPeopleIngest(input: {
  readonly sources: readonly PersonSource[];
  readonly roster: readonly RosterPerson[];
  readonly relationship: IngestRelationship | null;
  /** Answers a human has already given to earlier ambiguities. */
  readonly resolutions?: readonly RowResolution[];
}): IngestPlan {
  const answered = new Map<number, RowResolution>(
    (input.resolutions ?? []).map((r) => [r.index, r]),
  );
  const sources = input.sources ?? [];
  if (sources.length > MAX_PEOPLE_PER_BATCH) {
    return {
      kind: "too_many_rows",
      limit: MAX_PEOPLE_PER_BATCH,
      received: sources.length,
    };
  }

  const rows: IngestPlanRow[] = [];
  /** normalized key → the index that already claimed it in THIS batch. */
  const seen = new Map<string, number>();

  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    const name = tidyName(source.name);
    const normalizedName = personKey(name);

    if (name === "" || normalizedName === "") {
      rows.push({
        index,
        source,
        normalizedName: "",
        disposition: { kind: "unusable", reason: "empty_name" },
        relationship: null,
      });
      continue;
    }
    if (name.length > MAX_PERSON_NAME) {
      rows.push({
        index,
        source,
        normalizedName,
        disposition: { kind: "unusable", reason: "name_too_long" },
        relationship: null,
      });
      continue;
    }

    // SAME PERSON TWICE IN ONE BATCH — one file listing them twice, or the
    // same person appearing in two of the uploaded CVs. Either way this is
    // ONE person and must not become two roster rows.
    const firstIndex = seen.get(normalizedName);
    if (firstIndex !== undefined) {
      rows.push({
        index,
        source,
        normalizedName,
        disposition: { kind: "duplicate_in_batch", firstIndex },
        relationship: null,
      });
      continue;
    }
    seen.set(normalizedName, index);

    // AGAINST THE ROSTER — the existing matcher, not a second opinion.
    const match: PersonMatch = matchPerson(
      { name, externalRef: source.externalRef ?? null },
      input.roster,
    );
    if (match.kind === "matched") {
      rows.push({
        index,
        source,
        normalizedName,
        disposition: {
          kind: "already_on_roster",
          personId: match.personId,
          displayName: match.displayName,
          method: match.method,
          confidence: match.confidence,
        },
        relationship: null,
      });
      continue;
    }
    if (match.kind === "ambiguous") {
      // A HUMAN MAY HAVE ALREADY ANSWERED THIS. Their answer settles which
      // reading was meant; it never merges two people and never widens to
      // rows they were not asked about.
      const answer = answered.get(index);
      if (answer?.choice === "existing") {
        const chosen = input.roster.find((p) => p.id === answer.personId);
        if (chosen) {
          rows.push({
            index,
            source,
            normalizedName,
            disposition: {
              kind: "already_on_roster",
              personId: chosen.id,
              displayName: chosen.displayName,
              method: "exact_name",
              confidence: 1,
            },
            relationship: null,
          });
          continue;
        }
        // An id that is not on this organization's roster is not an answer.
      }
      if (answer?.choice === "new") {
        rows.push({
          index,
          source,
          normalizedName,
          disposition: { kind: "new" },
          relationship: input.relationship,
        });
        continue;
      }
      rows.push({
        index,
        source,
        normalizedName,
        disposition: { kind: "ambiguous", candidates: match.candidates },
        relationship: null,
      });
      continue;
    }

    rows.push({
      index,
      source,
      normalizedName,
      disposition: { kind: "new" },
      relationship: input.relationship,
    });
  }

  const counts: IngestCounts = {
    total: rows.length,
    toCreate: rows.filter((r) => r.disposition.kind === "new").length,
    alreadyOnRoster: rows.filter((r) => r.disposition.kind === "already_on_roster").length,
    duplicateInBatch: rows.filter((r) => r.disposition.kind === "duplicate_in_batch").length,
    ambiguous: rows.filter((r) => r.disposition.kind === "ambiguous").length,
    unusable: rows.filter((r) => r.disposition.kind === "unusable").length,
  };

  return {
    kind: "plan",
    rows,
    counts,
    // An ambiguity is the ONLY thing that must be answered before a commit;
    // duplicates and already-known people are decided, they simply create
    // nothing. An unusable row is reported and skipped, never written.
    needsReconciliation: counts.ambiguous > 0,
    needsRelationship: input.relationship === null && counts.toCreate > 0,
  };
}

/**
 * A HUMAN'S ANSWER to one ambiguity.
 *
 * `existing` says "this row is that roster person" — it creates nothing.
 * `new` says "this is a different human who happens to share a name" — the
 * commonest real case, and the reason auto-merging on similarity is banned.
 * A resolution NEVER merges two people; it only says which of the two
 * possible readings the human meant.
 */
export type RowResolution =
  | { readonly index: number; readonly choice: "existing"; readonly personId: string }
  | { readonly index: number; readonly choice: "new" };

/** One row as it would be written. The ONLY shape the writer accepts. */
export interface PersonToCreate {
  readonly displayName: string;
  readonly normalizedName: string;
  readonly externalRef: string | null;
  readonly relationshipKind: IngestRelationship;
  readonly sourceNote: string | null;
}

/**
 * The rows a commit may write — and NOTHING else.
 *
 * Returns empty while anything is unresolved, so "commit" can never mean
 * "commit the easy ones and quietly drop the questions". A caller that wants
 * a partial commit has to settle the ambiguities first, which is the point.
 */
export function peopleToCreate(plan: IngestPlan): readonly PersonToCreate[] {
  if (plan.kind !== "plan") return [];
  if (plan.needsReconciliation || plan.needsRelationship) return [];
  const out: PersonToCreate[] = [];
  for (const row of plan.rows) {
    if (row.disposition.kind !== "new") continue;
    if (row.relationship === null) continue;
    const displayName = tidyName(row.source.name);
    const ref = row.source.externalRef?.trim() ?? "";
    const note = row.source.sourceNote?.trim() ?? "";
    out.push({
      displayName,
      normalizedName: row.normalizedName,
      externalRef: ref === "" ? null : ref.slice(0, MAX_EXTERNAL_REF),
      relationshipKind: row.relationship,
      // Provenance travels with the row: which file, which line.
      sourceNote: note === "" ? null : note.slice(0, 500),
    });
  }
  return out;
}
