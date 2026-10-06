import type { VacancyVolumeResult } from "./vacancy-volume";
import type { WorldViewResult } from "./world-model";

/**
 * THE MARKET BRIEF — the first truthful "live market" signals, derived ONCE
 * from the readers the canonical Market Map already uses, and shown in two
 * places (the home's market region and the map's signals rail) so the two
 * can never disagree.
 *
 * Nothing here reads a table. It reshapes four existing answers:
 *
 *   needs      ← the world read, demand layer (open needs the caller may see)
 *   projects   ← the world read, projects layer (RLS: own, assigned, managed)
 *   vacancies  ← the public-vacancy volume for the caller's own profession
 *   territory  ← the caller's own company territory
 *
 * HONESTY RULES (each one is pinned by `market-brief-model.test.ts`):
 *
 *  - A reader that FAILED is `unknown`, never `empty` and never a zero
 *    (SEP-7). A real empty answer is `empty`. A signal that does not apply
 *    to this person (no profession, no company territory) is `absent` and is
 *    not drawn at all — "Tuščia = tvarkinga". A vacancy read that broke is
 *    `unknown`, distinct from one that does not apply.
 *  - A count over a leg that hit its row limit is flagged `lowerBound`.
 *  - Freshness is only the newest real `created_at` / `published_at` the
 *    reader saw; no timestamp, no freshness line. Nothing is "live" by
 *    adjective.
 *  - There is NO supply/demand ratio, no rate, no match or team signal and no
 *    people count here: the readers for them do not exist yet (people are
 *    anonymous aggregates below five). The model has no field they could be
 *    smuggled through.
 *
 * Pure, no I/O.
 */

export type MarketSignalKey = "needs" | "vacancies" | "projects" | "territory";

/** Which layer of the ONE map shows this signal (`?layer=`). */
export const MARKET_SIGNAL_LAYER: Readonly<Record<MarketSignalKey, "demand" | "jobs" | "projects" | "territory">> = {
  needs: "demand",
  vacancies: "jobs",
  projects: "projects",
  territory: "territory",
};

export type PlaceSignal =
  | {
      readonly state: "known";
      /** Real objects counted (needs, projects) — not a headcount. */
      readonly count: number;
      /** Distinct drawn places the objects fall on (clusters, incl. overflow). */
      readonly places: number;
      /** The read hit its row limit: every figure is "at least". */
      readonly lowerBound: boolean;
      /** Rows whose country could not be resolved — real, counted, not drawn. */
      readonly unplaced: number;
      /** Newest `created_at` the read saw; null when none carried one. */
      readonly newestAt: string | null;
    }
  | { readonly state: "empty" }
  | { readonly state: "unknown" };

export type VacancySignal =
  | {
      readonly state: "known";
      /** Exact count of browsable ads for THIS person's profession. */
      readonly ads: number;
      readonly newAds7d: number;
      readonly newAds30d: number;
      readonly professionSlug: string;
      /** The profession was evidenced from recorded work, not declared. */
      readonly derived: boolean;
      readonly countries: readonly string[];
      readonly measuredAtIso: string;
    }
  | { readonly state: "empty"; readonly professionSlug: string; readonly derived: boolean }
  /** The vacancy read FAILED — named, never dropped, never a zero. */
  | { readonly state: "unknown" }
  | { readonly state: "absent" };

export type TerritorySignal =
  | { readonly state: "known"; readonly places: number }
  | { readonly state: "absent" };

export type MarketBrief = {
  readonly needs: PlaceSignal;
  readonly vacancies: VacancySignal;
  readonly projects: PlaceSignal;
  readonly territory: TerritorySignal;
};

export type MarketBriefInputs = {
  /** `null` = the reader threw. */
  readonly needs: WorldViewResult | null;
  readonly projects: WorldViewResult | null;
  readonly vacancies: VacancyVolumeResult;
  /** Number of the caller's own company territories; `null` = none/not read. */
  readonly territoryCount: number | null;
};

export function derivePlaceSignal(result: WorldViewResult | null): PlaceSignal {
  if (!result || result.kind !== "ok") return { state: "unknown" };
  const { view } = result;
  if (view.state.kind === "error") return { state: "unknown" };
  // No placeable country in the viewport, or nothing in it: a real, empty answer.
  if (view.state.kind === "unavailable" || view.state.kind === "empty") {
    // Unplaced rows are still real needs/projects the map could not draw.
    if (view.counts.unplaced > 0) {
      return {
        state: "known",
        count: view.counts.unplaced,
        places: 0,
        lowerBound: view.counts.truncated,
        unplaced: view.counts.unplaced,
        newestAt: view.counts.newestAt,
      };
    }
    return { state: "empty" };
  }
  const c = view.counts;
  return {
    state: "known",
    count: c.inViewObjects + c.unplaced,
    places: c.renderedClusters + c.overflowClusters,
    lowerBound: c.truncated,
    unplaced: c.unplaced,
    newestAt: c.newestAt,
  };
}

export function deriveMarketBrief(inputs: MarketBriefInputs): MarketBrief {
  const v = inputs.vacancies;
  const vacancies: VacancySignal =
    v.kind === "ok"
      ? {
          state: "known",
          ads: v.data.activeAds,
          newAds7d: v.data.newAds7d,
          newAds30d: v.data.newAds30d,
          professionSlug: v.data.professionSlug,
          derived: v.data.derived,
          countries: v.data.countries,
          measuredAtIso: v.data.measuredAtIso,
        }
      : v.kind === "empty"
        ? { state: "empty", professionSlug: v.professionSlug, derived: v.derived }
        : v.failed
          ? { state: "unknown" }
          : { state: "absent" };

  return {
    needs: derivePlaceSignal(inputs.needs),
    vacancies,
    projects: derivePlaceSignal(inputs.projects),
    territory:
      inputs.territoryCount !== null && inputs.territoryCount > 0
        ? { state: "known", places: inputs.territoryCount }
        : { state: "absent" },
  };
}

/**
 * Signals in the order the surfaces draw them. Needs are the market's core
 * question and are ALWAYS stated (an empty answer is said once, in words).
 * Vacancies and territory are dropped when they do not apply to this person
 * (`absent`); projects are dropped when there are none to name — a failed
 * read is never dropped, so "could not read" never reads as "none".
 */
export function visibleMarketSignals(brief: MarketBrief): readonly MarketSignalKey[] {
  const out: MarketSignalKey[] = ["needs"];
  if (brief.vacancies.state !== "absent") out.push("vacancies");
  if (brief.projects.state !== "empty") out.push("projects");
  if (brief.territory.state !== "absent") out.push("territory");
  return out;
}
