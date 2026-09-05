"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";

import { MarketMap } from "@/components/app/market-map/market-map";
import type { MarketAnchor } from "@/components/app/market-map/market-map-model";
import { loadMarketResultAction } from "@/lib/market-map/market-result-actions";
import type { MarketResultData } from "@/lib/market-map/market-result";
import {
  loadProjectEvaluationAction,
  loadProjectResultsAction,
} from "@/lib/market-map/project-results-actions";
// VALUES come from the PURE model, never from `project-results.ts` — that
// module is `server-only`, and a value import would drag it into the client
// bundle. Types are erased, so either would compile; only one would run.
import {
  COMPLETENESS_FIELDS,
  DEMAND_SOURCE,
  type MatchReason,
  type MissingField,
  type ProjectEvaluation,
  type ProjectResultRow,
  type ProjectResults,
} from "@/lib/market-map/project-results-model";
import {
  geographyFromAnchor,
  geographyLabel,
  type GeographySelection,
} from "@/lib/market-map/geography-selection";

/**
 * THE MARKET RESULT, AT THREE DEPTHS — Goal 3.
 *
 * The proven market result answered "where is demand?". The person then has one
 * obvious next question ("which projects create it?") and one after that ("is
 * this project worth my time?"). Those are the SAME result getting more
 * specific, so they are one component in one panel, not three screens:
 *
 *   0. the canonical <MarketMap> — unchanged from Goal 4
 *   1. the projects behind the selected place
 *   2. one project, evaluated
 *
 * ONE MAP, EVER. The map is mounted at depth 0 and at no other depth. Depth 1
 * and 2 answer "which projects" and "is it worth it", not "where", so a second
 * map would be the panel arguing with itself — the same defect the Goal 4 fix
 * removed when it stopped stacking `WorkspaceMap` under the market result.
 *
 * DEPTH LIVES IN THE URL, not in this component's state. That is what makes
 * refresh and the browser Back button work without any routing in the panel:
 * every depth is a real address. This component is told where it is and calls
 * back when the person moves.
 *
 * NOTHING IS COMPUTED HERE. Every field rendered below came from a row; every
 * explanation is a CODE the loader emitted, rendered with that row's own
 * values. There is no scoring, no ranking beyond "most open headcount first",
 * and no sentence about whether a project is a good idea — the loader cannot
 * know that, so the panel must not say it.
 */
export function MarketDrilldown({
  geography,
  geoToken,
  projectId,
  workspace,
  onSelectGeography,
  onSelectProject,
  onBackToMarket,
  onBackToProjects,
}: {
  geography: GeographySelection | null;
  geoToken: string | null;
  projectId: string | null;
  /** Active organization name, or null for the person's own space. */
  workspace: string | null;
  onSelectGeography: (g: GeographySelection) => void;
  onSelectProject: (projectId: string) => void;
  onBackToMarket: () => void;
  onBackToProjects: () => void;
}) {
  if (geography && geoToken && projectId) {
    return (
      <ProjectEvaluationView
        geography={geography}
        geoToken={geoToken}
        projectId={projectId}
        workspace={workspace}
        onBackToMarket={onBackToMarket}
        onBackToProjects={onBackToProjects}
      />
    );
  }
  if (geography && geoToken) {
    return (
      <ProjectsView
        geography={geography}
        geoToken={geoToken}
        onSelectProject={onSelectProject}
        onBackToMarket={onBackToMarket}
      />
    );
  }
  return <MarketView onSelectGeography={onSelectGeography} />;
}

// ── depth 0 — the map ───────────────────────────────────────────────────────

/**
 * THE MARKET RESULT, inline in the panel (Goal 4, unchanged except that its
 * anchors now act).
 *
 * The SAME canonical <MarketMap> the landing hero mounts — one engine, one
 * geographic model, different mode. The data is real rows for this environment
 * (`origin: "live"`); there is deliberately no demo fallback, so an empty
 * market says so instead of borrowing the landing's scenario.
 */
