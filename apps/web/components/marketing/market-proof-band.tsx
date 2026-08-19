import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";
import { Card } from "@/components/ui/Card";

/**
 * MARKET PROOF BAND (landing minimal truth update, owner mandate 2026-08-17,
 * functional completion train V2 §27).
 *
 * A compact, static block stating what the marketplace data actually holds —
 * coverage framing ONLY, never adoption framing (the four-population rule in
 * `lib/analytics/market-coverage-claims.ts`; guard:
 * `lib/guards/market-coverage-claims.test.ts`).
 *
 * DATA SOURCE (recorded per the claim-invariant "any re-quote must re-derive
 * from `public_vacancies`"): production read-back via Supabase MCP
 * `execute_sql` (read-only SELECTs) against the production project (the one
 * documented in docs/audits/sweden-market-truth-2026-08-17.md — the ref
 * string itself must not appear in user-facing source, per
 * lib/guards/single-domain-origin.test.ts), table `public.public_vacancies`.
 *
 * CORRECTED 2026-08-19 (owner approval, docs/audits/landing-coverage-claim-basis-2026-08-18.md).
 * The original floors were read on `is_active AND lifecycle='published'` — a
 * predicate that counts ads the public job board refuses to serve. The band now
 * quotes `SWEDEN_COVERAGE_2026_08_19`, derived on the job board's OWN predicate
 * (`BROWSABLE_VACANCY_PREDICATE`) over a five-day window rather than one
 * reading, because the browsable pool oscillates ~8% inside a week:
 *
 *   - browsable vacancies 2026-08-15..19: 40,460 · 40,089 · 37,105 · 38,181 ·
 *     39,795 → window low 37,105, floor 35,000+
 *   - identified employers (registry-id identity, no fuzzy name merge — see
 *     lib/employers/employer-identity.ts): 7,482 · 7,416 · 7,252 · 7,433 ·
 *     7,628 → window low 7,252, floor 7,000+
 *   - regions with browsable ads: 21, stable across the window, quoted exactly
 *
 * A floor must survive the TROUGH, not the day it was measured — the shipped
 * "7 600+" was false on four of those five days. `floorsAreSupportedBy` in the
 * claim module now enforces that, and the guard test pins it.
 *
 * TOP PROFESSIONS: top profession families by active-ad count among ads with
 * a canonical `profession_slug` (post-cleanup v2 categorization; 18,192 of
 * 43,781 active ads carried a canonical tag at the 2026-08-17 measurement,
 * ~41.6%). Re-derived on the browsable basis 2026-08-18 the ORDER is
 * unchanged, so the ranking below still holds.
 * Because coverage is partial, the block shows the RANKING ONLY — no absolute
 * counts — and the visible note says some listings are not yet grouped by
 * profession. Measured order (ads): caregiver 4,415 · teacher 1,643 ·
 * sales_assistant 1,120 · warehouse_worker 964 · driver 924 · cleaner 880.
 * A ranking over the classified subset is a safe claim: these families lead
 * by a wide margin, and per-family employer counts corroborate the order.
 *
 * Names render from the canonical `professions` taxonomy catalogs
 * (messages/<locale>/professions.json) — never new ad-hoc labels.
 *
 * LCP: server component, static translated strings, zero data fetches at
 * request time. No new blocking work on the landing route.
 */

/** Stat keys, in display order. Values live in `landing.marketProof.stats.*`. */
export const MARKET_PROOF_STATS = [
  "vacancies",
  "employers",
  "regions",
] as const;

/**
 * Top profession families by active-ad count (production read-back
 * 2026-08-17 21:23 UTC — see the file header). Slugs are canonical
 * `professions` taxonomy keys; the guard test asserts each exists in every
 * locale catalog so a typo can never render a raw slug.
 */
export const TOP_PROFESSION_FAMILY_SLUGS = [
  "caregiver",
  "teacher",
  "sales_assistant",
  "warehouse_worker",
  "driver",
  "cleaner",
] as const;

export async function MarketProofBand() {
  const t = await getTranslations("landing.marketProof");
  const professions = await getTranslations("professions");

  return (
    <section className="mt-16" aria-labelledby="market-proof-title">
      <Reveal>
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("eyebrow")}
        </p>
        <h2
          id="market-proof-title"
          className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl"
        >
          {t("title")}
        </h2>
      </Reveal>

      <Reveal delay={0.06}>
        {/* Canonical <Card> primitive — the visual-contract ratchet forbids
            new raw card-class call sites (visual-contract-v1.test.ts). */}
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {MARKET_PROOF_STATS.map((key) => (
            <Card key={key} className="flex flex-col gap-1.5">
              <div data-testid={`market-proof-${key}`}>
                <p className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
                  {t(`stats.${key}.value`)}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                  {t(`stats.${key}.label`)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </Reveal>

      {/* The honest basis line: floors, dated, changing daily. */}
      <Reveal delay={0.1}>
        <p className="mt-4 text-meta text-text-muted" data-testid="market-proof-basis">
          {t("asOfNote")}
        </p>
      </Reveal>

      {/* ── Top professions in demand — ranking only, no absolute counts:
             profession grouping covers part of the listings, so counts over
             the grouped subset would understate the market while reading as
             totals. The ranking itself is stable and safe. ─────────────── */}
      <Reveal delay={0.14}>
        <h3 className="mt-10 font-display text-xl font-semibold tracking-tightest text-text-primary">
          {t("topTitle")}
        </h3>
        <ol
          className="mt-4 flex flex-wrap gap-2"
          data-testid="market-proof-professions"
        >
          {TOP_PROFESSION_FAMILY_SLUGS.map((slug, i) => (
            <li
              key={slug}
              className="flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800/40 px-3.5 py-1.5"
            >
              <span className="font-mono text-meta font-semibold text-brand-cyan">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-medium text-text-primary">
                {professions(slug)}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 max-w-2xl text-meta text-text-muted">
          {t("topNote")}
        </p>
      </Reveal>
    </section>
  );
}
