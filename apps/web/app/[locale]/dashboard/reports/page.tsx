import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getJournalWindowReport,
  JOURNAL_WINDOW_KEYS,
  type JournalWindowKey,
  type JournalWindowReport,
} from "@/lib/journal/journal-window-report";
import {
  getReportsView,
  REPORT_PROJECT_STATUSES,
  type OrgReportsView,
} from "@/lib/reports/reports-hub";
import { OPEN_WORK_TASK_STATUSES } from "@/lib/tasks/task-model";
import { createUtcFormatter } from "@/lib/time/display";
import type { Role } from "@/lib/auth/actions";

/**
 * Reports hub (control room PR K, capability gap map §12) — the role-specific
 * reports INDEX. Real data only, composed from the caller's own RLS-scoped
 * reads (lib/reports/reports-hub.ts).
 *
 * Honest by construction (guard: lib/guards/universal-search-reports.test.ts):
 *  - every figure carries a BASIS label (reports.basis.*) naming exactly how
 *    it is calculated and from which of the caller's own records;
 *  - no benchmark, no score, no projection, no "real-time" claim — counts
 *    over the caller's own bounded rows, nothing else;
 *  - missing data (unapplied migration, no consent aggregate, no company)
 *    renders an explicit unavailable state — never a fabricated number;
 *  - export links point ONLY at the exports that already exist (evidence
 *    report print, Verified CV print, journal CSV, finance CSV).
 */

export const dynamic = "force-dynamic";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

const SECTION_CLASS =
  "flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/30 p-4";
const LINK_CLASS =
  "w-fit text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const EMPTY_CLASS =
  "rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-secondary";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** `?journalWindow=` → a valid window key, or null (collapsed summary). An
 *  invalid value collapses rather than guessing a window. */
function journalWindowKeyFrom(
  raw: string | undefined,
): JournalWindowKey | null {
  return raw !== undefined &&
    (JOURNAL_WINDOW_KEYS as readonly string[]).includes(raw)
    ? (raw as JournalWindowKey)
    : null;
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-ink-500 bg-ink-800/40 p-3">
      <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums text-text-primary">
        {value}
      </dd>
    </div>
  );
}

/** The per-figure calculation-basis label — every section renders one. */
function BasisNote({ t, basisKey }: { t: Translate; basisKey: string }) {
  return (
    <p
      className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-meta leading-relaxed text-text-muted"
      data-testid={`reports-basis-${basisKey}`}
    >
      <span className="font-mono uppercase tracking-label">
        {t("basis.label")}:
      </span>{" "}
      {t(`basis.${basisKey}`)}
    </p>
  );
}

function UnavailableNote({
  t,
  state,
}: {
  t: Translate;
  state: "needs-migration" | "unavailable";
}) {
  return (
    <p className={EMPTY_CLASS}>
      {state === "needs-migration"
        ? t("state.needsMigration")
        : t("state.unavailable")}
    </p>
  );
}

