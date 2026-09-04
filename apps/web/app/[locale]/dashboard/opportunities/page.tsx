import { getTranslations, setRequestLocale } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import Link from "next/link";

import { FeatureNote } from "@/components/app/feature-note";
import { MatchSignals } from "@/components/app/match-signals";
import { MatchTierExplanation } from "@/components/app/match-tier-explanation";
import { ExternalVacanciesSection } from "@/components/app/external-vacancies-section";
import { ProfessionRecoveryPrompt } from "@/components/app/profession-recovery-prompt";
import { OpportunityDetailsDisclosure } from "@/components/app/opportunity-details-disclosure";
import {
  OpportunityStructuredChips,
  OpportunityStructuredSections,
  payText,
} from "@/components/app/opportunity-structured-detail";
import { OpportunitiesShownMarker } from "@/components/app/marketplace/opportunities-shown-marker";
import { RecentlyViewedStrip } from "@/components/app/recently-viewed-strip";
import { WorkerSaveOpportunityButton } from "@/components/app/worker-save-opportunity-button";
import {
  CompareBar,
  CompareToggleChip,
  OpportunityCompareProvider,
} from "@/components/app/opportunity-compare";
import {
  COMPARE_FACT_KEYS,
  completeCompareFacts,
  type CompareEntry,
  type CompareFactKey,
} from "@/lib/opportunities/compare-facts";
import {
  formatPublicIsoDate,
  publicLanguageName,
  type StructuredDemandPublic,
} from "@/lib/opportunities/structured-public";
import {
  buildMatchCardView,
  type MatchSignal,
  type MatchSignalState,
} from "@/lib/opportunities/match-card-view";
import { TrustInsightCard } from "@/components/intelligence/trust-insight-card";
import { buildOpportunityInsightRow } from "@/lib/intelligence/trust-card-model";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getWorkerSalaryIntelligence } from "@/lib/intelligence/intelligence-read";
import { loadWorkerOpportunityBoard } from "@/lib/marketplace/worker-opportunities";
import { getWeeklyPersonalIntelligence } from "@/lib/worker/weekly-intelligence";
import { WeeklyIntelligenceSection } from "@/components/app/weekly-intelligence-section";
import { MarketExplanationPanel } from "@/components/app/market-explanation-panel";
import {
  activeFilterEntries,
  applyDiscoveryFilters,
  buildDiscoveryQuery,
  collectDiscoveryFacets,
  INITIAL_VIEW_MAX_COUNT,
  parseDiscoveryParams,
  selectInitialBoardView,
  sortDiscoveryCards,
  type DiscoveryFilterState,
  type DiscoverySort,
} from "@/lib/opportunities/discovery-filters";
import { MATCH_CALC_VERSION } from "@/lib/market/match-v1";
import { WorkerInterestButton } from "@/components/app/worker-interest-button";
import {
  WorkerMyInterestSection,
  type MyInterestDisplayRow,
} from "@/components/app/worker-my-interest-section";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import type {
  OpportunityGap,
  OpportunityNeed,
  OpportunityStatus,
} from "@/lib/opportunities/opportunity-fit";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * Worker-facing opportunities board ("Man tinkamos galimybės"). Shows the
 * worker their OWN matching readiness (real, own-data) and — once the
 * owner-gated worker-visibility RPC is applied — open employer needs scored by
 * an honest, deterministic heuristic (neutral statuses, NO score, NO fake AI).
 * Until then it shows an honest "opportunities will appear here" state and the
 * concrete profile steps to be ready. No fake needs, no fake interest button.
 *
 * PR 4 (Marketplace Precision): URL-param filter chips + sort over the
 * ALREADY-AUTHORIZED RPC rows (server-side narrowing, no new data source), the
 * matching-contract-v2 tier explanation (blocking / strengths / negotiables /
 * missing facts — never a standalone %), a per-card progressive-disclosure
 * details area, and a "how matching works" note (deterministic rules, no AI).
 */

const STATUS_TONE: Record<OpportunityStatus, string> = {
  possible_match: "border-state-success/40 bg-state-success/10 text-state-success",
  check_conditions: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  needs_documents: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  missing_profile_info: "border-ink-500 bg-ink-800/40 text-text-muted",
};

