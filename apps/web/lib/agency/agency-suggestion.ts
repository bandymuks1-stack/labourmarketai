import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * AN AGENCY THE PRODUCT MAY SUGGEST TO A WORKER (migration 20261114120000).
 *
 * The list is kept by an admin (platform_suggested_agencies); no agency is
 * named in code. The database decides who sees a suggestion: a worker with no
 * active place on any agency's roster, who was never on this agency's roster
 * (a withdrawal is an answer). Everyone else — and everyone while the
 * migration is not applied — gets an empty list.
 */
export type AgencySuggestion = {
  readonly companyId: string;
  readonly agencyName: string;
  /** The version of the consent text the worker is shown; their choice is
   *  recorded against it and refused if it changed. */
  readonly consentTextVersion: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: unknown): any => supabase;

export async function readAgencySuggestionsForMe(): Promise<readonly AgencySuggestion[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await db(supabase).rpc("list_agency_suggestions_for_me_v1");
    if (error || !Array.isArray(data)) return [];
    return (data as { company_id: string; agency_name: string | null; consent_text_version: string }[])
      .filter((r) => typeof r.company_id === "string" && (r.agency_name ?? "").trim().length > 0)
      .map((r) => ({
        companyId: r.company_id,
        agencyName: (r.agency_name ?? "").trim(),
        consentTextVersion: r.consent_text_version,
      }));
  } catch {
    return [];
  }
}
