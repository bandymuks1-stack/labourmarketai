/**
 * Supply-panel filters for the admin matching workbench (server-rendered via
 * searchParams). Pure factual membership filters — never a ranking.
 *
 * Extracted from the deleted lib/admin/match-suggestions.ts (Wagon 4): the
 * token/evidence shortlist it carried was a DUPLICATE matching engine and the
 * workbench now runs the canonical lib/market/match-v1 engine instead.
 */

import type { SupplyWorkerRow } from "@/lib/admin/matching-workbench";

export function filterSupply(
  supply: readonly SupplyWorkerRow[],
  opts: { country: string | null; availability: string | null },
): readonly SupplyWorkerRow[] {
  return supply.filter((w) => {
    if (opts.country) {
      const c = opts.country.toUpperCase();
      const hit =
        w.locationCountry?.toUpperCase() === c ||
        w.preferredCountries.some((p) => p.toUpperCase() === c);
      if (!hit) return false;
    }
    if (opts.availability && w.availabilityStatus !== opts.availability) {
      return false;
    }
    return true;
  });
}
