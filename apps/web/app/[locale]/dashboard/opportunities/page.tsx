import { getTranslations, setRequestLocale } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import Link from "next/link";

import { FeatureNote } from "@/components/app/feature-note";
import { MatchSignals } from "@/components/app/match-signals";
import { MatchTierExplanation } from "@/components/app/match-tier-explanation";
import {
  ExternalOpportunityRow,
  ExternalVacanciesSection,
  selectExternalFirstView,
} from "@/components/app/external-vacancies-section";
import { ProfessionRecoveryPrompt } from "@/components/app/profession-recovery-prompt";
import { OpportunityDetailsDisclosure } from "@/components/app/opportunity-details-disclosure";
import { FitBandChip } from "@/components/app/opportunities/fit-band-chip";
import { OpportunityBandSection } from "@/components/app/opportunities/opportunity-band-section";
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
import { Card } from "@/components/ui/Card";
import { buttonLinkClassName } from "@/components/ui/Button";
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
import type { ExternalOpportunityCardV1 } from "@/lib/opportunities/external-vacancies";
import { deriveFitBand, type FitBand } from "@/lib/opportunities/fit-band";
import type { OpportunityCard } from "@/lib/opportunities/load-worker-opportunities";
import {
  deriveWorldReading,
  retrievalCounts,
  whyCodesFor,
} from "@/lib/opportunities/opportunities-view";
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
 * PASAULIS — the worker's discovery-and-matching destination
 * (`/dashboard/opportunities`, target IA 2026-09-13; #1689 defect H).
 *
 * Discovery ≠ matching. The page states in ONE line what the fit was
 * assessed against (the subject reader's own facts, in words) and how many
 * rows were retrieved versus shown, then lists every row — platform need or
 * public advertisement alike — inside the band the ONE engine's verdict
 * implies: STRONG → POSSIBLE → MISSING REQUIREMENT → CONFLICT →
 * DISCOVERED-NOT-ASSESSED. Each row carries its WHY in words (the engine's
 * own gap / missing-data codes through the existing `fitWhy.*` / `gap.*`
 * copy), never a score. A `not_assessed` row is UNKNOWN, never a verdict;
 * an empty STRONG band says what would change it and names only what the
 * engine reported missing on the person's side.
 *
 * What stayed (§1.5 — reachable and working): the profession-recovery
 * prompt, the no-skills state, saved opportunities (platform + public),
 * express interest, compare, the URL-param filters and sort (server-side
 * narrowing, on request), the compressed first view and its show-all door,
 * "my interest", the external supply/freshness line, market situation,
 * readiness, how matching works, recently viewed, the next-step bridge and
 * the telemetry / shown markers. The legacy card body (facts grid,
 * structured conditions, match breakdown, tiers) lives inside each row's
 * details disclosure — the same components, one tap deeper.
 *
 * READERS ONLY. Every row comes through `loadWorkerOpportunityBoard`; the
 * band through `deriveFitBand`; nothing here runs a second query or a
 * second matching fork.
 */

const STATUS_TONE: Record<OpportunityStatus, string> = {
  possible_match: "border-state-success/40 bg-state-success/10 text-state-success",
  check_conditions: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  needs_documents: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  missing_profile_info: "border-ink-500 bg-ink-800/40 text-text-muted",
};

/** Band → the words the destination uses for its section titles and chips.
 *  Section titles reuse the ONE external band vocabulary the chat readback
 *  already speaks; the chip word is the band, short. */
const BAND_TITLE_KEY: Record<FitBand, string> = {
  strong: "external.bandBest",
  possible: "external.bandPossible",
  missing_requirement: "external.bandMissingRequirement",
  conflict: "external.bandConflict",
  not_assessed: "external.bandNotAssessed",
};
const BAND_CHIP_KEY: Record<FitBand, string> = {
  strong: "world.chip.strong",
  possible: "world.chip.possible",
  missing_requirement: "world.chip.missing_requirement",
  conflict: "world.chip.conflict",
  not_assessed: "world.chip.not_assessed",
};

/** One row of the destination — a platform need or a public advertisement,
 *  already banded. `rankIndex` is the platform row's position in the shared
 *  comparator's order (a position, never a score). */
type WorldRow =
  | {
      readonly kind: "platform";
      readonly key: string;
      readonly band: FitBand;
      readonly card: OpportunityCard;
      readonly rankIndex: number;
      readonly gapCodes: readonly string[];
      readonly missingDataCodes: OpportunityCard["match"]["missingData"];
      readonly profileGapCodes: readonly OpportunityGap[];
    }
  | {
      readonly kind: "external";
      readonly key: string;
      readonly band: FitBand;
      readonly card: ExternalOpportunityCardV1;
      readonly gapCodes: readonly string[];
      readonly missingDataCodes: ExternalOpportunityCardV1["match"]["missingData"];
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
  // ?view=all) the bands hold everything that was loaded, as before.
  const boardRefined = view === "all" || active.length > 0 || sort !== "relevance";
  const externalInitialCount = boardRefined
    ? null
    : Math.max(INITIAL_VIEW_MAX_COUNT - initialView.visible.length, 2);
  const externalCards =
    result.kind === "ready" ? result.externalVacancies.cards : [];
  // The SAME rule the supply line states its count with — so the bands
  // render exactly the rows the line says are shown.
  const externalView = selectExternalFirstView(externalCards, externalInitialCount);
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
  // WHY a row sits in its band — the engine's own codes in words. An
  // existing sentence is reused where one exists (`fitWhy.*` for the
  // engine's gap / missing-data codes, `gap.*` for the profile layer); a
  // code with no copy is dropped rather than shown raw.
  const whyText = (code: string): string | null =>
    t.has(`fitWhy.${code}`)
      ? (t(`fitWhy.${code}` as never) as string)
      : t.has(`gap.${code}`)
        ? (t(`gap.${code}` as never) as string)
        : null;

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
  const chipClass = (isActive: boolean) =>
    `inline-flex min-h-11 items-center rounded-md border px-2.5 text-support transition-colors ${
      isActive
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

  // ── THE ROWS — platform needs (the compressed first view) and public ads
  //    (the same first-view budget), each banded by the ONE engine's verdict.
  //    Order inside a band: platform rows in comparator order, then public
  //    rows in comparator order — nothing is re-ranked here. ────────────────
  const rows: WorldRow[] = [
    ...initialView.visible.map((card, rankIndex): WorldRow => {
      const fit = deriveFitBand(card.match);
      return {
        kind: "platform",
        key: `p:${card.need.id}`,
        band: fit.band,
        card,
        rankIndex,
        gapCodes: fit.why.gapCodes,
        missingDataCodes: fit.why.missingDataCodes,
        profileGapCodes: card.fit.gaps,
      };
    }),
    ...externalView.shown.map((card): WorldRow => {
      const fit = deriveFitBand(card.match);
      return {
        kind: "external",
        key: `x:${card.key}`,
        band: fit.band,
        card,
        gapCodes: fit.why.gapCodes,
        missingDataCodes: fit.why.missingDataCodes,
      };
    }),
  ];
  const world = deriveWorldReading({
    subject: result.kind === "ready" ? "ready" : "unreadable",
    rows,
  });
  const platformCounts = retrievalCounts(
    result.kind === "ready" ? result.opportunities.length : 0,
    initialView.visible.length,
  );
  const externalCounts = retrievalCounts(externalCards.length, externalView.shown.length);
  const filteredOut =
    result.kind === "ready" && result.capabilities.boardAvailable
      ? result.opportunities.length - filtered.length
      : 0;

  // ── The assessment line: WHAT the fit was assessed against, in words,
  //    from the subject reader's own facts. "Not stated" is a stated fact
  //    here, never an omission. ─────────────────────────────────────────────
  const assessedFacts: string[] =
    result.kind === "ready"
      ? (() => {
          const r = result.readiness;
          const facts: string[] = [];
          facts.push(
            r.professionSlug
              ? t("world.fact.profession", { value: roleLabel(r.professionSlug) })
              : r.evidencedProfessionSlug
                ? t("world.fact.professionEvidenced", {
                    value: roleLabel(r.evidencedProfessionSlug),
                  })
                : t("world.fact.professionMissing"),
          );
          facts.push(
            r.assessedAgainst.skillCount > 0
              ? t("world.fact.skills", { count: r.assessedAgainst.skillCount })
              : t("world.fact.skillsMissing"),
          );
          const place = [r.assessedAgainst.city, r.countries[0] ? countryLabel(r.countries[0]) : null]
            .filter(Boolean)
            .join(", ");
          facts.push(place ? t("world.fact.place", { value: place }) : t("world.fact.placeMissing"));
          facts.push(
            r.assessedAgainst.salaryMinEur != null
              ? t("world.fact.pay", { amount: r.assessedAgainst.salaryMinEur })
              : t("world.fact.payMissing"),
          );
          facts.push(
            r.assessedAgainst.languages.length > 0
              ? t("world.fact.languages", {
                  list: r.assessedAgainst.languages.map(publicLanguageName).join(", "),
                })
              : t("world.fact.languagesMissing"),
          );
          return facts;
        })()
      : [];
  const countParts: string[] =
    result.kind === "ready"
      ? [
          result.capabilities.boardAvailable
            ? t("world.countsPlatform", {
                shown: platformCounts.shown,
                retrieved: platformCounts.retrieved,
              })
            : t("world.countsPlatformUnavailable"),
          result.externalVacancies.available
            ? t("world.countsExternal", {
                shown: externalCounts.shown,
                retrieved: externalCounts.retrieved,
              })
            : t("world.countsExternalUnreadable"),
          ...(filteredOut > 0 ? [t("world.countsFiltered", { count: filteredOut })] : []),
        ]
      : [];

  const bandTitle = (band: FitBand) => t(BAND_TITLE_KEY[band] as never) as string;
  const bandChip = (band: FitBand) => t(BAND_CHIP_KEY[band] as never) as string;

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
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("world.title")}
        </h1>
        {result.kind === "ready" ? (
          <>
            {/* ONE line: what the fit was assessed against. */}
            <p
              className="text-support leading-relaxed text-text-secondary"
              data-testid="opportunities-assessment"
            >
              {t("world.assessedAgainst", { facts: assessedFacts.join(" · ") })}
            </p>
            {/* Retrieved vs shown — "kodėl šie / kiek atmesta" (§T). */}
            <p
              className="font-mono text-meta uppercase tracking-label text-text-muted"
              data-testid="opportunities-counts"
            >
              {countParts.join(" · ")}
            </p>
          </>
        ) : null}
      </header>

      {world.kind === "could_not_read_subject" || result.kind !== "ready" ? (
        /* READER FAILURE — no worker row, nothing to compare against. Said
           as such, never rendered as an empty band. */
        <section
          className="rounded-lg border border-dashed border-ink-500 px-4 py-6"
          data-testid="opportunities-no-worker"
        >
          <p className="text-support text-text-secondary">{t("noWorkerBody")}</p>
          <Link
            href={profileHref}
            className="mt-3 inline-flex min-h-11 items-center rounded-md bg-brand-blue px-4 text-support font-semibold text-text-on-brand hover:bg-brand-blue/80"
          >
            {t("ctaProfile")} →
          </Link>
        </section>
      ) : (
        <>
          {/* WHAT BLOCKS MATCHING, if anything -- one reason, one action.
              These two are the only profile states that stop the engine from
              producing a match at all, so they stay above the bands. */}
          {/* No work type: `hasWorkType` is satisfied by a DECLARED profession
              or one their recorded work evidences, so this prompt appears only
              for someone we genuinely cannot read. Dismissible — it invites,
              it never blocks. */}
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
              evidence. Honest guidance to the Work Journal — never a fake fit.
              Two different silences, opposite next steps: somebody who has
              never recorded work needs to start; somebody whose journal is
              already full needs to CONFIRM what it describes. */}
          {!result.readiness.hasSkills ? (
            <section
              className="flex flex-col items-start gap-2 rounded-md border border-state-amber/40 bg-state-amber/10 px-4 py-3"
              data-testid="opportunities-no-skills"
            >
              <p className="text-support font-semibold text-text-primary">
                {result.readiness.hasRecordedWork
                  ? t("noSkills.confirmTitle")
                  : t("noSkills.title")}
              </p>
              <p className="text-basis leading-relaxed text-text-secondary">
                {result.readiness.hasRecordedWork
                  ? t("noSkills.confirmBody")
                  : t("noSkills.body")}
              </p>
              <Link
                href={`/${locale}/dashboard/journal`}
                className="inline-flex min-h-11 items-center rounded-md bg-brand-blue px-3 text-support font-semibold text-text-on-brand hover:bg-brand-blue/80"
                data-testid="opportunities-no-skills-cta"
              >
                {result.readiness.hasRecordedWork
                  ? t("noSkills.confirmCta")
                  : t("noSkills.cta")}{" "}
                →
              </Link>
            </section>
          ) : null}

          {/* Platform demand not enabled yet — a stated fact, kept apart from
              "no rows". Public ads read from their own store and still render
              below, so this is a line, not the whole page. */}
          {!result.capabilities.boardAvailable ? (
            <section
              className="rounded-lg border border-dashed border-ink-500 px-4 py-4"
              data-testid="opportunities-pending"
            >
              <h2 className="font-display text-card-title font-semibold text-text-primary">
                {t("needsAccessTitle")}
              </h2>
              <p className="mt-1 text-basis leading-relaxed text-text-secondary">
                {t("needsAccessBody")}
              </p>
              <Link
                href={profileHref}
                data-testid="opportunities-pending-cta"
                className={`mt-3 ${buttonLinkClassName("secondary", "sm")}`}
              >
                {t("approvedEmptyCta")} →
              </Link>
            </section>
          ) : null}

          {/* The public-supply source could not be read — UNKNOWN, not zero. */}
          {!result.externalVacancies.available ? (
            <p
              className="rounded-md border border-ink-500 bg-ink-900/40 p-3 text-basis leading-relaxed text-text-secondary"
              data-testid="opportunities-external-unreadable"
              role="status"
            >
              {t("world.externalCouldNotRead")}
            </p>
          ) : null}

          {rows.length === 0 && active.length > 0 ? (
            /* Empty state names WHICH active filters produced zero. */
            <section
              className="rounded-lg border border-dashed border-ink-500 px-4 py-6"
              data-testid="opportunities-filtered-empty"
            >
              <h2 className="font-display text-card-title font-semibold text-text-primary">
                {t("discovery.emptyFiltered.title")}
              </h2>
              <p className="mt-1 text-basis leading-relaxed text-text-secondary">
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
                className={`mt-3 ${buttonLinkClassName("secondary", "sm")}`}
                data-testid="opportunities-filtered-empty-reset"
              >
                {t("discovery.emptyFiltered.reset")}
              </Link>
            </section>
          ) : rows.length === 0 && result.capabilities.boardAvailable ? (
            /* Honest empty (§18): the read worked, nothing was retrieved —
               neither a platform need nor a public ad — and the ONE concrete
               next step is named rather than implied. */
            <section
              className="rounded-lg border border-dashed border-ink-500 px-4 py-6"
              data-testid="opportunities-empty"
            >
              <h2 className="font-display text-card-title font-semibold text-text-primary">
                {t("approvedEmptyTitle")}
              </h2>
              <p className="mt-1 text-basis leading-relaxed text-text-secondary">
                {t("approvedEmptyBody")}
              </p>
              <Link
                href={profileHref}
                data-testid="opportunities-empty-cta"
                className={`mt-3 ${buttonLinkClassName("secondary", "sm")}`}
              >
                {t("approvedEmptyCta")} →
              </Link>
            </section>
          ) : null}

          {(() => {
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
            const strongEmptyChanges =
              world.kind === "bands" && world.strong.kind === "empty"
                ? [
                    ...(!result.readiness.hasWorkType ? [t("world.change.profession_missing")] : []),
                    ...world.strong.subjectMissing.map(
                      (code) => t(`world.change.${code}` as never) as string,
                    ),
                  ]
                : [];
            return (
              <OpportunityCompareProvider>
                {/* Public supply line: retrieved vs shown, source, how old
                    the supply is, the door to the rest. Rows are in the
                    bands below — this states the count they come from. */}
                <ExternalVacanciesSection
                  cards={externalCards}
                  freshness={result.externalVacancies.freshness}
                  initialCount={externalInitialCount}
                  expansion={{
                    href: expandedHref,
                    label: t("discovery.initialView.showAllExternal"),
                  }}
                  labels={{
                    shownOfTotal: (shown, total) =>
                      t("external.shownOfTotal", { shown, total }),
                    sectionTitle: t("external.sectionTitle"),
                    sectionNote: t("external.sectionNote"),
                    // How old this supply is, in the worker's own words. The
                    // date is locale-formatted through the page's UTC-pinned
                    // formatter (W12); no infrastructure state is surfaced.
                    freshnessNotice: (freshness) => {
                      const date = dateFmt(freshness.lastRefreshedAt);
                      if (freshness.state === "unavailable")
                        return t("external.freshnessUnavailable");
                      if (!date || freshness.state === "unknown")
                        return t("external.freshnessUnknown");
                      return freshness.state === "stale"
                        ? t("external.freshnessStale", { date })
                        : t("external.freshnessDelayed", { date });
                    },
                  }}
                />

                {/* ── THE BANDS. Strongest first, UNKNOWN last; a band renders
                    only when it has rows — except STRONG, which says honestly
                    when it is empty and what would change it. Rendering IS the
                    read event: the shown marker reports `initialView.visible`,
                    never everything the RPC returned. */}
                {world.kind === "bands" && rows.length > 0 ? (
                  <div
                    className="flex flex-col gap-6"
                    data-testid="opportunities-list"
                    data-discovery-only={world.discoveryOnly ? "true" : undefined}
                  >
                    <OpportunitiesShownMarker
                      surface="opportunities_board"
                      requestIds={initialView.visible.map((o) => o.need.id)}
                    />
                    <p className="text-meta leading-relaxed text-text-muted" data-testid="opportunities-derived-note">
                      {t("world.derivedNote")}
                    </p>
                    {world.strong.kind === "empty" ? (
                      <OpportunityBandSection
                        band="strong"
                        title={bandTitle("strong")}
                        count={0}
                        emptyReading={
                          <div className="flex flex-col gap-1">
                            <p className="text-support font-medium text-text-primary">
                              {t("world.strongEmpty")}
                            </p>
                            {strongEmptyChanges.length > 0 ? (
                              <p className="text-basis text-text-secondary" data-testid="opportunities-strong-empty-change">
                                {t("world.strongEmptyChange", {
                                  items: strongEmptyChanges.join(" · "),
                                })}
                              </p>
                            ) : null}
                          </div>
                        }
                      />
                    ) : null}
                    {world.sections.map((section) => (
                      <OpportunityBandSection
                        key={section.band}
                        band={section.band}
                        title={bandTitle(section.band)}
                        count={section.rows.length}
                      >
                        {/* ONE COLUMN WAS THE WHOLE DEFECT of the old board on
                            desktop; below xl a phone has no spare width to
                            give, from 1280px the rows use the width they have.
                            DOM order is the comparator's order. */}
                        <ul className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                          {section.rows.map((row) =>
                            row.kind === "external" ? (
                              <ExternalOpportunityRow
                                key={row.key}
                                card={row.card}
                                band={row.band}
                                whyCodes={whyCodesFor(row)}
                                labels={{
                                  bandLabel: bandChip(row.band),
                                  whyLabel: t("world.why"),
                                  whyText,
                                  whyFallback:
                                    row.band === "not_assessed"
                                      ? t("world.whyUnknown")
                                      : t("world.whyNoGaps"),
                                  openOriginal: t("external.openOriginal"),
                                  confirmNotice: t("external.confirmNotice"),
                                  confirmContinue: t("external.confirmContinue"),
                                  confirmDismiss: t("external.confirmDismiss"),
                                  noApplicationRoute: t("external.noApplicationRoute"),
                                  publishedOn: (d) => t("external.publishedOn", { date: d }),
                                  positionsLabel: (n) => t("external.positions", { count: n }),
                                  payAsPublished: t("external.payAsPublished"),
                                  payUnitNotStated: t("world.payUnitNotStated"),
                                  payNotStated: t("world.payNotStated"),
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
                                  detailsShow: t("discovery.details.show"),
                                  detailsHide: t("discovery.details.hide"),
                                }}
                              />
                            ) : (
                              (() => {
                                const { need, fit, match, nextAction, interestStatus, structured, saved } = row.card;
                                const rankIndex = row.rankIndex;
                                const whyLines = whyCodesFor(row)
                                  .map(whyText)
                                  .filter((s): s is string => s !== null);
                                const pay = payText(structured?.compensation, ts, sd);
                                return (
                                  <li
                                    key={row.key}
                                    id={`opp-${need.id}`}
                                    className="min-w-0 scroll-mt-24"
                                    data-status={fit.status}
                                    data-band={row.band}
                                  >
                                    <Card compact variant="interactive" className="flex flex-col gap-2">
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 font-display text-card-title font-bold text-text-primary">
                                          {/* POSITION, NOT A SCORE: the shared comparator's
                                              order, stated. Rendered ONLY under the relevance
                                              sort — on "newest" the position means recency. */}
                                          {sort === "relevance" ? (
                                            <span
                                              className="font-mono text-meta text-text-muted"
                                              data-testid={`opportunity-rank-${rankIndex + 1}`}
                                            >
                                              #{rankIndex + 1}
                                            </span>
                                          ) : null}
                                          <span className="min-w-0">{roleLabel(need.roleText)}</span>
                                          {/* Declared opportunity type (internship / apprenticeship /
                                              temporary …) — stated by the employer, never inferred.
                                              Plain employment is the default and gets no chip. */}
                                          {structured?.opportunity_type && structured.opportunity_type !== "employment" ? (
                                            <span
                                              className="shrink-0 rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-primary"
                                              data-testid="opportunity-type-chip"
                                            >
                                              {sd(`opportunityType.${structured.opportunity_type}`)}
                                            </span>
                                          ) : null}
                                        </p>
                                        <FitBandChip band={row.band} label={bandChip(row.band)} />
                                      </div>

                                      {/* Organization / source · place · start. */}
                                      <p className="text-basis text-text-secondary" data-testid="opportunity-company">
                                        {need.companyName ? (
                                          <>
                                            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                                              {t("fieldCompany")}:
                                            </span>{" "}
                                            {need.companyName}
                                            {/* Trust minimum (PR11): the approved-route badge is shown ONLY
                                                when the row carries the real signal — never copy-driven. */}
                                            {need.routeStatus === "approved_direct_partner" ? (
                                              <span
                                                className="ml-2 rounded-sm border border-state-success/40 bg-state-success/10 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-success"
                                                data-testid="opportunity-company-verified"
                                              >
                                                {t("companyVerified")}
                                              </span>
                                            ) : null}
                                          </>
                                        ) : (
                                          <span className="text-text-muted">{t("world.sourcePlatform")}</span>
                                        )}
                                        {" · "}
                                        {need.locationLabel
                                          ? `${need.locationLabel} · ${countryLabel(need.country)}`
                                          : countryLabel(need.country)}
                                        {" · "}
                                        {startLabel(need.startPeriod)}
                                      </p>

                                      {/* Pay as the company stated it (currency + unit named) plus
                                          the other structured scan chips, including the MANDATORY
                                          talent-pool disclosure. No compensation stated = said so. */}
                                      <OpportunityStructuredChips
                                        structured={structured}
                                        locale={locale}
                                        ts={ts}
                                        sd={sd}
                                      />
                                      {pay === null ? (
                                        <p className="text-basis text-text-muted" data-testid="opportunity-pay-not-stated">
                                          {t("world.payNotStated")}
                                        </p>
                                      ) : null}

                                      {/* WHY the row sits in its band — the engine's own codes in
                                          words; a strong / possible row with no gap says so through
                                          its §19 basis, never through a bare percentage. */}
                                      <p className="text-basis text-text-secondary" data-testid="opportunity-why">
                                        <span className="font-medium text-text-primary">{t("world.why")} </span>
                                        {whyLines.length > 0
                                          ? whyLines.join(" · ")
                                          : match.skillFit
                                            ? t("skillMatch.basis", {
                                                matched: match.skillFit.matchedTotal,
                                                total: match.skillFit.needTotal,
                                                confirmed: match.skillFit.matchedConfirmed,
                                              })
                                            : row.band === "not_assessed"
                                              ? t("world.whyUnknown")
                                              : t("world.whyNoGaps")}
                                      </p>

                                      {/* The one clear next step for this row. */}
                                      <p
                                        className="font-mono text-meta uppercase tracking-label text-text-muted"
                                        data-testid="opportunity-next-action"
                                        data-next-action={nextAction}
                                      >
                                        {t(`workerNext.${nextAction}` as never)}
                                      </p>

                                      {/* Actions — the SAME canonical controls the board always had:
                                          save (gated on the store), express interest (gated on the
                                          table), compare, details. */}
                                      <div className="flex flex-wrap items-center gap-2">
                                        {result.capabilities.savedAvailable ? (
                                          <WorkerSaveOpportunityButton
                                            locale={locale}
                                            requestId={need.id}
                                            initialSaved={saved}
                                            labels={savedLabels}
                                          />
                                        ) : null}
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
                                        <CompareToggleChip
                                          entry={buildCompareEntry(need, structured)}
                                          label={t("compare.toggle")}
                                        />
                                      </div>

                                      {/* Progressive disclosure: the legacy card body — every
                                          whitelisted fact, the structured conditions, the match
                                          breakdown, the skill match, the contract-v2 tiers — behind
                                          a REAL button (aria-expanded). Same components, one tap
                                          deeper. */}
                                      <OpportunityDetailsDisclosure
                                        showLabel={t("discovery.details.show")}
                                        hideLabel={t("discovery.details.hide")}
                                        testId="opportunity-details"
                                        recentlyViewedId={need.id}
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span
                                            className={`rounded-full border px-2.5 py-1 font-mono text-meta uppercase tracking-label ${STATUS_TONE[fit.status]}`}
                                          >
                                            {statusLabel(fit.status)}
                                          </span>
                                          {fit.gaps.map((g) => (
                                            <span
                                              key={g}
                                              className="rounded-md border border-state-amber/30 bg-state-amber/5 px-2 py-0.5 text-meta text-state-amber"
                                            >
                                              {gapLabel(g)}
                                            </span>
                                          ))}
                                        </div>

                                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                                          <div className="min-w-0">
                                            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                              {t("fieldCountry")}
                                            </dt>
                                            <dd className="truncate text-basis text-text-primary">
                                              {need.locationLabel
                                                ? `${need.locationLabel} · ${countryLabel(need.country)}`
                                                : countryLabel(need.country)}
                                            </dd>
                                          </div>
                                          <div className="min-w-0">
                                            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                              {t("fieldStart")}
                                            </dt>
                                            <dd className="truncate text-basis text-text-primary">
                                              {startLabel(need.startPeriod)}
                                            </dd>
                                          </div>
                                          <div className="min-w-0">
                                            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                              {t("fieldTeam")}
                                            </dt>
                                            <dd className="truncate text-basis text-text-primary">
                                              {need.teamSize ?? "—"}
                                            </dd>
                                          </div>
                                          <div className="min-w-0">
                                            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                              {t("fieldAccommodation")}
                                            </dt>
                                            <dd className="truncate text-basis text-text-primary">
                                              {need.accommodation
                                                ? t.has(`accommodation.${need.accommodation}`)
                                                  ? t(`accommodation.${need.accommodation}`)
                                                  : need.accommodation
                                                : "—"}
                                            </dd>
                                          </div>
                                          {/* Transport condition (§8.5) — enum-only value: whitelisted
                                              value or "—", never free text. */}
                                          <div className="min-w-0">
                                            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                              {t("fieldTransport")}
                                            </dt>
                                            <dd
                                              className="truncate text-basis text-text-primary"
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
                                              catalogue; honest "not stated" otherwise. */}
                                          <div className="col-span-2 min-w-0">
                                            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                                              {t("fieldTools")}
                                            </dt>
                                            <dd
                                              className="text-basis text-text-primary"
                                              data-testid="opportunity-required-tools"
                                            >
                                              {need.requiredTools && need.requiredTools.length > 0
                                                ? need.requiredTools.map(skillLabel).join(", ")
                                                : t("toolsNotStated")}
                                            </dd>
                                          </div>
                                        </dl>

                                        {/* Structured demand detail (P2-PR2): organized sections
                                            with visible amber honesty gaps when the projection
                                            exists; ONE honest "not provided" line when it does not. */}
                                        <OpportunityStructuredSections
                                          structured={structured}
                                          locale={locale}
                                          ts={ts}
                                          sd={sd}
                                          countryLabel={countryLabel}
                                        />

                                        {/* Match breakdown — honest per-dimension fit (why it fits /
                                            what to check), reusing the deterministic fit engine. */}
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

                                        {/* Canonical skill match (PR5) — YOUR skills vs this demand's
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
                                            <p className="text-basis text-text-secondary">
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

                                        <div className="flex flex-wrap items-center gap-3">
                                          <Link
                                            href={profileHref}
                                            className={buttonLinkClassName("secondary", "sm")}
                                          >
                                            {t("ctaProfile")} →
                                          </Link>
                                          {fit.status === "possible_match" ? (
                                            <span className="text-meta text-text-muted">{t("possibleNote")}</span>
                                          ) : null}
                                        </div>
                                      </OpportunityDetailsDisclosure>
                                    </Card>
                                  </li>
                                );
                              })()
                            ),
                          )}
                        </ul>
                      </OpportunityBandSection>
                    ))}
                  </div>
                ) : null}

                {/* Compressed-view honesty line: the first view shows the
                    strongest platform matches, and says so — with the true
                    size of the ranked universe and one real link to all of it.
                    Nothing is deleted, nothing is hidden without a door. */}
                {initialView.capped ? (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-800/30 px-4 py-3"
                    data-testid="opportunities-show-more"
                  >
                    <p className="text-basis text-text-secondary">
                      {t("discovery.initialView.summary", {
                        shown: initialView.visible.length,
                        total: filtered.length,
                      })}
                    </p>
                    <Link
                      href={expandedHref}
                      data-testid="opportunities-show-all"
                      className={buttonLinkClassName("secondary", "sm")}
                    >
                      {t("discovery.initialView.showAll", {
                        count: initialView.hiddenCount,
                      })}
                    </Link>
                  </div>
                ) : null}

                {/* ── Saved opportunities (P2-PR5, #723-compat) — rendered
                    ONLY when the owner-gated store exists. Private bookmark:
                    the hint says the company never sees it. Below the bands
                    now — a person's own list, not the answer. */}
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
                            {/* In-page anchor to the live row above. A row the
                                compressed first view holds back gets the
                                expanded URL instead — a bookmark must never
                                dead-link into a hidden row. */}
                            <a
                              href={
                                visibleIds.has(need.id)
                                  ? `#opp-${need.id}`
                                  : `${expandedHref}#opp-${need.id}`
                              }
                              className="inline-flex min-h-11 flex-col justify-center rounded-md border border-ink-500 px-3 py-1.5 transition-colors hover:border-brand-blue"
                              data-testid="opportunities-saved-item"
                            >
                              <span className="text-support font-semibold text-text-primary">
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
                    {/* The SAME saved list, second source: public vacancies the
                        worker kept from the job board. One group, not a second
                        saved section — the store is one table and the concept
                        is one concept. Ids are joined against live ads by the
                        loader, so an expired bookmark is simply absent rather
                        than rendered from stale facts. */}
                    {result.savedVacancies.length > 0 ? (
                      <ul
                        className="flex flex-wrap gap-1.5"
                        data-testid="opportunities-saved-vacancies"
                      >
                        {result.savedVacancies.map((v) => (
                          <li key={v.id}>
                            <Link
                              href={`/${locale}/jobs/${v.id}`}
                              className="inline-flex min-h-11 flex-col justify-center rounded-md border border-ink-500 px-3 py-1.5 transition-colors hover:border-brand-blue"
                              data-testid="opportunities-saved-vacancy-item"
                            >
                              <span className="text-support font-semibold text-text-primary">
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
                        className="text-basis text-text-muted"
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

                {/* ── Refine (URL-param links, server-rendered) — on request,
                    never the primary experience (§T). `open={active.length > 0}`
                    is the honesty rule: a narrowed page always shows what is
                    narrowing it, and the reset link with it. Same facets, same
                    links, same sort, same reset as before. */}
                {result.capabilities.boardAvailable && result.opportunities.length > 0 ? (
                  <details
                    open={active.length > 0}
                    className="group rounded-lg border border-ink-600 bg-ink-800/30"
                    data-testid="opportunities-filters"
                  >
                    <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 font-mono text-meta uppercase tracking-label text-text-muted marker:text-text-muted">
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
                            className="inline-flex min-h-11 items-center text-support font-medium text-brand-blue hover:text-brand-champagne"
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
                ) : null}

                {/* Compare (P2-PR5) — pure client state over the loaded rows;
                    the sticky bar + whitelisted-facts table render only once
                    something is selected. Nothing persists. */}
                <CompareBar labels={compareLabels} factLabels={compareFactLabels} />
              </OpportunityCompareProvider>
            );
          })()}

          {/* ── Mano susidomėjimai (extension A) — the worker's OWN interest
              signals, collapsible, INDEPENDENT of board visibility: a signal
              whose demand closed stays here with an honest label instead of
              silently vanishing. Renders only when at least one signal
              exists. Actions reuse EXISTING flows only. */}
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

          {/* MARKET SITUATION -- on request, not by default. The same
              salary/benchmark cards, the same reading of the public ad pool,
              the same weekly summary, the same map — below the bands. */}
          <details
            className="group rounded-lg border border-ink-600 bg-ink-800/40"
            data-testid="opportunities-market-situation"
          >
            <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 text-support font-medium text-text-primary marker:text-text-muted">
              {tIntel("trustCard.rowTitle")}
            </summary>
            <div className="flex flex-col gap-4 px-4 pb-4">
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
                  imported public advertisement pool. Renders nothing when the
                  profile carries no work type. */}
              <MarketExplanationPanel
                professionSlug={result.readiness.professionSlug}
                evidencedProfessionSlug={result.readiness.evidencedProfessionSlug}
                locale={locale}
              />

              {/* Weekly personal intelligence (C-r1) — the summary the weekly
                  digest bell row points at. */}
              {weekly.kind === "ready" ? (
                <WeeklyIntelligenceSection intel={weekly.intelligence} locale={locale} />
              ) : null}

              <Link
                href={`/${locale}/dashboard/market-map`}
                data-testid="opportunities-market-map-link"
                className="inline-flex min-h-11 w-fit items-center gap-1.5 text-support font-medium text-brand-blue hover:text-brand-champagne"
              >
                {t("marketMapLink")} →
              </Link>
            </div>
          </details>

          {/* YOUR READINESS -- diagnostics, on request. The two states that
              genuinely BLOCK matching -- no work type, no skills -- are NOT in
              here; they render above the bands as one reason plus one action. */}
          <details
            className="group rounded-lg border border-ink-600 bg-ink-800/40"
            data-testid="opportunities-readiness-disclosure"
          >
            <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 text-support font-medium text-text-primary marker:text-text-muted">
              {t("readinessTitle")}
            </summary>
            <div className="px-4 pb-4">
              <section
                className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-ink-800/40 p-4"
                data-testid="opportunities-readiness"
              >
                <p className="text-basis leading-relaxed text-text-secondary">
                  {t("readinessIntro")}
                </p>
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
                      className={`rounded-md border px-2.5 py-1 text-basis ${
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
                  className="inline-flex min-h-11 w-fit items-center rounded-md bg-brand-blue px-4 text-support font-semibold text-text-on-brand hover:bg-brand-blue/80"
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
            <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 text-support font-medium text-text-primary marker:text-text-muted">
              {t("discovery.how.title")}
            </summary>
            <div className="flex flex-col gap-2 px-4 pb-4 text-basis leading-relaxed text-text-secondary">
              <p>{t("discovery.how.body")}</p>
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("discovery.how.version", { version: MATCH_CALC_VERSION })}
              </p>
              <p data-testid="opportunities-trust-note">{t("trustNote")}</p>
              {/* What this surface is — answers the reader who actually asked. */}
              <FeatureNote testId="feature-note-opportunities">
                {(await getTranslations("featureNotes"))("opportunities")}
              </FeatureNote>
            </div>
          </details>

          {/* Recently viewed (P2-PR5) — DEVICE-LOCAL list of detail
              disclosures opened on THIS device, re-joined against the live,
              already-authorized rows (ids + timestamps only in storage). */}
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
          matching action. AFTER the bands: a next step is only a next step once
          there is something to step on from. */}
      <section
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="opportunities-next-step"
      >
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
              className="flex min-h-[3.25rem] flex-col rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-support text-text-primary transition-colors hover:border-brand-blue"
            >
              <span className="font-semibold">{l.label}</span>
              <span className="text-basis text-text-muted">{l.note}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
