import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import {
  classifyEvent,
  isBusinessFunnelCountable,
  HISTORICAL_CONTAMINATION_UNKNOWN,
} from "@/lib/analytics/population";

/**
 * Acquisition-funnel summary for the owner (Pre-Advertising Launch Readiness
 * v1). Reads the FIRST-PARTY `pilot_events` table — no third-party analytics —
 * and derives the counts + conversion rates an owner needs to judge whether a
 * paid campaign is working:
 *
 *   landing_viewed → cta_clicked → registration_started → onboarding_completed
 *   landing_viewed → company_need_started → company_need_submitted
 *
 * plus a first-touch campaign (utm_source) breakdown of the conversion events.
 *
 * Reads go through the CALLER's already-superadmin-gated Supabase client; the
 * `pilot_events_select` RLS policy (migration 0020) is admin-only, so a
 * non-admin session returns nothing. No PII is read — only bounded event names
 * and the allowlisted, non-identifying metadata (utm_*). Counts are event
 * occurrences over a bounded recent window, not deduplicated unique visitors,
 * and include no revenue attribution.
 *
 * ── W14 item 4: THE POPULATION BEHIND EVERY RATE ────────────────────────────
 *
 * This read used to be `.select("event_name, metadata").in(…).limit(5000)` —
 * no ORDER BY and no time predicate. Postgres promises nothing about which
 * rows an unordered LIMIT returns, so once `pilot_events` passed 5000 rows
 * every numerator and denominator came from an ARBITRARY subset of all
 * history, and the panel went on printing a confident percentage. The prose
 * above already said "a bounded recent window"; the query never implemented
 * one.
 *
 * The truncation was also BIASED, not just noisy: within one visitor's journey
 * `landing_viewed` precedes `registration_started`, so dropping a slice
 * removes disproportionately many top-of-funnel events and INFLATES every
 * conversion rate — wrong in the flattering direction, for the one reader
 * deciding whether to spend money on ads.
 *
 * Three changes, and the third is the one that matters:
 *   1. a real `created_at >= now - FUNNEL_WINDOW_DAYS` predicate;
 *   2. `order(created_at desc)`, so the cap keeps the MOST RECENT rows rather
 *      than an arbitrary slice;
 *   3. when the read comes back AT the cap the window was not read completely,
 *      so every rate reports `null` and the counts are declared lower bounds.
 *      An incomplete population yields UNKNOWN — never a percentage derived
 *      from whatever rows happened to arrive.
 */

/** Rows one read may return. Hitting it means the window is saturated. */
export const FUNNEL_MAX_ROWS = 5000;
/** The window the rates actually describe — stated to the reader. */
export const FUNNEL_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

/** Inclusive lower bound of the funnel window, as an ISO timestamp. */
export function funnelWindowStart(
  now: Date,
  windowDays: number = FUNNEL_WINDOW_DAYS,
): string {
  return new Date(now.getTime() - windowDays * DAY_MS).toISOString();
}

