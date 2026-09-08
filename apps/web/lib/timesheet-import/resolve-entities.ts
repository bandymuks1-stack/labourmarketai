/**
 * TIMESHEET ENTITY RESOLUTION — pure. A label from a spreadsheet against the
 * company's real workers / objects.
 *
 * The one rule that shapes everything here: the resolver NEVER auto-picks
 * below an exact or single-unambiguous match. "Jonas" against two Jonases is
 * an `ambiguous` result carrying both candidates — the human chooses, because
 * hours recorded against the wrong person are exactly the defect a paper
 * timesheet never has. `unresolved` is equally honest: no invented matches.
 *
 * Matching is case- and diacritics-insensitive (the same sheet writes
 * "Peleniškės" and "Peleniskes") plus token-based containment, so
 * "Object 01" finds "Object 01 — Peleniškės" without a code column existing
 * anywhere (work_objects has none; the code lives in `name`).
 */

export type ResolveEntity = {
  readonly id: string;
  readonly name: string;
};

export type EntityResolution =
  | {
      readonly kind: "resolved";
      readonly id: string;
      readonly name: string;
      readonly match: "exact" | "unambiguous";
    }
  | { readonly kind: "ambiguous"; readonly candidates: readonly ResolveEntity[] }
  | { readonly kind: "unresolved" };

export const RESOLVE_MAX_CANDIDATES = 5;

/** Lowercase, diacritics stripped, punctuation collapsed to single spaces. */
export function normalizeLabel(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(normalized: string): readonly string[] {
  return normalized === "" ? [] : normalized.split(" ");
}

/** Every token of `a` appears in `b` (exact token or `b` token starts with it,
 *  so "Pelen" still finds "Peleniskes" while "01" never matches "010"). */
function tokensCovered(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0) return false;
  return a.every((ta) =>
    b.some((tb) => tb === ta || (ta.length >= 3 && tb.startsWith(ta))),
  );
}

/**
 * Resolve one sheet label against the provided entity list.
 *
 *   exactly one exact match        → resolved (match: "exact")
 *   several exact matches          → ambiguous — duplicate names are REAL
 *   exactly one partial match      → resolved (match: "unambiguous")
 *   several partial matches        → ambiguous, best-ranked first
 *   nothing                        → unresolved
 */
export function resolveEntityLabel(
  label: string,
  entities: readonly ResolveEntity[],
): EntityResolution {
  const wanted = normalizeLabel(label);
  if (wanted === "") return { kind: "unresolved" };

  const exact = entities.filter((e) => normalizeLabel(e.name) === wanted);
  if (exact.length === 1) {
    return { kind: "resolved", id: exact[0].id, name: exact[0].name, match: "exact" };
  }
  if (exact.length > 1) {
    return { kind: "ambiguous", candidates: exact.slice(0, RESOLVE_MAX_CANDIDATES) };
  }

  const wantedTokens = tokens(wanted);
  const scored = entities
    .map((entity) => {
      const entityNorm = normalizeLabel(entity.name);
      const entityTokens = tokens(entityNorm);
      let score = 0;
      if (tokensCovered(wantedTokens, entityTokens)) score += 2;
      else if (tokensCovered(entityTokens, wantedTokens)) score += 2;
      else if (
        wanted.length >= 3 &&
        (entityNorm.includes(wanted) || wanted.includes(entityNorm))
      ) {
        score += 1;
      }
      return { entity, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));

  if (scored.length === 1) {
    const { entity } = scored[0];
    return { kind: "resolved", id: entity.id, name: entity.name, match: "unambiguous" };
  }
  if (scored.length > 1) {
    return {
      kind: "ambiguous",
      candidates: scored.slice(0, RESOLVE_MAX_CANDIDATES).map((s) => s.entity),
    };
  }
  return { kind: "unresolved" };
}
