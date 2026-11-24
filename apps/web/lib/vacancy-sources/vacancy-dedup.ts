/**
 * VACANCY DEDUPLICATION — the stage that keeps one ad one row.
 *
 * Three distinct collisions have to be told apart, because they need
 * different outcomes:
 *
 *   1. REPLAY — the identical ad, identical content. Seen when the snapshot
 *      and the stream overlap, or the importer re-runs. Outcome: `duplicate`,
 *      counted, not stored again.
 *   2. REVISION — the same ad (same provider + external id) with different
 *      content. The employer edited it. Outcome: `revision`, stored, and it
 *      SUPERSEDES the row we hold. Treating this as a duplicate would freeze
 *      a stale salary forever; treating it as new would show the same job
 *      twice.
 *   3. WITHDRAWAL — the stream says the ad was removed. Outcome: `removal`,
 *      applied to the row we hold. Never a new row.
 *
 * Within a single batch the LAST occurrence of an ad wins, ordered by the
 * publisher's own `publishedAt` and then by input order — a stream batch can
 * legitimately carry two states of one ad, and the newer one is the truth.
 *
 * Pure module: no IO, no env, no fetch, no Date.now.
 */
import type { PublicVacancyV1 } from "./vacancy-contract";
import { vacancyIdentityKey } from "./vacancy-hash";

export type VacancyDedupOutcome =
  | "new"
  | "revision"
  | "removal"
  | "duplicate";

export interface VacancyDedupDecision {
  readonly vacancy: PublicVacancyV1;
  readonly outcome: VacancyDedupOutcome;
  /** The identity key the decision was made against. */
  readonly identityKey: string;
}

export interface VacancyDedupState {
  /** Content hashes already stored — the replay detector. */
  readonly knownContentHashes: ReadonlySet<string>;
  /** identityKey → the content hash currently stored for that ad. */
  readonly knownIdentityHashes: ReadonlyMap<string, string>;
}

export interface VacancyDedupResult {
  readonly decisions: readonly VacancyDedupDecision[];
  /** Records to persist: everything that is not a replay. */
  readonly toPersist: readonly PublicVacancyV1[];
  readonly counts: {
    readonly new: number;
    readonly revision: number;
    readonly removal: number;
    readonly duplicate: number;
  };
}

/** Newest-wins ordering inside one batch: publishedAt, then input order. */
function pickLatest(
  a: { v: PublicVacancyV1; i: number },
  b: { v: PublicVacancyV1; i: number },
): { v: PublicVacancyV1; i: number } {
  const aMs = Date.parse(a.v.publishedAt);
  const bMs = Date.parse(b.v.publishedAt);
  if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
    return aMs > bMs ? a : b;
  }
  return b.i > a.i ? b : a;
}

/**
 * Collapse a batch, then classify each survivor against what is already
 * stored. `state` describes storage; the function itself reads nothing.
 */
export function dedupeVacancies(
  batch: readonly PublicVacancyV1[],
  state: VacancyDedupState,
): VacancyDedupResult {
  // Pass 1 — collapse within the batch, newest per identity wins.
  const collapsed = new Map<string, { v: PublicVacancyV1; i: number }>();
  batch.forEach((v, i) => {
    const key = vacancyIdentityKey(v.providerKey, v.externalId);
    const existing = collapsed.get(key);
    collapsed.set(key, existing ? pickLatest(existing, { v, i }) : { v, i });
  });

  // Pass 2 — classify against storage, preserving the batch's own order so
  // the report reads in the order the provider sent it.
  const ordered = [...collapsed.values()].sort((a, b) => a.i - b.i);
  const decisions: VacancyDedupDecision[] = [];
  const toPersist: PublicVacancyV1[] = [];
  const counts = { new: 0, revision: 0, removal: 0, duplicate: 0 };

  for (const { v } of ordered) {
    const identityKey = vacancyIdentityKey(v.providerKey, v.externalId);
    const storedHash = state.knownIdentityHashes.get(identityKey);

    let outcome: VacancyDedupOutcome;
    if (v.lifecycle === "removed") {
      // A withdrawal for an ad we never held is not an error and not a row —
      // it is simply nothing to do, and counts as a replay of "absent".
      outcome = storedHash === undefined ? "duplicate" : "removal";
    } else if (state.knownContentHashes.has(v.contentHash)) {
      outcome = "duplicate";
    } else if (storedHash !== undefined) {
      outcome = "revision";
    } else {
      outcome = "new";
    }

    decisions.push({ vacancy: v, outcome, identityKey });
    counts[outcome] += 1;
    if (outcome !== "duplicate") toPersist.push(v);
  }

  return { decisions, toPersist, counts };
}

/** Convenience: an empty state, for a cold start or a dry run. */
export function emptyDedupState(): VacancyDedupState {
  return {
    knownContentHashes: new Set<string>(),
    knownIdentityHashes: new Map<string, string>(),
  };
}
