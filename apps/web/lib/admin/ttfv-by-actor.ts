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

/**
 * TWO kinds of "result", measured SEPARATELY (owner direction 2026-09-03):
 *
 *  - SYSTEM result — the product itself produced something useful for the
 *    person, with no other human involved: matches shown to an employer, a
 *    board with at least one fitting opportunity shown to a worker/student.
 *    This is TIME_TO_FIRST_SYSTEM_VALUE — the part LabourMarket.ai controls.
 *  - HUMAN result — another person had to act: a contact disclosed after a
 *    worker's interest, a booking accepted, an engagement created. This is
 *    TIME_TO_EXTERNAL_HUMAN_RESPONSE and may honestly stay asynchronous.
 *
 * One conflated "median to result" hid the difference: for employers the
 * seconds-fast system preview always won the min; for workers only the
 * days-long human events could fill it. The dedicated `first_real_result`
 * event carries `step: "system" | "human"` and is bucketed by that flag.
 */
export const TTFV_SYSTEM_RESULT_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.matchPreviewGenerated,
];

export const TTFV_HUMAN_RESULT_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.contactDisclosed,
  FUNNEL_EVENTS.bookingAccepted,
  FUNNEL_EVENTS.engagementCreated,
];

/** The worker/student board view counts as a SYSTEM result only when it
 *  actually showed something (`candidate_count` > 0 — the number of fitting
 *  opportunities rendered). An empty board is not value. */
export const TTFV_BOARD_VIEW_EVENT: string = FUNNEL_EVENTS.marketplaceOrOpportunitiesViewed;

/** All result events the window must fetch. */
export const TTFV_RESULT_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.firstRealResult,
  ...TTFV_SYSTEM_RESULT_EVENTS,
  ...TTFV_HUMAN_RESULT_EVENTS,
  TTFV_BOARD_VIEW_EVENT,
];

export type TtfvResultKind = "system" | "human";

/** Which kind of result a row is — or null when it is not a result. */
export function resultKindOf(r: { event_name: string; metadata: Record<string, unknown> | null }): TtfvResultKind | null {
  if (r.event_name === FUNNEL_EVENTS.firstRealResult) {
    return r.metadata?.step === "human" ? "human" : "system";
  }
  if (TTFV_SYSTEM_RESULT_EVENTS.includes(r.event_name)) return "system";
  if (TTFV_HUMAN_RESULT_EVENTS.includes(r.event_name)) return "human";
  if (r.event_name === TTFV_BOARD_VIEW_EVENT) {
    const n = r.metadata?.candidate_count;
    return typeof n === "number" && n > 0 ? "system" : null;
  }
  return null;
}

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
  /** Reached a result the SYSTEM produced alone (matches / fitting board). */
  reachedSystemResult: number;
  /** Reached a result that needed ANOTHER PERSON to act. */
  reachedHumanResult: number;
  medianToActionMs: number | null;
  medianToSystemResultMs: number | null;
  medianToHumanResultMs: number | null;
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

  type Agg = {
    startAt: number | null;
    actor: TtfvActor | null;
    /** True once the actor came from an explicit first-run `intent` — the
     *  precise signal; a coarse `role_context` must never override it. */
    actorFromIntent: boolean;
    actionAt: number | null;
    systemResultAt: number | null;
    humanResultAt: number | null;
  };
  const byProfile = new Map<string, Agg>();
  for (const r of clean) {
    const at = Date.parse(r.created_at);
    if (!Number.isFinite(at)) continue;
    const key = r.profile_id as string;
    const agg =
      byProfile.get(key) ??
      { startAt: null, actor: null, actorFromIntent: false, actionAt: null, systemResultAt: null, humanResultAt: null };
    if (TTFV_START_EVENTS.includes(r.event_name)) {
      agg.startAt = agg.startAt === null ? at : Math.min(agg.startAt, at);
    }
    if (TTFV_ACTOR_EVENTS.includes(r.event_name)) {
      // Rows arrive newest-first. `onboarding_completed` (newest) used to
      // carry only role_context and locked the bucket before the older
      // `role_selected` row with intent:"student"/"education" was read — so
      // every student was filed as a worker and every institution as an
      // employer. An intent-bearing row now always wins over a coarse one.
      const hasIntent = typeof r.metadata?.intent === "string" && r.metadata.intent.length > 0;
      const candidate = actorFromMetadata(r.metadata);
      if (candidate !== null && (agg.actor === null || (hasIntent && !agg.actorFromIntent))) {
        agg.actor = candidate;
        agg.actorFromIntent = hasIntent;
      }
    }
    if (TTFV_ACTION_EVENTS.includes(r.event_name)) {
      agg.actionAt = agg.actionAt === null ? at : Math.min(agg.actionAt, at);
    }
    const kind = resultKindOf(r);
    if (kind === "system") {
      agg.systemResultAt = agg.systemResultAt === null ? at : Math.min(agg.systemResultAt, at);
    } else if (kind === "human") {
      agg.humanResultAt = agg.humanResultAt === null ? at : Math.min(agg.humanResultAt, at);
    }
    byProfile.set(key, agg);
  }

  type Bucket = {
    users: number;
    toAction: number[];
    toSystem: number[];
    toHuman: number[];
    reachedAction: number;
    reachedSystemResult: number;
    reachedHumanResult: number;
  };
  const buckets = new Map<TtfvActor | "unknown", Bucket>();
  const bucket = (a: TtfvActor | "unknown") => {
    const b =
      buckets.get(a) ??
      { users: 0, toAction: [], toSystem: [], toHuman: [], reachedAction: 0, reachedSystemResult: 0, reachedHumanResult: 0 };
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
    if (agg.systemResultAt !== null && agg.systemResultAt >= agg.startAt) {
      b.reachedSystemResult += 1;
      b.toSystem.push(agg.systemResultAt - agg.startAt);
    }
    if (agg.humanResultAt !== null && agg.humanResultAt >= agg.startAt) {
      b.reachedHumanResult += 1;
      b.toHuman.push(agg.humanResultAt - agg.startAt);
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
        reachedSystemResult: b.reachedSystemResult,
        reachedHumanResult: b.reachedHumanResult,
        medianToActionMs: median([...b.toAction].sort((x, y) => x - y)),
        medianToSystemResultMs: median([...b.toSystem].sort((x, y) => x - y)),
        medianToHumanResultMs: median([...b.toHuman].sort((x, y) => x - y)),
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
