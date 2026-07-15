import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { IntelligenceCard } from "@/components/intelligence/intelligence-card";
import type { Role } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import {
  getCompanyDemandIntelligence,
  getWorkerSalaryIntelligence,
} from "@/lib/intelligence/intelligence-read";
import {
  buildCompanyIntelligenceCards,
  buildWorkerIntelligenceCards,
  type IntelligenceCardV1,
  type SalaryCardInput,
} from "@/lib/intelligence/intelligence-view-model";
import {
  allExternalSourcesOff,
  INTELLIGENCE_SOURCE_PROFILES,
} from "@/lib/intelligence/source-governance";
import { deriveSourceLifecycleState } from "@/lib/intelligence/source-lifecycle";
import { SourceStatusBadge } from "@/components/intelligence/source-status-badge";
import { TrustInsightCard } from "@/components/intelligence/trust-insight-card";
import {
  buildEurostatContextCards,
  EUROSTAT_ATTRIBUTION_CODE,
  EUROSTAT_KIND_DATASET,
} from "@/lib/intelligence/trust-card-model";

/**
 * Market intelligence workspace (Labour Market Intelligence v1) — the ONE
 * surface where the viewer's role-matched intelligence cards render.
 *
 * Server component over the existing read layer
 * (lib/intelligence/intelligence-read.ts) + view-model builders
 * (lib/intelligence/intelligence-view-model.ts). This page ONLY renders —
 * every number, state and i18n code arrives pre-built (§18: the UI never
 * invents a figure).
 *
 * Honesty contract:
 *  - real destinations only; honest states — insufficient_data /
 *    needs_migration / stale render as clearly-labelled states, never a
 *    fabricated number;
 *  - external vs internal is ALWAYS visually separated via the source badge
 *    (origin kind, source key, observed date) on every card;
 *  - every card exposes its full explanation (the six questions) behind ONE
 *    disclosure action;
 *  - bounded output (the view model caps cards + items) — no unbounded
 *    tables; progressive disclosure: key signals first, methodology last.
 *
 * Composer coverage note (honest): the read layer exposes the worker salary
 * composer and the company demand composer today. Worker recommendation /
 * skill-freshness inputs and the company supply/demand-gap + salary-
 * competitiveness inputs have NO server composer yet, so they are passed as
 * null/empty — the builders then render only honest cards (never a guess).
 */

export const dynamic = "force-dynamic";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

const SECTION_CLASS =
  "flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/30 p-4";

