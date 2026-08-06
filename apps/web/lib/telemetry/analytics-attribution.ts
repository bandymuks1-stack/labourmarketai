import "server-only";

import { cache } from "react";

import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import type { GovernanceRole } from "@/lib/company/role-capabilities";

/**
 * ORGANIZATION-AWARE ANALYTICS ATTRIBUTION (M-P0-8, owner directive
 * 2026-08-06 §14). ONE resolver that every server-side analytics writer
 * shares, extending W14 attribution with:
 *
 *   - workspace type (personal | organization);
 *   - organization id — the VALIDATED active workspace's organization, the
 *     same membership-truth chain every authority consumer uses. A personal
 *     workspace attributes NO organization (never fabricated); a revoked or
 *     forged workspace fails closed to personal (the employer context
 *     refuses it before we ever see it);
 *   - role context — the caller's governance role in that organization;
 *   - billing subject — M-P0-7's canonical subject for the same workspace.
 *
 * ISOLATION BY CONSTRUCTION: attribution is resolved server-side per
 * request from the caller's own validated workspace — an event fired while
 * acting for A can only ever carry A; B's id is not reachable from A's
 * request. Historical rows are append-only (`pilot_events` and
 * `usage_cost_events` carry no UPDATE policy and the cost ledger has
 * no-mutation triggers), so later revocation can never rewrite attribution.
 *
 * FAIL-SAFE: outside a request context (cron, scripts) or on any resolver
 * error this returns the personal/none shape — analytics must never break
 * or block a product action.
 */

export interface AnalyticsAttribution {
  readonly workspaceType: "personal" | "organization";
  readonly organizationId: string | null;
  readonly roleContext: GovernanceRole | null;
  readonly billingSubjectType: "profile" | "organization" | null;
}

const PERSONAL: AnalyticsAttribution = {
  workspaceType: "personal",
  organizationId: null,
  roleContext: null,
  billingSubjectType: null,
};

export const resolveAnalyticsAttribution = cache(
  async function resolveAnalyticsAttribution(): Promise<AnalyticsAttribution> {
    try {
      const billing = await resolveBillingSubject();
      if (!billing.subject) return PERSONAL;
      if (billing.subject.type === "organization") {
        return {
          workspaceType: "organization",
          organizationId: billing.subject.id,
          roleContext: billing.role,
          billingSubjectType: "organization",
        };
      }
      return { ...PERSONAL, billingSubjectType: "profile" };
    } catch {
      // No request context / resolver failure — honest personal/none.
      return PERSONAL;
    }
  },
);

/** The attribution as allowlisted funnel-metadata keys (bounded scalars). */
export async function analyticsAttributionMetadata(): Promise<
  Record<string, string>
> {
  const a = await resolveAnalyticsAttribution();
  const meta: Record<string, string> = { workspace_type: a.workspaceType };
  if (a.organizationId) meta.organization_id = a.organizationId;
  if (a.roleContext) meta.org_role = a.roleContext;
  if (a.billingSubjectType) meta.billing_subject = a.billingSubjectType;
  return meta;
}
