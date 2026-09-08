import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readSupplyLastRefreshedAt } from "@/lib/vacancy-store/vacancy-read";
import { loadWorkerDocumentGap } from "./documents-gap-server";

/**
 * A COUNTRY THE PERSON NAMED BUT HAS NOT CHOSEN — the READ half (real-person
 * join walk, production ca96605b, 2026-09-06: "ieškau darbo Norvegijoje" from
 * a worker whose countries were NL ended in "nothing visible there. Visible:
 * NL." with no chip, on the very sentence the landing advertises).
 *
 * Two facts the answer needs, both through reads that already exist:
 *   - the list the work card should open with — the person's CURRENT
 *     countries plus the one they named (the card REPLACES the list on save,
 *     so the chip must carry all of them). Same read the documents answer
 *     uses (`loadWorkerDocumentGap` → the person's own preferences);
 *   - whether ANY active public ad from the official sources exists there —
 *     the SAME bounded, RLS-scoped, index-backed read the board's freshness
 *     line uses (`(country, published_at) WHERE is_active`, LIMIT 1), never a
 *     count over the 77k-row table.
 * Every failure degrades to a NAMED state: `unknown`, never `no`. No listing
 * is ever manufactured either way.
 */
export interface UnchosenCountryNextSteps {
  readonly nextCountries: readonly string[];
  readonly supply: "yes" | "no" | "unknown";
}

export async function loadUnchosenCountryNextSteps(code: string): Promise<UnchosenCountryNextSteps> {
  const upper = code.trim().toUpperCase();
  let current: string[] = [];
  try {
    const gap = await loadWorkerDocumentGap();
    if (gap.kind === "ok") current = gap.countries.map((c) => c.toUpperCase());
  } catch {
    current = [];
  }
  const nextCountries = current.includes(upper) ? current : [...current, upper];
  let supply: UnchosenCountryNextSteps["supply"] = "unknown";
  try {
    const supabase = await createClient();
    const read = await readSupplyLastRefreshedAt(supabase, {
      country: upper,
      nowIso: new Date().toISOString(),
    });
    if (read.status === "ok") supply = read.lastRefreshedAt ? "yes" : "no";
  } catch {
    supply = "unknown";
  }
  return { nextCountries, supply };
}
