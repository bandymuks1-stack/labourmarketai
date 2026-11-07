import { getTranslations } from "next-intl/server";

import { QuickConfirmQueue } from "@/components/app/quick-confirm-queue";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { Link } from "@/lib/i18n/navigation";
import { countCounterpartyToDecide } from "@/lib/journal/counterparty-to-decide-count";
import { readOrganizationApprovalFacts } from "@/lib/journal/organization-approvals";
import { organizationApprovalsView } from "@/lib/journal/organization-approvals-model";
import { quickConfirmEntryView } from "@/lib/journal/quick-confirm-model";
import { fetchQuickReviewQueue, type QuickQueueEntry } from "@/lib/journal/review-queue";
import { countReviewablePendingEntries } from "@/lib/journal/reviewable-count";

const ON_THE_CARD = 3;

/**
 * WORK WAITING FOR APPROVAL, on the organization's first screen (owner P0 2026-11-07:
 * a director could not find how to approve hours). The oldest entries are approved
 * right here, on the same cards and through the same writes as the quick queue, whose
 * RPCs decide who may approve. The rest are one tap away. When nothing waits, the card
 * says why, including the two reasons that look like a missing feature.
 */
export async function OrganizationApprovalsCard() {
  const [context, pending, clientToDecide, t, tPulse, tSkill, tUnit] = await Promise.all([
    getActiveOrganizationContext(),
    countReviewablePendingEntries(),
    countCounterpartyToDecide(),
    getTranslations("companyModel.approvals"),
    getTranslations("projects.pulse"),
    getTranslations("skillNames"),
    getTranslations("productivityUnits"),
  ]);
  const organizationId = context.activeOrganizationId;
  const [facts, queue] = await Promise.all([
    organizationId
      ? readOrganizationApprovalFacts(organizationId)
      : Promise.resolve({ employees: null, ownUnconfirmed: null }),
    // The rows are read only when the count says some wait.
    pending
      ? fetchQuickReviewQueue().catch((): QuickQueueEntry[] | null => null)
      : Promise.resolve<QuickQueueEntry[] | null>([]),
  ]);
  const view = organizationApprovalsView({
    // The rows failed: the card cannot offer them, so it does not count them either.
    pending: queue === null ? null : pending,
    employees: facts.employees,
    ownUnconfirmed: facts.ownUnconfirmed,
  });
  const entries = (queue ?? []).slice(0, ON_THE_CARD).map((e) => quickConfirmEntryView(e, tSkill, tUnit));
  const lineLink = "w-fit text-sm font-medium text-brand-blue hover:underline";

  return (
    <section className="card-border flex flex-col gap-3 p-5" data-testid="organization-approvals" data-state={view.state}>
      <h3 className="font-display text-base font-semibold text-text-primary" data-testid="organization-approvals-title">
        {view.state === "unreadable" ? t("titleUnknown") : t("title", { n: pending ?? 0 })}
      </h3>
      {view.state === "unreadable" ? (
        <>
          <p className="text-sm leading-relaxed text-text-secondary" data-testid="organization-approvals-unread">
            {tPulse("unreadable")}
          </p>
          <Link href={"/dashboard/inbox/quick" as "/dashboard"} className={lineLink}>
            {tPulse("zeroCta")} →
          </Link>
        </>
      ) : (
        <>
          {view.state === "waiting" ? <p className="text-sm leading-relaxed text-text-secondary">{t("what")}</p> : null}
          {/* Stays mounted when the last entry is approved, so its receipt survives. */}
          <QuickConfirmQueue
            entries={entries}
            todays={[]}
            exceptions={{}}
            empty={
              <p className="text-sm leading-relaxed text-text-secondary" data-testid="organization-approvals-empty">
                {view.noEmployees ? t("noEmployees") : view.reviewOff ? t("emptyTitle") : `${t("emptyTitle")} ${t("emptyNext")}`}
              </p>
            }
          />
          {(pending ?? 0) > entries.length ? (
            <Link href={"/dashboard/inbox/quick" as "/dashboard"} className={lineLink} data-testid="organization-approvals-all">
              {t("seeAll", { n: pending ?? 0 })} →
            </Link>
          ) : null}
        </>
      )}
      {view.noEmployees && view.state === "empty" ? (
        <Link href={"/dashboard/company/people" as "/dashboard"} className={lineLink} data-testid="organization-approvals-people">
          {t("people")} →
        </Link>
      ) : null}
      {view.reviewOff ? (
        <div className="flex flex-col gap-1" data-testid="organization-approvals-review-off">
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("reviewOff", { off: view.reviewOff.reviewOff, total: view.reviewOff.total })}
          </p>
          <Link href={"/dashboard/company/people#org-members" as "/dashboard"} className={lineLink} data-testid="organization-approvals-enable">
            {t("enable")} →
          </Link>
        </div>
      ) : null}
      {view.ownUnconfirmed > 0 ? (
        <p className="text-xs leading-relaxed text-text-muted" data-testid="organization-approvals-own">
          {t("own", { n: view.ownUnconfirmed })}
        </p>
      ) : null}
      {clientToDecide !== null && clientToDecide > 0 ? (
        <Link href={"/dashboard/inbox/counterparty" as "/dashboard"} className={lineLink} data-testid="organization-approvals-client">
          {tPulse("clientTitle", { n: clientToDecide })} →
        </Link>
      ) : null}
    </section>
  );
}
