import {
  RESOLVE_MAX_CANDIDATES,
  normalizeLabel,
  resolveEntityLabel,
  type EntityResolution,
  type ResolveEntity,
} from "@/lib/timesheet-import/resolve-entities";

/**
 * MATCHING A NAME IN A SPREADSHEET TO A PERSON THE COMPANY KNOWS. Pure.
 *
 * Built ON the timesheet importer's `resolveEntityLabel` (exact -> unambiguous
 * -> ambiguous -> unresolved, diacritics-folded, token-covered) rather than
 * beside it: one matching rule, already tested against the real "Peleniskes"
 * sheets, keeps the hours import and the history import agreeing about who
 * "J. Petraitis" is. This module adds only what a PERSON needs and an object
 * does not:
 *
 *   1. WORD ORDER IS NOT IDENTITY. Payroll writes "Petraitis Jonas", the
 *      timesheet writes "Jonas Petraitis". Sorting the tokens makes them one
 *      key - that key is what `organization_people.normalized_name` stores.
 *
 *   2. AN EMPLOYEE NUMBER BEATS A NAME. When the source carries one and the
 *      roster carries the same one, that is an identifier, not a guess.
 *
 *   3. THE MATCHER NEVER CREATES ANYONE. `unresolved` is a real answer, and
 *      the only thing that follows from it is a question for the human (or a
 *      deliberate, authorized "create this roster person" call). Inventing a
 *      person to make an import finish is the single worst failure available
 *      to this feature: it writes one human's work into another's history.
 *
 * CONFIDENCE IS REPORTED, NEVER ROUNDED UP. The numbers below are the ones
 * stored on the staging row and shown in the preview; nothing multiplies them
 * into a score or promotes a low one into a match.
 */

/** Match strengths, and the confidence each carries into the preview. */
export const PERSON_MATCH_CONFIDENCE = {
  /** The source's employee number equals a roster person's external_ref. */
  external_ref: 1,
  /** Same normalised, token-sorted name, exactly one candidate. */
  exact_name: 0.95,
  /** One unambiguous partial match (initials, a missing middle name). */
  unambiguous_name: 0.7,
} as const;

export type PersonMatchMethod = keyof typeof PERSON_MATCH_CONFIDENCE;

/** A roster person as the matcher sees them. */
export interface RosterPerson {
  readonly id: string;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly externalRef: string | null;
}

export type PersonMatch =
  | {
      readonly kind: "matched";
      readonly personId: string;
      readonly displayName: string;
      readonly method: PersonMatchMethod;
      readonly confidence: number;
    }
  | {
      readonly kind: "ambiguous";
      /** Every real candidate, so the human chooses by name rather than id. */
      readonly candidates: readonly { readonly id: string; readonly displayName: string }[];
    }
  | { readonly kind: "unmatched" };

/**
 * THE person key: diacritics folded, punctuation dropped, tokens sorted.
 *
 * "Petraitis, Jonas", "Jonas PETRAITIS" and "jonas petraitis" all become
 * "jonas petraitis". Stored on `organization_people.normalized_name`, so the
 * database index and the in-memory matcher agree by construction.
 */
export function personKey(rawName: string): string {
  const normalized = normalizeLabel(rawName);
  if (normalized === "") return "";
  return normalized.split(" ").filter(Boolean).sort().join(" ");
}

/** Resolve one written name (plus an optional employee number) against the
 *  organization's roster. */
export function matchPerson(
  written: { readonly name: string; readonly externalRef?: string | null },
  roster: readonly RosterPerson[],
): PersonMatch {
  const ref = written.externalRef?.trim();
  if (ref) {
    const byRef = roster.filter((p) => p.externalRef?.trim() === ref);
    if (byRef.length === 1) {
      return {
        kind: "matched",
        personId: byRef[0].id,
        displayName: byRef[0].displayName,
        method: "external_ref",
        confidence: PERSON_MATCH_CONFIDENCE.external_ref,
      };
    }
    if (byRef.length > 1) {
      // A duplicated employee number is a real data problem in the company's
      // own roster. Say so by asking, never by picking one.
      return {
        kind: "ambiguous",
        candidates: byRef
          .slice(0, RESOLVE_MAX_CANDIDATES)
          .map((p) => ({ id: p.id, displayName: p.displayName })),
      };
    }
  }

  const key = personKey(written.name);
  if (key === "") return { kind: "unmatched" };

  const exact = roster.filter((p) => p.normalizedName === key);
  if (exact.length === 1) {
    return {
      kind: "matched",
      personId: exact[0].id,
      displayName: exact[0].displayName,
      method: "exact_name",
      confidence: PERSON_MATCH_CONFIDENCE.exact_name,
    };
  }
  if (exact.length > 1) {
    // Two real people with the same name is normal and must never be guessed.
    return {
      kind: "ambiguous",
      candidates: exact
        .slice(0, RESOLVE_MAX_CANDIDATES)
        .map((p) => ({ id: p.id, displayName: p.displayName })),
    };
  }

  // Fall back to the shared label resolver for initials and partial names.
  const entities: readonly ResolveEntity[] = roster.map((p) => ({
    id: p.id,
    name: p.displayName,
  }));
  const resolution: EntityResolution = resolveEntityLabel(written.name, entities);
  if (resolution.kind === "resolved") {
    const hit = roster.find((p) => p.id === resolution.id);
    return {
      kind: "matched",
      personId: resolution.id,
      displayName: hit?.displayName ?? resolution.name,
      method: "unambiguous_name",
      confidence: PERSON_MATCH_CONFIDENCE.unambiguous_name,
    };
  }
  if (resolution.kind === "ambiguous") {
    return {
      kind: "ambiguous",
      candidates: resolution.candidates.map((c) => ({ id: c.id, displayName: c.name })),
    };
  }
  return { kind: "unmatched" };
}

/** The work object / project side. Thin on purpose: an object label has none
 *  of a person's identity risk, so the shared resolver is used unchanged and
 *  only the result shape is normalised for the preview. */
export type PlaceMatch =
  | {
      readonly kind: "matched";
      readonly workObjectId: string;
      readonly name: string;
      readonly confidence: number;
    }
  | {
      readonly kind: "ambiguous";
      readonly candidates: readonly { readonly id: string; readonly name: string }[];
    }
  | { readonly kind: "unmatched" }
  /** The source named no place at all - different from "named one we cannot
   *  find", and the preview must not confuse the two. */
  | { readonly kind: "absent" };

export function matchPlace(
  label: string | null | undefined,
  objects: readonly ResolveEntity[],
): PlaceMatch {
  if (!label || label.trim() === "") return { kind: "absent" };
  const resolution = resolveEntityLabel(label, objects);
  if (resolution.kind === "resolved") {
    return {
      kind: "matched",
      workObjectId: resolution.id,
      name: resolution.name,
      confidence: resolution.match === "exact" ? 0.95 : 0.7,
    };
  }
  if (resolution.kind === "ambiguous") {
    return { kind: "ambiguous", candidates: resolution.candidates.slice() };
  }
  return { kind: "unmatched" };
}