export default async function OpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "worker");

  const t = await getTranslations("opportunities");
  const tlm = await getTranslations("labourMarket");
  const tSkill = await getTranslations("skillNames");
  const tsd = await getTranslations("structuredDemand");
  // Discovery params parsed BEFORE the load so an active profession/country
  // chip narrows what the external-supply retrieval FETCHES (closed-set
  // values), not merely what the page hides afterwards.
  const { filters, sort, view } = parseDiscoveryParams(sp);
  // Board + salary benchmark + weekly digest are independent reads — one
  // combined await so TTFB pays the slowest of the three, not their sum.
  const [result, salaryIntel, weekly] = await Promise.all([
    loadWorkerOpportunityBoard("opportunities_board", {
      externalDiscovery: {
        professionSlug: filters.profession,
        country: filters.country,
      },
    }),
    getWorkerSalaryIntelligence(),
    getWeeklyPersonalIntelligence(),
  ]);

  // ── Compressed first view (owner rule 2026-08-29): 3 best by default,
  //    never more than 5 items before the person asks for more. Pure
  //    presentation compression over the ALREADY-ranked universe — the
  //    loader, the RPC limit, the filters and the external retrieval are
  //    untouched, and every withheld card is one ?view=all click away.
  const active = activeFilterEntries(filters);
  const filtered =
    result.kind === "ready" && result.capabilities.boardAvailable
      ? sortDiscoveryCards(
          applyDiscoveryFilters(result.opportunities, filters),
          sort,
        )
      : [];
  const initialView = selectInitialBoardView(filtered, {
    sort,
    activeFilterCount: active.length,
    view,
  });
  // External ads share the SAME 5-item first-view budget: whatever the
  // internal top slots leave over. In any refined view (filter, sort,
  // ?view=all) the section shows everything it loaded, as before.
  const boardRefined = view === "all" || active.length > 0 || sort !== "relevance";
  const externalInitialCount = boardRefined
    ? null
    : Math.max(INITIAL_VIEW_MAX_COUNT - initialView.visible.length, 2);
  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);

  // ── Market context (Contextual Intelligence UI v1): the worker's OWN
  //    deterministic salary-vs-benchmark trust card plus the four honest
  //    unavailable placeholders (demand / supply / skill gap / market
  //    trend). Every card degrades honestly — the unavailable ones say WHY,
  //    what is required, which sources are off and what activation changes.
  //    Nothing here fabricates a number (§18).
  const tIntel = await getTranslations("intelligence");
  // Root translator — provenance/attribution codes are FULL key paths
  // (vacancySources.*), stored as codes on the record, resolved only here.
  const tRoot = await getTranslations();
  const marketContextCards = buildOpportunityInsightRow(
    salaryIntel.kind === "ok"
      ? {
          benchmark: salaryIntel.benchmark,
          comparison: salaryIntel.comparison,
        }
      : null,
    Date.now(),
  );

  // Weekly personal intelligence (C-r1): the SAME request-cached read the
  // digest emitter uses — the bell row's href lands here, so this is where
  // the summary it points at finally renders. No second derivation.
  // (Loaded in the combined await above.)

  const workLabels = buildWorkTypeLabelMap(locale);
  const profileHref = `/${locale}/dashboard/profile`;
  const boardHref = `/${locale}/dashboard/opportunities`;
  const statusLabel = (s: OpportunityStatus) => t(`status.${s}`);
  const gapLabel = (g: OpportunityGap) => t(`gap.${g}`);
  // role_text is a work-type slug → localized label; country is ISO-2 → name;
  // start_period is the urgency enum → localized timing label. All from closed
  // sets the RPC exposes — never free text.
  const roleLabel = (slug: string | null) =>
    (slug && workLabels[slug]) || t("fieldRoleUnknown");
  const countryLabel = (code: string | null) =>
    code && tlm.has(`countryNames.${code}`) ? tlm(`countryNames.${code}`) : (code ?? "—");
  const startLabel = (val: string | null) =>
    val && t.has(`urgency.${val}`) ? t(`urgency.${val}`) : (val ?? "—");
  const accommodationLabel = (val: string | null) =>
    val ? (t.has(`accommodation.${val}`) ? t(`accommodation.${val}`) : val) : "—";
  const transportLabel = (val: string | null) =>
    val ? (t.has(`transport.${val}`) ? t(`transport.${val}`) : val) : "—";
  // Translator closures for the structured-detail components (P2-PR2): `ts`
  // covers opportunities.structured.*, `sd` the existing structuredDemand
  // option catalog — enum labels are reused, never duplicated.
  const ts = (key: string, values?: Record<string, string | number>) =>
    t(`structured.${key}` as never, values as never) as string;
  const sd = (key: string, values?: Record<string, string | number>) =>
    tsd(key as never, values as never) as string;

  // ── Discovery filters + sort (PR 4) — URL params over authorized rows.
  //    (Parsed above, before the board load.) ────────────────────────────
  const criterionLabel = (c: string) =>
    t.has(`discovery.criterion.${c}`) ? t(`discovery.criterion.${c}` as never) : c;
  const tierLabels = {
    blockingTitle: t("discovery.tiers.blocking"),
    strengthsTitle: t("discovery.tiers.strengths"),
    negotiablesTitle: t("discovery.tiers.negotiables"),
    missingTitle: t("discovery.tiers.missing"),
    criterionLabel,
    missingLabel: (side: "worker" | "demand", label: string) =>
      side === "worker"
        ? t("discovery.missing.worker", { criterion: label })
        : t("discovery.missing.demand", { criterion: label }),
  };
  const href = (
    patch: Partial<Record<keyof DiscoveryFilterState, string | null>> & {
      sort?: DiscoverySort;
    },
  ) => `${boardHref}${buildDiscoveryQuery(filters, sort, patch)}`;
  const chipClass = (active: boolean) =>
    `rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
      active
        ? "border-brand-blue bg-brand-blue/10 text-text-primary"
        : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
    }`;
  const filterValueLabel = (dim: keyof DiscoveryFilterState, value: string): string => {
    switch (dim) {
      case "profession":
        return roleLabel(value);
      case "country":
        return countryLabel(value);
      case "start":
        return startLabel(value);
      case "accommodation":
        return accommodationLabel(value);
      case "transport":
        return transportLabel(value);
      case "tool":
        return skillLabel(value);
      case "opportunityType":
        // The same catalogue the row badge uses (structuredDemand.opportunityType).
        return sd(`opportunityType.${value}` as never);
    }
  };

  // ── P2-PR5: saved bookmarks (#723-compat) / recently viewed / compare ─────
  const scanLine = (need: OpportunityNeed) =>
    `${
      need.locationLabel
        ? `${need.locationLabel} · ${countryLabel(need.country)}`
        : countryLabel(need.country)
    } · ${startLabel(need.startPeriod)}`;
  const savedLabels = {
    save: t("saved.save"),
    saved: t("saved.saved"),
    unsave: t("saved.unsave"),
    error: t("saved.error"),
  };
  const recentLabels = {
    title: t("recent.title"),
    deviceOnly: t("recent.deviceOnly"),
    clear: t("recent.clear"),
  };
  const compareLabels = {
    selectedLabel: t("compare.selectedLabel"),
    open: t("compare.open"),
    close: t("compare.close"),
    clear: t("compare.clear"),
    limitNote: t("compare.limitNote"),
    title: t("compare.title"),
  };
  const compareFactLabels = Object.fromEntries(
    COMPARE_FACT_KEYS.map((k) => [k, t(`compare.fact.${k}` as never) as string]),
  ) as Record<CompareFactKey, string>;
  const compareNotStated = t("compare.notStated");
  // One compare column per card — ONLY whitelisted facts, every value the
  // stated (already-localized) fact or the honest "not stated". Reuses the
  // card's own rendering rules (payText, enum catalogs) — never a second
  // formatting truth.
  const buildCompareEntry = (
    need: OpportunityNeed,
    structured: StructuredDemandPublic | null,
  ): CompareEntry => ({
    id: need.id,
    title: roleLabel(need.roleText),
    facts: completeCompareFacts(
      {
        pay: payText(structured?.compensation, ts, sd),
        hours:
          structured?.time?.hours_per_week != null
            ? ts("chipHours", { hours: structured.time.hours_per_week })
            : null,
        start:
          structured?.time?.start_earliest && structured?.time?.start_latest
            ? ts("chipStartWindow", {
                from: formatPublicIsoDate(structured.time.start_earliest, locale),
                to: formatPublicIsoDate(structured.time.start_latest, locale),
              })
            : structured?.time?.start_earliest
              ? ts("chipStartFrom", {
                  from: formatPublicIsoDate(structured.time.start_earliest, locale),
                })
              : need.startPeriod
                ? startLabel(need.startPeriod)
                : null,
        engagement: structured?.engagement_form
          ? sd(`engagementForm.${structured.engagement_form}`)
          : null,
        accommodation: structured?.accommodation?.state
          ? sd(`accommodationState.${structured.accommodation.state}`)
          : accommodationLabel(need.accommodation ?? null),
        transport: structured?.transport?.daily
          ? sd(`transportLevel.${structured.transport.daily}`)
          : transportLabel(need.transport ?? null),
        tools:
          need.requiredTools && need.requiredTools.length > 0
            ? need.requiredTools.map(skillLabel).join(", ")
            : null,
        languages:
          structured?.requirements?.languages &&
          structured.requirements.languages.length > 0
            ? structured.requirements.languages
                .map((l) => `${publicLanguageName(l.lang)} ${l.level}`)
                .join(", ")
            : null,
        location: need.locationLabel
          ? `${need.locationLabel} · ${countryLabel(need.country)}`
          : countryLabel(need.country),
        company: need.companyName,
      },
      compareNotStated,
    ),
  });

  // ── "Mano susidomėjimai" (extension A): the worker's own interest signals
  //    as precomputed display rows (RSC-serializable — no functions cross the
  //    client boundary). Live board facts win; a closed demand keeps its row
  //    with the honest "no longer active" label from the click-time snapshot.
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });
  const myInterestDisplayRows: MyInterestDisplayRow[] =
    result.kind === "ready"
      ? result.myInterestRows.map((r) => {
          const parts: string[] = [];
          if (r.companyName) parts.push(r.companyName);
          if (r.locationLabel) {
            parts.push(`${r.locationLabel} · ${countryLabel(r.country)}`);
          } else if (r.country) {
            parts.push(countryLabel(r.country));
          }
          if (r.dateIso) {
            const when = dateFmt(r.dateIso);
            if (when) parts.push(when);
          }
          return {
            requestId: r.requestId,
            status: r.status,
            statusText: t(`myInterest.status.${r.status}` as never) as string,
            stillOpen: r.stillOpen,
            title: roleLabel(r.roleText),
            metaLine: parts.join(" · "),
            nextAction: r.nextAction,
            cvHref: r.cvTemplate
              ? `/${locale}/cv?need=${encodeURIComponent(r.requestId)}&template=${encodeURIComponent(r.cvTemplate)}`
              : null,
          };
        })
      : [];

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      {/* `candidate_count` = how many fitting opportunities this view showed
          (0 when the board is not available or empty). A board with fits is
          the worker's first SYSTEM result; an empty one is not value — the
          admin TTFV section reads exactly this number. */}
      <TelemetryView
        event={FUNNEL_EVENTS.marketplaceOrOpportunitiesViewed}
        metadata={{
          surface: "opportunities",
          role_context: "worker",
          candidate_count:
            result.kind === "ready" && result.capabilities.boardAvailable ? result.opportunities.length : 0,
        }}
      />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
      </header>


      {result.kind === "no-worker" ? (
        <section className="rounded-lg border border-dashed border-ink-500 px-4 py-6">
          <p className="text-sm text-text-secondary">{t("noWorkerBody")}</p>
          <Link
            href={profileHref}
            className="mt-3 inline-block rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80"
          >
            {t("ctaProfile")} →
          </Link>
        </section>
      ) : (
        <>
          {/* WHAT BLOCKS MATCHING, if anything -- one reason, one action.
              These two are the only profile states that stop the engine from
              producing a match at all, so they stay above the board. Everything
              else the page knows about the profile is in the readiness
              disclosure below it. */}
          {/* No work type: onboarding only started asking on 2026-08-21, so
              everyone who joined before that is past the one screen that asks.
              Without it the profile-directed pool never runs and this board is
              the newest ads of any kind.
              `hasWorkType` is no longer `Boolean(subject.professionSlug)` — it
              is satisfied by a DECLARED profession or one their recorded work
              evidences, so this prompt now appears only for someone we
              genuinely cannot read, instead of nagging every worker whose
              journal already answered the question. Still no query, still
              dismissible — it invites, it never blocks. */}
          {result.kind === "ready" && !result.readiness.hasWorkType ? (
            <ProfessionRecoveryPrompt
              labels={{
                title: t("noWorkType.title"),
                body: t("noWorkType.body"),
                cta: t("noWorkType.cta"),
                dismiss: t("noWorkType.dismiss"),
              }}
            />
          ) : null}

          {/* No-evidence improvement state (PR5): skill matching needs skill
              evidence. Honest guidance to the Work Journal — never a fake fit. */}
          {result.kind === "ready" && !result.readiness.hasSkills ? (
            <section
              className="flex flex-col items-start gap-2 rounded-md border border-state-amber/40 bg-state-amber/10 px-4 py-3"
              data-testid="opportunities-no-skills"
            >
              {/* Two different silences, opposite next steps. Somebody who
                  has never recorded work needs to start; somebody whose
                  journal is already full needs to CONFIRM what it describes —
                  telling them to "add a work entry" is asking them to redo
                  the thing they did. Same section, same honesty, no fake fit. */}
              <p className="text-sm font-semibold text-text-primary">
                {result.readiness.hasRecordedWork
                  ? t("noSkills.confirmTitle")
                  : t("noSkills.title")}
              </p>
              <p className="text-xs leading-relaxed text-text-secondary">
                {result.readiness.hasRecordedWork
                  ? t("noSkills.confirmBody")
                  : t("noSkills.body")}
              </p>
              <Link
                href={`/${locale}/dashboard/journal`}
                className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80"
                data-testid="opportunities-no-skills-cta"
              >
                {result.readiness.hasRecordedWork
                  ? t("noSkills.confirmCta")
                  : t("noSkills.cta")}{" "}
                →
              </Link>
            </section>
          ) : null}

          {/* THE OPPORTUNITIES. First, because they are the page.
              They used to be the eleventh block. */}
          {/* ── Opportunities (approved supply routes only) ────────────── */}
          {!result.capabilities.boardAvailable ? (
            <section
              className="rounded-lg border border-dashed border-ink-500 px-4 py-6"
              data-testid="opportunities-pending"
            >
              <h2 className="font-display text-base font-semibold text-text-primary">
                {t("needsAccessTitle")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {t("needsAccessBody")}
              </p>
              {/* The body already tells the person what to do (complete the
                  profile); give them the door — same link the sibling empty
                  state offers, so this branch is no longer a dead end. */}
              <Link
                href={`/${locale}/dashboard/profile`}
                data-testid="opportunities-pending-cta"
                className="mt-3 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-ink-500 px-3 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue"
              >
                {t("approvedEmptyCta")} →
              </Link>
            </section>
          ) : result.opportunities.length === 0 ? (
            <section
              className="rounded-lg border border-dashed border-ink-500 px-4 py-6"
              data-testid="opportunities-empty"
            >
              <h2 className="font-display text-base font-semibold text-text-primary">
                {t("approvedEmptyTitle")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {t("approvedEmptyBody")}
              </p>
              {/* First-impression train v1: the empty body already tells a new
                  worker WHAT to do (complete the profile) — give them the door
                  to do it instead of a dead end. One real route, no fake
                  matching action. */}
              <Link
                href={`/${locale}/dashboard/profile`}
                data-testid="opportunities-empty-cta"
                className="mt-3 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-ink-500 px-3 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue"
              >
                {t("approvedEmptyCta")} →
              </Link>
            </section>
          ) : (
            (() => {
              // Facets over the FULL authorized universe — the chips must
              // offer every present value even while the first view shows
              // only the top of the ranking.
              const facets = collectDiscoveryFacets(
                result.opportunities.map((o) => o.need),
              );
              const visibleIds = new Set(
                initialView.visible.map((o) => o.need.id),
              );
              const expandedHref = `${boardHref}?view=all`;
              const facetGroups: ReadonlyArray<{
                dim: keyof DiscoveryFilterState;
                values: readonly string[];
              }> = [
                { dim: "profession", values: facets.professions },
                { dim: "country", values: facets.countries },
                { dim: "start", values: facets.starts },
                { dim: "accommodation", values: facets.accommodations },
                { dim: "transport", values: facets.transports },
                { dim: "tool", values: facets.tools },
              ];
              // Saved bookmarks joined against the LIVE rows (facts are never
              // copied into a save — a saved id with no live row is honestly
              // reported as "no longer open", never rendered from stale data).
              const liveIds = new Set(result.opportunities.map((o) => o.need.id));
              const savedLive = result.opportunities.filter((o) => o.saved);
              const savedStaleCount = result.savedRequestIds.filter(
                (id) => !liveIds.has(id),
              ).length;
              return (
                <OpportunityCompareProvider>
                  {/* ── Saved opportunities (P2-PR5, #723-compat) — rendered
                      ONLY when the owner-gated store exists. Private
                      bookmark: the hint says the company never sees it. */}
                  {result.capabilities.savedAvailable &&
                  (savedLive.length > 0 ||
                    savedStaleCount > 0 ||
                    result.savedVacancies.length > 0) ? (
                    <section
                      className="flex flex-col gap-2 rounded-lg border border-ink-600 bg-ink-800/30 p-4"
                      data-testid="opportunities-saved"
                      aria-label={t("saved.sectionTitle")}
                    >
                      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                        {t("saved.sectionTitle")} ·{" "}
                        {savedLive.length + result.savedVacancies.length}
                      </span>
                      {savedLive.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {savedLive.map(({ need }) => (
                            <li key={need.id}>
                              {/* In-page anchor to the live card below. A card
                                  the compressed first view holds back gets the
                                  expanded URL instead — a bookmark must never
                                  dead-link into a hidden card. */}
                              <a
                                href={
                                  visibleIds.has(need.id)
                                    ? `#opp-${need.id}`
                                    : `${expandedHref}#opp-${need.id}`
                                }
                                className="inline-flex min-h-[2.75rem] flex-col justify-center rounded-md border border-ink-500 px-3 py-1.5 transition-colors hover:border-brand-blue"
                                data-testid="opportunities-saved-item"
                              >
                                <span className="text-xs font-semibold text-text-primary">
                                  {roleLabel(need.roleText)}
                                </span>
                                <span className="text-meta text-text-muted">
                                  {scanLine(need)}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {/* The SAME saved list, second source: public vacancies
                          the worker kept from the job board. One group, not a
                          second saved section — the store is one table and the
                          concept is one concept. Ids are joined against live
                          ads by the loader, so an expired bookmark is simply
                          absent rather than rendered from stale facts. */}
                      {result.savedVacancies.length > 0 ? (
                        <ul
                          className="flex flex-wrap gap-1.5"
                          data-testid="opportunities-saved-vacancies"
                        >
                          {result.savedVacancies.map((v) => (
                            <li key={v.id}>
                              <Link
                                href={`/${locale}/jobs/${v.id}`}
                                className="inline-flex min-h-[2.75rem] flex-col justify-center rounded-md border border-ink-500 px-3 py-1.5 transition-colors hover:border-brand-blue"
                                data-testid="opportunities-saved-vacancy-item"
                              >
                                <span className="text-xs font-semibold text-text-primary">
                                  {v.title}
                                </span>
                                {v.occupation ? (
                                  <span className="text-meta text-text-muted">
                                    {v.occupation}
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {savedStaleCount > 0 ? (
                        /* One honest line — the demand behind these saves is
                           no longer on the board (closed or unpublished). */
                        <p
                          className="text-xs text-text-muted"
                          data-testid="opportunities-saved-stale"
                        >
                          {t("saved.noLongerOpen", { count: savedStaleCount })}
                        </p>
                      ) : null}
                      <p className="text-meta leading-relaxed text-text-muted">
                        {t("saved.privateHint")}
                      </p>
                    </section>
                  ) : null}

                  {/* ── Filters (URL-param links, server-rendered) ──────────
                      On request, not by default. Always-open, this panel was
                      330px of controls -- five facet rows and a sort row --
                      between the title and the first opportunity, so having
                      moved eight blocks off the top of the page the board was
                      still not the first thing on it.
                      `open={active.length > 0}` is the honesty rule: a board
                      that IS filtered always shows what is filtering it, and
                      the reset link with it. Nothing else changed -- same
                      facets, same links, same sort, same reset. */}
                  <details
                    open={active.length > 0}
                    className="group rounded-lg border border-ink-600 bg-ink-800/30"
                    data-testid="opportunities-filters"
                  >
                    <summary className="cursor-pointer select-none px-4 py-3 font-mono text-meta uppercase tracking-label text-text-muted marker:text-text-muted">
                      {t("discovery.filters.title")}
                      {active.length > 0
                        ? ` · ${t("discovery.filters.activeCount", { count: active.length })}`
                        : ""}
                    </summary>
                    <div className="flex flex-col gap-3 px-4 pb-4">
                    {active.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={boardHref}
                          data-testid="opportunities-filters-reset"
                          className="text-xs font-medium text-brand-blue hover:text-brand-cyan"
                        >
                          {t("discovery.filters.reset")}
                        </Link>
                      </div>
                    ) : null}
                    {facetGroups
                      .filter((g) => g.values.length > 0)
                      .map((g) => (
                        <div key={g.dim} className="flex flex-wrap items-center gap-1.5">
                          <span className="min-w-[7rem] font-mono text-meta uppercase tracking-label text-text-muted">
                            {t(`discovery.filters.${g.dim}` as never)}
                          </span>
                          {g.values.map((v) => {
                            const isActive = filters[g.dim] === v;
                            return (
                              <Link
                                key={v}
                                href={href({ [g.dim]: isActive ? null : v })}
                                aria-pressed={isActive}
                                className={chipClass(isActive)}
                                data-testid={`opportunities-filter-${g.dim}`}
                                data-active={isActive ? "true" : "false"}
                              >
                                {filterValueLabel(g.dim, v)}
                              </Link>
                            );
                          })}
                        </div>
                      ))}
                    {/* Sort — relevance (shared §19 comparator) | newest. */}
                    <div
                      className="flex flex-wrap items-center gap-1.5 border-t border-ink-600 pt-3"
                      data-testid="opportunities-sort"
                    >
                      <span className="min-w-[7rem] font-mono text-meta uppercase tracking-label text-text-muted">
                        {t("discovery.sort.label")}
                      </span>
                      {(["relevance", "newest"] as const).map((s) => (
                        <Link
                          key={s}
                          href={href({ sort: s })}
                          aria-pressed={sort === s}
                          className={chipClass(sort === s)}
                          data-testid={`opportunities-sort-${s}`}
                        >
                          {t(`discovery.sort.${s}`)}
                        </Link>
                      ))}
                    </div>
                    </div>
                  </details>

                  {filtered.length === 0 ? (
                    /* Empty state names WHICH active filters produced zero. */
                    <section
                      className="rounded-lg border border-dashed border-ink-500 px-4 py-6"
                      data-testid="opportunities-filtered-empty"
                    >
                      <h2 className="font-display text-base font-semibold text-text-primary">
                        {t("discovery.emptyFiltered.title")}
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                        {t("discovery.emptyFiltered.body", {
                          filters: active
                            .map(
                              ([dim, v]) =>
                                `${t(`discovery.filters.${dim}` as never)}: ${filterValueLabel(dim, v)}`,
                            )
                            .join(" · "),
                        })}
                      </p>
                      <Link
                        href={boardHref}
                        className="mt-3 inline-block rounded-md border border-brand-blue px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand-blue/80"
                        data-testid="opportunities-filtered-empty-reset"
                      >
                        {t("discovery.emptyFiltered.reset")}
                      </Link>
                    </section>
                  ) : (
                    /* ONE COLUMN WAS THE WHOLE DEFECT. The owner audit
                       described "tiny cards in a narrow central column
                       extending vertically through a huge mostly-empty desktop
                       page" — this `flex flex-col` is that column. Below xl
                       nothing changes (a phone has no spare width to give);
                       from 1280px the list uses the width it already occupies,
                       which halves the scroll instead of leaving the right half
                       of the screen empty. `items-start` keeps a card that
                       expands its details from stretching its neighbour. DOM
                       order is untouched, so the strongest match is still
                       first — top-left, then across. */
                    <ul
                      className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2"
                      data-testid="opportunities-list"
                    >
                      {/* Rendering IS the read event — and the board renders
                          `initialView.visible`, not everything the RPC
                          returned. Marking the loaded set would silently
                          retire matches the worker never saw behind an active
                          filter OR behind the compressed first view. */}
                      <OpportunitiesShownMarker
                        surface="opportunities_board"
                        requestIds={initialView.visible.map((o) => o.need.id)}
                      />
                      {initialView.visible.map(({ need, fit, match, nextAction, interestStatus, structured, saved }, rankIndex) => (
                        <li
                          key={need.id}
                          id={`opp-${need.id}`}
                          className="card-border flex scroll-mt-24 flex-col gap-3 p-4"
                          data-status={fit.status}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <p className="flex items-baseline gap-1.5 font-display text-base font-bold text-text-primary">
                                {/* POSITION, NOT A SCORE. The board already
                                    orders by `compareMatches` (status →
                                    coverage → confirmed evidence →
                                    availability), but nothing said so, and the
                                    order is invisible once the cards sit in a
                                    grid. A rank states what the product can
                                    honestly claim — "this is the strongest
                                    evidence we currently hold" — where a
                                    percentage would invent a precision no
                                    calibration backs (§19).

                                    Rendered ONLY under the relevance sort: on
                                    "newest" the position means recency, and a
                                    "#1" there would be a lie about fit. */}
                                {sort === "relevance" ? (
                                  <span
                                    className="font-mono text-meta text-text-muted"
                                    data-testid={`opportunity-rank-${rankIndex + 1}`}
                                  >
                                    #{rankIndex + 1}
                                  </span>
                                ) : null}
                                <span className="min-w-0">{roleLabel(need.roleText)}</span>
                                {/* Declared opportunity type (internship /
                                    apprenticeship / temporary assignment …)
                                    from the demand's structured projection —
                                    stated by the employer, never inferred.
                                    Plain employment is the default and gets
                                    no chip; the full row stays in details. */}
                                {structured?.opportunity_type && structured.opportunity_type !== "employment" ? (
                                  <span
                                    className="shrink-0 rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-primary"
                                    data-testid="opportunity-type-chip"
                                  >
                                    {sd(`opportunityType.${structured.opportunity_type}`)}
                                  </span>
                                ) : null}
                              </p>
                              {/* Compact scan line — full facts in details. */}
                              <p className="text-xs text-text-secondary">
                                {need.locationLabel
                                  ? `${need.locationLabel} · ${countryLabel(need.country)}`
                                  : countryLabel(need.country)}
                                {" · "}
                                {startLabel(need.startPeriod)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 font-mono text-meta uppercase tracking-label ${STATUS_TONE[fit.status]}`}
                              >
                                {statusLabel(fit.status)}
                              </span>
                              {/* Save toggle (#723-compat) — offered ONLY when
                                  the owner-gated store exists; absence means
                                  the control is simply not rendered. */}
                              {result.capabilities.savedAvailable ? (
                                <WorkerSaveOpportunityButton
                                  locale={locale}
                                  requestId={need.id}
                                  initialSaved={saved}
                                  labels={savedLabels}
                                />
                              ) : null}
                            </div>
                          </div>
                          {need.companyName ? (
                            <p className="text-xs text-text-secondary" data-testid="opportunity-company">
                              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                                {t("fieldCompany")}:
                              </span>{" "}
                              {need.companyName}
                              {/* Trust minimum (PR11): "verified" is shown ONLY when
                                  the row carries the real approved-route signal —
                                  admin-verified company via the Model-A gate. Never
                                  copy-driven, never default. */}
                              {need.routeStatus === "approved_direct_partner" ? (
                                <span
                                  className="ml-2 rounded-sm border border-state-success/40 bg-state-success/10 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-success"
                                  data-testid="opportunity-company-verified"
                                >
                                  {t("companyVerified")}
                                </span>
                              ) : null}
                            </p>
                          ) : null}

                          {/* Structured-condition scan chips (P2-PR2): pay with
                              explicit currency + basis, hours, engagement form,
                              start window, deadline — plus the MANDATORY
                              talent-pool disclosure chip. Renders nothing until
                              the MP-3 RPC widening delivers a valid projection. */}
                          <OpportunityStructuredChips
                            structured={structured}
                            locale={locale}
                            ts={ts}
                            sd={sd}
                          />

                          {/* Match breakdown — honest per-dimension fit (why it fits /
                              what to check), reusing the deterministic fit engine. No
                              score, no percentage, no guaranteed match. */}
                          <div className="flex flex-col gap-1.5" data-testid="opportunity-match-breakdown">
                            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                              {t("matchTitle")}
                            </span>
                            <MatchSignals
                              signals={buildMatchCardView(result.readiness, need).signals}
                              dimensionLabel={(k: MatchSignal["key"]) => t(`matchDim.${k}`)}
                              stateLabel={(s: MatchSignalState) => t(`matchState.${s}`)}
                            />
                          </div>

                          {/* Canonical skill match (PR5) — the same PR4 engine company
                              scouting uses, inverted: YOUR skills vs this demand's
                              derived requirements. §19: the coverage line always
                              carries its basis; band ≠ rating. */}
                          {match.skillFit ? (
                            <div
                              className="flex flex-col gap-1.5"
                              data-testid="opportunity-skill-match"
                              data-band={match.status}
                            >
                              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                                {t("skillMatch.title")} ·{" "}
                                {t.has(`skillMatch.band.${match.status}`)
                                  ? t(`skillMatch.band.${match.status}` as never)
                                  : match.status}
                              </span>
                              <p className="text-xs text-text-secondary">
                                {t("skillMatch.basis", {
                                  matched: match.skillFit.matchedTotal,
                                  total: match.skillFit.needTotal,
                                  confirmed: match.skillFit.matchedConfirmed,
                                })}
                                {match.missingData.includes("need_recognized_not_confirmed") ? (
                                  <span className="text-text-muted"> · {t("skillMatch.recognizedNote")}</span>
                                ) : null}
                              </p>
                            </div>
                          ) : null}

                          {/* Progressive disclosure (PR 4): all whitelisted fields +
                              the contract-v2 tier explanation behind a REAL button
                              (aria-expanded), so cards stay scannable. */}
                          <OpportunityDetailsDisclosure
                            showLabel={t("discovery.details.show")}
                            hideLabel={t("discovery.details.hide")}
                            testId="opportunity-details"
                            recentlyViewedId={need.id}
                          >
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                              <div className="min-w-0">
                                <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                  {t("fieldCountry")}
                                </dt>
                                <dd className="truncate text-xs text-text-primary">
                                  {need.locationLabel
                                    ? `${need.locationLabel} · ${countryLabel(need.country)}`
                                    : countryLabel(need.country)}
                                </dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                  {t("fieldStart")}
                                </dt>
                                <dd className="truncate text-xs text-text-primary">
                                  {startLabel(need.startPeriod)}
                                </dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                  {t("fieldTeam")}
                                </dt>
                                <dd className="truncate text-xs text-text-primary">
                                  {need.teamSize ?? "—"}
                                </dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                  {t("fieldAccommodation")}
                                </dt>
                                <dd className="truncate text-xs text-text-primary">
                                  {need.accommodation
                                    ? t.has(`accommodation.${need.accommodation}`)
                                      ? t(`accommodation.${need.accommodation}`)
                                      : need.accommodation
                                    : "—"}
                                </dd>
                              </div>
                              {/* Transport condition (§8.5) — enum-only value, same
                                  honest pattern as accommodation: whitelisted value or
                                  "—", never free text; stays "—" until the transport
                                  RPC recreate is applied. */}
                              <div className="min-w-0">
                                <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                  {t("fieldTransport")}
                                </dt>
                                <dd
                                  className="truncate text-xs text-text-primary"
                                  data-testid="opportunity-transport"
                                >
                                  {need.transport
                                    ? t.has(`transport.${need.transport}`)
                                      ? t(`transport.${need.transport}`)
                                      : need.transport
                                    : "—"}
                                </dd>
                              </div>
                              {/* Required tools/equipment (§8.6) — closed taxonomy slug
                                  list only, localized through the EXISTING skillNames
                                  catalogue (never a raw payload string); honest "not
                                  stated" until the company selects tools AND the
                                  required-tools RPC recreate is applied. */}
                              <div className="col-span-2 min-w-0">
                                <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                  {t("fieldTools")}
                                </dt>
                                <dd
                                  className="text-xs text-text-primary"
                                  data-testid="opportunity-required-tools"
                                >
                                  {need.requiredTools && need.requiredTools.length > 0
                                    ? need.requiredTools.map(skillLabel).join(", ")
                                    : t("toolsNotStated")}
                                </dd>
                              </div>
                            </dl>

                            {/* Structured demand detail (P2-PR2): organized
                                sections with visible amber honesty gaps when
                                the projection exists; ONE honest "not provided"
                                line when it does not (never fake emptiness). */}
                            <OpportunityStructuredSections
                              structured={structured}
                              locale={locale}
                              ts={ts}
                              sd={sd}
                              countryLabel={countryLabel}
                            />

                            {match.skillFit && match.skillFit.matchedUris.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5" data-testid="opportunity-matched-skills">
                                {match.skillFit.matchedUris.map((slug) => (
                                  <span
                                    key={slug}
                                    className="rounded-md border border-state-success/30 bg-state-success/10 px-2 py-0.5 text-meta text-state-success"
                                  >
                                    ✓ {skillLabel(slug)}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {match.skillFit && match.skillFit.missingUris.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5" data-testid="opportunity-missing-skills">
                                {match.skillFit.missingUris.map((slug) => (
                                  <span
                                    key={slug}
                                    className="rounded-md border border-state-amber/30 bg-state-amber/5 px-2 py-0.5 text-meta text-state-amber"
                                  >
                                    {t("skillMatch.missingPrefix")} {skillLabel(slug)}
                                  </span>
                                ))}
                              </div>
                            ) : null}

                            {/* Contract-v2 tiers: blocking / strengths / negotiables /
                                missing facts — explanation first, never a standalone %. */}
                            <MatchTierExplanation
                              blocking={match.blocking}
                              strengths={match.strengths}
                              negotiables={match.negotiables}
                              missingFacts={match.missingFacts}
                              labels={tierLabels}
                              testId="opportunity-match-tiers"
                            />
                          </OpportunityDetailsDisclosure>

                          {/* The one clear next step for this card. */}
                          <p
                            className="font-mono text-meta uppercase tracking-label text-text-muted"
                            data-testid="opportunity-next-action"
                            data-next-action={nextAction}
                          >
                            {t(`workerNext.${nextAction}` as never)}
                          </p>

                          {/* Express interest — INTERNAL signal only (honest copy in
                              labels.internalNote). Offered ONLY when the owner-gated
                              interest table exists — never a dead button. */}
                          {result.capabilities.interestAvailable ? (
                            <WorkerInterestButton
                              locale={locale}
                              requestId={need.id}
                              initialStatus={interestStatus}
                              labels={{
                                express: t("interest.express"),
                                sent: t("interest.sent"),
                                reviewed: t("interest.reviewed"),
                                contacted: t("interest.contacted"),
                                withdraw: t("interest.withdraw"),
                                internalNote: t("interest.internalNote"),
                                error: t("interest.error"),
                                contactedLink: t("interest.contactedLink"),
                                contactEmployer: t("interest.contactEmployer"),
                                contactError: t("interest.contactError"),
                              }}
                            />
                          ) : null}
                          {fit.gaps.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {fit.gaps.map((g) => (
                                <span
                                  key={g}
                                  className="rounded-md border border-state-amber/30 bg-state-amber/5 px-2 py-0.5 text-meta text-state-amber"
                                >
                                  {gapLabel(g)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-3">
                            {/* Compare selector — pure client selection of
                                this already-loaded card (whitelisted facts
                                only, precomputed server-side). */}
                            <CompareToggleChip
                              entry={buildCompareEntry(need, structured)}
                              label={t("compare.toggle")}
                            />
                            <Link
                              href={profileHref}
                              className="inline-flex min-h-[2.75rem] items-center rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-primary hover:border-brand-blue"
                            >
                              {t("ctaProfile")} →
                            </Link>
                            {fit.status === "possible_match" ? (
                              <span className="text-meta text-text-muted">{t("possibleNote")}</span>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Compressed-view honesty line: the first view shows the
                      strongest matches, and says so — with the true size of
                      the ranked universe and one real link to all of it.
                      Nothing is deleted, nothing is hidden without a door. */}
                  {initialView.capped ? (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-800/30 px-4 py-3"
                      data-testid="opportunities-show-more"
                    >
                      <p className="text-xs text-text-secondary">
                        {t("discovery.initialView.summary", {
                          shown: initialView.visible.length,
                          total: filtered.length,
                        })}
                      </p>
                      <Link
                        href={expandedHref}
                        data-testid="opportunities-show-all"
                        className="inline-flex min-h-11 items-center rounded-md border border-brand-blue px-3 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue/80"
                      >
                        {t("discovery.initialView.showAll", {
                          count: initialView.hiddenCount,
                        })}
                      </Link>
                    </div>
                  ) : null}

                  {/* Compare (P2-PR5) — pure client state over the loaded
                      cards; the sticky bar + whitelisted-facts table render
                      only once something is selected. Nothing persists. */}
                  <CompareBar labels={compareLabels} factLabels={compareFactLabels} />
                </OpportunityCompareProvider>
              );
            })()
          )}

          {/* ── Mano susidomėjimai (extension A) — the worker's OWN interest
              signals, collapsible, INDEPENDENT of board visibility: a signal
              whose demand closed stays here with an honest label instead of
              silently vanishing. Renders only when at least one signal
              exists — no empty wall, and never a section for an unapplied
              store (rows are empty then). Actions reuse EXISTING flows only
              (withdraw / contact employer / view demand / tailored CV). */}
          {myInterestDisplayRows.length > 0 ? (
            <WorkerMyInterestSection
              locale={locale}
              rows={myInterestDisplayRows}
              labels={{
                title: t("myInterest.title"),
                summary: t("myInterest.summary", {
                  count: myInterestDisplayRows.length,
                }),
                intro: t("myInterest.intro"),
                closed: t("myInterest.closed"),
                withdrawnStatusText: t("myInterest.status.withdrawn"),
                withdraw: t("interest.withdraw"),
                contactEmployer: t("interest.contactEmployer"),
                openConversation: t("interest.contactedLink"),
                viewDemand: t("myInterest.viewDemand"),
                cvLink: t("myInterest.cvLink"),
                error: t("interest.error"),
                internalNote: t("interest.internalNote"),
              }}
            />
          ) : null}

          {/* External public-source ads (real-supply train) — same board,
              same engine, provenance always rendered. The section is absent
              while there is no supply: no dead shell. */}
          <ExternalVacanciesSection
            cards={result.externalVacancies.cards}
            freshness={result.externalVacancies.freshness}
            initialCount={externalInitialCount}
            expansion={{
              href: `${boardHref}?view=all`,
              label: t("discovery.initialView.showAllExternal"),
            }}
            labels={{
              shownOfTotal: (shown, total) =>
                t("external.shownOfTotal", { shown, total }),
              sectionTitle: t("external.sectionTitle"),
              sectionNote: t("external.sectionNote"),
              // How old this supply is, in the worker's own words. The date is
              // locale-formatted; no infrastructure state is ever surfaced.
              freshnessNotice: (freshness) => {
                // `dateFmt` is the page's existing UTC-pinned formatter.
                // `last_seen_at` is a UTC instant; formatting it in the
                // server's ambient zone would show the reader a different day
                // for a value meant to be exact (W12 doctrine).
                const date = dateFmt(freshness.lastRefreshedAt);
                if (freshness.state === "unavailable")
                  return t("external.freshnessUnavailable");
                if (!date || freshness.state === "unknown")
                  return t("external.freshnessUnknown");
                return freshness.state === "stale"
                  ? t("external.freshnessStale", { date })
                  : t("external.freshnessDelayed", { date });
              },
              openOriginal: t("external.openOriginal"),
              confirmNotice: t("external.confirmNotice"),
              confirmContinue: t("external.confirmContinue"),
              confirmDismiss: t("external.confirmDismiss"),
              noApplicationRoute: t("external.noApplicationRoute"),
              bandBestTitle: t("external.bandBest"),
              bandPossibleTitle: t("external.bandPossible"),
              bandExploreTitle: t("external.bandExplore"),
              publishedOn: (d) => t("external.publishedOn", { date: d }),
              positionsLabel: (n) => t("external.positions", { count: n }),
              payAsPublished: t("external.payAsPublished"),
              gapsTitle: t("external.gapsTitle"),
              gapLabel: (gap) =>
                t.has(`external.gap.${gap}`)
                  ? t(`external.gap.${gap}` as never)
                  : gap,
              tierLabels,
              attributionText: (code) => tRoot(code as never),
              originNoteText: (code) => tRoot(code as never),
              managementNoteText: (code) => tRoot(code as never),
              skillLabel,
            }}
          />

          {/* MARKET SITUATION -- on request, not by default.
              Market intelligence is a real capability and none of it is removed:
              the same salary/benchmark cards, the same AI reading of the public
              ad pool, the same weekly summary, the same map. What changed is that
              it no longer occupies the viewport a worker opened to see WORK.
              Three consecutive market blocks used to sit between the reader and
              the first opportunity -- and on a profile with no imported ads they
              were three cards of zeroes.
              Reuses the existing market-context row title as the summary, so no
              untranslated string enters the product. */}
          <details
            className="group rounded-lg border border-ink-600 bg-ink-800/40"
            data-testid="opportunities-market-situation"
          >
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-text-primary marker:text-text-muted">
              {tIntel("trustCard.rowTitle")}
            </summary>
            <div className="flex flex-col gap-4 px-4 pb-4">
              {/* Market context row (Contextual Intelligence UI v1): the ONE
                  trust-card engine renders the worker's salary-vs-benchmark
                  position plus four honest unavailable placeholders — no
                  duplicate UI, no fabricated figures, premium empty states. */}
              {salaryIntel.kind !== "no_viewer" ? (
                <section
                  className="flex flex-col gap-3"
                  data-testid="opportunities-market-context"
                  aria-label={tIntel("trustCard.rowTitle")}
                >
                  <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                    {tIntel("trustCard.rowTitle")}
                  </h2>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {marketContextCards.map((card, index) => (
                      <TrustInsightCard
                        key={card.id}
                        card={card}
                        locale={locale}
                        linkToWorkspace={index === 0}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Market for the worker's own occupation — exact counts over the
                  imported public advertisement pool, plus the optional AI
                  reading of them. Placed ABOVE the weekly summary because it is
                  the one signal on this page that does not depend on the
                  internal demand board having rows in it. Renders nothing when
                  the profile carries no work type. */}
              {result.kind === "ready" ? (
                <MarketExplanationPanel
                  professionSlug={result.readiness.professionSlug}
                  evidencedProfessionSlug={result.readiness.evidencedProfessionSlug}
                  locale={locale}
                />
              ) : null}

              {/* Weekly personal intelligence (C-r1) — the summary the weekly
                  digest bell row points at. Renders only when at least one of
                  the two reads answered (emitter rule mirrored). */}
              {weekly.kind === "ready" ? (
                <WeeklyIntelligenceSection intel={weekly.intelligence} locale={locale} />
              ) : null}

          <Link
            href={`/${locale}/dashboard/market-map`}
            data-testid="opportunities-market-map-link"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand-blue hover:text-brand-cyan"
          >
            {t("marketMapLink")} →
          </Link>
            </div>
          </details>

          {/* YOUR READINESS -- diagnostics, on request.
              This is the worker's own profile-completeness scorecard. It is real,
              own-data and worth keeping, but it is not what the page is FOR, and
              as a permanent card above the board it made opportunity discovery
              compete with profile admin every time the page opened.
              The two states that genuinely BLOCK matching -- no work type, no
              skills -- are NOT in here. They still render above the board as one
              reason plus one action, because those a worker must act on now. */}
          <details
            className="group rounded-lg border border-ink-600 bg-ink-800/40"
            data-testid="opportunities-readiness-disclosure"
          >
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-text-primary marker:text-text-muted">
              {t("readinessTitle")}
            </summary>
            <div className="px-4 pb-4">
              {/* ── Your readiness (real own-data) ─────────────────────────── */}
              <section
                className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-ink-800/40 p-4"
                data-testid="opportunities-readiness"
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {t("readinessIntro")}
                  </p>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {(
                    [
                      ["workType", result.readiness.hasWorkType],
                      ["skills", result.readiness.hasSkills],
                      ["country", result.readiness.countries.length > 0],
                      ["documents", result.readiness.documentsCount > 0],
                      ["availability", result.readiness.availabilitySet],
                    ] as const
                  ).map(([key, ok]) => (
                    <li
                      key={key}
                      className={`rounded-md border px-2.5 py-1 text-xs ${
                        ok
                          ? "border-state-success/40 bg-state-success/10 text-state-success"
                          : "border-state-amber/40 bg-state-amber/5 text-state-amber"
                      }`}
                      data-ready={ok ? "yes" : "no"}
                    >
                      {t(`ready.${key}`)} · {ok ? t("ready.set") : t("ready.missing")}
                    </li>
                  ))}
                </ul>
                <Link
                  href={profileHref}
                  className="inline-block w-fit rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80"
                >
                  {t("ctaProfile")} →
                </Link>
              </section>
            </div>
          </details>

          {/* How matching works — deterministic rules + calc version, no AI
              claims, no global score (contract v2 presentation rule). */}
          <details
            className="group rounded-lg border border-ink-600 bg-ink-800/40"
            data-testid="opportunities-how-matching"
          >
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-text-primary marker:text-text-muted">
              {t("discovery.how.title")}
            </summary>
            <div className="flex flex-col gap-2 px-4 pb-4 text-xs leading-relaxed text-text-secondary">
              <p>{t("discovery.how.body")}</p>
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("discovery.how.version", { version: MATCH_CALC_VERSION })}
              </p>
              <p data-testid="opportunities-trust-note">{t("trustNote")}</p>
              {/* What this surface is. It used to be a permanent banner
                  above the board -- copy explaining the feature, on the
                  feature, in the space the feature needed. Here it answers
                  the reader who actually asked. */}
              <FeatureNote testId="feature-note-opportunities">
                {(await getTranslations("featureNotes"))("opportunities")}
              </FeatureNote>
            </div>
          </details>

          {/* Recently viewed (P2-PR5) — DEVICE-LOCAL list of detail
              disclosures opened on THIS device, re-joined against the live,
              already-authorized rows (ids + timestamps only in storage; the
              strip itself discloses that nothing leaves this browser). */}
          {result.opportunities.length > 0 ? (
            <RecentlyViewedStrip
              liveRows={result.opportunities.map(({ need }) => ({
                id: need.id,
                title: roleLabel(need.roleText),
                scanLine: scanLine(need),
              }))}
              labels={recentLabels}
            />
          ) : null}

          <p className="text-meta leading-relaxed text-text-muted">{t("footnote")}</p>
        </>
      )}

      {/* Next-step bridge (§8.10 / §6 system loop): a fit doesn't dead-end — it
          moves through the marketplace (request/offer) and the plan (a confirmed
          match becomes a booking). Existing routes only; navigation, no fake
          matching action, mobile-first tap targets.

          It sits AFTER the board, not before it. This block used to be the
          first thing on the page: a worker who opened "Galimybės" met two
          links to OTHER surfaces before a single opportunity. A next step is
          only a next step once there is something to step on from — and the
          page now answers "what matters now?" before "what else can I do?".
          Still outside the no-worker branch, so it renders exactly as often
          as it did before. */}
      <section
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="opportunities-next-step"
      >
        {/* Density pass (worker-workspace UX audit v2): the intro sentence
            restated what the two link cards below already say — removed. */}
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("nextStep.title")}
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              key: "marketplace",
              href: `/${locale}/dashboard/service-requests`,
              label: t("nextStep.marketplace"),
              note: t("nextStep.marketplaceNote"),
            },
            {
              key: "bookings",
              href: `/${locale}/dashboard/bookings`,
              label: t("nextStep.bookings"),
              note: t("nextStep.bookingsNote"),
            },
          ].map((l) => (
            <Link
              key={l.key}
              href={l.href}
              data-testid={`opportunities-next-step-${l.key}`}
              className="flex min-h-[3.25rem] flex-col rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue"
            >
              <span className="font-semibold">{l.label}</span>
              <span className="text-xs text-text-muted">{l.note}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
