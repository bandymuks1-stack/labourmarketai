/**
 * Canonical Marketplace "mark shown" core (Stage B).
 *
 * PURE orchestration over injected ports — no IO of its own, so the honesty
 * rules below are unit-testable without a database, without mocks and without
 * a running Next.js server.
 *
 * The rules it encodes, straight from the owner decision:
 *   - a surface reports what it SHOWED, not what it loaded;
 *   - a repeat report is idempotent (identical normalized payload, and the
 *     store's conflict-is-a-no-op keeps `seen_at` at first-seen);
 *   - the ONE known, product-approved degradation is "the owner-gated store
 *     does not exist yet" → honest no-op;
 *   - anything unexpected is REPORTED, never swallowed into a fake success and
 *     never disguised as the approved degradation.
 */

import {
  normalizeShownIds,
  type MarkShownInput,
  type MarkShownOutcome,
} from "./worker-opportunities-contract";

/** What the repository/adapter layer may answer. Deliberately narrow: the
 *  adapter classifies driver errors ONCE, so no other layer ever needs to
 *  know a Postgres or PostgREST error code. */
export type SeenWriteResult =
  | { readonly kind: "ok"; readonly marked: number }
  /** The owner-gated store is genuinely absent (unapplied migration). */
  | { readonly kind: "feature_unavailable" }
  | { readonly kind: "not_authenticated" }
  /** Anything else — a real failure that must not be silently dropped. */
  | { readonly kind: "unexpected_error"; readonly message: string };

export interface MarkShownPorts {
  /** Record first-seen markers for the given ids. */
  readonly writeSeen: (
    ids: readonly string[],
  ) => Promise<SeenWriteResult>;
  /** Surface an unexpected failure to whatever observability exists. Called
   *  ONLY for genuinely unexpected states — never for the approved
   *  feature-unavailable degradation, which is not an error. */
  readonly reportUnexpected: (
    detail: { readonly surface: string; readonly message: string },
  ) => void;
}

export async function runMarkShown(
  ports: MarkShownPorts,
  input: MarkShownInput,
): Promise<MarkShownOutcome> {
  const ids = normalizeShownIds(input.shownRequestIds);
  if (ids.length === 0) {
    // Nothing was put in front of the human. Not an error, not a degradation,
    // and emphatically not a reason to claim the store is missing.
    return { available: null, persisted: false, reason: "nothing_shown", marked: 0 };
  }

  let result: SeenWriteResult;
  try {
    result = await ports.writeSeen(ids);
  } catch (err) {
    // A throwing adapter is an unexpected state by definition: the adapter's
    // contract is to CLASSIFY, so reaching here means something outside the
    // classified set happened.
    const message = err instanceof Error ? err.message : String(err);
    ports.reportUnexpected({ surface: input.surface, message });
    return {
      available: null,
      persisted: false,
      reason: "unexpected_error",
      marked: 0,
    };
  }

  switch (result.kind) {
    case "ok":
      return {
        available: true,
        persisted: true,
        reason: "persisted",
        marked: result.marked,
      };
    case "feature_unavailable":
      // The one approved silent degradation — the store provably does not
      // exist yet, so there is nothing to report and nothing to fix in code.
      return {
        available: false,
        persisted: false,
        reason: "feature_unavailable",
        marked: 0,
      };
    case "not_authenticated":
      return {
        available: null,
        persisted: false,
        reason: "not_authenticated",
        marked: 0,
      };
    case "unexpected_error":
      ports.reportUnexpected({
        surface: input.surface,
        message: result.message,
      });
      return {
        available: null,
        persisted: false,
        reason: "unexpected_error",
        marked: 0,
      };
  }
}