export default async function ReportsHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ journalWindow?: string }>;
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

  const t = await getTranslations("reports");
  const view = await getReportsView(role);

  // Windowed journal detail (V8 GAP 4) — an expandable section of THIS page,
  // not a page of its own (product gate A-09: no new surface). Absent or
  // invalid `?journalWindow=` renders the collapsed summary only.
  const sp = (await searchParams) ?? {};
  const journalWindowKey = journalWindowKeyFrom(sp.journalWindow);
  const journalDetail =
    view.kind === "org" && journalWindowKey !== null
      ? await getJournalWindowReport(journalWindowKey)
      : null;

  return (
    <div className="flex flex-col gap-6" data-testid="reports-hub">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
        <p className="text-xs text-text-muted">{t("honestyNote")}</p>
      </header>

      {view.kind === "worker" ? (
        <>
          {/* Worker 1 — profile & evidence figures (evidence-report rules). */}
          <section
            className={SECTION_CLASS}
            data-testid="reports-worker-evidence"
            aria-labelledby="reports-worker-evidence-heading"
          >
            <h2
              id="reports-worker-evidence-heading"
              className="font-display text-lg font-semibold tracking-tight text-text-primary"
            >
              {t("worker.evidence.title")}
            </h2>
            {view.evidence ? (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <MetricTile
                  label={t("worker.evidence.totalSkills")}
                  value={view.evidence.totalSkills}
                />
                <MetricTile
                  label={t("worker.evidence.workSupported")}
                  value={view.evidence.workSupported}
                />
                <MetricTile
                  label={t("worker.evidence.confirmed")}
                  value={view.evidence.confirmed}
                />
                <MetricTile
                  label={t("worker.evidence.journalEntries")}
                  value={view.evidence.journalEntries}
                />
                <MetricTile
                  label={t("worker.evidence.confirmations")}
                  value={view.evidence.confirmations}
                />
              </dl>
            ) : (
              <p className={EMPTY_CLASS} data-testid="reports-worker-evidence-empty">
                {t("worker.evidence.empty")}
              </p>
            )}
            <BasisNote t={t} basisKey="workerEvidence" />
            <Link
              href={"/dashboard/reports/evidence" as "/dashboard"}
              className={LINK_CLASS}
              data-testid="reports-link-evidence"
            >
              {t("worker.evidence.link")} →
            </Link>
          </section>

          {/* Worker 2 — journal / evidence activity (own head counts). */}
          <section
            className={SECTION_CLASS}
            data-testid="reports-worker-activity"
            aria-labelledby="reports-worker-activity-heading"
          >
            <h2
              id="reports-worker-activity-heading"
              className="font-display text-lg font-semibold tracking-tight text-text-primary"
            >
              {t("worker.activity.title")}
            </h2>
            {view.activity.journalEntryCount !== null &&
            view.activity.journalPhotoCount !== null ? (
              <dl className="grid grid-cols-2 gap-2 sm:max-w-sm">
                <MetricTile
                  label={t("worker.activity.entries")}
                  value={view.activity.journalEntryCount}
                />
                <MetricTile
                  label={t("worker.activity.photos")}
                  value={view.activity.journalPhotoCount}
                />
              </dl>
            ) : (
              <p
                className={EMPTY_CLASS}
                data-testid="reports-worker-activity-unavailable"
              >
                {t("worker.activity.unavailable")}
              </p>
            )}
            <BasisNote t={t} basisKey="workerActivity" />
            <Link
              href={"/dashboard/journal" as "/dashboard"}
              className={LINK_CLASS}
              data-testid="reports-link-journal"
            >
              {t("worker.activity.link")} →
            </Link>
          </section>

          {/* Worker 3 — the exports that already exist (nothing invented). */}
          <section
            className={SECTION_CLASS}
            data-testid="reports-worker-exports"
            aria-labelledby="reports-worker-exports-heading"
          >
            <h2
              id="reports-worker-exports-heading"
              className="font-display text-lg font-semibold tracking-tight text-text-primary"
            >
              {t("exports.title")}
            </h2>
            <p className="text-xs text-text-muted">{t("exports.note")}</p>
            <ul className="flex flex-col gap-1">
              <li>
                <Link
                  href={"/dashboard/reports/evidence" as "/dashboard"}
                  className={LINK_CLASS}
                  data-testid="reports-export-evidence"
                >
                  {t("exports.evidence")} →
                </Link>
              </li>
              <li>
                <Link
                  href={"/cv" as "/dashboard"}
                  className={LINK_CLASS}
                  data-testid="reports-export-cv"
                >
                  {t("exports.cv")} →
                </Link>
              </li>
              <li>
                {/* CSV route handler — a file download, not a page (the
                    documents-page precedent: plain anchor with locale). */}
                <a
                  href={`/${locale}/dashboard/journal/export`}
                  className={LINK_CLASS}
                  data-testid="reports-export-journal-csv"
                >
                  {t("exports.journalCsv")} →
                </a>
              </li>
            </ul>
          </section>
        </>
      ) : (
        <OrgSections
          view={view}
          t={t}
          locale={locale}
          journalWindowKey={journalWindowKey}
          journalDetail={journalDetail}
        />
      )}
    </div>
  );
}

