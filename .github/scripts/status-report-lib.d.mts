/**
 * Types for status-report-lib.mjs (the 12-hour status report's decision logic). The rules live once,
 * in the .mjs, because the report scripts are plain ESM; this file gives the vitest guard
 * (apps/web/lib/guards/status-report.test.ts) real types over that same module.
 */

export declare const POLICY_REQUIRED_CHECKS: readonly string[];
export declare const IGNORED_CHECKS: readonly string[];
export declare const TRUSTED_ASSOCIATIONS: readonly string[];

export type CheckRun = {
  id?: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};
export type CommitStatus = { context: string; state: string; created_at?: string; updated_at?: string };
export type CiState = "success" | "failure" | "pending" | "missing" | "unknown";
export type CiVerdict = { state: CiState; failed: string[]; pending: string[]; missing: string[] };

export declare function ciVerdict(input: {
  checkRuns?: CheckRun[] | null;
  statuses?: CommitStatus[] | null;
  required?: readonly string[];
  complete?: boolean;
}): CiVerdict;

export type IssueComment = {
  body?: string | null;
  created_at: string;
  author_association: string;
  user?: { login: string } | null;
};
export type PullReview = {
  state: string;
  commit_id: string;
  submitted_at: string;
  author_association: string;
  user?: { login: string } | null;
};
export type VerdictState = "no-block" | "blocks" | "unclear" | "stale" | "untrusted" | "none" | "unknown";
export type Verdict = { state: VerdictState; author?: string | null; at?: string; sha?: string };

export declare function reviewedSha(body: string | null | undefined): string | null;
export declare function verdictOf(body: string | null | undefined): "no-block" | "blocks" | "unclear";
export declare function reviewVerdict(input: {
  comments?: IssueComment[];
  reviews?: PullReview[];
  headSha: string;
  headCommittedAt?: string | null;
}): { review: Verdict; security: Verdict };

export type ReportPr = {
  number?: number;
  title?: string;
  labels?: string[];
  draft?: boolean;
  incomplete?: boolean;
  mergeableState?: string | null;
  ci: CiVerdict;
  review?: Verdict;
  security?: Verdict;
};
export declare function isRedPr(p: { labels?: string[]; title?: string }): boolean;
export declare function prBlocker(p: ReportPr): string;

export type FetchError = { path: string; status: number | string | null; attempts: number; message: string };
export declare function completeness(input: { errors?: FetchError[]; registerProblems?: string[] }): "COMPLETE" | "PARTIAL";

export type TransportResponse = { status: number; headers?: Record<string, string>; body: unknown };
export type GithubClient = {
  get(path: string): Promise<{ ok: boolean; body?: any }>;
  getAll(path: string, opts?: { perPage?: number; maxPages?: number }): Promise<{ ok: boolean; items: any[] }>;
  getCounted(
    path: string,
    key: string,
    opts?: { perPage?: number; maxPages?: number; limit?: number },
  ): Promise<{ ok: boolean; items: any[]; total: number | null }>;
  errors: FetchError[];
  stats(): { requests: number };
};
export declare function createGithubClient(input: {
  transport: (path: string) => Promise<TransportResponse>;
  sleep: (ms: number) => Promise<void>;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxWaitMs?: number;
  now?: () => number;
}): GithubClient;
export declare function parseGhInclude(stdout: string): TransportResponse;

export declare function collect(input: {
  client: GithubClient;
  repo: string;
  sinceIso: string;
  fetchHealth: () => Promise<Record<string, unknown>>;
  sleep: (ms: number) => Promise<void>;
  concurrency?: number;
  mergeableRetryMs?: number;
}): Promise<{
  schema: number;
  completeness: "COMPLETE" | "PARTIAL";
  errors: FetchError[];
  prs: Array<ReportPr & { number: number; head: string }>;
  [k: string]: unknown;
}>;
