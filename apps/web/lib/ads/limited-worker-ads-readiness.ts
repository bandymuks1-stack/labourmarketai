import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Limited-worker-ads readiness (Wagon 1) — derives READY / NOT_READY for the
 * owner's "limited worker ads" launch decision from REAL signals only.
 * NO FAKE GREEN: every runtime item is probed live; every code item cites a
 * repo proof whose existence + wiring is pinned by
 * lib/guards/limited-worker-ads-readiness.test.ts.
 *
 * Follows the claim-ledger pattern of lib/billing/readiness.ts, split into:
 *   - RUNTIME items — probed against production data through the caller's
 *     session (admin-gated consent RPC; draft-gated ask-table probe). An
 *     unapplied migration or an empty supply is an honest red, not a warning.
 *   - CODE items — shipped seams (discovery surface, anonymisation policy,
 *     bounded request budgets, freshness demotion). They are claims about
 *     the repo, so they are constants here and their proof files are
 *     CI-guarded — never a runtime pretence.
 *
 * Consumed by the superadmin launch-readiness page. Ads stay a HUMAN
 * decision: READY here means "the platform pieces exist and are live", never
 * "spend money now".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient): any => c;

export type WorkerAdsReadinessStatus = "READY" | "NOT_READY";

export type WorkerAdsItemKey =
  | "consent_spine"
  | "discoverable_supply"
  | "contact_request_flow"
  | "discovery_surface"
  | "anonymisation_policy"
  | "rate_limits"
  | "freshness_demotion";

export interface WorkerAdsReadinessItem {
  readonly key: WorkerAdsItemKey;
  readonly kind: "runtime" | "code";
  readonly ok: boolean;
  /** apps/web- or repo-relative proof artifact (CI-guarded existence). */
  readonly proof: string;
  /** Real number behind the signal, when one exists (e.g. supply count). */
  readonly value: number | null;
}

export interface WorkerAdsReadiness {
  readonly status: WorkerAdsReadinessStatus;
  readonly items: readonly WorkerAdsReadinessItem[];
}

/** The runtime facts the derivation needs — read separately so the pure
 *  derivation is unit-testable without IO. */
export interface WorkerAdsRuntimeSignals {
  /** The applied consent spine answered (admin_privacy_readiness_counts ok). */
  readonly consentSpineApplied: boolean;
  /** CURRENT granted discoverability consents (null = unknown). */
  readonly discoverableWorkers: number | null;
  /** The draft-gated contact-ask model (20260716120000) is applied. */
  readonly contactRequestModelApplied: boolean;
}

/** Code-level seams shipped by Wagon 1 + earlier wagons. Constants ON
 *  PURPOSE: they claim repo state, and the guard test pins each proof file
 *  exists and is wired — the honest way to assert "the code exists". */
const CODE_ITEMS: readonly Omit<WorkerAdsReadinessItem, "value">[] = [
  {
    key: "discovery_surface",
    kind: "code",
    ok: true,
    proof: "app/[locale]/dashboard/company/scouting/page.tsx",
  },
  {
    key: "anonymisation_policy",
    kind: "code",
    ok: true,
    proof: "lib/visibility/worker-profile-visibility.ts",
  },
  {
    key: "rate_limits",
    kind: "code",
    ok: true,
    proof: "lib/limits/request-rate-limits.ts",
  },
  {
    key: "freshness_demotion",
    kind: "code",
    ok: true,
    proof: "lib/scouting/profile-freshness.ts",
  },
];

/** Pure derivation — READY only when EVERY item is ok (no partial green). */
export function deriveWorkerAdsReadiness(
  signals: WorkerAdsRuntimeSignals,
): WorkerAdsReadiness {
  const items: WorkerAdsReadinessItem[] = [
    {
      key: "consent_spine",
      kind: "runtime",
      ok: signals.consentSpineApplied,
      proof: "supabase/migrations/20260711130000_privacy_consent_and_disclosure_v1.sql",
      value: null,
    },
    {
      key: "discoverable_supply",
      kind: "runtime",
      // Unknown counts are NOT ready (fail closed) — never a fake green.
      ok:
        typeof signals.discoverableWorkers === "number" &&
        signals.discoverableWorkers > 0,
      proof: "lib/admin/launch-readiness.ts",
      value: signals.discoverableWorkers,
    },
    {
      key: "contact_request_flow",
      kind: "runtime",
      ok: signals.contactRequestModelApplied,
      proof: "supabase/migrations/20260716120000_contact_disclosure_requests_v1.sql",
      value: null,
    },
    ...CODE_ITEMS.map((c) => ({ ...c, value: null })),
  ];
  return {
    status: items.every((i) => i.ok) ? "READY" : "NOT_READY",
    items,
  };
}

/** Probe the runtime signals with the CALLER's session. The consent RPC is
 *  is_admin()-gated in SQL; the ask-table probe reads only the caller's own
 *  RLS-visible rows (existence is what matters, not content). */
export async function getWorkerAdsReadiness(): Promise<WorkerAdsReadiness> {
  const supabase = await createClient();

  let consentSpineApplied = false;
  let discoverableWorkers: number | null = null;
  try {
    const { data, error } = await asAny(supabase).rpc(
      "admin_privacy_readiness_counts",
    );
    if (!error && data?.ok) {
      consentSpineApplied = true;
      discoverableWorkers =
        typeof data.discoverable === "number" ? data.discoverable : null;
    }
  } catch {
    // absent RPC / not admin → honest red
  }

  let contactRequestModelApplied = false;
  try {
    const { error } = await asAny(supabase)
      .from("contact_disclosure_requests")
      .select("id", { count: "exact", head: true });
    contactRequestModelApplied = !error;
  } catch {
    contactRequestModelApplied = false;
  }

  return deriveWorkerAdsReadiness({
    consentSpineApplied,
    discoverableWorkers,
    contactRequestModelApplied,
  });
}