/** Ordered funnel stages the panel renders. */
export const FUNNEL_STAGES = [
  { key: FUNNEL_EVENTS.landingViewed, label: "Landing viewed" },
  { key: FUNNEL_EVENTS.ctaClicked, label: "CTA clicked" },
  { key: FUNNEL_EVENTS.roleSelected, label: "Identity selected" },
  { key: FUNNEL_EVENTS.registrationStarted, label: "Registration started" },
  { key: FUNNEL_EVENTS.onboardingStarted, label: "Onboarding started" },
  { key: FUNNEL_EVENTS.onboardingCompleted, label: "Onboarding completed" },
  { key: FUNNEL_EVENTS.companyNeedStarted, label: "Company need started" },
  { key: FUNNEL_EVENTS.companyNeedSubmitted, label: "Company need submitted" },
  // ── Mid-funnel marketplace progression (W14 Pilot Analytics slice v1) —
  //    the stages where a demand actually turns into work. Server-emitted
  //    at the real action points (lib/telemetry/server-funnel.ts).
  { key: FUNNEL_EVENTS.matchPreviewGenerated, label: "Match preview generated" },
  { key: FUNNEL_EVENTS.shortlistAdded, label: "Shortlist added" },
  { key: FUNNEL_EVENTS.contactRequested, label: "Contact requested" },
  { key: FUNNEL_EVENTS.contactDisclosed, label: "Contact disclosed" },
  { key: FUNNEL_EVENTS.bookingProposed, label: "Booking proposed" },
  { key: FUNNEL_EVENTS.engagementCreated, label: "Engagement created" },
  { key: FUNNEL_EVENTS.projectAssigned, label: "Project assigned" },
  { key: FUNNEL_EVENTS.projectCompleted, label: "Project completed" },
  { key: FUNNEL_EVENTS.experienceSubmitted, label: "Experience submitted" },
  { key: FUNNEL_EVENTS.experiencePublished, label: "Experience published" },
  { key: FUNNEL_EVENTS.organizationCreated, label: "Organization created" },
] as const;

const CONVERSION_EVENTS: readonly string[] = [
  FUNNEL_EVENTS.registrationStarted,
  FUNNEL_EVENTS.companyNeedSubmitted,
];

/**
 * WHICH KIND OF ANSWER a rate is. `pct === null` covers two genuinely
 * different facts and the panel used to render one dash for both:
 *
 *   insufficient_data — nothing to divide by yet;
 *   truncated         — a share exists, but the read hit its cap so it cannot
 *                       honestly be stated.
 *
 * A real measured 0% is `ok` and is not a kind of nothing at all. The state is
 * carried explicitly so the UI branches on a value rather than string-matching
 * the note, which would put the distinction one refactor away from collapsing
 * again.
 */
export type FunnelRateState = "ok" | "insufficient_data" | "truncated";

export type FunnelRate = {
  label: string;
  pct: number | null;
  note: string;
  state: FunnelRateState;
};

export type AcquisitionFunnel = {
  available: boolean;
  counts: { key: string; label: string; count: number }[];
  rates: FunnelRate[];
  /** Top first-touch utm_source values among conversion events. */
  sources: { source: string; count: number }[];
  totalEvents: number;
  /** Count of non-production (localhost / preview) events excluded. */
  excludedPreview: number;
  /** Count of platform-admin (owner / staff) events excluded — internal
   *  navigation is not acquisition traffic. */
  excludedAdmin: number;
  /** Why no period can be certified free of internal activity. Rendered
   *  verbatim so the panel cannot paraphrase the caveat away. */
  historicalContaminationUnknown: string;
  /** Days of history the numbers describe — the panel states it. */
  windowDays: number;
  /** The read came back AT the row cap: more events exist in the window than
   *  were read, so the population behind any rate is incomplete. */
  truncated: boolean;
  /** Implied by `truncated` — every count is "at least N", not "N". */
  countsAreLowerBound: boolean;
};

type FunnelRow = {
  event_name: string;
  metadata: Record<string, unknown> | null;
  /** Set server-side from `auth.getUser()`; NULL for anonymous events. */
  profile_id?: string | null;
};

/** A rate, or null. Null covers BOTH "no denominator" and "the denominator we
 *  can see is incomplete" — in neither case does the product know the answer,
 *  and in neither case is the answer 0%. */
function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

const TRUNCATED_NOTE =
  "population incomplete — the window returned more events than one read can cover, so no share can be stated";

