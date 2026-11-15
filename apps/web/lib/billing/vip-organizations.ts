/**
 * PERMANENT VIP ORGANIZATIONS — owner decision 2026-11-15 (final).
 *
 * The owner's own organizations hold the highest organization plan that exists
 * now or later, at €0, with no end date, no automatic return to FREE, no card
 * and no Stripe subscription. This is a privilege of the ORGANIZATION, read by
 * the one entitlement resolver (lib/billing/entitlements-v1.ts) before any
 * subscription row, so nothing a provider event, a reconciliation run or the
 * end of a pilot pass writes can take it away.
 *
 * It grants a PLAN, never access: membership, roles, RLS and every other
 * organization's data are decided exactly as before.
 *
 * ONLY identities verified against production are listed (read 2026-11-15):
 * exact legal name, country, and an active owner membership. An organization
 * the owner named but which does not exist on the platform is NOT listed and
 * nothing is created for it; it is added here by id once it exists and its
 * identity is confirmed. Never list a similarly named organization.
 *
 *   - UAB „Nonstop Group" (LT, VAT LT100010790613) — the platform operator.
 *     Its 1 € pilot pass ends 2026-11-22; from then on this entry alone keeps
 *     the plan.
 *   - Labour market ai Sp. z o.o. (PL) — the owner of the software and IP.
 *
 * Owner-named, NOT on the platform on 2026-11-15 (no grant):
 *   - "Watchmaker Vismantas"
 *   - "Construction Design Solutions" (a separate entity that trades
 *     Watchmaker Vismantas products — never merged with it)
 *
 * Pure data. No IO.
 */

export interface VipOrganization {
  readonly organizationId: string;
  /** Legal name as stored on the platform, for review only (never matched on). */
  readonly legalName: string;
}

export const VIP_ORGANIZATIONS: readonly VipOrganization[] = [
  { organizationId: "20b2c802-c624-43c0-b368-8fa6c1fbeae3", legalName: "UAB „Nonstop Group“" },
  { organizationId: "19f47e78-7bd1-4120-9937-603dba769f8a", legalName: "Labour market ai Sp. z o.o" },
];

/** The plan name a VIP organization sees — one word, the same in every language. */
export const VIP_PLAN_LABEL = "VIP";

const VIP_IDS: ReadonlySet<string> = new Set(
  VIP_ORGANIZATIONS.map((o) => o.organizationId.toLowerCase()),
);

/** Whether this organization holds the permanent VIP privilege. Matches by id only. */
export function isVipOrganization(organizationId: string | null | undefined): boolean {
  return typeof organizationId === "string" && VIP_IDS.has(organizationId.toLowerCase());
}
