import { getTranslations, setRequestLocale } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import Link from "next/link";

import { FeatureNote } from "@/components/app/feature-note";
import { MatchSignals } from "@/components/app/match-signals";
import { MatchTierExplanation } from "@/components/app/match-tier-explanation";
import { OpportunityDetailsDisclosure } from "@/components/app/opportunity-details-disclosure";
import {
  buildMatchCardView,
  type MatchSignal,
  type MatchSignalState,
} from "@/lib/opportunities/match-card-view";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { loadWorkerOpportunities } from "@/lib/opportunities/load-worker-opportunities";
import {
  activeFilterEntries,
  applyDiscoveryFilters,
  buildDiscoveryQuery,
  collectDiscoveryFacets,
  parseDiscoveryParams,
  sortDiscoveryCards,
  type DiscoveryFilterState,
  type DiscoverySort,
} from "@/lib/opportunities/discovery-filters";
import { MATCH_CALC_VERSION } from "@/lib/market/match-v1";
import { WorkerInterestButton } from "@/components/app/worker-interest-button";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import type {
  OpportunityGap,
  OpportunityStatus,
} from "@/lib/opportunities/opportunity-fit";

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
  const result = await loadWorkerOpportunities();
  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);

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

  // ── Discovery filters + sort (PR 4) — URL params over authorized rows. ────
  const { filters, sort } = parseDiscoveryParams(sp);
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
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <TelemetryView
        event={FUNNEL_EVENTS.marketplaceOrOpportunitiesViewed}
        metadata={{ surface: "opportunities", role_context: "worker" }}
      />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>

      <FeatureNote testId="feature-note-opportunities">
        {(await getTranslations("featureNotes"))("opportunities")}
      </FeatureNote>
      <Link
        href={`/${locale}/dashboard/market-map`}
        data-testid="opportunities-market-map-link"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand-blue hover:text-brand-cyan"
      >
        {t("marketMapLink")} →
      </Link>

      {/* Next-step bridge (§8.10 / §6 system loop): a fit doesn't dead-end — it
          moves through the marketplace (request/offer) and the plan (a confirmed
          match becomes a booking). Existing routes only; navigation, no fake
          matching action, mobile-first tap targets. */}
      <section
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="opportunities-next-step"
      >
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("nextStep.title")}
        </span>
        <p className="text-xs text-text-secondary">{t("nextStep.intro")}</p>
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
          {/* ── Your readiness (real own-data) ─────────────────────────── */}
          <section
            className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-ink-800/40 p-4"
            data-testid="opportunities-readiness"
          >
            <div className="flex flex-col gap-0.5">
              <h2 className="font-display text-base font-semibold text-text-primary">
                {t("readinessTitle")}
              </h2>
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

          {/* No-evidence improvement state (PR5): skill matching needs skill
              evidence. Honest guidance to the Work Journal — never a fake fit. */}
          {result.kind === "ready" && !result.readiness.hasSkills ? (
            <section
              className="flex flex-col items-start gap-2 rounded-md border border-state-amber/40 bg-state-amber/10 px-4 py-3"
              data-testid="opportunities-no-skills"
            >
              <p className="text-sm font-semibold text-text-primary">
                {t("noSkills.title")}
              </p>
              <p className="text-xs leading-relaxed text-text-secondary">
                {t("noSkills.body")}
              </p>
              <Link
                href={`/${locale}/dashboard/journal`}
                className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80"
                data-testid="opportunities-no-skills-cta"
              >
                {t("noSkills.cta")} →
              </Link>
            </section>
          ) : null}

          {/* Trust note — workers first see only approved / safely-managed
              opportunities (Worker Opportunities v1). */}
          <p
            className="rounded-md border border-brand-blue/25 bg-brand-blue/5 px-4 py-3 text-xs leading-relaxed text-text-secondary"
            data-testid="opportunities-trust-note"
          >
            {t("trustNote")}
          </p>

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
              <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t("discovery.how.version", { version: MATCH_CALC_VERSION })}
              </p>
            </div>
          </details>

          {/* ── Opportunities (approved supply routes only) ────────────── */}
          {result.needsDataAccess ? (
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
            </section>
          ) : (
            (() => {
              const facets = collectDiscoveryFacets(
                result.opportunities.map((o) => o.need),
              );
              const filtered = sortDiscoveryCards(
                applyDiscoveryFilters(result.opportunities, filters),
                sort,
              );
              const active = activeFilterEntries(filters);
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
              return (
                <>
                  {/* ── Filter chips (URL-param links, server-rendered) ── */}
                  <section
                    className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-ink-800/30 p-4"
                    data-testid="opportunities-filters"
                    aria-label={t("discovery.filters.title")}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {t("discovery.filters.title")}
                        {active.length > 0
                          ? ` · ${t("discovery.filters.activeCount", { count: active.length })}`
                          : ""}
                      </span>
                      {active.length > 0 ? (
                        <Link
                          href={boardHref}
                          data-testid="opportunities-filters-reset"
                          className="text-xs font-medium text-brand-blue hover:text-brand-cyan"
                        >
                          {t("discovery.filters.reset")}
                        </Link>
                      ) : null}
                    </div>
                    {facetGroups
                      .filter((g) => g.values.length > 0)
                      .map((g) => (
                        <div key={g.dim} className="flex flex-wrap items-center gap-1.5">
                          <span className="min-w-[7rem] font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                      <span className="min-w-[7rem] font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                  </section>

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
                    <ul className="flex flex-col gap-3" data-testid="opportunities-list">
                      {filtered.map(({ need, fit, match, nextAction, interestStatus }) => (
                        <li
                          key={need.id}
                          className="card-border flex flex-col gap-3 p-4"
                          data-status={fit.status}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <p className="font-display text-base font-bold text-text-primary">
                                {roleLabel(need.roleText)}
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
                            <span
                              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[fit.status]}`}
                            >
                              {statusLabel(fit.status)}
                            </span>
                          </div>
                          {need.companyName ? (
                            <p className="text-xs text-text-secondary" data-testid="opportunity-company">
                              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                                {t("fieldCompany")}:
                              </span>{" "}
                              {need.companyName}
                              {/* Trust minimum (PR11): "verified" is shown ONLY when
                                  the row carries the real approved-route signal —
                                  admin-verified company via the Model-A gate. Never
                                  copy-driven, never default. */}
                              {need.routeStatus === "approved_direct_partner" ? (
                                <span
                                  className="ml-2 rounded-sm border border-state-success/40 bg-state-success/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-success"
                                  data-testid="opportunity-company-verified"
                                >
                                  {t("companyVerified")}
                                </span>
                              ) : null}
                            </p>
                          ) : null}

                          {/* Match breakdown — honest per-dimension fit (why it fits /
                              what to check), reusing the deterministic fit engine. No
                              score, no percentage, no guaranteed match. */}
                          <div className="flex flex-col gap-1.5" data-testid="opportunity-match-breakdown">
                            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                          >
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                              <div className="min-w-0">
                                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                                  {t("fieldCountry")}
                                </dt>
                                <dd className="truncate text-xs text-text-primary">
                                  {need.locationLabel
                                    ? `${need.locationLabel} · ${countryLabel(need.country)}`
                                    : countryLabel(need.country)}
                                </dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                                  {t("fieldStart")}
                                </dt>
                                <dd className="truncate text-xs text-text-primary">
                                  {startLabel(need.startPeriod)}
                                </dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                                  {t("fieldTeam")}
                                </dt>
                                <dd className="truncate text-xs text-text-primary">
                                  {need.teamSize ?? "—"}
                                </dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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

                            {match.skillFit && match.skillFit.matchedUris.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5" data-testid="opportunity-matched-skills">
                                {match.skillFit.matchedUris.map((slug) => (
                                  <span
                                    key={slug}
                                    className="rounded-md border border-state-success/30 bg-state-success/10 px-2 py-0.5 text-[11px] text-state-success"
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
                                    className="rounded-md border border-state-amber/30 bg-state-amber/5 px-2 py-0.5 text-[11px] text-state-amber"
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
                            className="font-mono text-[10px] uppercase tracking-label text-text-muted"
                            data-testid="opportunity-next-action"
                            data-next-action={nextAction}
                          >
                            {t(`workerNext.${nextAction}` as never)}
                          </p>

                          {/* Express interest — INTERNAL signal only (honest copy in
                              labels.internalNote). Offered ONLY when the owner-gated
                              interest table exists — never a dead button. */}
                          {result.interestAvailable ? (
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
                              }}
                            />
                          ) : null}
                          {fit.gaps.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {fit.gaps.map((g) => (
                                <span
                                  key={g}
                                  className="rounded-md border border-state-amber/30 bg-state-amber/5 px-2 py-0.5 text-[11px] text-state-amber"
                                >
                                  {gapLabel(g)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-3">
                            <Link
                              href={profileHref}
                              className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-primary hover:border-brand-blue"
                            >
                              {t("ctaProfile")} →
                            </Link>
                            {fit.status === "possible_match" ? (
                              <span className="text-[11px] text-text-muted">{t("possibleNote")}</span>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              );
            })()
          )}

          <p className="text-[11px] leading-relaxed text-text-muted">{t("footnote")}</p>
        </>
      )}
    </main>
  );
}