function OrgSections({
  view,
  t,
  locale,
  journalWindowKey,
  journalDetail,
}: {
  view: OrgReportsView;
  t: Translate;
  locale: string;
  /** Non-null = the journal detail is expanded on this window. */
  journalWindowKey: JournalWindowKey | null;
  journalDetail: JournalWindowReport | null;
}): ReactNode {
  const { demand, projects, tasks, documents, finance, journal } = view;
  return (
    <>
      {/* Org 1 — own demand requests. */}
      <section
        className={SECTION_CLASS}
        data-testid="reports-org-demand"
        aria-labelledby="reports-org-demand-heading"
      >
        <h2
          id="reports-org-demand-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("org.demand.title")}
        </h2>
        {demand.state === "ok" ? (
          <>
            {/* W8/W14-6: the ORGANIZATION rollup (org demand spine). */}
            <dl
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              data-testid="reports-org-demand-rollup"
            >
              <MetricTile label={t("org.demand.open")} value={demand.open} />
              <MetricTile label={t("org.demand.total")} value={demand.total} />
              <MetricTile
                label={t("org.demand.structured")}
                value={demand.structured}
              />
              <MetricTile
                label={t("org.demand.shortlisted")}
                value={demand.shortlisted}
              />
              {demand.interest && demand.interest.state === "ok" ? (
                <MetricTile
                  label={t("org.demand.interest")}
                  value={demand.interest.total}
                />
              ) : null}
              {demand.timeToFill && demand.timeToFill.state === "measured" ? (
                <MetricTile
                  label={t("org.demand.timeToFillDays")}
                  value={demand.timeToFill.medianDays}
                />
              ) : null}
            </dl>
            {/* A-12: an unmeasured fact is SAID to be unmeasured — never a
                zero. Production has no accepted bookings yet, so time-to-fill
                has no denominator. */}
            {!demand.timeToFill || demand.timeToFill.state === "unmeasured" ? (
              <p
                className={EMPTY_CLASS}
                data-testid="reports-demand-ttf-unmeasured"
              >
                {t("org.demand.timeToFillUnmeasured")}
              </p>
            ) : null}
            <BasisNote t={t} basisKey="orgDemandOrg" />
          </>
        ) : demand.state === "own" ? (
          <>
            {/* Personal fallback: no org context resolved — these are the
                caller's OWN requests, and the basis label says so. */}
            <dl className="grid grid-cols-2 gap-2 sm:max-w-sm">
              <MetricTile label={t("org.demand.open")} value={demand.open} />
              <MetricTile label={t("org.demand.total")} value={demand.total} />
            </dl>
            <BasisNote t={t} basisKey="orgDemand" />
          </>
        ) : (
          <>
            <UnavailableNote t={t} state={demand.state} />
            <BasisNote t={t} basisKey="orgDemand" />
          </>
        )}
        <Link
          href="/dashboard"
          className={LINK_CLASS}
          data-testid="reports-link-demand"
        >
          {t("org.demand.link")} →
        </Link>
      </section>

      {/* Org 2 — own project status counts. */}
      <section
        className={SECTION_CLASS}
        data-testid="reports-org-projects"
        aria-labelledby="reports-org-projects-heading"
      >
        <h2
          id="reports-org-projects-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("org.projects.title")}
        </h2>
        {projects.state === "ok" ? (
          projects.total === 0 ? (
            <p className={EMPTY_CLASS}>{t("org.projects.empty")}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REPORT_PROJECT_STATUSES.map((s) => (
                <MetricTile
                  key={s}
                  label={t(`org.projects.status.${s}`)}
                  value={projects.byStatus[s]}
                />
              ))}
              <MetricTile label={t("org.projects.total")} value={projects.total} />
            </dl>
          )
        ) : (
          <UnavailableNote t={t} state={projects.state} />
        )}
        <BasisNote t={t} basisKey="orgProjects" />
        <Link
          href={"/dashboard/projects" as "/dashboard"}
          className={LINK_CLASS}
          data-testid="reports-link-projects"
        >
          {t("org.projects.link")} →
        </Link>
      </section>

      {/* Org 3 — own task status counts (degrades until D2 is applied). */}
      <section
        className={SECTION_CLASS}
        data-testid="reports-org-tasks"
        aria-labelledby="reports-org-tasks-heading"
      >
        <h2
          id="reports-org-tasks-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("org.tasks.title")}
        </h2>
        {tasks.state === "ok" ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricTile label={t("org.tasks.open")} value={tasks.open} />
            {OPEN_WORK_TASK_STATUSES.map((s) => (
              <MetricTile
                key={s}
                label={t(`org.tasks.status.${s}`)}
                value={tasks.byStatus[s]}
              />
            ))}
          </dl>
        ) : (
          <UnavailableNote t={t} state={tasks.state} />
        )}
        <BasisNote t={t} basisKey="orgTasks" />
        <Link
          href={"/dashboard/tasks" as "/dashboard"}
          className={LINK_CLASS}
          data-testid="reports-link-tasks"
        >
          {t("org.tasks.link")} →
        </Link>
      </section>

      {/* Org 4 — consented pool document readiness (aggregate counts only). */}
      <section
        className={SECTION_CLASS}
        data-testid="reports-org-documents"
        aria-labelledby="reports-org-documents-heading"
      >
        <h2
          id="reports-org-documents-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("org.documents.title")}
        </h2>
        {documents.state === "ok" ? (
          documents.workers === 0 ? (
            <p className={EMPTY_CLASS}>{t("org.documents.empty")}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetricTile
                label={t("org.documents.workers")}
                value={documents.workers}
              />
              <MetricTile
                label={t("org.documents.expiring")}
                value={documents.expiring}
              />
              <MetricTile
                label={t("org.documents.attention")}
                value={documents.attention}
              />
            </dl>
          )
        ) : (
          <UnavailableNote t={t} state="unavailable" />
        )}
        <BasisNote t={t} basisKey="orgDocuments" />
        <Link
          href={"/dashboard/documents" as "/dashboard"}
          className={LINK_CLASS}
          data-testid="reports-link-documents"
        >
          {t("org.documents.link")} →
        </Link>
      </section>

      {/* Org 5 — work-journal activity (V8 GAP 5): recorded entries in the
          org's engagements over the last seven calendar days, the current
          review queue, and how many of the window's entries are confirmed.
          Counts only — no rating, no score. The per-worker windowed detail
          (V8 GAP 4) expands INSIDE this section via ?journalWindow= — a
          same-page state, not a new surface (product gate A-09). */}
      <section
        id="journal"
        className={SECTION_CLASS}
        data-testid="reports-org-journal"
        aria-labelledby="reports-org-journal-heading"
      >
        <h2
          id="reports-org-journal-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("org.journal.title")}
        </h2>
        {journal.state === "ok" ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricTile
              label={t("org.journal.recorded")}
              value={journal.recorded}
            />
            <MetricTile
              label={t("org.journal.awaitingReview")}
              value={journal.awaitingReview}
            />
            <MetricTile
              label={t("org.journal.confirmed")}
              value={journal.confirmed}
            />
          </dl>
        ) : (
          <UnavailableNote t={t} state={journal.state} />
        )}
        <BasisNote t={t} basisKey="journal" />
        {journalDetail === null || journalWindowKey === null ? (
          <Link
            href={"/dashboard/reports?journalWindow=week#journal" as "/dashboard"}
            className={LINK_CLASS}
            data-testid="reports-link-journal-report"
          >
            {t("org.journal.link")} →
          </Link>
        ) : (
          <JournalWindowDetail
            t={t}
            locale={locale}
            windowKey={journalWindowKey}
            report={journalDetail}
          />
        )}
      </section>

      {/* Org 6 — own finance records (degrades until I2 is applied). */}
      <section
        className={SECTION_CLASS}
        data-testid="reports-org-finance"
        aria-labelledby="reports-org-finance-heading"
      >
        <h2
          id="reports-org-finance-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("org.finance.title")}
        </h2>
        {finance.state === "ok" ? (
          <dl className="grid grid-cols-2 gap-2 sm:max-w-sm">
            <MetricTile
              label={t("org.finance.overdue")}
              value={finance.overdueCount}
            />
            <MetricTile
              label={t("org.finance.total")}
              value={finance.totalCount}
            />
          </dl>
        ) : (
          <UnavailableNote t={t} state={finance.state} />
        )}
        <BasisNote t={t} basisKey="orgFinance" />
        <div className="flex flex-wrap gap-4">
          <Link
            href={"/dashboard/finance" as "/dashboard"}
            className={LINK_CLASS}
            data-testid="reports-link-finance"
          >
            {t("org.finance.link")} →
          </Link>
          {finance.state === "ok" ? (
            /* CSV route handler — a file download, not a page. */
            <a
              href={`/${locale}/dashboard/finance/export`}
              className={LINK_CLASS}
              data-testid="reports-export-finance-csv"
            >
              {t("exports.financeCsv")} →
            </a>
          ) : null}
        </div>
      </section>
    </>
  );
}

