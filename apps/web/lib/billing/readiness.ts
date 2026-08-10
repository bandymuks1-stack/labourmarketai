/**
 * Billing readiness — OWNER-EDITABLE readiness config + claim ledger
 * (Branch 29 closure, billing readiness WITHOUT a payment provider).
 *
 * Pure data + helpers, no IO. Everything here is a READINESS declaration,
 * never a live-billing claim:
 *   - PRICING_READINESS_STATE is the owner-editable pricing state — prices
 *     stay drafts until the owner flips it to "owner_confirmed"; neither
 *     state makes anything purchasable (PAYMENTS_ENABLED stays false).
 *   - FEATURE_ENFORCEMENT maps EVERY plan feature key to its real
 *     enforcement seam or surface (guard-pinned: cited sites must exist and
 *     carry the real check — no phantom features, no silent claims).
 *   - BILLING_READINESS_ITEMS is a claim ledger (launch-board style): each
 *     claim cites a proof artifact whose existence is CI-guarded by
 *     lib/guards/billing-readiness.test.ts.
 *
 * Guarded by lib/guards/billing-readiness.test.ts (live payment capture
 * remains impossible: kill-switch, live hard-block, webhook live-reject,
 * no capture call sites, no secrets in client code).
 */

import {
  PRE_PAYMENT_PLANS,
  type FeatureKey,
  type PlanAudience,
} from "./plans";

// ─── Owner-editable pricing readiness state ─────────────────────────────────

export type PricingReadinessState = "draft_pricing" | "owner_confirmed";

/**
 * OWNER-EDITABLE. Flip to "owner_confirmed" ONLY when the owner has reviewed
 * and confirmed the plan prices/copy. This state never enables payments; it
 * only describes copy readiness.
 *
 * M6 (beta foundation audit 2026-08-08): while this reads "draft_pricing" the
 * /pricing price slot renders THIS state's copy and NOTHING ELSE. It no longer
 * renders the `pricing.plan.*` placeholder: production forces placeholder
 * markers ON (lib/env.ts), so every price slot showed real visitors a dashed
 * "Free: pricing TBD" box. Those four registry entries still exist but are now
 * rendered by nothing — content/placeholders.ts sits inside the owner-gated
 * landing freeze, so deleting them is a separate owner call. The real price's
 * only future home is `plans.price_eur_monthly`, surfaced after this flips.
 */
export const PRICING_READINESS_STATE: PricingReadinessState = "draft_pricing";

// ─── Feature enforcement registry (plan boundary ↔ real checks) ─────────────

export type EnforcementKind =
  /** A server action/route calls hasFeature("<key>") before acting. */
  | "server_gate"
  /** Admin-only feature enforced by superadmin RBAC, not billing. */
  | "admin_rbac"
  /** Free-tier feature backed by a real product surface; never billed. */
  | "free_surface"
  /**
   * Boundary declared in plans.ts; enforced by the entitlement seam
   * (entitlements-v1 entitlementAllows) the moment billing activates.
   * While payments are OFF the seam is deliberately permissive (pilot
   * preserved) — nothing is locked and nothing is charged.
   */
  | "declared_boundary_only";

export interface FeatureEnforcement {
  readonly kind: EnforcementKind;
  /** apps/web-relative source citation proving the seam/surface exists. */
  readonly site: string;
}

const ENTITLEMENT_SEAM = "lib/billing/entitlements-v1.ts";
const ADMIN_RBAC_SITE = "lib/auth/superadmin.ts";

export const FEATURE_ENFORCEMENT: Readonly<
  Record<FeatureKey, FeatureEnforcement>
