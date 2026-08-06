import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider } from "@/lib/billing/provider";
import { customerMetadata } from "@/lib/billing/metadata-core";

/**
 * Billing customer store (Stripe TEST subscriptions v1) — the SERVER-only
 * profile ↔ provider-customer mapping over `billing_customers` (applied
 * migration 20260613200000). One TEST customer per profile:
 *   - lookup is always by the AUTHENTICATED caller's profile id — a caller can
 *     never supply someone else's customer id;
 *   - creation goes through the provider seam (adapter-only SDK access) with
 *     canonical metadata and a per-profile idempotency key;
 *   - a concurrent create race resolves via the unique (owner_id, provider)
 *     constraint → re-read, never a second mapping;
 *   - degrades honestly to "needs-migration" if the table is absent.
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type CustomerLookup =
  | { status: "found"; customerId: string }
  | { status: "absent" }
  | { status: "needs-migration" };

/** The caller's OWN stored TEST customer id (or absent). */
export async function findBillingCustomer(
  ownerId: string,
): Promise<CustomerLookup> {
  const { data, error } = await admin()
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("owner_id", ownerId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (error) {
    if (error.code === RELATION_ABSENT) return { status: "needs-migration" };
    return { status: "absent" };
  }
  if (!data?.provider_customer_id) return { status: "absent" };
  return { status: "found", customerId: data.provider_customer_id };
}

export type EnsureCustomerResult =
  | { ok: true; customerId: string }
  | { ok: false; reason: "needs-migration" | "provider_inactive" | string };

/**
 * Find-or-create the caller's TEST customer. Reuses the stored mapping;
 * otherwise creates ONE provider customer (idempotent) and persists it.
 */
export async function ensureBillingCustomer(user: {
  id: string;
  email?: string | null;
}): Promise<EnsureCustomerResult> {
  const existing = await findBillingCustomer(user.id);
  if (existing.status === "needs-migration") {
    return { ok: false, reason: "needs-migration" };
  }
  if (existing.status === "found") {
    return { ok: true, customerId: existing.customerId };
  }

  const provider = await getBillingProvider();
  if (!provider.active) return { ok: false, reason: "provider_inactive" };

  const created = await provider.createCustomer({
    ownerId: user.id,
    email: user.email ?? null,
    metadata: customerMetadata(user.id),
  });
  if (!created.ok) return { ok: false, reason: created.reason };

  const { error } = await admin().from("billing_customers").insert({
    owner_id: user.id,
    provider: "stripe",
    provider_customer_id: created.customerId,
    test_mode: true,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Concurrent request already persisted a mapping — use THAT one so the
      // stored mapping stays the single source of truth.
      const raced = await findBillingCustomer(user.id);
      if (raced.status === "found") {
        return { ok: true, customerId: raced.customerId };
      }
    }
    if (error.code === RELATION_ABSENT) {
      return { ok: false, reason: "needs-migration" };
    }
    return { ok: false, reason: "store_error" };
  }
  return { ok: true, customerId: created.customerId };
}
