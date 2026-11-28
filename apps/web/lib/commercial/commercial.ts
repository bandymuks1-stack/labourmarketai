import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  isContractStatus,
  isProposalStatus,
  type CommercialData,
  type Contract,
  type Proposal,
} from "@/lib/commercial/commercial-model";

/**
 * Commercial CRM read model (Wagon 10). Owner-scoped by RLS: a user reads their
 * own proposals + contracts. Honest degradation on a missing relation. Invoices
 * + payments are NOT read here — they belong to the canonical finance layer.
 */

export * from "@/lib/commercial/commercial-model";

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}
function migMissing(code?: string): boolean {
  return code === RELATION_NOT_FOUND || code === UNDEFINED_COLUMN;
}

type ProposalRow = {
  id: string;
  number: string | null;
  title: string;
  amount_cents: number | string;
  status: string;
  validity_until: string | null;
};
const PROPOSAL_FIELDS = "id, number, title, amount_cents, status, validity_until";

function mapProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    amountCents: Number(row.amount_cents) || 0,
    status: row.status as Proposal["status"],
    validityUntil: row.validity_until,
  };
}

export async function supportsServiceRequestProposals(supabase: SupabaseClient): Promise<boolean> {
  // The link column and the conversion RPC are installed in the same migration.
  // Check availability through the caller's own PostgREST client without reading rows.
  const { error } = await asAny(supabase)
    .from("proposals")
    .select("service_offering_request_id")
    .limit(0);
  return !error;
}

export async function findOpenServiceRequestProposal(
  supabase: SupabaseClient,
  providerId: string,
  requestId: string,
): Promise<{ proposal: Proposal | null } | null> {
  const { data, error } = await asAny(supabase)
    .from("proposals")
    .select(PROPOSAL_FIELDS)
    .eq("owner_id", providerId)
    .eq("service_offering_request_id", requestId)
    .in("status", ["draft", "sent", "accepted"])
    .maybeSingle();
  if (error) return null;
  return { proposal: data ? mapProposal(data as ProposalRow) : null };
}

export async function getMyCommercial(focusedProposal?: Proposal): Promise<CommercialData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const pRes = await asAny(supabase)
    .from("proposals")
    .select(PROPOSAL_FIELDS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (pRes.error) {
    if (migMissing(pRes.error.code)) return { applied: false };
    return { applied: true, proposals: [], contracts: [] };
  }

  const proposals = ((pRes.data ?? []) as ProposalRow[])
    .filter((r) => isProposalStatus(r.status))
    .map(mapProposal);
  if (focusedProposal && !proposals.some((proposal) => proposal.id === focusedProposal.id)) {
    proposals.unshift(focusedProposal);
  }

  const cRes = await asAny(supabase)
    .from("contracts")
    .select("id, number, title, proposal_id, parties, value_cents, status, signed_document_ref, start_date, end_date")
    .order("created_at", { ascending: false })
    .limit(200);
  type CRow = { id: string; number: string | null; title: string; proposal_id: string | null; parties: string | null; value_cents: number | string; status: string; signed_document_ref: string | null; start_date: string | null; end_date: string | null };
  const contracts: Contract[] = cRes.error
    ? []
    : ((cRes.data ?? []) as CRow[])
        .filter((r) => isContractStatus(r.status))
        .map((r) => ({
          id: r.id,
          number: r.number,
          title: r.title,
          proposalId: r.proposal_id,
          parties: r.parties,
          valueCents: Number(r.value_cents) || 0,
          status: r.status as Contract["status"],
          signedDocumentRef: r.signed_document_ref,
          startDate: r.start_date,
          endDate: r.end_date,
        }));

  // Which ACCEPTED proposals already have a contract, read for those proposals
  // only — never inferred from the contract list above, which stops at 200 and
  // would let an older contract fall off and the "create contract" step
  // reappear for a proposal that already has one.
  const acceptedIds = proposals.filter((p) => p.status === "accepted").map((p) => p.id);
  let contractedProposalIds: string[] | null = [];
  if (acceptedIds.length > 0) {
    const linked = await asAny(supabase)
      .from("contracts")
      .select("proposal_id")
      .in("proposal_id", acceptedIds)
      .limit(acceptedIds.length * 50);
    contractedProposalIds = linked.error
      ? null
      : [...new Set(((linked.data ?? []) as { proposal_id: string | null }[]).map((r) => r.proposal_id).filter((x): x is string => !!x))];
  }
  return { applied: true, proposals, contracts, contractedProposalIds };
}
