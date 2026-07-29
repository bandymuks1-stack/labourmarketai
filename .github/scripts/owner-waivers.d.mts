/**
 * Types for the shared scoped-owner-waiver module.
 *
 * The RULES live once, in `owner-waivers.mjs`, because the CI gate is plain
 * ESM and cannot import TypeScript. This declaration file gives the vitest
 * guard real types over that same module — so there is one implementation and
 * still no `any` at the test boundary.
 */

export type WaivableAxiom = "A-01" | "A-09";
export type WaiverResolution = "E.7" | "B.6" | "W6-map-slice";

export type WaiverRejection =
  | "no-waiver"
  | "pr-not-covered"
  | "sha-not-covered"
  | "expired"
  | "axiom-not-waivable"
  | "file-not-covered";

export interface ExpectedFinding {
  code: string;
  /** The gate's `what` for this finding — the file or surface id. */
  file: string;
}

export interface ScopedOwnerWaiver {
  id: string;
  axioms: readonly string[];
  scope: string;
  /** THE BINDING KEY. A PR not listed here matches nothing. */
  pullRequests: readonly number[];
  /** Audit trail; enforced when a run supplies a SHA to check. */
  approvedHeadShas: readonly string[];
  files: readonly string[];
  expectedFindings: readonly ExpectedFinding[];
  reason: string;
  resolvedBy: string;
  /** ISO date, inclusive. */
  expiresAt: string;
  owner: string;
}

export interface GateFinding {
  code: string;
  axiom: string;
  what: string;
}

export interface WaiverContext {
  pullRequest: number | null;
  headSha: string | null;
  /** ISO date of the run — injected so the expiry rule is testable. */
  today: string;
}

export interface WaiverDecision {
  waived: boolean;
  waiver: ScopedOwnerWaiver | null;
  rejection: WaiverRejection | null;
  detail: string;
}

export interface WaiverVerdict {
  pass: boolean;
  waivedFindings: { finding: GateFinding; decision: WaiverDecision }[];
  blockingFindings: { finding: GateFinding; decision: WaiverDecision }[];
}

export declare const SCOPED_OWNER_WAIVERS: readonly ScopedOwnerWaiver[];

export declare function decideWaiver(
  finding: GateFinding,
  ctx: WaiverContext,
  waivers?: readonly ScopedOwnerWaiver[],
): WaiverDecision;

export declare function evaluateFindings(
  findings: readonly GateFinding[],
  ctx: WaiverContext,
  waivers?: readonly ScopedOwnerWaiver[],
): WaiverVerdict;

export declare function waiverContextFromEnv(
  env?: Record<string, string | undefined>,
  now?: Date,
): WaiverContext;