export async function getAcquisitionFunnel(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<AcquisitionFunnel> {
  const names = FUNNEL_STAGES.map((s) => s.key);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAny = (supabase as any).from.bind(supabase) as (
    name: string,
  ) => {
    select: (cols: string) => {
      in: (
        col: string,
        vals: readonly string[],
      ) => {
        gte: (
          col: string,
          value: string,
        ) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{
              data: FunnelRow[] | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
  };

  // `created_at` is SELECTED as well as filtered: a window cannot be applied
  // to a column the read does not carry, and the ordering below is what makes
  // the cap keep the most recent rows instead of an arbitrary slice.
  // `profile_id` (W14 item 5) is what makes internal activity classifiable at
  // all — without it the funnel cannot tell the owner from a prospect.
  const { data, error } = await fromAny("pilot_events")
    .select("event_name, metadata, created_at, profile_id")
    .in("event_name", names)
    .gte("created_at", funnelWindowStart(now))
    .order("created_at", { ascending: false })
    .limit(FUNNEL_MAX_ROWS);

  if (error) {
    return {
      available: false,
      counts: [],
      rates: [],
      sources: [],
      totalEvents: 0,
      excludedPreview: 0,
      excludedAdmin: 0,
      historicalContaminationUnknown: HISTORICAL_CONTAMINATION_UNKNOWN,
      windowDays: FUNNEL_WINDOW_DAYS,
      truncated: false,
      countsAreLowerBound: false,
    };
  }

  return summariseFunnel((data ?? []) as FunnelRow[], await readAdminIds(supabase));
}

/**
 * The platform admin set — the owner and staff, NOT employers or workers.
 *
 * Two sources because the product carries two: a durable grant
 * (`profile_roles.role = 'admin'`) and the currently-active role
 * (`profiles.active_role = 'admin'`). Either makes the actor internal for
 * acquisition purposes.
 *
 * A failed read yields an EMPTY set, which means "exclude nobody" — the
 * pre-existing behaviour. Failing the other way would silently delete real
 * traffic from the owner's funnel, which is the worse error: an inflated
 * number is visibly suspicious, a deflated one is not.
 */
async function readAdminIds(supabase: SupabaseClient): Promise<Set<string>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [granted, active] = await Promise.all([
      sb.from("profile_roles").select("profile_id").eq("role", "admin"),
      sb.from("profiles").select("id").eq("active_role", "admin"),
    ]);
    const ids = new Set<string>();
    for (const r of (granted?.data ?? []) as { profile_id: string }[]) {
      if (r.profile_id) ids.add(r.profile_id);
    }
    for (const r of (active?.data ?? []) as { id: string }[]) {
      if (r.id) ids.add(r.id);
    }
    return ids;
  } catch {
    return new Set<string>();
  }
}

/**
 * Pure summary over the rows a read returned. Separated from the IO so the
 * population rules — preview exclusion, truncation, zero denominators — are
 * driven directly by tests rather than inferred from the query's source text.
 */
export function summariseFunnel(
  allRows: readonly FunnelRow[],
  adminProfileIds: ReadonlySet<string> = new Set<string>(),
): AcquisitionFunnel {
  // TRUNCATION IS JUDGED ON ROWS READ, BEFORE ANY FILTERING. Preview rows are
  // dropped below, which shrinks the array; deciding completeness afterwards
  // would let a fully saturated read look complete again and hand back
  // confident percentages built on a partial population.
  const truncated = allRows.length >= FUNNEL_MAX_ROWS;

  // ── W14 item 5: ONE population boundary, applied uniformly ──────────────
  // Every event feeding every rate passes the same test, so the rule cannot
  // be applied to a numerator and forgotten on its denominator. Excluding
  // preview origins and platform-admin activity leaves identified real users
  // and anonymous visitors — the population the acquisition question is
  // actually about. `lib/analytics/population.ts` owns the definitions.
  const classify = (r: FunnelRow) =>
    classifyEvent({ profileId: r.profile_id, metadata: r.metadata }, adminProfileIds);
  const rows = allRows.filter((r) => isBusinessFunnelCountable(classify(r)));
  const excludedPreview = allRows.filter((r) => classify(r) === "preview").length;
  const excludedAdmin = allRows.filter((r) => classify(r) === "admin").length;
  const countByEvent = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const r of rows) {
    countByEvent.set(r.event_name, (countByEvent.get(r.event_name) ?? 0) + 1);
    if (CONVERSION_EVENTS.includes(r.event_name)) {
      const src = r.metadata?.["utm_source"];
      const key =
        typeof src === "string" && src.trim().length > 0
          ? src.trim().slice(0, 60)
          : "(direct / none)";
      sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    }
  }

  const counts = FUNNEL_STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    count: countByEvent.get(s.key) ?? 0,
  }));

  const c = (k: string) => countByEvent.get(k) ?? 0;
  // The state is assigned once, below, for every rate at the same time — so
  // these literals deliberately carry only label/pct/note and cannot disagree
  // with it.
  const rates: Omit<FunnelRate, "state">[] = [
    {
      label: "Landing → CTA click",
      pct: pct(c(FUNNEL_EVENTS.ctaClicked), c(FUNNEL_EVENTS.landingViewed)),
      note: "share of landings that clicked a primary CTA",
    },
    {
      label: "Landing → registration started",
      pct: pct(
        c(FUNNEL_EVENTS.registrationStarted),
        c(FUNNEL_EVENTS.landingViewed),
      ),
      note: "share of landings that began signup",
    },
    {
      label: "Onboarding completion",
      pct: pct(
        c(FUNNEL_EVENTS.onboardingCompleted),
        c(FUNNEL_EVENTS.onboardingStarted),
      ),
      note: "share of started onboardings that finished",
    },
    {
      label: "Company need → submitted",
      pct: pct(
        c(FUNNEL_EVENTS.companyNeedSubmitted),
        c(FUNNEL_EVENTS.companyNeedStarted),
      ),
      note: "share of started company-need forms that were submitted",
    },
    // ── Mid-funnel conversion (W14): event-count ratios, not per-demand
    //    journeys — stated honestly in the note.
    {
      label: "Match preview → shortlist",
      pct: pct(
        c(FUNNEL_EVENTS.shortlistAdded),
        c(FUNNEL_EVENTS.matchPreviewGenerated),
      ),
      note: "shortlist adds per generated match preview (event counts, not per-demand journeys)",
    },
    {
      label: "Contact requested → booking proposed",
      pct: pct(
        c(FUNNEL_EVENTS.bookingProposed),
        c(FUNNEL_EVENTS.contactRequested),
      ),
      note: "booking proposals per contact request (event counts)",
    },
    {
      label: "Booking proposed → engagement created",
      pct: pct(
        c(FUNNEL_EVENTS.engagementCreated),
        c(FUNNEL_EVENTS.bookingProposed),
      ),
      note: "engagements created per booking proposal (event counts)",
    },
  ];

  const sources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count }));

  // ONE PLACE decides whether a share may be stated at all, and what KIND of
  // non-answer it is when it cannot be. Applying it to the whole list rather
  // than to each construction above means a rate added later cannot forget the
  // rule and quietly publish a number from a partial read.
  const finalRates: FunnelRate[] = rates.map((r) =>
    truncated
      ? {
          ...r,
          pct: null,
          note: `${r.note} — ${TRUNCATED_NOTE}`,
          state: "truncated" as const,
        }
      : {
          ...r,
          // A real measured zero is an ANSWER. A missing denominator is not,
          // and the two must not render the same way.
          state: (r.pct === null
            ? "insufficient_data"
            : "ok") as FunnelRateState,
        },
  );

  return {
    available: true,
    counts,
    rates: finalRates,
    sources,
    totalEvents: rows.length,
    excludedPreview,
    excludedAdmin,
    historicalContaminationUnknown: HISTORICAL_CONTAMINATION_UNKNOWN,
    windowDays: FUNNEL_WINDOW_DAYS,
    truncated,
    countsAreLowerBound: truncated,
  };
}
