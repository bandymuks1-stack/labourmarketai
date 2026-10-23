export declare const THRESHOLDS: Readonly<{
  healthDbMs: number;
  healthAuthMs: number;
  healthAttempts: number;
  healthRetryDelayMs: number;
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