function MarketView({
  onSelectGeography,
}: {
  onSelectGeography: (g: GeographySelection) => void;
}) {
  const t = useTranslations("conversation.results");
  const [data, setData] = useState<MarketResultData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMarketResultAction()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A thrown action AND a read that failed server-side are the same answer to
  // the person: we could not read the market. Neither may render as emptiness.
  if (failed || data?.failed) {
    return (
      <p className="text-basis text-text-secondary" data-testid="market-error">
        {t("marketError")}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="text-basis text-text-muted" data-testid="market-loading">
        {t("pendingInline")}
      </p>
    );
  }
  if (data.empty) {
    // Honest empty: no rows is a real answer, and inventing demand here would
    // be exactly the fabricated market this platform bans.
    return (
      <p className="text-basis text-text-secondary" data-testid="market-empty">
        {t("marketEmpty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="market-view">
      <MarketMap
        view={data.view}
        mode="result"
        layer="demand"
        onSelectAnchor={(a: MarketAnchor) => onSelectGeography(geographyFromAnchor(a))}
      />
      {/* A clickable map that does not say it is clickable is a hidden feature. */}
      <p className="text-meta text-text-muted" data-testid="market-select-hint">
        {t("selectPlaceHint")}
      </p>
    </div>
  );
}

// ── depth 1 — the projects behind the place ─────────────────────────────────

function ProjectsView({
  geography,
  geoToken,
  onSelectProject,
  onBackToMarket,
}: {
  geography: GeographySelection;
  geoToken: string;
  onSelectProject: (projectId: string) => void;
  onBackToMarket: () => void;
}) {
  const t = useTranslations("conversation.results");
  const [data, setData] = useState<ProjectResults | null>(null);
  const [threw, setThrew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setThrew(false);
    loadProjectResultsAction(geoToken)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setThrew(true);
      });
    return () => {
      cancelled = true;
    };
  }, [geoToken]);

  const totalHeadcount = (data?.rows ?? []).reduce((n, r) => n + r.openHeadcount, 0);

  return (
    <div className="flex flex-col gap-3" data-testid="projects-view">
      <Breadcrumb
        onBackToMarket={onBackToMarket}
        place={geographyLabel(geography)}
        precision={geography.precision}
        backLabel={t("backToMarket")}
        marketLabel={t("crumbMarket")}
      />

      {threw || data?.state === "error" ? (
        <ErrorState
          testId="projects-error"
          text={t("projectsError")}
          code={data?.errorCode}
        />
      ) : !data ? (
        <p className="text-basis text-text-muted" data-testid="projects-loading">
          {t("pendingInline")}
        </p>
      ) : data.state === "unsupported_precision" ? (
        // A gap in us, said plainly — not "no projects here", which would be a
        // claim about the market we have no basis for.
        <p
          className="rounded-card border border-state-amber/30 bg-state-amber/5 p-3 text-basis text-state-amber"
          data-testid="projects-unsupported-precision"
        >
          {t("projectsUnsupported")}
        </p>
      ) : data.state === "empty" ? (
        <p
          className="rounded-card border border-ink-500 bg-ink-800/40 p-3 text-basis text-text-secondary"
          data-testid="projects-empty"
        >
          {t("projectsEmpty", { place: data.geographyLabel })}
        </p>
      ) : (
        <>
          <p className="text-meta text-text-muted" data-testid="projects-count">
            {t("projectsCount", {
              count: data.rows.length,
              headcount: totalHeadcount,
            })}
          </p>
          <ul className="flex flex-col gap-2" data-testid="projects-list">
            {data.rows.map((row) => (
              <ProjectRow key={row.projectId} row={row} onOpen={onSelectProject} />
            ))}
          </ul>
          <SourceNote label={t("fieldSource")} />
        </>
      )}
    </div>
  );
}

