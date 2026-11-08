import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, FolderOpen, Users } from "lucide-react";

import { ManagerScopeNotice } from "@/components/app/organization/manager-scope-notice";
import { TelemetryView } from "@/components/app/telemetry-view";
import { ExplainMore } from "@/components/app/premium/disclosure";
import { PageTitle } from "@/components/app/premium/page-title";
import { QuickConfirmQueue } from "@/components/app/quick-confirm-queue";
import { buttonLinkClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { TodayViewAmount, TodayViewWorkLoad } from "@/lib/company/organization-today-view-model";
import { loadOrganizationTodayView } from "@/lib/company/organization-today-view";
import type { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { Link } from "@/lib/i18n/navigation";
import { quickConfirmEntryView } from "@/lib/journal/quick-confirm-model";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

const LINE_LINK = "w-fit text-sm font-medium text-brand-blue hover:underline";
const SECTION_TITLE = "font-display text-card-title font-semibold text-text-primary";

/**
 * THE ORGANIZATION'S "TODAY" VIEW, on real data (owner order 2026-11-07). A prototype
 * reachable only at `/dashboard/company?view=today`: the visual direction is not
 * approved, so nothing links here and the default page stays as it is. Existing tokens,
 * `Card` and `Button` only.
 *
 * The work waiting for approval leads, on the quick queue's own cards and writes. Every
 * section says plainly when its read failed. Nothing here says who is working today:
 * there is no shift or attendance data.
 */
export async function OrganizationTodayView({
  organizationId,
  company,
  context,
}: {
  readonly organizationId: string | null;
  /** The company row the page already read. Null: there is none, or it failed. */
  readonly company: { readonly id: string; readonly displayName: string | null; readonly legalName: string | null } | null;
  readonly context: Awaited<ReturnType<typeof resolveEmployerCompanyContext>>;
}) {
  const companyId = company?.id ?? null;
  const organizationName = company?.displayName ?? company?.legalName ?? null;
  const role = context.kind === "ok" ? context.role : null;
  const [data, locale, t, tApprovals, tPulse, tToday, tDecisions, tModel, tJournal, tSkill, tUnit] = await Promise.all([
    loadOrganizationTodayView({ organizationId, companyId }),
    getLocale(),
    getTranslations("companyModel.today"),
    getTranslations("companyModel.approvals"),
    getTranslations("projects.pulse"),
    getTranslations("workforcePlanning.organizationToday"),
    getTranslations("roleDashboards.company"),
    getTranslations("companyModel"),
    getTranslations("journal"),
    getTranslations("skillNames"),
    getTranslations("productivityUnits"),
  ]);
  const { approvals, today, decisions } = data;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const amount = (a: TodayViewAmount) => t(`amount.${a.unit}`, { n: number.format(a.value) });
  const figures = (load: TodayViewWorkLoad) => [
    ...(load.unclear > 0 ? [t("unclear", { n: load.unclear })] : []),
    ...(load.noHours > 0 ? [t("noHours", { n: load.noHours })] : []),
  ];
  const cardOf = <E extends Parameters<typeof quickConfirmEntryView>[0]>(e: E) => quickConfirmEntryView(e, tSkill, tUnit);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${data.todayIso}T00:00:00Z`));
  const decisionLabel = (key: (typeof decisions.unread)[number]) =>
    key === "absences" ? tToday("pendingDecisions") : tDecisions(`decisions.${key}`);
  const reason = approvals.reason;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5" data-testid="organization-today-view">
      <TelemetryView
        event={FUNNEL_EVENTS.companyDashboardViewed}
        metadata={{ surface: "company", role_context: "company", step: "today_view" }}
      />
      <header className="flex flex-col gap-1">
        <p className="text-sm text-text-secondary" data-testid="organization-today-date">
          <time dateTime={data.todayIso}>{date}</time>
        </p>
        <PageTitle data-testid="organization-today-name">{organizationName ?? tDecisions("title")}</PageTitle>
      </header>

      {role ? <ManagerScopeNotice role={role} /> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="flex flex-col gap-4">
          <section className="flex flex-col gap-4" aria-labelledby="organization-today-approvals" data-testid="organization-today-approvals" data-state={approvals.state}>
            <h2 id="organization-today-approvals" className="flex flex-col gap-1 font-display font-semibold text-text-primary">
              {approvals.waiting === null ? (
                <span className="text-2xl leading-tight tracking-tight">{tApprovals("titleUnknown")}</span>
              ) : (
                <>
                  <span className="text-lg leading-tight">{tApprovals("titleUnknown")}:</span>{" "}
                  <span
                    className="text-7xl leading-none tracking-tight text-brand-blue tabular-nums"
                    data-testid="organization-today-waiting"
                  >
                    {approvals.waiting}
                  </span>
                </>
              )}
            </h2>

            {approvals.state === "unreadable" ? (
              <>
                <p className="text-sm leading-relaxed text-text-secondary" data-testid="organization-today-approvals-unread">
                  {tPulse("unreadable")}
                </p>
                <Link href={"/dashboard/inbox/quick" as "/dashboard"} className={LINE_LINK}>
                  {tPulse("zeroCta")} →
                </Link>
              </>
            ) : null}

            {approvals.state === "not-reviewer" ? (
              <p className="text-sm leading-relaxed text-text-secondary" data-testid="organization-today-not-reviewer">
                {t("notReviewer")}
              </p>
            ) : null}

            {approvals.state === "waiting" ? (
              <>
                <p className="text-base font-medium text-text-primary tabular-nums" data-testid="organization-today-totals">
                  {[
                    t("people", { n: approvals.total.people }),
                    t("entries", { n: approvals.total.entries }),
                    ...approvals.total.amounts.map(amount),
                  ].join(" · ")}
                </p>
                {/* The first card sits below the people on a phone: one tap, never a hunt. */}
                <a href="#organization-today-queue" className={buttonLinkClassName("primary")} data-testid="organization-today-go-approve">
                  {t("goApprove")}
                </a>
                <ul className="flex flex-col divide-y divide-ink-600" data-testid="organization-today-people">
                  {approvals.people.map((p) => (
                    <li key={p.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0" data-testid="organization-today-person">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 break-words font-medium text-text-primary">{p.name}</span>
                        <span className="shrink-0 text-right font-semibold text-text-primary tabular-nums">
                          {p.amounts.map(amount).join(" · ") || t("noFigure")}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-text-secondary">
                        {[t("entries", { n: p.entries }), ...figures(p)].join(" · ")}
                      </p>
                      {p.exceptions.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5" data-testid="organization-today-exceptions">
                          {p.exceptions.map((slug) => (
                            <span
                              key={slug}
                              className="inline-flex items-center rounded-full border border-state-warning/40 bg-state-warning/10 px-2 py-0.5 text-meta text-state-warning"
                            >
                              {tJournal(`inbox.quick.exception.${slug}`)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {approvals.state === "waiting" || approvals.state === "empty" ? (
              // Stays mounted when the last entry is approved, so its receipt survives. Its
              // rows come only from the gated set, and the actions re-check every write.
              <div id="organization-today-queue" className="scroll-mt-24">
              <QuickConfirmQueue
                entries={approvals.cards.map(cardOf)}
                todays={approvals.batch.map(cardOf)}
                exceptions={Object.fromEntries(Object.entries(data.exceptions).map(([id, slugs]) => [id, [...slugs]]))}
                empty={
                  <p className="text-sm leading-relaxed text-text-secondary" data-testid="organization-today-approvals-empty">
                    {reason.noEmployees
                      ? tApprovals("noEmployees")
                      : reason.reviewOff
                        ? tApprovals("emptyTitle")
                        : `${tApprovals("emptyTitle")} ${tApprovals("emptyNext")}`}
                  </p>
                }
              />
              </div>
            ) : null}

            {approvals.moreHere > 0 || approvals.elsewhere > 0 ? (
              <div className="flex flex-col gap-1">
                {approvals.elsewhere > 0 ? (
                  <p className="text-sm leading-relaxed text-text-secondary" data-testid="organization-today-elsewhere">
                    {t("elsewhere", { n: approvals.elsewhere })}
                  </p>
                ) : null}
                <Link href={"/dashboard/inbox/quick" as "/dashboard"} className={LINE_LINK} data-testid="organization-today-all">
                  {tApprovals("seeAll", { n: (approvals.waiting ?? 0) + approvals.elsewhere })} →
                </Link>
              </div>
            ) : null}

            {approvals.state === "empty" && reason.noEmployees ? (
              <Link href={"/dashboard/company/people" as "/dashboard"} className={LINE_LINK}>
                {tApprovals("people")} →
              </Link>
            ) : null}

            {approvals.state !== "not-reviewer" && reason.reviewOff ? (
              <div className="flex flex-col gap-1" data-testid="organization-today-review-off">
                <p className="text-sm leading-relaxed text-text-secondary">
                  {tApprovals("reviewOff", { off: reason.reviewOff.reviewOff, total: reason.reviewOff.total })}
                </p>
                <Link href={"/dashboard/company/people#org-members" as "/dashboard"} className={LINE_LINK}>
                  {tApprovals("enable")} →
                </Link>
              </div>
            ) : null}

            {reason.ownUnconfirmed > 0 ? (
              <p className="text-xs leading-relaxed text-text-muted" data-testid="organization-today-own">
                {tApprovals(reason.otherReviewer === true ? "own" : reason.otherReviewer === false ? "ownAlone" : "ownUnknown", {
                  n: reason.ownUnconfirmed,
                })}
              </p>
            ) : null}
          </section>
        </Card>

        <div className="flex flex-col gap-5">
          <Card compact className="flex flex-col gap-3">
            <section className="flex flex-col gap-3" aria-labelledby="organization-today-facts" data-testid="organization-today-facts">
              <h2 id="organization-today-facts" className={SECTION_TITLE}>
                {tToday("title")}
              </h2>
              <dl className="grid grid-cols-2 gap-3">
                {today.facts.map((fact) => (
                  <div key={fact.key} className="flex flex-col gap-0.5" data-testid={`organization-today-fact-${fact.key}`}>
                    <dt className="text-xs leading-snug text-text-secondary">{tToday(fact.key)}</dt>
                    <dd className="text-2xl font-semibold text-text-primary tabular-nums">
                      {fact.value === null ? <span className="text-sm font-normal text-text-muted">{tToday("notReadable")}</span> : fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col gap-1" data-testid="organization-today-absent-today">
                <h3 className="text-support font-semibold text-text-secondary">{tToday("absentToday")}</h3>
                {today.absentToday === null ? (
                  <p className="text-meta text-text-muted">{tToday("notReadable")}</p>
                ) : today.absentToday.length === 0 ? (
                  <p className="text-meta text-text-muted">{tToday("noneRecordedToday")}</p>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {today.absentToday.map((r) => (
                      <li key={r.workerId} className="text-support text-text-primary">
                        {r.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col gap-1" data-testid="organization-today-absent-next">
                <h3 className="text-support font-semibold text-text-secondary">{tToday("absentNext")}</h3>
                {today.absentNext === null ? (
                  <p className="text-meta text-text-muted">{tToday("notReadable")}</p>
                ) : today.absentNext.length === 0 ? (
                  <p className="text-meta text-text-muted">{tToday("noneRecordedNext")}</p>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {today.absentNext.map((r, i) => (
                      <li key={`${r.workerId}-${r.startDate}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-support">
                        <span className="text-text-primary">{r.name}</span>
                        <span className="text-meta text-text-muted tabular-nums">
                          {r.startDate}
                          {r.endDate && r.endDate !== r.startDate ? ` – ${r.endDate}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ExplainMore>
                <p>{tToday("basis")}</p>
              </ExplainMore>
            </section>
          </Card>

          <Card compact className="flex flex-col gap-3">
            <section className="flex flex-col gap-3" aria-labelledby="organization-today-decisions" data-testid="organization-today-decisions">
              <h2 id="organization-today-decisions" className={SECTION_TITLE}>
                {tDecisions("decisions.title")}
              </h2>
              {decisions.items.length > 0 ? (
                <ul className="flex flex-col divide-y divide-ink-600">
                  {decisions.items.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href as "/dashboard"}
                        data-testid={`organization-today-decision-${item.key}`}
                        className="group flex min-h-11 items-center gap-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                      >
                        <span className="w-8 shrink-0 text-xl font-semibold text-brand-blue tabular-nums">{item.count}</span>
                        <span className="min-w-0 flex-1 break-words">{decisionLabel(item.key)}</span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {decisions.unread.length > 0 ? (
                <p className="text-sm leading-relaxed text-text-muted" data-testid="organization-today-decisions-unread">
                  {decisions.unread.map((key) => `${decisionLabel(key)}: ${tDecisions("decisions.unreadable")}`).join(" · ")}
                </p>
              ) : null}
              {decisions.clear ? (
                <p className="text-sm leading-relaxed text-text-secondary" data-testid="organization-today-decisions-clear">
                  {t("decisionsClear")}
                </p>
              ) : null}
            </section>
          </Card>

          <nav aria-label={t("doors")} className="grid grid-cols-2 gap-3" data-testid="organization-today-doors">
            <Link href={"/dashboard/company/people" as "/dashboard"} className={buttonLinkClassName("secondary", "sm")} data-testid="organization-today-door-people">
              <Users className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{tModel("people")}</span>
            </Link>
            <Link href={"/dashboard/projects" as "/dashboard"} className={buttonLinkClassName("secondary", "sm")} data-testid="organization-today-door-projects">
              <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{tModel("projects")}</span>
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