const DETAIL_CELL_CLASS = "px-3 py-2 text-sm text-text-primary";
const DETAIL_NUM_CELL_CLASS = `${DETAIL_CELL_CLASS} text-right tabular-nums`;
const DETAIL_HEAD_CELL_CLASS =
  "px-3 py-2 text-left font-mono text-meta uppercase tracking-label text-text-muted";

/**
 * The windowed journal detail (V8 GAP 4), expanded INSIDE the journal
 * section: per-worker counts of recorded work entries over a fixed UTC
 * calendar window, with review state. Window switching is plain links back
 * to this page (?journalWindow=…#journal) — no client JS, no new route.
 * Counts and timestamps only; the basis line states that absence of entries
 * is not evidence of absence of work. No rating, no score.
 */
function JournalWindowDetail({
  t,
  locale,
  windowKey,
  report,
}: {
  t: Translate;
  locale: string;
  windowKey: JournalWindowKey;
  report: JournalWindowReport;
}): ReactNode {
  const dayFmt = createUtcFormatter(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-3" data-testid="journal-window-report">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-base font-semibold text-text-primary">
          {t("journalWindow.title")}
        </h3>
        <p className="text-xs text-text-muted">{t("journalWindow.intro")}</p>
      </div>

      {/* Window switch — plain links, the server re-renders (no client state). */}
      <nav
        className="flex flex-wrap gap-2"
        aria-label={t("journalWindow.windowLabel")}
        data-testid="journal-window-switch"
      >
        {JOURNAL_WINDOW_KEYS.map((key) => (
          <Link
            key={key}
            href={`/dashboard/reports?journalWindow=${key}#journal` as "/dashboard"}
            aria-current={key === windowKey ? "page" : undefined}
            data-testid={`journal-window-link-${key}`}
            className={`inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
              key === windowKey
                ? "border-brand-blue bg-brand-blue/10 font-semibold text-brand-blue"
                : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
            }`}
          >
            {t(`journalWindow.window.${key}`)}
          </Link>
        ))}
      </nav>

      {!report.applied ? (
        <p className={EMPTY_CLASS} data-testid="journal-window-unavailable">
          {report.reason === "no-org"
            ? t("journalWindow.noOrg")
            : t("journalWindow.unavailable")}
        </p>
      ) : (
        <>
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("journalWindow.windowRange", {
              start: dayFmt(report.window.startIso) ?? report.window.startIso,
              end: dayFmt(report.window.endIso) ?? report.window.endIso,
            })}
          </p>

          {report.totals.entries === 0 ? (
            <div
              className="flex flex-col gap-1 rounded-md border border-dashed border-ink-500 p-5"
              data-testid="journal-window-empty"
            >
              <p className="text-sm text-text-secondary">
                {t("journalWindow.empty")}
              </p>
              <p className="text-xs text-text-muted">
                {t("journalWindow.emptyNext")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-ink-500">
              <table
                className="w-full min-w-[36rem] border-collapse"
                data-testid="journal-window-table"
              >
                <thead className="border-b border-ink-500 bg-ink-800/40">
                  <tr>
                    <th scope="col" className={DETAIL_HEAD_CELL_CLASS}>
                      {t("journalWindow.table.worker")}
                    </th>
                    <th
                      scope="col"
                      className={`${DETAIL_HEAD_CELL_CLASS} text-right`}
                    >
                      {t("journalWindow.table.entries")}
                    </th>
                    <th
                      scope="col"
                      className={`${DETAIL_HEAD_CELL_CLASS} text-right`}
                    >
                      {t("journalWindow.table.awaitingReview")}
                    </th>
                    <th
                      scope="col"
                      className={`${DETAIL_HEAD_CELL_CLASS} text-right`}
                    >
                      {t("journalWindow.table.confirmed")}
                    </th>
                    <th scope="col" className={DETAIL_HEAD_CELL_CLASS}>
                      {t("journalWindow.table.lastEntry")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.workers.map((w) => (
                    <tr
                      key={w.workerId}
                      className="border-b border-ink-600/60 last:border-b-0"
                      data-testid={`journal-window-worker-${w.workerId}`}
                    >
                      <td className={DETAIL_CELL_CLASS}>{w.name}</td>
                      <td className={DETAIL_NUM_CELL_CLASS}>{w.entries}</td>
                      <td className={DETAIL_NUM_CELL_CLASS}>{w.awaitingReview}</td>
                      <td className={DETAIL_NUM_CELL_CLASS}>{w.confirmed}</td>
                      <td
                        className={`${DETAIL_CELL_CLASS} font-mono text-meta text-text-muted`}
                      >
                        {dayFmt(w.lastEntryAtIso) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className="border-t border-ink-500 bg-ink-800/40 font-semibold"
                    data-testid="journal-window-totals"
                  >
                    <td className={DETAIL_CELL_CLASS}>
                      {t("journalWindow.totals", {
                        count: report.totals.workers,
                      })}
                    </td>
                    <td className={DETAIL_NUM_CELL_CLASS}>
                      {report.totals.entries}
                    </td>
                    <td className={DETAIL_NUM_CELL_CLASS}>
                      {report.totals.awaitingReview}
                    </td>
                    <td className={DETAIL_NUM_CELL_CLASS}>
                      {report.totals.confirmed}
                    </td>
                    <td className={DETAIL_CELL_CLASS} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* The calculation basis — including the "no entries ≠ no work" rule. */}
          <p
            className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-meta leading-relaxed text-text-muted"
            data-testid="journal-window-basis"
          >
            <span className="font-mono uppercase tracking-label">
              {t("journalWindow.basisLabel")}:
            </span>{" "}
            {t("journalWindow.basis")}
          </p>
        </>
      )}

      <Link
        href={"/dashboard/reports#journal" as "/dashboard"}
        className={LINK_CLASS}
        data-testid="journal-window-collapse"
      >
        {t("journalWindow.collapse")}
      </Link>
    </div>
  );
}