function ProjectRow({
  row,
  onOpen,
}: {
  row: ProjectResultRow;
  onOpen: (projectId: string) => void;
}) {
  const t = useTranslations("conversation.results");
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.projectId)}
        data-testid="project-row"
        data-project-id={row.projectId}
        data-project-precision={row.precision}
        className="w-full rounded-card border border-ink-500 bg-ink-800/50 p-3 text-left hover:border-brand-blue"
      >
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 break-words font-display text-card-title font-semibold text-text-primary">
            {row.title ?? t("notStated")}
          </span>
          <PrecisionBadge precision={row.precision} />
        </span>

        <span className="mt-1 block break-words text-support text-text-secondary">
          {row.organization ?? t("notStated")} · {placeText(row, t("notStated"))}
        </span>

        <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Field label={t("fieldRoles")} value={row.roles.join(", ")} />
          <Field
            label={t("fieldHeadcount")}
            value={row.missing.includes("headcount") ? "" : String(row.openHeadcount)}
          />
          <Field label={t("fieldStatus")} value={row.projectStatus ?? ""} />
          <Field label={t("fieldStart")} value={row.startDate ?? ""} />
        </span>

        <span className="mt-2 block rounded-sm border border-ink-600 bg-ink-900/50 p-2 text-meta text-text-secondary">
          <span className="font-mono uppercase tracking-label text-text-muted">
            {t("whyMatch")}
          </span>
          <span className="mt-0.5 block" data-testid="project-match-reason">
            <MatchReasonText reason={row.matchReason} />
          </span>
        </span>

        {row.missing.length > 0 ? (
          <span
            className="mt-2 flex flex-wrap gap-1"
            data-testid="project-missing"
          >
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("missingTitle")}
            </span>
            {row.missing.map((m) => (
              <span
                key={m}
                className="rounded-md border border-state-amber/30 bg-state-amber/5 px-1.5 text-meta text-state-amber"
              >
                {t(`missing.${m}` as MissingKey)}
              </span>
            ))}
          </span>
        ) : null}
      </button>
    </li>
  );
}

// ── depth 2 — the evaluation ────────────────────────────────────────────────

