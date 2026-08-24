import "server-only";

/**
 * PUBLIC MARKET FACTS — the read half.
 *
 * ── WHY THIS NEEDS NO MIGRATION, AND WHY THAT MATTERS ──────────────────────
 *
 * `public-vacancy-professions.ts` records that a facet count per profession
 * "needs a new SECURITY DEFINER function (`anon` holds no grant on
 * `public_vacancies`) — a RED-class migration". That is true for the
 * ANONYMOUS board, and it is the reason the public job board still has no
 * counts beside its filter.
 *
 * It is NOT true here, because this surface is authenticated. Verified against
 * production 2026-08-24 rather than assumed:
 *
 *   grant   : `authenticated` holds SELECT on `public.public_vacancies`
 *   policy  : `public_vacancies_read_active` FOR SELECT TO authenticated
 *             USING (is_active)
 *
 * So a signed-in worker's OWN client can compute this, under RLS, with no new
 * function, no new grant and no migration. The whole slice stays GREEN. The
 * price of that choice is stated plainly: this cannot be moved to an anonymous
 * page later without the RED migration the other module describes.
 *
 * ── THE PREDICATE IS NOT A DETAIL ──────────────────────────────────────────
 *
 * RLS enforces `is_active`. The BROWSABLE population is narrower — it also
 * excludes expired ads — and `market-coverage-claims.ts` records what happened
 * the last time a public number was derived from the wider one: the landing
 * page promised 41,000 jobs and the board showed ~40,000, because the claim
 * was true about the database and false about what a visitor can reach. Every
 * query below therefore restates `expires_at is null or expires_at > now()`
 * itself rather than leaning on the policy.
 *
 * ── SHAPE OF THE READ ──────────────────────────────────────────────────────
 *
 * Four exact `head: true` counts (no rows transferred) plus one bounded window
 * select of four columns. Five round trips, no row scan larger than
 * `RANKING_WINDOW_ADS`, and the counts are exact rather than estimated — which
 * is what lets the copy print a number instead of a hedge.
 */
import { createClient } from "@/lib/supabase/server";
import {
  RANKING_WINDOW_ADS,
  buildPublicMarketFacts,
  type MarketRankingRow,
  type PublicMarketFacts,
} from "./public-market-facts";

/** PostgreSQL `undefined_table` — "not switched on yet", never "no results".
 *  Same distinction `lib/vacancy-store/vacancy-read.ts` draws, same reason. */
const UNDEFINED_TABLE = "42P01";

const TABLE = "public_vacancies";

export type PublicMarketFactsResult =
  | { readonly kind: "ok"; readonly facts: PublicMarketFacts }
  /** The vacancy store is absent on this stack. Not an error, not an empty
   *  market — a surface that is not provisioned here. */
  | { readonly kind: "not_provisioned" }
  /** The caller is not signed in, or RLS returned nothing readable. */
  | { readonly kind: "unavailable"; readonly reason: string };

type Client = Awaited<ReturnType<typeof createClient>>;

function isUndefinedTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === UNDEFINED_TABLE;
}

/** The browsable predicate, applied identically to every query below.
 *  A helper rather than four repetitions, because the one thing that must not
 *  drift between the counts and the ranking window is the population. */
function browsable(supabase: Client, professionSlug: string, nowIso: string) {
  return (select: string, head: boolean) =>
    supabase
      .from(TABLE)
      .select(select, head ? { count: "exact", head: true } : undefined)
      .eq("profession_slug", professionSlug)
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
}

/**
 * Facts for ONE profession, read through the caller's own client.
 *
 * `nowIso` is injected so a test can pin the window boundaries; production
 * passes nothing and gets the real clock.
 */
export async function getPublicMarketFacts(
  professionSlug: string,
  nowIso?: string,
): Promise<PublicMarketFactsResult> {
  const slug = professionSlug.trim();
  if (slug === "") return { kind: "unavailable", reason: "no_profession" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // RLS would refuse anyway; failing here means the reason is nameable rather
  // than arriving as an empty market.
  if (!user) return { kind: "unavailable", reason: "not_authenticated" };

  const now = nowIso ? new Date(nowIso) : new Date();
  const measuredAtIso = now.toISOString();
  const iso = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  const q = browsable(supabase, slug, measuredAtIso);
  const [all, d7, d30, paid, windowRes] = await Promise.all([
    q("id", true),
    q("id", true).gte("published_at", iso(7)),
    q("id", true).gte("published_at", iso(30)),
    q("id", true).not("compensation_min", "is", null),
    // FOUR COLUMNS. Never the title, the description, the employer or the
    // application URL — see the exclusion list in `public-market-facts.ts`.
    q("skill_slugs, city, country, published_at", false)
      .order("published_at", { ascending: false })
      .limit(RANKING_WINDOW_ADS),
  ]);

  const firstError =
    all.error ?? d7.error ?? d30.error ?? paid.error ?? windowRes.error ?? null;
  if (isUndefinedTable(firstError)) return { kind: "not_provisioned" };
  if (firstError) {
    return { kind: "unavailable", reason: "read_failed" };
  }
  // A null count is not a zero. PostgREST returns null when the count could
  // not be produced, and rendering that as "0 open jobs" is the fabricated
  // confident zero §18 forbids.
  if (all.count === null || d7.count === null || d30.count === null || paid.count === null) {
    return { kind: "unavailable", reason: "count_unavailable" };
  }

  return {
    kind: "ok",
    facts: buildPublicMarketFacts({
      professionSlug: slug,
      measuredAtIso,
      counts: {
        activeAds: all.count,
        newAds7d: d7.count,
        newAds30d: d30.count,
        adsStatingPay: paid.count,
      },
      windowRows: (windowRes.data ?? []) as unknown as MarketRankingRow[],
    }),
  };
}
