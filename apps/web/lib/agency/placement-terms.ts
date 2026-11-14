import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * AN AGENCY'S PLACEMENT TERM (migration 20261114120000, RED, owner-gated).
 *
 * The agency's own statement to employers: an amount, a currency, the
 * condition under which it applies and, when the agency has one, a link to
 * its full terms. It is the agency's commercial offer, never platform
 * pricing, and no agency, amount or text is named in code: the agency states
 * it on its own partners page, and the employer sees exactly what was stated.
 *
 * The employer accepts it at ONE moment only: when accepting that agency's
 * candidate (respond_agency_candidate_offer_v2 records which term). It is
 * due only on an actual placement; viewing, contacting or receiving an offer
 * records nothing.
 *
 * Until the migration is applied every read answers "unavailable" and the
 * surfaces show nothing about terms — they never invent one.
 */
export type PlacementTerm = {
  readonly id: string;
  readonly companyId: string;
  readonly feeAmount: number;
  readonly currency: string;
  readonly conditionText: string;
  readonly conditionLanguage: string;
  readonly termsUrl: string | null;
  readonly createdAt: string;
};

type Row = {
  id: string;
  company_id: string;
  fee_amount: number | string;
  currency: string;
  condition_text: string;
  condition_language: string;
  terms_url: string | null;
  created_at: string;
};

const COLUMNS = "id, company_id, fee_amount, currency, condition_text, condition_language, terms_url, created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toTerm(r: Row): PlacementTerm {
  return {
    id: r.id,
    companyId: r.company_id,
    feeAmount: Number(r.fee_amount),
    currency: r.currency,
    conditionText: r.condition_text,
    conditionLanguage: r.condition_language,
    termsUrl: r.terms_url,
    createdAt: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: unknown): any => supabase;

/** Missing table / function: the migration is not applied here. */
export function placementTermsMissing(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883";
}

/** The CURRENT term of each agency asked about (RLS shows current terms to
 *  every signed-in caller). An agency without a term is simply absent. */
export async function readCurrentPlacementTerms(
  agencyCompanyIds: readonly string[],
): Promise<
  | { readonly kind: "ok"; readonly byAgency: ReadonlyMap<string, PlacementTerm> }
  | { readonly kind: "unavailable" }
> {
  const ids = [...new Set(agencyCompanyIds.filter((id) => UUID.test(id)))];
  if (ids.length === 0) return { kind: "ok", byAgency: new Map() };
  const supabase = await createClient();
  const { data, error } = await db(supabase)
    .from("agency_placement_terms")
    .select(COLUMNS)
    .in("company_id", ids)
    .is("retired_at", null);
  if (error) return { kind: "unavailable" };
  return {
    kind: "ok",
    byAgency: new Map(((data ?? []) as Row[]).map((r) => [r.company_id, toTerm(r)] as const)),
  };
}

/** Which agency made each offer (the client owns the offer rows it reads). */
export async function readOfferAgencies(
  offerIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const ids = [...new Set(offerIds.filter((id) => UUID.test(id)))];
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await db(supabase)
    .from("agency_candidate_offers")
    .select("id, agency_company_id")
    .in("id", ids);
  if (error) return new Map();
  return new Map(
    ((data ?? []) as { id: string; agency_company_id: string }[]).map((r) => [r.id, r.agency_company_id] as const),
  );
}

/** The term an employer sees on each offer: offer id → the offering agency's
 *  current term. Offers of agencies without a term are absent. */
export async function readPlacementTermsForOffers(
  offerIds: readonly string[],
): Promise<
  | { readonly kind: "ok"; readonly byOffer: ReadonlyMap<string, PlacementTerm> }
  | { readonly kind: "unavailable" }
> {
  const agencyByOffer = await readOfferAgencies(offerIds);
  const terms = await readCurrentPlacementTerms([...agencyByOffer.values()]);
  if (terms.kind !== "ok") return terms;
  const byOffer = new Map<string, PlacementTerm>();
  for (const [offerId, agencyId] of agencyByOffer) {
    const term = terms.byAgency.get(agencyId);
    if (term) byOffer.set(offerId, term);
  }
  return { kind: "ok", byOffer };
}

/** The agency's own current term, for its partners page. */
export async function readOwnPlacementTerm(
  companyId: string,
): Promise<
  | { readonly kind: "ok"; readonly term: PlacementTerm | null }
  | { readonly kind: "unavailable" }
> {
  if (!UUID.test(companyId)) return { kind: "ok", term: null };
  const terms = await readCurrentPlacementTerms([companyId]);
  if (terms.kind !== "ok") return terms;
  return { kind: "ok", term: terms.byAgency.get(companyId) ?? null };
}

/** The amount as the reader's locale writes money ("300 €", "€300"). */
export function formatPlacementFee(term: Pick<PlacementTerm, "feeAmount" | "currency">, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: term.currency,
      maximumFractionDigits: Number.isInteger(term.feeAmount) ? 0 : 2,
    }).format(term.feeAmount);
  } catch {
    return `${term.feeAmount} ${term.currency}`;
  }
}
