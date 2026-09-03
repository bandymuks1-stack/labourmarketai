import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * TIME TO FIRST REAL VALUE, PER ACTOR (FIRST REAL ECOSYSTEM USE, 2026-09-03).
 *
 * The owner's key metric is not a page view: it is how long a real person
 * needs, from becoming a user, to their first REAL state-changing action and
 * to the first REAL result they receive — measured separately for worker,
 * employer, agency, student and education institution.
 *
 * Keyed by PROFILE (a person returns across sessions), not by tab session
 * like the global time-to-value summary. Actor comes from the first-run
 * router's `intent` (role_selected / onboarding steps), falling back to the
 * coarse `role_context`. Until the dedicated `first_real_action` /
 * `first_real_result` events accumulate, the existing action/result events
 * stand in — listed explicitly below so the metric is auditable.
 *
 * Admin-only read (`pilot_events_select` RLS). No PII: profile ids are only
 * grouping keys and never leave this module.
 */

export const TTFV_ACTORS = ["worker", "employer", "agency", "student", "education"] as const;
export type TtfvActor = (typeof TTFV_ACTORS)[number];

export const TTFV_START_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.signupCompleted,
  FUNNEL_EVENTS.onboardingCompleted,
];

export const TTFV_ACTOR_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.roleSelected,
  FUNNEL_EVENTS.onboardingStepRoleCompleted,
  FUNNEL_EVENTS.onboardingCompleted,
];

export const TTFV_ACTION_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.firstRealAction,
  FUNNEL_EVENTS.journalEntrySaved,
  FUNNEL_EVENTS.cvUploadSucceeded,
  FUNNEL_EVENTS.demandSaved,
  FUNNEL_EVENTS.companyNeedSubmitted,
  FUNNEL_EVENTS.serviceRequestSent,
  FUNNEL_EVENTS.bookingProposed,
  FUNNEL_EVENTS.contactRequested,
];

export const TTFV_RESULT_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.firstRealResult,
  FUNNEL_EVENTS.matchPreviewGenerated,
  FUNNEL_EVENTS.contactDisclosed,
  FUNNEL_EVENTS.bookingAccepted,
  FUNNEL_EVENTS.engagementCreated,
];

export type TtfvRow = {
  event_name: string;
  profile_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type TtfvActorSummary = {
  actor: TtfvActor | "unknown";
  users: number;
  reachedAction: number;
  reachedResult: number;
  medianToActionMs: number | null;
  medianToResultMs: number | null;
};

export type TtfvSummary = {
  available: boolean;
  byActor: TtfvActorSummary[];
  usersWithStart: number;
  excludedPreview: number;
};

/** Map a first-run intent (or a comma-joined set) / role_context to an actor.
 *  A set picks the most specific: education > agency > student > employer > worker. */
export function actorFromMetadata(meta: Record<string, unknown> | null): TtfvActor | null {
  const intent = typeof meta?.intent === "string" ? meta.intent : "";
  const parts = intent.split(",").map((s) => s.trim());
  if (parts.includes("education")) return "education";
  if (parts.includes("agency")) return "agency";
  if (parts.includes("student")) return "student";
  if (parts.includes("hire")) return "employer";
  if (parts.includes("work")) return "worker";
  const role = typeof meta?.role_context === "string" ? meta.role_context : "";
  if (role === "worker" || role === "person") return "worker";
  if (role === "company") return "employer";
  if (role === "agency") return "agency";
  return null;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** PURE: fold event rows into the per-actor summary. */
export function summariseTtfv(rows: readonly TtfvRow[]): TtfvSummary {
  const clean = rows.filter((r) => r.metadata?.["preview_host"] !== true && r.profile_id);
  const excludedPreview = rows.length - clean.length;

  type Agg = { startAt: number | null; actor: TtfvActor | null; actionAt: number | null; resultAt: number | null };
  const byProfile = new Map<string, Agg>();
  for (const r of clean) {
    const at = Date.parse(r.created_at);
    if (!Number.isFinite(at)) continue;
    const key = r.profile_id as string;
    const agg = byProfile.get(key) ?? { startAt: null, actor: null, actionAt: null, resultAt: null };
    if (TTFV_START_EVENTS.includes(r.event_name)) {
      agg.startAt = agg.startAt === null ? at : Math.min(agg.startAt, at);
    }
    if (TTFV_ACTOR_EVENTS.includes(r.event_name) && agg.actor === null) {
      agg.actor = actorFromMetadata(r.metadata);
    }
    if (TTFV_ACTION_EVENTS.includes(r.event_name)) {
      agg.actionAt = agg.actionAt === null ? at : Math.min(agg.actionAt, at);
    }
    if (TTFV_RESULT_EVENTS.includes(r.event_name)) {
      agg.resultAt = agg.resultAt === null ? at : Math.min(agg.resultAt, at);
    }
    byProfile.set(key, agg);
  }

  const buckets = new Map<TtfvActor | "unknown", { users: number; toAction: number[]; toResult: number[]; reachedAction: number; reachedResult: number }>();
  const bucket = (a: TtfvActor | "unknown") => {
    const b = buckets.get(a) ?? { users: 0, toAction: [], toResult: [], reachedAction: 0, reachedResult: 0 };
    buckets.set(a, b);
    return b;
  };
  let usersWithStart = 0;
  for (const agg of byProfile.values()) {
    if (agg.startAt === null) continue;
    usersWithStart += 1;
    const b = bucket(agg.actor ?? "unknown");
    b.users += 1;
    if (agg.actionAt !== null && agg.actionAt >= agg.startAt) {
      b.reachedAction += 1;
      b.toAction.push(agg.actionAt - agg.startAt);
    }
    if (agg.resultAt !== null && agg.resultAt >= agg.startAt) {
      b.reachedResult += 1;
      b.toResult.push(agg.resultAt - agg.startAt);
    }
  }

  const order: (TtfvActor | "unknown")[] = [...TTFV_ACTORS, "unknown"];
  const byActor = order
    .filter((a) => buckets.has(a))
    .map((actor) => {
      const b = buckets.get(actor)!;
      return {
        actor,
        users: b.users,
        reachedAction: b.reachedAction,
        reachedResult: b.reachedResult,
        medianToActionMs: median([...b.toAction].sort((x, y) => x - y)),
        medianToResultMs: median([...b.toResult].sort((x, y) => x - y)),
      };
    });

  return { available: true, byActor, usersWithStart, excludedPreview };
}

const WINDOW_ROWS = 8000;

export async function getTimeToFirstValueByActor(
  supabase: SupabaseClient,
): Promise<TtfvSummary> {
  const names = [
    ...new Set([...TTFV_START_EVENTS, ...TTFV_ACTOR_EVENTS, ...TTFV_ACTION_EVENTS, ...TTFV_RESULT_EVENTS]),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAny = (supabase as any).from.bind(supabase) as (name: string) => {
    select: (cols: string) => {
      in: (col: string, vals: readonly string[]) => {
        not: (col: string, op: string, value: null) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: TtfvRow[] | null; error: { message?: string } | null }>;
          };
        };
      };
    };
  };
  const { data, error } = await fromAny("pilot_events")
    .select("event_name, profile_id, created_at, metadata")
    .in("event_name", names)
    .not("profile_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(WINDOW_ROWS);
  if (error) return { available: false, byActor: [], usersWithStart: 0, excludedPreview: 0 };
  return summariseTtfv((data ?? []) as TtfvRow[]);
}
