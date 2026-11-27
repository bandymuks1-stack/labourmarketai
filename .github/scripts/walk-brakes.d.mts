export declare const THRESHOLDS: Readonly<{
  healthDbMs: number;
  healthAuthMs: number;
  healthSamples: number;
  healthSampleGapMs: number;
  deployQuietMinutes: number;
  deployWaitPollMs: number;
  errorLookback: number;
  errorCooldownMinutes: number;
  supabaseWindowMinutes: number;
  supabaseMax5xx: number;
  supabaseMax429: number;
  minGapSeconds: number;
}>;

export declare function judgeHealth(
  report: unknown,
  t?: typeof THRESHOLDS,
): { ok: boolean; reasons: string[]; summary: string };

export declare function judgeHealthSamples(
  samples: readonly { status: number; report: unknown }[],
  t?: typeof THRESHOLDS,
): { ok: boolean; reasons: string[] };

export declare function runShippedFromJobs(
  jobs: readonly { name: string; conclusion?: string | null; steps?: readonly { name: string; conclusion?: string | null }[] }[],
): boolean;

export declare function judgeDeployBrake(
  runs: readonly { id: number; status: string; updated_at: string | null; deploySkipped?: boolean }[],
  now?: Date,
  t?: typeof THRESHOLDS,
  /** Inside a deploy-vps.yml run: that run's id and the end of its own `deploy` job. */
  own?: { id: number; deployEndedAt: string | null } | null,
): { refuse: boolean; reason: string };

export declare function judgeWalkRun(input: {
  walkConclusion: string | null;
  provisionFailed: boolean;
  result: unknown;
  log?: string;
}): { bad: boolean; why: string };

export declare function flattenTests(result: unknown): { status: string; errors: string[] }[];

export declare function judgeErrorBrake(
  recent: readonly { bad: boolean; why: string; endedAt: string | null }[],
  now?: Date,
  t?: typeof THRESHOLDS,
): { refuse: boolean; reason: string };

export declare function gapRemainingSeconds(
  lastEndedAtIso: string | null,
  now?: Date,
  t?: typeof THRESHOLDS,
): number;

export declare function judgeSupabaseEdge(
  counts: { e5: number; e429: number },
  t?: typeof THRESHOLDS,
): { refuse: boolean; reason: string };

export declare const SR1_READING_KEYS: readonly string[];

export declare function judgeSr1Readings(text: string): { publish: boolean; why: string };

/** `--wait <minutes>` from the arguments, bounded to 0..30; absent = 0 (judge once). */
export declare function deployWaitMinutes(argv: readonly string[]): number;

/** Bounded deployment-job evidence for a walk outside the serialized deploy queue. */
export declare function readStandaloneDeployVerdict(
  api: (path: string) => unknown,
  repo: string,
  now?: Date,
  t?: typeof THRESHOLDS,
): { refuse: boolean; reason: string };

/** The complete deploy brake, with injectable reads and clock for offline regression tests. */
export declare function readDeployVerdict(options?: {
  api?: (path: string) => unknown;
  repo?: string;
  now?: Date;
  ownId?: number;
}): { refuse: boolean; reason: string };
