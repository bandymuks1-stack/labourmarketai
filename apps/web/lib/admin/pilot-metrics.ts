import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Time-to-first-value summary (Pilot Onboarding and Measurement v1).
 *
 * Reads the FIRST-PARTY `pilot_events` table (migration 0020) through the
 * caller's already-superadmin-gated Supabase client — the admin-only
 * `pilot_events_select` RLS policy returns zero rows to anyone else. No PII
 * is read: only bounded event names, the pseudonymous per-tab session_id,
 * timestamps and the allowlisted non-identifying metadata.
 *
 * Definition (mirrors the honesty stance of lib/admin/conversion-funnel.ts):
 *   - a session "starts" at its EARLIEST registration_started or
 *     onboarding_started event;
 *   - a session "reaches value" at its EARLIEST value event AT OR AFTER the
 *     start (value events: company_need_submitted, demand_saved,
 *     service_request_sent, journal_entry_saved — the real first-benefit
 *     moments that exist in the funnel registry today);
 *   - time-to-value = value timestamp − start timestamp, summarised as the
 *     median and 75th percentile across converting sessions.
 *
 * HONEST LIMITS (also stated in the UI):
 *   - Sessions are pseudonymous PER BROWSER TAB (sessionStorage), NOT unique
 *     visitors — one person can appear as several sessions, and a session
 *     that started before the query window looks value-only.
 *   - There is NO session ↔ pilot-participant linkage: deriving one would
 *     require joining pseudonymous telemetry to identified profiles, which
 *     the privacy contract forbids for cohort slicing without participant
 *     events. Timing is therefore computed GLOBALLY; cohort-scoped timing
 *     requires the pilots migration + explicit participant events.
 *   - Counts are event occurrences over a bounded recent window; no revenue
 *     attribution, no dedup, no unique-visitor claims.
 */

const WINDOW_ROWS = 8000;

/** A session's clock starts at the earliest of these. */
export const TTV_START_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.registrationStarted,
  FUNNEL_EVENTS.onboardingStarted,
];

/** First-value moments that exist in the funnel registry today. */
export const TTV_VALUE_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.companyNeedSubmitted,
  FUNNEL_EVENTS.demandSaved,
  FUNNEL_EVENTS.serviceRequestSent,
  FUNNEL_EVENTS.journalEntrySaved,
];

export type TimeToValueSummary = {
  available: boolean;
  /** Sessions in the window that emitted a start event. */
  sessionsWithStart: number;
  /** Sessions whose earliest value event is at/after their start. */
  sessionsReachedValue: number;
  medianMs: number | null;
  p75Ms: number | null;
  /** Which value event converted each session first. */
  byFirstValueEvent: { event: string; sessions: number }[];
  /** Non-production (localhost / preview) events excluded from the window. */
  excludedPreview: number;
  totalEvents: number;
};

type TtvRow = {
  event_name: string;
  session_id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function percentile(sortedMs: number[], p: number): number | null {
  if (sortedMs.length === 0) return null;
  const idx = Math.min(
    sortedMs.length - 1,
    Math.max(0, Math.ceil(p * sortedMs.length) - 1),
  );
  return sortedMs[idx];
}

export async function getTimeToValueSummary(
  supabase: SupabaseClient,
): Promise<TimeToValueSummary> {
  const names = [...TTV_START_EVENTS, ...TTV_VALUE_EVENTS];
  // The generated `Database` type doesn't include `pilot_events` until
  // `pnpm db:types` is re-run after 0020 — cast through `any` (repo pattern).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAny = (supabase as any).from.bind(supabase) as (name: string) => {
    select: (cols: string) => {
      in: (
        col: string,
        vals: readonly string[],
      ) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{
            data: TtvRow[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };

  const { data, error } = await fromAny("pilot_events")
    .select("event_name, session_id, created_at, metadata")
    .in("event_name", names)
    .order("created_at", { ascending: false })
    .limit(WINDOW_ROWS);

  if (error) {
    return {
      available: false,
      sessionsWithStart: 0,
      sessionsReachedValue: 0,
      medianMs: null,
      p75Ms: null,
      byFirstValueEvent: [],
      excludedPreview: 0,
      totalEvents: 0,
    };
  }

  const allRows: TtvRow[] = (data ?? []) as TtvRow[];
  // Exclude events fired from non-production origins (localhost / preview) —
  // same exclusion the acquisition funnel applies.
  const rows = allRows.filter((r) => r.metadata?.["preview_host"] !== true);
  const excludedPreview = allRows.length - rows.length;

  type SessionAgg = { startAt: number | null; values: { at: number; event: string }[] };
  const bySession = new Map<string, SessionAgg>();
  for (const r of rows) {
    const at = Date.parse(r.created_at);
    if (!Number.isFinite(at)) continue;
    const agg = bySession.get(r.session_id) ?? { startAt: null, values: [] };
    if (TTV_START_EVENTS.includes(r.event_name)) {
      agg.startAt = agg.startAt === null ? at : Math.min(agg.startAt, at);
    } else {
      agg.values.push({ at, event: r.event_name });
    }
    bySession.set(r.session_id, agg);
  }

  const deltas: number[] = [];
  const firstValueCounts = new Map<string, number>();
  let sessionsWithStart = 0;
  for (const agg of bySession.values()) {
    if (agg.startAt === null) continue;
    sessionsWithStart += 1;
    const startAt = agg.startAt;
    const eligible = agg.values
      .filter((v) => v.at >= startAt)
      .sort((a, b) => a.at - b.at);
    const first = eligible[0];
    if (!first) continue;
    deltas.push(first.at - startAt);
    firstValueCounts.set(
      first.event,
      (firstValueCounts.get(first.event) ?? 0) + 1,
    );
  }

  deltas.sort((a, b) => a - b);
  const byFirstValueEvent = [...firstValueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([event, sessions]) => ({ event, sessions }));

  return {
    available: true,
    sessionsWithStart,
    sessionsReachedValue: deltas.length,
    medianMs: percentile(deltas, 0.5),
    p75Ms: percentile(deltas, 0.75),
    byFirstValueEvent,
    excludedPreview,
    totalEvents: rows.length,
  };
}

/** Human-compact duration for admin surfaces (locale-neutral units). */
export function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 90) return `${Math.round(s)} s`;
  const m = s / 60;
  if (m < 90) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  const d = h / 24;
  return `${Math.round(d * 10) / 10} d`;
}