export default async function IntelligencePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  const role: Role = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : "worker";

  const t = await getTranslations("intelligence");

  const header = (
    <header className="flex flex-col gap-1">
      <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
        {t("page.eyebrow")}
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("page.title")}
      </h1>
      <p className="text-sm text-text-secondary">{t("page.intro")}</p>
    </header>
  );

  // ── Role-matched cards from the read layer (server-only composers). ───────
  let cards: readonly IntelligenceCardV1[] = [];
  /** Honest "what is missing" codes for the worker salary signal. */
  let missingCodes: readonly string[] = [];

  if (role === "worker") {
    const salaryIntel = await getWorkerSalaryIntelligence();
    const salary: SalaryCardInput | null =
      salaryIntel.kind === "ok"
        ? {
            benchmark: salaryIntel.benchmark,
            comparison: salaryIntel.comparison,
          }
        : null;
    if (salaryIntel.kind === "insufficient_data") {
      missingCodes = salaryIntel.missingCodes;
    }
    cards = buildWorkerIntelligenceCards({
      salary,
      // No server composer exists for these inputs yet — null means the
      // builder simply emits no card (honest absence, never a guess).
      recommendations: null,
      skillFreshness: null,
    });
  } else if (role === "company" || role === "agency") {
    // Both org roles read their OWN RLS-scoped demand rows — the composer
    // never exposes another tenant's data.
    const demand = await getCompanyDemandIntelligence();
    cards = buildCompanyIntelligenceCards({
      // No salary-offer / supply-read composer exists yet — the builders
      // render the honest insufficient_data salary card and skip the gap
      // card entirely (never a fabricated number).
      salaryCompetitiveness: null,
      supplyDemandGaps: [],
      skillScarcity: demand.kind === "ok" ? demand.demandAggregates : [],
    });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="intelligence-page">
      {header}

      {role === "customer" ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="intelligence-not-available"
        >
          {t("page.notAvailableForRole")}
        </p>
      ) : (
        <>
          {/* Honest "what is missing" note for the worker salary signal. */}
          {missingCodes.length > 0 ? (
            <section
              className={SECTION_CLASS}
              data-testid="intelligence-missing"
            >
              <h2 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
                {t("page.missingTitle")}
              </h2>
              <ul className="list-inside list-disc text-xs text-text-secondary">
                {missingCodes.map((code) => (
                  <li key={code}>
                    {t(code.replace(/^intelligence\./, "") as never) as string}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* (a) Key signals first — bounded card list from the view model. */}
          <section
            className="flex flex-col gap-3"
            data-testid="intelligence-signals"
            aria-label={t("page.signalsTitle")}
          >
            <h2 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
              {t("page.signalsTitle")}
            </h2>
            {cards.map((card) => (
              <IntelligenceCard key={card.id} card={card} locale={locale} />
            ))}
          </section>
        </>
      )}

      {/* European labour-market context (Eurostat) — official aggregates,
          rendered as honest unavailable cards until the owner activates the
          eurostat source. Shown to every non-customer role (macro context is
          not tenant-specific). Each card names its exact Eurostat dataset. */}
      {role !== "customer" ? (
        <section
          className={SECTION_CLASS}
          data-testid="intelligence-eurostat-context"
          aria-label={t("eurostat.sectionTitle")}
        >
          <h2 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
            {t("eurostat.sectionTitle")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("eurostat.sectionIntro")}
          </p>
          {buildEurostatContextCards().map((card) => (
            <div key={card.id} className="flex flex-col gap-1">
              <TrustInsightCard card={card} locale={locale} />
              <span className="pl-1 font-mono text-[10px] text-text-muted">
                {
                  EUROSTAT_KIND_DATASET[
                    card.kind as keyof typeof EUROSTAT_KIND_DATASET
                  ]
                }
              </span>
            </div>
          ))}
          <p
            className="pt-1 text-[11px] leading-relaxed text-text-muted"
            data-testid="intelligence-eurostat-attribution"
          >
            {t(
              EUROSTAT_ATTRIBUTION_CODE.replace(/^intelligence\./, "") as never,
            ) as string}
          </p>
        </section>
      ) : null}

      {/* (c) Methodology footer — static honest note + the source registry.
          No external link, no claim beyond what the governance module pins. */}
      <section
        className={SECTION_CLASS}
        data-testid="intelligence-methodology"
        aria-labelledby="intelligence-methodology-heading"
      >
        <h2
          id="intelligence-methodology-heading"
          className="font-mono text-[11px] uppercase tracking-label text-text-secondary"
        >
          {t("methodology.title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("methodology.deterministic")}
        </p>
        {allExternalSourcesOff() ? (
          <p
            className="text-xs leading-relaxed text-text-secondary"
            data-testid="intelligence-external-off"
          >
            {t("methodology.externalOff")}
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("methodology.cohort")}
        </p>
        <h3 className="pt-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("page.sourcesTitle")}
        </h3>
        <ul className="flex flex-col gap-1" data-testid="intelligence-sources">
          {INTELLIGENCE_SOURCE_PROFILES.map((p) => (
            <li
              key={p.key}
              className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-1.5 text-xs text-text-primary"
              data-source-key={p.key}
            >
              <span>
                {t(p.displayNameCode.replace(/^intelligence\./, "") as never) as string}
              </span>
              {/* Lifecycle badge (Trust Layer v1) — DERIVED deterministically
                  from the governance profile; the page never decides a state. */}
              <SourceStatusBadge state={deriveSourceLifecycleState(p)} />
              <span className="w-full text-[11px] text-text-muted">
                {t(p.termsNoteCode.replace(/^intelligence\./, "") as never) as string}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
