import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

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
 */

const WINDOW_ROWS = 5000;

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

export type FunnelRate = { label: string; pct: number | null; note: string };

export type AcquisitionFunnel = {
  available: boolean;
  counts: { key: string; label: string; count: number }[];
  rates: FunnelRate[];
  /** Top first-touch utm_source values among conversion events. */
  sources: { source: string; count: number }[];
  totalEvents: number;
  /** Count of non-production (localhost / preview) events excluded. */
  excludedPreview: number;
};

type FunnelRow = {
  event_name: string;
  metadata: Record<string, unknown> | null;
};

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function getAcquisitionFunnel(
  supabase: SupabaseClient,
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
        limit: (n: number) => Promise<{
          data: FunnelRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  const { data, error } = await fromAny("pilot_events")
    .select("event_name, metadata")
    .in("event_name", names)
    .limit(WINDOW_ROWS);

  if (error) {
    return {
      available: false,
      counts: [],
      rates: [],
      sources: [],
      totalEvents: 0,
      excludedPreview: 0,
    };
  }

  const allRows: FunnelRow[] = (data ?? []) as FunnelRow[];
  // Exclude events fired from non-production origins (localhost / Vercel
  // preview) so dev/preview traffic never inflates the owner's real funnel.
  const rows = allRows.filter((r) => r.metadata?.["preview_host"] !== true);
  const excludedPreview = allRows.length - rows.length;
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
  const rates: FunnelRate[] = [
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

  return {
    available: true,
    counts,
    rates,
    sources,
    totalEvents: rows.length,
    excludedPreview,
  };
}