> = {
  // worker
  worker_profile: {
    kind: "free_surface",
    site: "app/[locale]/dashboard/profile/page.tsx",
  },
  worker_journal: {
    kind: "free_surface",
    site: "app/[locale]/dashboard/journal/page.tsx",
  },
  worker_basic_skills: {
    kind: "free_surface",
    site: "app/[locale]/dashboard/profile/page.tsx",
  },
  readiness_checklist_countries: {
    kind: "declared_boundary_only",
    site: ENTITLEMENT_SEAM,
  },
  document_expiry_reminders: {
    kind: "declared_boundary_only",
    site: ENTITLEMENT_SEAM,
  },
  expanded_cv: { kind: "declared_boundary_only", site: ENTITLEMENT_SEAM },
  priority_visibility: {
    kind: "declared_boundary_only",
    site: ENTITLEMENT_SEAM,
  },
  // company
  company_create_needs: {
    kind: "declared_boundary_only",
    site: ENTITLEMENT_SEAM,
  },
  candidate_readiness_summaries: {
    kind: "declared_boundary_only",
    site: ENTITLEMENT_SEAM,
  },
  booking_requests: {
    kind: "server_gate",
    site: "lib/booking/booking-actions.ts",
  },
  communication: { kind: "declared_boundary_only", site: ENTITLEMENT_SEAM },
  team_matching: { kind: "declared_boundary_only", site: ENTITLEMENT_SEAM },
  // agency
  agency_multi_company: {
    kind: "declared_boundary_only",
    site: ENTITLEMENT_SEAM,
  },
  worker_pool: { kind: "declared_boundary_only", site: ENTITLEMENT_SEAM },
  doc_readiness_tracking: {
    kind: "declared_boundary_only",
    site: ENTITLEMENT_SEAM,
  },
  booking_pipeline: { kind: "declared_boundary_only", site: ENTITLEMENT_SEAM },
  // admin
  verify_documents: { kind: "admin_rbac", site: ADMIN_RBAC_SITE },
  manage_country_rules: { kind: "admin_rbac", site: ADMIN_RBAC_SITE },
  manage_pilots: { kind: "admin_rbac", site: ADMIN_RBAC_SITE },
};

/** Every feature key claimed by at least one plan (the boundary in use). */
export function featureKeysUsedByPlans(): FeatureKey[] {
  const used = new Set<FeatureKey>();
  for (const plan of PRE_PAYMENT_PLANS) {
    for (const key of Object.keys(plan.entitlements) as FeatureKey[]) {
      used.add(key);
    }
  }
  return [...used];
}

export interface EntitlementCoverageSummary {
  readonly total: number;
  readonly serverGated: number;
  readonly adminRbac: number;
  readonly freeSurface: number;
  readonly declaredOnly: number;
  readonly declaredOnlyKeys: readonly FeatureKey[];
}

/** Deterministic coverage summary from the registry (real config, no IO). */
export function summarizeEntitlementCoverage(): EntitlementCoverageSummary {
  const entries = Object.entries(FEATURE_ENFORCEMENT) as [
    FeatureKey,
    FeatureEnforcement,
  ][];
  const of = (k: EnforcementKind) => entries.filter(([, e]) => e.kind === k);
  return {
    total: entries.length,
    serverGated: of("server_gate").length,
    adminRbac: of("admin_rbac").length,
    freeSurface: of("free_surface").length,
    declaredOnly: of("declared_boundary_only").length,
    declaredOnlyKeys: of("declared_boundary_only").map(([k]) => k),
  };
}

/** Audiences whose paid tier today resolves to `payment_not_enabled`. */
export function paidTierAudiences(): PlanAudience[] {
  return PRE_PAYMENT_PLANS.filter(
    (p) => p.accessState === "payment_not_enabled",
  ).map((p) => p.audience);
}

// ─── Billing readiness claim ledger ─────────────────────────────────────────

export type BillingReadinessStatus = "ready" | "prepared" | "blocked_by_design";

export interface BillingReadinessItem {
  /** i18n key suffix under `adminBilling.readiness.items`. */
  readonly key: string;
  readonly status: BillingReadinessStatus;
  /** Repo-root-relative proof artifact — existence is CI-guarded. */
  readonly proof: string;
}

export const BILLING_READINESS_ITEMS: readonly BillingReadinessItem[] = [
  {
    key: "payments_kill_switch",
    status: "ready",
    proof: "apps/web/lib/guards/no-live-payments.test.ts",
  },
  {
    key: "live_mode_hard_block",
    status: "ready",
    proof: "apps/web/lib/billing/config-core.ts",
  },
  {
    key: "webhook_live_reject",
    status: "ready",
    proof: "apps/web/app/api/billing/webhook/route.ts",
  },
  {
    key: "plan_catalogue",
    status: "ready",
    proof: "apps/web/lib/billing/plans.ts",
  },
  {
    key: "entitlement_coverage",
    status: "prepared",
    proof: "apps/web/lib/billing/entitlements-v1.ts",
  },
  {
    // M6 (2026-08-08): proof retargeted from content/placeholders.ts to this
    // file. The pricing copy's real source is PRICING_READINESS_STATE above,
    // not a placeholder registry entry — the `pricing.plan.*` placeholders it
    // used to cite are no longer rendered anywhere, so citing them as the
    // proof of pricing copy would have been a claim about dead content.
    key: "pricing_copy",
    status: "prepared",
    proof: "apps/web/lib/billing/readiness.ts",
  },
  {
    key: "provider_connection",
    status: "blocked_by_design",
    proof: "apps/web/lib/billing/provider.ts",
  },
];
