import "server-only";

import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { getBillingConfigFor } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { readOrganizationBillingLinks } from "@/lib/billing/subscription-store";
import {
  buildOrgInvoiceList,
  evaluateOrgInvoiceAccess,
  type CustomerInvoiceRead,
  type OrgInvoicesResult,
} from "@/lib/billing/org-invoices-core";

/**
 * The organization's Stripe invoices for the account billing section
 * (registry 7.20) — read LIVE from Stripe at request time, server-side, through
 * the one provider seam (getBillingProvider → the Stripe adapter). Nothing is
 * stored and nothing is written.
 *
 * Every key is resolved on the server, in this order:
 *   1. WHO: `resolveBillingSubject()` — the workspace's organization and the
 *      `manage-billing` authority, proven from the caller's own membership
 *      (the same check checkout, the portal and the pilot pass use). Takes no
 *      argument: a client can name neither the organization nor a customer.
 *   2. WHETHER: the organization's billing config (pilot-aware).
 *   3. WHICH customers: the organization's own stored subscription rows
 *      (`readOrganizationBillingLinks`) — org-keyed, so every billing manager
 *      sees the same list, whoever paid.
 *   4. WHICH invoices: per customer, filtered to the ones attributed to this
 *      organization (org-invoices-core) — a payer's invoices for another
 *      organization never show here.
 */
export async function readOrganizationInvoices(): Promise<OrgInvoicesResult> {
  const workspace = await resolveBillingSubject();
  const organizationId = workspace.subject?.type === "organization" ? workspace.subject.id : null;
  const cfg = getBillingConfigFor(organizationId);
  const access = evaluateOrgInvoiceAccess({
    subject: workspace.subject,
    billingAuthority: workspace.billingAuthority,
    billingState: cfg.state,
  });
  if (!access.ok) return access.result;

  const links = await readOrganizationBillingLinks({
    organizationId: access.organizationId,
    testMode: cfg.testMode,
  });
  if (links.status !== "ok") return { state: "unknown" };
  if (links.customerIds.length === 0) return { state: "no_customer" };

  const provider = await getBillingProvider();
  if (!provider.active || !provider.listCustomerInvoices) return { state: "unknown" };
  const list = provider.listCustomerInvoices.bind(provider);

  const reads: CustomerInvoiceRead[] = await Promise.all(
    links.customerIds.map(async (customerId): Promise<CustomerInvoiceRead> => {
      try {
        const r = await list(customerId);
        return r.ok ? { ok: true, invoices: r.invoices, hasMore: r.hasMore } : { ok: false };
      } catch {
        return { ok: false };
      }
    }),
  );

  return buildOrgInvoiceList({
    organizationId: access.organizationId,
    subscriptionIds: links.subscriptionIds,
    livemode: !cfg.testMode,
    reads,
  });
}
