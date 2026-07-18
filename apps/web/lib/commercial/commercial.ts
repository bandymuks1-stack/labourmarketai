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

export async function getMyCommercial(): Promise<CommercialData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const pRes = await asAny(supabase)
    .from("proposals")
    .select("id, number, title, amount_cents, status, validity_until")
    .order("created_at", { ascending: false })
    .limit(200);
  if (pRes.error) {
    if (migMissing(pRes.error.code)) return { applied: false };
    return { applied: true, proposals: [], contracts: [] };
  }

  type PRow = { id: string; number: string | null; title: string; amount_cents: number | string; status: string; validity_until: string | null };
  const proposals: Proposal[] = ((pRes.data ?? []) as PRow[])
    .filter((r) => isProposalStatus(r.status))
    .map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      amountCents: Number(r.amount_cents) || 0,
      status: r.status as Proposal["status"],
      validityUntil: r.validity_until,
    }));

  const cRes = await asAny(supabase)
    .from("contracts")
    .select("id, number, title, parties, value_cents, status, signed_document_ref, start_date, end_date")
    .order("created_at", { ascending: false })
    .limit(200);
  type CRow = { id: string; number: string | null; title: string; parties: string | null; value_cents: number | string; status: string; signed_document_ref: string | null; start_date: string | null; end_date: string | null };
  const contracts: Contract[] = cRes.error
    ? []
    : ((cRes.data ?? []) as CRow[])
        .filter((r) => isContractStatus(r.status))
        .map((r) => ({
          id: r.id,
          number: r.number,
          title: r.title,
          parties: r.parties,
          valueCents: Number(r.value_cents) || 0,
          status: r.status as Contract["status"],
          signedDocumentRef: r.signed_document_ref,
          startDate: r.start_date,
          endDate: r.end_date,
        }));

  return { applied: true, proposals, contracts };
}
