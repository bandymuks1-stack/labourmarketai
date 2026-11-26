import type { ReactNode } from "react";
import { CvWorkMap, type CvWorkMapNode } from "@/components/app/cv/cv-work-map";
import { businessHistoryHeader } from "@/lib/organization-evidence/business-history-header";
import type { OrganizationLivingHistory, OrganizationLivingWorkRecord } from "@/lib/company/team-profile-model";

const BUSINESS_HISTORY = "companyWorkHistory.business";

type Translate = (key: string, values?: Record<string, string | number>) => string;

function recordDetails(
  details: readonly OrganizationLivingWorkRecord[],
  locale: string,
  t: Translate,
) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (
    <ul className="flex min-w-0 flex-col gap-3" data-testid="org-living-work-details">
      {details.map((record) => {
        const context = record.contexts.length > 0
          ? record.contexts.map((item) => `${t(item.kind === "project" ? "companyWorkHistory.facts.project" : "companyWorkHistory.place")}: ${item.label}`)
          : record.fallbackPlace
            ? [`${t("companyWorkHistory.place")}: ${record.fallbackPlace}`]
            : [];
        return (
          <li key={record.id} className="min-w-0 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5" data-testid="org-living-work-detail">
            <p className="text-sm leading-relaxed text-text-primary [overflow-wrap:anywhere]">
              {record.description ?? t("companyWorkHistory.descriptionNotInSource")}
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-meta text-text-secondary">
              <span>
                {record.when ?? t(BUSINESS_HISTORY + ".boundsNotDocumented")}
              </span>
              {context.map((label) => <span key={label}>{label}</span>)}
              {record.hours !== null ? (
                <span className="font-medium tabular-nums text-text-primary">
                  {record.period
                    ? t("companyWorkHistory.periodShort", { hours: number.format(record.hours) })
                    : t("businessProfile.team.living.hours", { hours: number.format(record.hours) })}
                </span>
              ) : null}
            </div>
            {record.attributed ? (
              <p className="mt-1 text-meta leading-relaxed text-text-muted">
                {t("companyWorkHistory.attributedNote", { count: 1 })}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Existing record descriptions and direct project/place links, with details opened by node selection. */
export function OrganizationLivingActivity({
  historyDetail,
  locale,
  t,
  action,
}: {
  readonly historyDetail: OrganizationLivingHistory | null;
  readonly locale: string;
  readonly t: Translate;
  readonly action?: ReactNode;
}) {
  if (!historyDetail) return null;
  const split = historyDetail.business
    ? businessHistoryHeader(historyDetail.business, historyDetail.identity).split
    : false;
  const countFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const groupLabel = (key: string, shown: number, total: number) => {
    const label = t(key);
    return shown < total ? `${label} (${countFormat.format(shown)} / ${countFormat.format(total)})` : label;
  };
  const nodes: CvWorkMapNode[] = [
    ...historyDetail.workDescriptions.map((work) => ({
      id: work.id,
      label: work.label,
      side: "left" as const,
      meta: t("companyWorkHistory.entries", { count: work.records }),
      detail: recordDetails(work.details, locale, t),
    })),
    ...historyDetail.workContexts.map((context) => ({
      id: context.id,
      label: `${t(context.kind === "project" ? "companyWorkHistory.facts.project" : "companyWorkHistory.place")}: ${context.label}`,
      side: "right" as const,
      meta: t("companyWorkHistory.entries", { count: context.records }),
      detail: recordDetails(context.details, locale, t),
    })),
  ];
  const hasNotice = historyDetail.truncated || historyDetail.partnerWorkUnreadable ||
    historyDetail.attributedCount > 0 || split;
  if (nodes.length === 0 && !hasNotice) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="org-living-activity">
      {split ? (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="org-living-activity-held">
          {t(BUSINESS_HISTORY + ".totalsHeld", { name: historyDetail.organizationName })}
        </p>
      ) : null}
      {historyDetail.attributedCount > 0 ? (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="org-living-activity-attributed">
          {t("companyWorkHistory.attributedNote", { count: historyDetail.attributedCount })}
        </p>
      ) : null}
      {historyDetail.truncated ? (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="org-living-activity-truncated">
          {t("companyWorkHistory.truncated", { count: historyDetail.recordsRead })}
        </p>
      ) : null}
      {historyDetail.partnerWorkUnreadable ? (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="org-living-activity-partner-unreadable">
          {t("companyWorkHistory.forClient.unreadable")}
        </p>
      ) : null}
      <CvWorkMap
        title={t("businessProfile.team.living.tabs.experience")}
        leftLabel={groupLabel("companyWorkHistory.timeline", historyDetail.workDescriptions.length, historyDetail.workDescriptionCount)}
        rightLabel={groupLabel("cvExport.premium.analytics.contextLabel", historyDetail.workContexts.length, historyDetail.workContextCount)}
        nodes={nodes}
        edges={historyDetail.workEdges}
        action={action}
      />
    </div>
  );
}
