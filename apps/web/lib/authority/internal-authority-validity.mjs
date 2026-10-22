// INTERNAL AUTHORITY VALIDITY — the one rule every internal approval inherits
// (owner P0 2026-10-22, all projects; mirrors Agentai OS
// `agent-control-center/src/authority/internal-authority-validity.ts`).
//
//   1. An internal approval, owner decision, internal contract or temporary
//      internal permission is valid for 12 months.
//   2. It renews automatically for another 12 months, term after term, without
//      the owner and without waiting for the end.
//   3. No 24 h / 72 h / 7-day / 30-day internal expiry unless the owner set one
//      for that specific item (the caller keeps that owner-set term).
//   4. Renewal is TIME only: never a wider scope, a new source, a higher rate, a
//      new authority — and never past a revocation, which stays the owner's.
//
// WHAT THIS IS NOT. It never extends:
//   - FACT FRESHNESS — advert / vacancy recency, verification age, measured
//     data: a fact is as current as its last measurement and is re-measured,
//     never re-dated;
//   - external legal permits, certificates, credentials and their validity;
//   - OAuth / API tokens and keys, session / auth tokens, signed URLs;
//   - invitation and magic links, password-reset links, one-shot security
//     codes, confirmation tokens and anti-replay windows;
//   - payment / billing items and value grants;
//   - anything user-facing security.
//
// WHY `.mjs` AND NOT `.ts`. The one in-scope consumer today is the product
// gate's scoped owner waivers (`.github/scripts/owner-waivers.mjs`), which CI
// runs as plain ESM on Node 20 and which therefore cannot import TypeScript.
// This file is the SINGLE implementation; `internal-authority-validity.d.mts`
// gives TypeScript callers real types over it. Do not copy it elsewhere.
//
// PURE: no fs, no network; the clock is a parameter (default: now).

export const INTERNAL_AUTHORITY_TERM_MONTHS = 12;

/** Milliseconds in one internal-authority term, for code that keeps durations rather than dates. */
export const INTERNAL_AUTHORITY_TERM_MS = 365 * 86_400_000;
/** The same term in days / hours, for callers that express a validity in those units. */
export const INTERNAL_AUTHORITY_TERM_DAYS = 365;
export const INTERNAL_AUTHORITY_TERM_HOURS = INTERNAL_AUTHORITY_TERM_DAYS * 24;

function plusMonths(d, months) {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/**
 * The end of the CURRENT 12-month term of an internal approval granted at
 * `approvedAtIso`: approval + 12 months, rolled forward one term at a time
 * until it lies after `now`. An approval therefore never lapses by the
 * calendar alone; a revocation (or a narrower owner-set term handled by the
 * caller) is what ends it. An unreadable date is returned unchanged so the
 * caller's own fail-closed check still applies.
 *
 * @param {string} approvedAtIso
 * @param {Date} [now]
 * @returns {string}
 */
export function rollingInternalExpiryIso(approvedAtIso, now = new Date()) {
  const approved = new Date(approvedAtIso);
  if (Number.isNaN(approved.getTime())) return approvedAtIso;
  let end = plusMonths(approved, INTERNAL_AUTHORITY_TERM_MONTHS);
  while (end.getTime() <= now.getTime()) end = plusMonths(end, INTERNAL_AUTHORITY_TERM_MONTHS);
  return end.toISOString();
}
