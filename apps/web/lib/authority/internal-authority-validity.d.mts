/**
 * Types for the single internal-authority validity module
 * (`internal-authority-validity.mjs`). The rule lives once, in plain ESM,
 * because the CI product gate cannot import TypeScript; this declaration gives
 * TypeScript callers real types over that same module.
 */

/** One internal-authority term, in months (owner P0 2026-10-22). */
export declare const INTERNAL_AUTHORITY_TERM_MONTHS: 12;
/** One term in milliseconds (365 days). */
export declare const INTERNAL_AUTHORITY_TERM_MS: number;
/** One term in days. */
export declare const INTERNAL_AUTHORITY_TERM_DAYS: 365;
/** One term in hours. */
export declare const INTERNAL_AUTHORITY_TERM_HOURS: number;

/**
 * End of the CURRENT 12-month term of an internal approval granted at
 * `approvedAtIso`, rolled forward term by term until it lies after `now`.
 * An unreadable date is returned unchanged.
 */
export declare function rollingInternalExpiryIso(approvedAtIso: string, now?: Date): string;
