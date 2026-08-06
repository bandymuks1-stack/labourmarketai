import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import {
  hasOrganizationCapability,
  type GovernanceRole,
} from "@/lib/company/role-capabilities";

/**
 * CANONICAL BILLING SUBJECT (M-P0-7, owner directive 2026-08-06 §13).
 *
 * WHO a plan belongs to is a SUBJECT — `profile` (personal) or
 * `organization` — never "the profile that happened to pay". One profile may
 * simultaneously hold a personal plan, pay for organization A, and pay for
 * organization B; A and B may hold the SAME plan key; cancelling A's touches
 * nothing of B's. The storage mapping (schema shipped by the owner-gated
 * Stripe TEST package, PR #844 migration `20260721150000`):
 *
 *   subject_type = profile       ⇔ billing_subscriptions.origin_organization_id IS NULL
 *   subject_type = organization  ⇔ billing_subscriptions.organization_id = <org>
 *   payer profile                =  billing_subscriptions.owner_id (always a real person)
 *   Stripe customer              =  per PAYER profile (billing_customers.owner_id)
 *   plan / provider ids          =  plan_key / provider_customer_id / provider_subscription_id
 *
 * DOCTRINE ENFORCED HERE:
 *   - the WORKSPACE selects the PROPOSED billing subject (Personal → profile;
 *     an organization workspace → that organization);
 *   - organization membership does NOT automatically grant billing
 *     authority — only the `manage-billing` capability (owner/admin) may act
 *     on an organization's billing (`billingAuthority` is separate from the
 *     proposal);
 *   - NO ENTITLEMENT TRANSFER on workspace switch: entitlement reads for an
 *     organization subject consider ONLY that organization's rows; personal
 *     rows never empower an organization and vice versa
 *     (`effective-entitlements.ts` resolves per-subject);
 *   - webhooks bind the subject via metadata (`owner_id` +
 *     `organization_id`), verified server-side — PR #844 `metadata-core.ts`.
 *
 * No Stripe Live, no real prices, no charges — the billing config layer
 * (`config-core.ts`) keeps live unreachable and this module adds no
 * provider calls at all.
 */

export type BillingSubject =
  | { readonly type: "profile"; readonly id: string }
  | { readonly type: "organization"; readonly id: string };

export interface BillingSubjectContext {
  /** null = unauthenticated. */
  readonly subject: BillingSubject | null;
  /** The human who would pay — always the signed-in profile. */
  readonly payerProfileId: string | null;
  /** May the payer ACT on this subject's billing (checkout, cancel,
   *  portal)? Personal subject → always their own; organization subject →
   *  requires the manage-billing capability. */
  readonly billingAuthority: boolean;
  /** The governance role behind an organization subject (null for
   *  personal). */
  readonly role: GovernanceRole | null;
}

/**
 * The workspace proposes the subject; membership + capability decide the
 * authority. Request-cached — checkout, portal and entitlement reads must
 * agree within one request.
 */
export const resolveBillingSubject = cache(
  async function resolveBillingSubject(): Promise<BillingSubjectContext> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { subject: null, payerProfileId: null, billingAuthority: false, role: null };
    }

    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind === "ok") {
      return {
        subject: { type: "organization", id: ctx.organizationId },
        payerProfileId: user.id,
        billingAuthority: hasOrganizationCapability(ctx.role, "manage-billing"),
        role: ctx.role,
      };
    }

    // Personal workspace, no organization, or no governance role — the
    // person acts for THEMSELVES. (An engagement-only worker inside an
    // employer's workspace intentionally lands here too: employment is
    // never billing authority.)
    return {
      subject: { type: "profile", id: user.id },
      payerProfileId: user.id,
      billingAuthority: true,
      role: null,
    };
  },
);
