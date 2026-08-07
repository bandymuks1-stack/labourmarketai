import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { TrustInsightCard } from "@/components/intelligence/trust-insight-card";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getCompanyDemandIntelligence } from "@/lib/intelligence/intelligence-read";
import { buildCompanyDemandTrustCard } from "@/lib/intelligence/trust-card-model";
import { openDemandIntakeAsCompanyAction } from "@/lib/company/demand-intake-navigation";
import { PROFESSION_SKILLS } from "@/lib/taxonomy/profession-skills";
import { getWorkforce } from "@/lib/workforce/workforce";
import {
  buildPlanningZoneView,
  type PlanningZoneEntry,
  type ZoneAction,
} from "@/lib/workforce/planning-zone-view";
import type { GapRiskLevel } from "@/lib/workforce/gap-timeline";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * Workforce planning zone (Labour Market OS P10) — ONE visual planning zone
 * INSIDE the company workspace (constitution §8: never a second dashboard).
 *
 * Server component over the P1–P4 composition: getWorkforce() →
 * requirements (stored human plan or deterministic suggestion) →
 * assessCapacity → buildGapTimeline → recommendActions — all shaped by the
 * pure view model (lib/workforce/planning-zone-view.ts) so this page only
 * renders.
 *
 * Surface doctrine (guard: lib/guards/labour-market-os-surface.test.ts):
 *  - vertical month-bucketed timeline (no horizontal scroll), capacity bars
 *    (pure CSS widths from design tokens), short numbers, skill chips,
 *    an accessible ok/tight/critical indicator (text + colour, never
 *    colour-only), and EXACTLY ONE primary CTA — the top recommendation,
 *    linking a real existing surface (or plain status when none exists);
 *  - the recommendation is VISIBLY a suggestion, never a command (owner
 *    directive 2026-07-13): the zone forces no workflow — equal-validity
 *    entry points (demand form, new project, candidates, network) sit
 *    beside it as quiet links, the empty state offers a CHOICE of starting
 *    points, and nothing is gated on "an earlier step";
 *  - honest degradation: per-source quiet notes for pending owner
 *    activations / read errors — optional notes, never blockers; no fake
 *    rows, no dead controls, no technical AI copy.
 */

export const dynamic = "force-dynamic";

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 font-mono text-meta uppercase tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

/** Accessible risk tone — always paired with a text label. */
const RISK_TONE: Record<GapRiskLevel, string> = {
  ok: "border-state-success/50 bg-state-success/10 text-state-success",
  tight: "border-state-warning/50 bg-state-warning/10 text-text-primary",
  critical: "border-state-danger/50 bg-state-danger/10 text-state-danger",
};

const BAR_TONE: Record<GapRiskLevel, string> = {
  ok: "bg-state-success/70",
  tight: "bg-state-warning/70",
  critical: "bg-state-danger/70",
};

const PRIMARY_CTA_CLASS =
  "inline-flex min-h-10 w-fit items-center rounded-md border border-brand-blue bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-brand-blue transition-colors hover:bg-brand-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

export default async function CompanyWorkforcePlanningPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("workforcePlanning");

  const header = (
    <header className="flex flex-col gap-1">
      <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
        {t("eyebrow")}
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="text-sm text-text-secondary">{t("intro")}</p>
    </header>
  );

  const result = await getWorkforce();
  if (result.status === "not-authed") {
    return (
      <div className="flex flex-col gap-6" data-testid="workforce-planning-page">
        {header}
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {t("notAuthed")}
        </p>
      </div>
    );
  }

  // ── Market context (Contextual Intelligence UI v1): the org's OWN 90-day
  //    demand aggregates as a trust card — full trust report (derived
  //    confidence, freshness, limitations, timeline) when data exists, an
  //    honest unavailable state (why / requirement / disabled sources /
  //    after activation) otherwise. Never a fabricated number (§18).
  const demandIntel = await getCompanyDemandIntelligence();
  const demandTrustCard = buildCompanyDemandTrustCard(
    demandIntel.kind === "ok"
      ? {
          demandAggregates: demandIntel.demandAggregates,
          windowStart: demandIntel.windowStart,
          windowEnd: demandIntel.windowEnd,
        }
      : null,
    Date.now(),
  );
  const intelContextCard = (
    <TrustInsightCard card={demandTrustCard} locale={locale} linkToWorkspace />
  );

  const view = buildPlanningZoneView({
    entries: result.entries,
    plans: result.plans,
    workers: result.workers,
    assignments: result.assignments,
    brigades: result.brigades,
    sources: result.sources,
    catalog: {
      professions: Object.keys(PROFESSION_SKILLS),
      professionSkills: PROFESSION_SKILLS,
    },
  });

  const monthFmt = createUtcFormatter(locale, {
    month: "long",
    year: "numeric",
  });
  const dayFmt = createUtcFormatter(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const fmtMonth = (monthIso: string) => monthFmt(`${monthIso}-01`) ?? "";
  const fmtDay = (dayIso: string) => dayFmt(dayIso) ?? "";

  /** THE one primary CTA of the zone (guard-pinned single testid). Renders a
   *  real Link, the audited demand-intake server action, or nothing. */
  function PrimaryCta({
    label,
    target,
  }: {
    label: string;
    target: ZoneAction["target"] | { kind: "demand-intake" };
  }) {
    const testid = "planning-zone-primary-cta";
    if (target.kind === "route") {
      return (
        <Link
          href={target.href as "/dashboard"}
          data-testid={testid}
          className={PRIMARY_CTA_CLASS}
        >
          {label} →
        </Link>
      );
    }
    if (target.kind === "demand-intake") {
      return (
        <form action={openDemandIntakeAsCompanyAction.bind(null, locale)}>
          <button type="submit" data-testid={testid} className={PRIMARY_CTA_CLASS}>
            {label} →
          </button>
        </form>
      );
    }
    // No existing surface performs this — plain explanatory status, no
    // button-like element without an action (constitution §8).
    return (
      <p data-testid={testid} className="text-sm text-text-secondary">
        {label} — {t("action.statusHint")}
      </p>
    );
  }

  function CapacityBar({
    pct,
    riskLevel,
    label,
  }: {
    pct: number;
    riskLevel: GapRiskLevel;
    label: string;
  }) {
    return (
      <div
        role="img"
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-ink-700"
      >
        <div
          className={`h-full rounded-full ${BAR_TONE[riskLevel]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }

  /** Equal-validity starting points (owner directive: multiple entry
   *  points, suggestions not coercion). Every target is a REAL existing
   *  surface; the demand form opens through the audited server action. */
  function EntryChoices() {
    const linkClass =
      "inline-flex min-h-9 items-center rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
    const links: { key: string; href: string }[] = [
      { key: "project", href: "/dashboard/company/projects/new" },
      { key: "candidates", href: "/dashboard/candidates" },
      { key: "network", href: "/dashboard/network" },
    ];
    return (
      <div
        className="flex flex-wrap gap-2"
        data-testid="planning-zone-entry-choices"
      >
        <form action={openDemandIntakeAsCompanyAction.bind(null, locale)}>
          <button type="submit" className={linkClass}>
            {t("entries.demand")}
          </button>
        </form>
        {links.map((l) => (
          <Link
            key={l.key}
            href={l.href as "/dashboard"}
            className={linkClass}
            data-testid={`planning-zone-entry-choice-${l.key}`}
          >
            {t(`entries.${l.key}`)}
          </Link>
        ))}
      </div>
    );
  }

  function RiskChip({ level }: { level: GapRiskLevel }) {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${RISK_TONE[level]}`}
      >
        {t(`risk.level.${level}`)}
      </span>
    );
  }

  function EntryRow({ entry }: { entry: PlanningZoneEntry }) {
    const body = (
      <>
        <span className="flex flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`timeline.source.${entry.source}`)}
          </span>
          <span className="min-w-0 break-words text-sm font-semibold text-text-primary">
            {entry.title ?? t("timeline.untitled")}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          {entry.startDate ? (
            <span>
              {fmtDay(entry.startDate)}
              {entry.endDate && entry.endDate !== entry.startDate
                ? ` – ${fmtDay(entry.endDate)}`
                : ""}
            </span>
          ) : (
            <span>{t("timeline.undated")}</span>
          )}
          {entry.requiredHeadcount > 0 ? (
            <span className="tabular-nums">
              {t("timeline.requiredShort", { count: entry.requiredHeadcount })}
              {" · "}
              {t("timeline.coveredShort", { count: entry.coveredHeadcount })}
            </span>
          ) : null}
        </span>
      </>
    );
    const rowClass =
      "flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-800/30 px-4 py-3";
    return (
      <li>
        {entry.href ? (
          <Link
            href={entry.href as "/dashboard"}
            data-testid={`planning-zone-entry-${entry.id}`}
            className={`${rowClass} transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue`}
          >
            {body}
          </Link>
        ) : (
          <div
            data-testid={`planning-zone-entry-${entry.id}`}
            className={rowClass}
          >
            {body}
          </div>
        )}
      </li>
    );
  }

  /* ---------------- empty state ---------------- */

  if (view.isEmpty) {
    // Calm empty state with a CHOICE of starting points (owner directive:
    // no single funnel) — every option is an equal, real entry action.
    return (
      <div className="flex flex-col gap-6" data-testid="workforce-planning-page">
        {header}
        <Notes notes={view.notes} />
        <div
          className="flex flex-col gap-3 rounded-md border border-dashed border-ink-500 p-5"
          data-testid="planning-zone-empty"
        >
          <p className="text-sm text-text-secondary">{t("empty")}</p>
          <p className="text-xs font-semibold text-text-primary">
            {t("entries.chooseTitle")}
          </p>
          <EntryChoices />
        </div>
      </div>
    );
  }

  /* ---------------- populated zone ---------------- */

  const hoursShort =
    view.totals.shortfallHours !== null && view.totals.shortfallHours > 0
      ? view.totals.shortfallHours
      : null;

  return (
    <div className="flex flex-col gap-6" data-testid="workforce-planning-page">
      {header}

      <Notes notes={view.notes} />

      {/* Capacity summary — short numbers + one bar, never a text wall. */}
      <section
        className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="planning-zone-summary"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-text-primary">
              {view.totals.requiredHeadcount}
            </span>
            <span className="text-xs text-text-muted">{t("summary.required")}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums text-text-primary">
              {view.totals.coveredHeadcount}
            </span>
            <span className="text-xs text-text-muted">{t("summary.available")}</span>
          </span>
          {view.totals.shortfall > 0 ? (
            <span
              className="font-mono text-meta uppercase tracking-label text-state-danger"
              data-testid="planning-zone-shortfall"
            >
              {t("summary.shortPeople", { count: view.totals.shortfall })}
              {hoursShort !== null
                ? ` · ${t("summary.shortHours", { count: hoursShort })}`
                : ""}
            </span>
          ) : (
            <span className="font-mono text-meta uppercase tracking-label text-state-success">
              {t("summary.coveredAll")}
            </span>
          )}
        </div>
        {/* Headcount provenance — the user's number is shown as the user's,
            a system placeholder as a labelled suggestion, confirmed as
            confirmed. Never merged into one anonymous figure. */}
        {view.totals.userEnteredHeadcount !== null ||
        view.totals.systemSuggestedHeadcount !== null ||
        view.totals.confirmedRequiredHeadcount !== null ? (
          <div
            className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-text-muted"
            data-testid="planning-zone-headcount-provenance"
          >
            {view.totals.userEnteredHeadcount !== null ? (
              <span>
                {t("summary.userEntered", {
                  count: view.totals.userEnteredHeadcount,
                })}
              </span>
            ) : null}
            {view.totals.systemSuggestedHeadcount !== null ? (
              <span>
                {t("summary.systemSuggested", {
                  count: view.totals.systemSuggestedHeadcount,
                })}
              </span>
            ) : null}
            {view.totals.confirmedRequiredHeadcount !== null ? (
              <span>
                {t("summary.confirmedRequired", {
                  count: view.totals.confirmedRequiredHeadcount,
                })}
              </span>
            ) : null}
          </div>
        ) : null}
        <CapacityBar
          pct={view.totals.coveragePct}
          riskLevel={view.risk.level}
          label={`${t("summary.capacityLabel")}: ${view.totals.coveragePct}%`}
        />
        {/* Risk date — text label + tone, never colour-only. */}
        <p
          className="flex flex-wrap items-center gap-2 text-sm text-text-secondary"
          data-testid="planning-zone-risk"
        >
          <RiskChip level={view.risk.level} />
          <span>
            {view.risk.riskDate
              ? t("risk.onDate", { date: fmtDay(view.risk.riskDate) })
              : t("risk.none")}
          </span>
        </p>
      </section>

      {intelContextCard}

      {/* Skill gaps — chips, capped short. */}
      {view.missingSkills.length > 0 ? (
        <section className="flex flex-col gap-2" data-testid="planning-zone-skills">
          <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
            {t("skills.title")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {view.missingSkills.slice(0, 12).map((skill) => (
              <span
                key={skill}
                className={`${CHIP_BASE} border-state-warning/50 text-text-primary`}
              >
                {skill}
              </span>
            ))}
            {view.missingSkills.length > 12 ? (
              <span className={`${CHIP_BASE} border-ink-500 text-text-muted`}>
                +{view.missingSkills.length - 12}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Recommendation — VISIBLY a suggestion (owner directive), never a
          command. The TOP recommendation is the ONE primary CTA; further
          recommendations are a quiet text list, and the equal-validity
          starting points below stay available regardless. */}
      <section className="flex flex-col gap-2" data-testid="planning-zone-action">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("action.title")}
        </h2>
        {view.primaryAction ? (
          <>
            <PrimaryCta
              label={t(`action.kind.${view.primaryAction.type}`)}
              target={view.primaryAction.target}
            />
            <p className="text-xs text-text-muted">
              {view.primaryAction.entryTitle
                ? `${view.primaryAction.entryTitle} · ${t("action.optionalHint")}`
                : t("action.optionalHint")}
            </p>
            {view.secondaryActions.length > 0 ? (
              <div className="flex flex-col gap-1 pt-1">
                <p className="text-meta uppercase tracking-label text-text-muted">
                  {t("action.secondaryTitle")}
                </p>
                <ul
                  className="flex flex-col gap-0.5 text-xs text-text-secondary"
                  data-testid="planning-zone-secondary-actions"
                >
                  {view.secondaryActions.map((a) => (
                    <li key={`${a.type}-${a.entryId}`}>
                      {t(`action.kind.${a.type}`)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-text-secondary">{t("action.none")}</p>
        )}
        {/* Other legitimate starting points — always available, no gating. */}
        <div className="flex flex-col gap-1 pt-2">
          <p className="text-meta uppercase tracking-label text-text-muted">
            {t("entries.title")}
          </p>
          <EntryChoices />
        </div>
      </section>

      {/* Upcoming work — vertical month-bucketed timeline. */}
      <section className="flex flex-col gap-4" data-testid="planning-zone-timeline">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("timeline.title")}
        </h2>
        {view.months.map((m) => (
          <div key={m.monthIso} className="flex flex-col gap-2">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold capitalize text-text-primary">
              {fmtMonth(m.monthIso)}
              {m.shortfall > 0 ? <RiskChip level={m.riskLevel} /> : null}
            </h3>
            {m.requiredHeadcount > 0 ? (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <CapacityBar
                    pct={m.coveragePct}
                    riskLevel={m.riskLevel}
                    label={`${t("summary.capacityLabel")}: ${m.coveragePct}%`}
                  />
                </div>
                <span className="shrink-0 font-mono text-meta uppercase tracking-label tabular-nums text-text-muted">
                  {m.coveredHeadcount}/{m.requiredHeadcount}
                </span>
              </div>
            ) : null}
            <ul className="flex flex-col gap-2">
              {m.entries.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          </div>
        ))}
        {view.undated.length > 0 ? (
          <div className="flex flex-col gap-2" data-testid="planning-zone-undated">
            <h3 className="text-sm font-semibold text-text-primary">
              {t("timeline.undated")}
            </h3>
            <p className="text-xs text-text-muted">{t("timeline.undatedHint")}</p>
            <ul className="flex flex-col gap-2">
              {view.undated.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );

  /** Quiet per-source honesty notes — one line each, never a crash. */
  function Notes({ notes }: { notes: readonly string[] }) {
    if (notes.length === 0) return null;
    return (
      <div className="flex flex-col gap-2" data-testid="planning-zone-notes">
        {notes.map((n) => (
          <p
            key={n}
            className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs text-text-secondary"
            data-testid={`planning-zone-note-${n}`}
          >
            {t(`notes.${n}`)}
          </p>
        ))}
      </div>
    );
  }
}
