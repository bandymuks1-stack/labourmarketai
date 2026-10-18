/**
 * Demand → MatchNeed for the worker side (PURE). ONE derivation shared by
 * the opportunity board loader AND the express-interest flow so the match a
 * worker sees is EXACTLY the match stored in their interest snapshot — no
 * second pipeline (guard-pinned).
 */

import {
  STRUCTURED_DEMAND_CONTRACT_VERSION,
  readStructuredDemandV2,
  type StructuredDemandV2,
} from "@/lib/demand/structured-demand-v2";
import { deriveNeedSkills, type NeedSkillSource } from "@/lib/market/need-skills";
import type { MatchNeed } from "@/lib/market/match-v1";

import { readStructuredDemandPublic } from "./structured-public";

export function needFromRoleText(
  roleText: string | null,
  country: string | null,
  city: string | null = null,
): { need: MatchNeed; source: NeedSkillSource | null } {
  // Underscores/hyphens → spaces so structured work-type slugs recognise
  // through the same offline pipeline as free text.
  const derived = deriveNeedSkills({
    roleOrWorkType: (roleText ?? "").replace(/[_-]+/g, " "),
  });
  return {
    need: {
      skillIds: derived.skillSlugs,
      needSource: derived.source,
      professionSlug: derived.professionSlug,
      country,
      // Coarse place label (city/region) when the demand carries one — the
      // engine's city tier fires only when BOTH sides know their city.
      city: city && city.trim() !== "" ? city : null,
    },
    source: derived.source,
  };
}

/**
 * The worker-safe structured demand, re-validated as a `StructuredDemandV2`.
 *
 * The board RPC (`list_open_demand_for_workers`) does not hand back the raw
 * `payload.structured_v2`. It hands back `structured` — a SQL-side whitelist
 * projection of that cluster (`demand_structured_v2_public`), which is the
 * only shape a worker is allowed to see. `readStructuredDemandPublic` is the
 * app-side twin of that whitelist.
 *
 * The public projection is a strict SUBSET of v2 by key: same cluster names,
 * same field names, minus the private ones (`worksite_type`, notes) and minus
 * `requirement_priorities`. So it can be re-read through the CANONICAL v2
 * validator rather than a second hand-rolled parser — which matters, because a
 * second parser is how the demand side would drift away from the engine again.
 * `meta` is the one field the projection cannot carry (it is not worker-facing)
 * and the v2 schema requires, so it is restated here.
 *
 * TWO HONEST CONSEQUENCES, both leniency-preserving:
 *
 *  1. `requirement_priorities` is absent from the public shape, so the author's
 *     mandatory/preferred TIERS never reach the engine on this path. The engine
 *     documents an absent map as "keeps every hardcoded default exactly as-is"
 *     — so criteria are evaluated at their default tier, never invented and
 *     never hardened beyond what the author stated.
 *  2. If the projected cluster fails v2 validation as a whole, this returns
 *     null and the match stays exactly as lenient as it is today. A demand is
 *     never matched against requirements that did not validate. The SQL
 *     whitelist is looser than the app schema on numeric bounds, so this is
 *     reachable in principle; it degrades to "unknown", never to "not met".
 */
export function structuredV2FromDemandRow(row: unknown): StructuredDemandV2 | null {
  const publicCluster = readStructuredDemandPublic(row);
  if (!publicCluster) return null;
  return readStructuredDemandV2({
    structured_v2: {
      ...publicCluster,
      meta: { contract_version: STRUCTURED_DEMAND_CONTRACT_VERSION },
    },
  });
}

/**
 * THE canonical worker-side match input, derived from the REAL demand row.
 *
 * W10 audit P0-1. Both worker surfaces used to build the need from
 * `role_text` alone, while the very same row's structured demand was read
 * three lines later FOR DISPLAY. So a card could render the employer's
 * engagement form, gross pay, licence requirement and shift pattern, and print
 * `strong` next to them — because the engine had been handed a need with
 * `structuredV2: undefined`, so `engagement_form`, `licence_categories` and the
 * compensation comparison never evaluated and `blocking` came back empty.
 *
 * The product was telling the worker something untrue about its own data. The
 * fix is not a new signal: it is passing the signals the demand already
 * carries, from the row the server already re-read.
 *
 * Takes the ROW, not a demand id. Both callers obtain the row from the gated
 * RPC server-side (the express-interest path additionally re-finds it by id and
 * re-checks `isApprovedRouteRow`), so nothing a client sends decides what this
 * matches against.
 */
export function needFromDemandRow(row: unknown): {
  need: MatchNeed;
  source: NeedSkillSource | null;
} {
  const r = (row ?? {}) as Record<string, unknown>;
  const base = needFromRoleText(
    (r.role_text as string | null) ?? null,
    (r.country as string | null) ?? null,
    (r.location_label as string | null) ?? null,
  );
  const structuredV2 = structuredV2FromDemandRow(row);
  // `structuredV2: null` is passed explicitly rather than omitted: the engine
  // reads `need.structuredV2 ?? null` and treats both identically, and being
  // explicit keeps "this demand stated no structure" visible at the call site.
  return {
    need: {
      ...base.need,
      structuredV2,
      // The declared type rides the need so discovery can filter on it
      // ("praktika" → internship only); absent = the employer stated none.
      opportunityType: structuredV2?.opportunity_type ?? null,
      // W10 — DECLARE the one remaining consequential reduction rather than
      // let it read as an absence. The gated board RPC
      // (`list_open_demand_for_workers`) does not project the legacy
      // `customer_requests.language_requirement` column that
      // `buildNeedFromRequestRow` reads on the scouting side, and a required
      // language the worker lacks is a HARD BLOCK there. Without this flag the
      // engine could not tell "no language requirement" from "we cannot see
      // one", so the board could print `strong` for a demand scouting caps at
      // `weak`. The engine now reports it as demand-side missing data, on the
      // same card that prints the tier.
      //
      // Unconditional and true by construction: this builder can NEVER see
      // that column. The engine suppresses the report when structured v2
      // carries a real language requirement, because then it is not unknown.
      languageRequirementUnknown: true,
    },
    source: base.source,
  };
}
