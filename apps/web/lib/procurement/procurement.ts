import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  PROCUREMENT_READ_LIMIT,
  isProcurementMigrationMissingCode,
  isValidProcurementApprovalStatus,
  isValidProcurementStatus,
  type ProcurementInquiryRow,
  type ProcurementOfferRow,
} from "@/lib/procurement/procurement-model";

/**
 * Procurement read service (functional completion train V2). Reads ONLY
 * with the caller's RLS-scoped client:
 *   - `procurement_inquiries` RLS: the requester, org managers
 *     (has_org_demand_access), or platform admin;
 *   - `procurement_offers` under the same audience via
 *     procurement_can_view_v1 — this module never widens either scope.
 *
 * SELF-HEALING MIRROR, NEVER SELF-DECIDING: when an inquiry's approval
 * mirror is 'pending' but its engine instance is already terminal, the read
 * calls the gated `sync_procurement_approval_v1` RPC — which only COPIES
 * the engine outcome — and re-reads. No decision is ever made here.
 *
 * INTERNAL ONLY: no email, no push, no webhook, no supplier contact, no
 * outbound call of any kind.
 *
 * Honest degradation: while the human-gated procurement migration is not
 * applied the reads see 42P01 and report { status: "needs-migration" } —
 * the section shows a calm "not available yet" state and nothing is faked.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const INQUIRY_COLUMNS =
  "id, organization_id, requester_profile_id, project_id, object_id, item_description, quantity, estimated_budget_cents, status, approval_status, selected_offer_id, order_reference, finance_record_id, created_at";

type RawRow = Record<string, unknown>;

/** bigint may arrive as a string — integer parse only, never a float API. */
function toCentsOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const cents =
    typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function toInquiry(r: RawRow): ProcurementInquiryRow | null {
  const status = String(r.status ?? "");
  if (!isValidProcurementStatus(status)) return null;
  const approval = String(r.approval_status ?? "");
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    requesterProfileId: String(r.requester_profile_id),
    projectId: (r.project_id as string | null) ?? null,
    objectId: (r.object_id as string | null) ?? null,
    itemDescription: String(r.item_description ?? ""),
    quantity: (r.quantity as string | null) ?? null,
    estimatedBudgetCents: toCentsOrNull(r.estimated_budget_cents),
    status,
    approvalStatus: isValidProcurementApprovalStatus(approval)
      ? approval
      : null,
    selectedOfferId: (r.selected_offer_id as string | null) ?? null,
    orderReference: (r.order_reference as string | null) ?? null,
    financeRecordId: (r.finance_record_id as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

function toOffer(r: RawRow): ProcurementOfferRow | null {
  const amountCents = toCentsOrNull(r.amount_cents);
  if (amountCents === null) return null;
  return {
    id: String(r.id),
    inquiryId: String(r.inquiry_id),
    supplierName: String(r.supplier_name ?? ""),
    amountCents,
    currency: String(r.currency ?? "EUR"),
    note: (r.note as string | null) ?? null,
    orgDocumentId: (r.org_document_id as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export type ProcurementOrgOption = {
  readonly organizationId: string;
  readonly name: string | null;
};

export type ProcurementOverviewResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      /** Everything the caller's RLS answers, newest first (requester rows +
       *  manager-visible org rows — the policy is the split). */
      readonly inquiries: readonly ProcurementInquiryRow[];
      /** Offers per inquiry id (comparison IS this list). */
      readonly offers: ReadonlyMap<string, readonly ProcurementOfferRow[]>;
      /** Organizations the caller could file an inquiry for. */
      readonly orgOptions: readonly ProcurementOrgOption[];
      readonly error: string | null;
    };

/** Organizations the caller belongs to over EITHER membership truth. */
async function readOrgOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProcurementOrgOption[]> {
  const [ecRes, cmRes] = await Promise.all([
    asAny(supabase)
      .from("engagement_contexts")
      .select("organization_id, organizations(display_name, legal_name)")
      .eq("profile_id", userId)
      .eq("status", "active")
      .limit(PROCUREMENT_READ_LIMIT),
    asAny(supabase)
      .from("company_memberships")
      .select("organization_id, organizations(display_name, legal_name)")
      .eq("profile_id", userId)
      .eq("status", "active")
      .limit(PROCUREMENT_READ_LIMIT),
  ]);
  type OrgJoin = {
    organization_id: string | null;
    organizations: {
      display_name: string | null;
      legal_name: string | null;
    } | null;
  };
  const options = new Map<string, ProcurementOrgOption>();
  for (const row of [
    ...((ecRes.error ? [] : (ecRes.data ?? [])) as OrgJoin[]),
    ...((cmRes.error ? [] : (cmRes.data ?? [])) as OrgJoin[]),
  ]) {
    if (!row.organization_id) continue;
    if (options.has(row.organization_id)) continue;
    options.set(row.organization_id, {
      organizationId: row.organization_id,
      name:
        row.organizations?.display_name?.trim() ||
        row.organizations?.legal_name?.trim() ||
        null,
    });
  }
  return [...options.values()];
}

/**
 * One bounded, RLS-scoped pass building everything the procurement section
 * renders. Never throws; never fabricates.
 */
export async function getProcurementOverview(): Promise<ProcurementOverviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const listRes = await asAny(supabase)
    .from("procurement_inquiries")
    .select(INQUIRY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(PROCUREMENT_READ_LIMIT);
  if (listRes.error) {
    if (isProcurementMigrationMissingCode(listRes.error.code)) {
      return { status: "needs-migration" };
    }
    return {
      status: "ok",
      inquiries: [],
      offers: new Map(),
      orgOptions: [],
      error: String(listRes.error.message ?? "read failed"),
    };
  }

  let inquiries = ((listRes.data ?? []) as RawRow[])
    .map(toInquiry)
    .filter((i): i is ProcurementInquiryRow => i !== null);

  // SELF-HEALING MIRROR: a pending approval whose engine instance is
  // terminal is synced through the gated RPC (which only copies the engine
  // outcome) and re-read. Bounded; failures degrade silently.
  const pendingIds = inquiries
    .filter((i) => i.approvalStatus === "pending")
    .map((i) => i.id);
  if (pendingIds.length > 0) {
    const wfRes = await asAny(supabase)
      .from("workflow_instances")
      .select("context_entity_id, status")
      .eq("context_entity_type", "procurement")
      .in("context_entity_id", pendingIds)
      .order("created_at", { ascending: true })
      .limit(PROCUREMENT_READ_LIMIT);
    if (!wfRes.error) {
      // Ascending order means the LAST instance per context wins; a context
      // whose latest instance is still pending is not terminal.
      const latest = new Map<string, string>();
      for (const w of (wfRes.data ?? []) as RawRow[]) {
        latest.set(String(w.context_entity_id), String(w.status));
      }
      const terminal = new Set(
        [...latest.entries()]
          .filter(([, status]) => status !== "pending")
          .map(([id]) => id),
      );
      if (terminal.size > 0) {
        await Promise.all(
          [...terminal].map((id) =>
            asAny(supabase)
              .rpc("sync_procurement_approval_v1", { p_inquiry_id: id })
              .then(() => undefined)
              .catch(() => undefined),
          ),
        );
        const reRes = await asAny(supabase)
          .from("procurement_inquiries")
          .select(INQUIRY_COLUMNS)
          .in("id", [...terminal])
          .limit(PROCUREMENT_READ_LIMIT);
        if (!reRes.error) {
          const refreshed = new Map(
            ((reRes.data ?? []) as RawRow[])
              .map(toInquiry)
              .filter((i): i is ProcurementInquiryRow => i !== null)
              .map((i) => [i.id, i] as const),
          );
          inquiries = inquiries.map((i) => refreshed.get(i.id) ?? i);
        }
      }
    }
  }

  // Offers for every visible inquiry (RLS re-checks).
  const offers = new Map<string, ProcurementOfferRow[]>();
  if (inquiries.length > 0) {
    const offRes = await asAny(supabase)
      .from("procurement_offers")
      .select(
        "id, inquiry_id, supplier_name, amount_cents, currency, note, org_document_id, created_at",
      )
      .in(
        "inquiry_id",
        inquiries.map((i) => i.id),
      )
      .order("created_at", { ascending: true })
      .limit(PROCUREMENT_READ_LIMIT * 5);
    if (!offRes.error) {
      for (const raw of (offRes.data ?? []) as RawRow[]) {
        const offer = toOffer(raw);
        if (!offer) continue;
        const list = offers.get(offer.inquiryId) ?? [];
        list.push(offer);
        offers.set(offer.inquiryId, list);
      }
    }
  }

  const orgOptions = await readOrgOptions(supabase, user.id);

  return { status: "ok", inquiries, offers, orgOptions, error: null };
}