function ProjectEvaluationView({
  geography,
  geoToken,
  projectId,
  workspace,
  onBackToMarket,
  onBackToProjects,
}: {
  geography: GeographySelection;
  geoToken: string;
  projectId: string;
  workspace: string | null;
  onBackToMarket: () => void;
  onBackToProjects: () => void;
}) {
  const t = useTranslations("conversation.results");
  const tSkill = useTranslations("skillNames");
  const [data, setData] = useState<ProjectEvaluation | null>(null);
  const [threw, setThrew] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setThrew(false);
    setPeopleOpen(false);
    loadProjectEvaluationAction(geoToken, projectId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setThrew(true);
      });
    return () => {
      cancelled = true;
    };
  }, [geoToken, projectId]);

  const row = data?.row;

  return (
    <div className="flex flex-col gap-3" data-testid="project-evaluation">
      <Breadcrumb
        onBackToMarket={onBackToMarket}
        onBackToProjects={onBackToProjects}
        place={geographyLabel(geography)}
        precision={geography.precision}
        leaf={row?.title ?? undefined}
        backLabel={t("backToProjects")}
        marketLabel={t("crumbMarket")}
      />

      {threw || data?.state === "error" ? (
        <ErrorState
          testId="evaluation-error"
          text={t("evaluationError")}
          code={data?.errorCode}
        />
      ) : !data ? (
        <p className="text-basis text-text-muted" data-testid="evaluation-loading">
          {t("pendingInline")}
        </p>
      ) : data.state === "unsupported_precision" ? (
        <p
          className="rounded-card border border-state-amber/30 bg-state-amber/5 p-3 text-basis text-state-amber"
          data-testid="evaluation-unsupported-precision"
        >
          {t("projectsUnsupported")}
        </p>
      ) : data.state === "not_found" || !row ? (
        // Not "no such project" — the project may exist and simply not be in
        // the selected place, or not be readable by this person. Both are the
        // same honest answer and neither is an error.
        <p
          className="rounded-card border border-ink-500 bg-ink-800/40 p-3 text-basis text-text-secondary"
          data-testid="evaluation-not-found"
        >
          {t("evaluationNotFound")}
        </p>
      ) : (
        <>
          <header>
            <h3 className="break-words font-display text-card-title font-semibold text-text-primary">
              {row.title ?? t("notStated")}
            </h3>
            <p className="mt-0.5 break-words text-support text-text-secondary">
              {row.organization ?? t("notStated")}
            </p>
          </header>

          {/* ── Demand ───────────────────────────────────────────────── */}
          <Section title={t("evalDemand")} testId="eval-demand">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label={t("fieldRoles")} value={row.roles.join(", ")} />
              <Field
                label={t("fieldHeadcount")}
                value={
                  row.missing.includes("headcount") ? "" : String(row.openHeadcount)
                }
              />
              <Field
                label={t("fieldDemands")}
                value={String(row.openDemandCount)}
              />
              <Field
                label={t("fieldSkills")}
                value={data.skillSlugs.map((s) => skillLabel(tSkill, s)).join(", ")}
              />
            </dl>
            {data.unresolvedSkillCount > 0 ? (
              <p className="mt-1.5 text-meta text-state-amber" data-testid="eval-skills-unresolved">
                {t("evalSkillsUnresolved", { count: data.unresolvedSkillCount })}
              </p>
            ) : null}
            {/* Open vs filled: a non-owning reader is authorized for OPEN public
                demand only, so "0 filled" would be a number we do not have. */}
            <p className="mt-1.5 text-meta text-text-muted" data-testid="eval-open-vs-filled">
              {t("evalOpenVsFilled", { open: row.openHeadcount })}
            </p>
            {data.demands.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1" data-testid="eval-demand-list">
                {data.demands.map((d) => (
                  <li key={d.demandId} className="text-meta text-text-secondary">
                    {(d.roleTitle ?? t("notStated")) +
                      " · " +
                      (d.headcount === null ? t("notStated") : String(d.headcount)) +
                      " · " +
                      (d.startDate ?? t("notStated"))}
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>

          {/* ── Geography ────────────────────────────────────────────── */}
          <Section title={t("evalGeography")} testId="eval-geography">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label={t("fieldCountry")} value={row.country} />
              <Field label={t("fieldCity")} value={row.city ?? ""} />
              <Field
                label={t("fieldPrecision")}
                value={
                  row.precision === "city" ? t("precisionCity") : t("precisionCountry")
                }
              />
              <Field label={t("fieldAnchor")} value={geographyLabel(geography)} />
            </dl>
            <p className="mt-1.5 text-meta text-text-secondary" data-testid="eval-anchor-relation">
              <MatchReasonText reason={row.matchReason} />
            </p>
          </Section>

          {/* ── Timing ───────────────────────────────────────────────── */}
          <Section title={t("evalTiming")} testId="eval-timing">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label={t("fieldStart")} value={row.startDate ?? ""} />
              <Field label={t("fieldEnd")} value={row.endDate ?? ""} />
            </dl>
            {row.missing.includes("startDate") || row.missing.includes("endDate") ? (
              <p className="mt-1.5 text-meta text-state-amber" data-testid="eval-timing-missing">
                {t("evalTimingMissing")}
              </p>
            ) : null}
          </Section>

          {/* ── Organization ─────────────────────────────────────────── */}
          <Section title={t("evalOrganization")} testId="eval-organization">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label={t("fieldOrganization")} value={row.organization ?? ""} />
              <Field
                label={t("fieldWorkspace")}
                value={workspace ?? t("workspacePersonal")}
              />
            </dl>
            <p className="mt-1.5 text-meta text-text-muted" data-testid="eval-visibility">
              {t("evalVisibility")}
            </p>
          </Section>

          {/* ── Data quality ─────────────────────────────────────────── */}
          <Section title={t("evalDataQuality")} testId="eval-data-quality">
            <div className="flex flex-wrap gap-1">
              {COMPLETENESS_FIELDS.filter((f) => !row.missing.includes(f)).map((f) => (
                <span
                  key={`ok-${f}`}
                  className="rounded-md border border-state-success/30 bg-state-success/10 px-1.5 text-meta text-state-success"
                >
                  ✓ {t(`missing.${f}` as MissingKey)}
                </span>
              ))}
              {row.missing.map((f) => (
                <span
                  key={`gap-${f}`}
                  data-testid="eval-missing-field"
                  className="rounded-md border border-state-amber/30 bg-state-amber/5 px-1.5 text-meta text-state-amber"
                >
                  — {t(`missing.${f}` as MissingKey)}
                </span>
              ))}
            </div>
            {row.precision === "country" ? (
              <p className="mt-1.5 text-meta text-state-amber" data-testid="eval-unresolved-geography">
                {t("evalUnresolvedGeography")}
              </p>
            ) : null}
          </Section>

          {/* ── Explanation ──────────────────────────────────────────── */}
          <Section title={t("evalExplanation")} testId="eval-explanation">
            <p className="text-basis text-text-secondary">
              <MatchReasonText reason={row.matchReason} />
            </p>
            {/* The boundary, stated on the surface that could most easily
                cross it: this is a filter reporting itself, not a judgement. */}
            <p className="mt-1.5 text-meta text-text-muted" data-testid="eval-no-judgement">
              {t("evalNoJudgement")}
            </p>
            <SourceNote label={t("fieldSource")} />
          </Section>

          {/* ── W4.5 — the continuation to people ────────────────────── */}
          <div className="mt-1 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPeopleOpen(true)}
              data-testid="continue-to-people"
              className="min-h-11 self-start rounded-full border border-brand-blue px-3.5 text-support font-medium text-brand-blue hover:bg-brand-blue/10"
            >
              {t("findPeople")}
            </button>
            {peopleOpen ? (
              <div
                className="rounded-card border border-ink-500 bg-ink-800/50 p-3"
                data-testid="people-continuation"
              >
                {/* NOT a fake people list. People matching is the next goal; a
                    list invented to make this button look functional would be
                    the fabricated result this platform bans. What IS real is
                    the context — so the context is what is shown. */}
                <p className="text-basis text-state-amber">{t("peopleNotYet")}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                  <Field label={t("fieldProject")} value={row.title ?? t("notStated")} />
                  <Field label={t("fieldRoles")} value={row.roles.join(", ")} />
                  <Field
                    label={t("fieldSkills")}
                    value={data.skillSlugs.map((s) => skillLabel(tSkill, s)).join(", ")}
                  />
                  <Field label={t("fieldPlace")} value={geographyLabel(geography)} />
                  <Field
                    label={t("fieldHeadcount")}
                    value={
                      row.missing.includes("headcount") ? "" : String(row.openHeadcount)
                    }
                  />
                  <Field label={t("fieldStart")} value={row.startDate ?? ""} />
                  <Field label={t("fieldEnd")} value={row.endDate ?? ""} />
                  <Field
                label={t("fieldWorkspace")}
                value={workspace ?? t("workspacePersonal")}
              />
                </dl>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// ── shared pieces ───────────────────────────────────────────────────────────

type MissingKey = `missing.${MissingField}`;

/**
 * The selected place, always visible, always the way back.
 *
 * This is the whole "selection is visible to the user" requirement and the
 * whole back-navigation affordance in one control, which is deliberate: a
 * breadcrumb that cannot be clicked is decoration, and a back button that does
 * not say where it goes is a guess.
 */
function Breadcrumb({
  onBackToMarket,
  onBackToProjects,
  place,
  precision,
  leaf,
  backLabel,
  marketLabel,
}: {
  onBackToMarket: () => void;
  onBackToProjects?: () => void;
  place: string;
  precision: GeographySelection["precision"];
  leaf?: string;
  backLabel: string;
  marketLabel: string;
}) {
  return (
    // STICKY. The evaluation is long enough to scroll the place off the top,
    // and "which place am I looking at?" is the one question that must never
    // require scrolling back — a project row read without its place is a row
    // about nowhere. `-mx-4 px-4` lets it span the padded column edge to edge
    // so content cannot show through beside it.
    <div
      className="sticky top-0 z-10 -mx-4 flex flex-col gap-1.5 border-b border-ink-600 bg-ink-900/95 px-4 pb-2 pt-1 backdrop-blur-sm"
      data-testid="result-breadcrumb"
    >
      <button
        type="button"
        onClick={onBackToProjects ?? onBackToMarket}
        data-testid="result-back"
        className="flex min-h-11 items-center gap-1 self-start rounded-full border border-ink-500 pl-2 pr-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {backLabel}
      </button>
      <p className="flex flex-wrap items-center gap-1 text-meta">
        <button
          type="button"
          onClick={onBackToMarket}
          data-testid="crumb-market"
          className="text-text-muted underline-offset-2 hover:text-brand-blue hover:underline"
        >
          {marketLabel}
        </button>
        <span aria-hidden className="text-text-muted">
          ›
        </span>
        <span
          data-testid="crumb-place"
          data-geo-precision={precision}
          className="rounded-md border border-brand-blue/40 bg-brand-blue/10 px-1.5 font-medium text-brand-blue"
        >
          {place}
        </span>
        {leaf ? (
          <>
            <span aria-hidden className="text-text-muted">
              ›
            </span>
            <span
              data-testid="crumb-project"
              className="min-w-0 break-words text-text-secondary"
            >
              {leaf}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId}>
      <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">
        {title}
      </h4>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/**
 * One labelled value. An EMPTY value renders as "not stated" in muted type —
 * never as a blank, a dash or a zero, so a gap can never be read as data.
 */
function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const t = useTranslations("conversation.results");
  const empty = value.trim() === "";
  return (
    <div className="min-w-0">
      <span className="block font-mono text-meta uppercase tracking-label text-text-muted">
        {label}
      </span>
      <span
        className={`block break-words text-basis ${empty ? "text-text-muted" : "text-text-primary"} ${mono ? "font-mono text-meta" : ""}`}
      >
        {empty ? t("notStated") : value}
      </span>
    </div>
  );
}

function PrecisionBadge({ precision }: { precision: "city" | "country" }) {
  const t = useTranslations("conversation.results");
  const approx = precision === "country";
  return (
    <span
      data-testid="precision-badge"
      className={`flex-none rounded-md border px-1.5 text-meta ${
        approx
          ? "border-state-amber/40 bg-state-amber/5 text-state-amber"
          : "border-ink-500 text-text-muted"
      }`}
    >
      {approx ? t("precisionCountry") : t("precisionCity")}
    </span>
  );
}

/**
 * The explanation, rendered from the loader's CODE and the row's own values.
 *
 * Deliberately mechanical. It states which rule matched and on what value —
 * nothing about attractiveness, probability, suitability or quality, none of
 * which the query can know. It is also not called AI: it is a filter reporting
 * itself.
 */
function MatchReasonText({ reason }: { reason: MatchReason }) {
  const t = useTranslations("conversation.results");
  if (reason.code === "city_exact") {
    return <>{t("reasonCityExact", { city: reason.city, country: reason.country })}</>;
  }
  return <>{t("reasonCountryUnresolved", { country: reason.country })}</>;
}

function SourceNote({ label }: { label: string }) {
  return (
    <p className="mt-2 text-meta text-text-muted" data-testid="demand-source">
      {label}: <span className="font-mono">{DEMAND_SOURCE}</span>
    </p>
  );
}

function ErrorState({
  testId,
  text,
  code,
}: {
  testId: string;
  text: string;
  code?: string;
}) {
  return (
    <div
      className="rounded-card border border-state-danger/40 bg-state-danger/5 p-3"
      data-testid={testId}
      data-error-code={code ?? ""}
    >
      {/* A failed read is stated. It never falls back to the previous list,
          to an empty state, or to anything that looks like an answer. */}
      <p className="text-basis text-state-danger">{text}</p>
      {code ? <p className="mt-1 font-mono text-meta text-text-muted">{code}</p> : null}
    </div>
  );
}

function placeText(row: ProjectResultRow, notStated: string): string {
  return row.city ? `${row.city}, ${row.country}` : `${row.country} · ${notStated}`;
}

/** Skill slug → the EXISTING `skillNames` catalogue. An unknown slug falls back
 *  to the slug itself rather than an empty chip. */
function skillLabel(t: ReturnType<typeof useTranslations>, slug: string): string {
  try {
    const label = t(slug as never);
    return typeof label === "string" && label.trim() !== "" ? label : slug;
  } catch {
    return slug;
  }
}
