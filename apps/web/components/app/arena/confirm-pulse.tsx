import { getTranslations } from "next-intl/server";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";

import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { Link } from "@/lib/i18n/navigation";
import { loadOrganizationApprovals } from "@/lib/company/organization-today-view";
import { quickConfirmEntryView } from "@/lib/journal/quick-confirm-model";
import { countReviewablePendingEntries } from "@/lib/journal/reviewable-count";
import { countCounterpartyToDecide } from "@/lib/journal/counterparty-to-decide-count";
import { QuickConfirmQueue } from "@/components/app/quick-confirm-queue";
import { CountUp } from "@/components/app/today/count-up";
import { Card } from "@/components/ui/Card";

/**
 * ARENA confirm pulse (TASK 07 slice 2) — the S3.5 one-tap confirm queue
 * woven into the manager's arena rhythm. The count is the REAL gated
 * reviewable set (reviewable_journal_entry_ids RPC, 0 when the RPC is absent
 * or nothing waits; null when the read failed — never fabricated). One natural next step: the quick
 * confirm queue. Zero state is honest calm, not an empty promise
 * (DESIGN_SOUL §2 — Kito žingsnio + Ramybės testai).
 */
export async function ConfirmPulse() {
  // A DIFFERENT job (decision 0018): entries submitted to the caller as a
  // client. Its own line and label - never added to the employer count. The
  // two queues are independent reads, so they are asked together (perf
  // 2026-10-23), each keeping its own unknown-is-not-zero answer.
  const [pending, clientToDecide, t] = await Promise.all([
    countReviewablePendingEntries(),
    countCounterpartyToDecide(),
    getTranslations("projects.pulse"),
  ]);

  return (
    <section
      className="card-border glow-hover flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 p-5"
      data-testid="arena-confirm-pulse"
    >
      {pending === null ? (
        // UNKNOWN IS NOT ZERO (SEP-7): a failed queue read is never the calm
        // "nothing waits" state - it says it could not be read.
        <>
          <ClipboardCheck className="h-5 w-5 shrink-0 text-text-muted" aria-hidden />
          <span
            className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary"
            data-testid="confirm-pulse-unread"
          >
            {t("unreadable")}
          </span>
          <Link
            href={"/dashboard/inbox/quick" as "/dashboard"}
            data-testid="confirm-pulse-cta"
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-ink-500 px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-ink-700 sm:w-auto sm:justify-start"
          >
            {t("zeroCta")} →
          </Link>
        </>
      ) : pending > 0 ? (
        <>
          <span className="flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 shrink-0 text-state-warning" aria-hidden />
            <CountUp
              text={String(pending)}
              className="font-mono text-3xl font-bold tracking-tightest text-text-primary"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-semibold text-text-primary">
              {t("pendingTitle", { n: pending })}
            </span>
            <span className="block text-xs leading-relaxed text-text-secondary">
              {t("pendingBody")}
            </span>
          </span>
          <Link
            href={"/dashboard/inbox/quick" as "/dashboard"}
            data-testid="confirm-pulse-cta"
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-gradient-cta px-5 py-3 text-sm font-semibold text-text-on-brand transition-transform duration-fast ease-out hover:-translate-y-0.5 sm:w-auto sm:justify-start"
          >
            {t("cta")} →
          </Link>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-5 w-5 shrink-0 text-state-success" aria-hidden />
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary">
            {t("zero")}
          </span>
          <Link
            href={"/dashboard/inbox/quick" as "/dashboard"}
            data-testid="confirm-pulse-cta"
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-ink-500 px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-ink-700 sm:w-auto sm:justify-start"
          >
            {t("zeroCta")} →
          </Link>
        </>
      )}
      {clientToDecide !== null && clientToDecide > 0 ? (
        <Link
          href={"/dashboard/inbox/counterparty" as "/dashboard"}
          data-testid="confirm-pulse-client-review"
          className="inline-flex min-h-11 w-full items-center gap-2 rounded-md border border-brand-blue/40 px-4 py-2.5 text-sm font-medium text-brand-blue transition-colors duration-fast hover:bg-brand-blue/10"
        >
          <span className="font-semibold tabular-nums">{clientToDecide}</span>
          <span className="min-w-0 flex-1">{t("clientTitle", { n: clientToDecide })}</span>
          <span aria-hidden>→</span>
          <span className="sr-only">{t("clientCta")}</span>
        </Link>
      ) : null}
    </section>
  );
}

const ON_THE_CARD = 3;

/**
 * WORK WAITING FOR APPROVAL, on the organization's first screen (owner P0 2026-11-07:
 * a director could not find how to approve hours). The oldest entries are approved
 * right here, on the same cards and through the same writes as the quick queue, whose
 * RPCs decide who may approve. The rest are one tap away. When nothing waits, the card
 * says why, including the two reasons that look like a missing feature.
 */
export async function OrganizationApprovalsCard() {
  // The one approvals view model (ORG-6): the today view shows the same count of the
  // same rows. The active organization is already resolved by the layout.
  const context = await getActiveOrganizationContext();
  const [{ approvals: view }, clientToDecide, t, tToday, tPulse, tSkill, tUnit] = await Promise.all([
    loadOrganizationApprovals({ organizationId: context.activeOrganizationId, exceptions: false }),
    countCounterpartyToDecide(),
    getTranslations("companyModel.approvals"),
    getTranslations("companyModel.today"),
    getTranslations("projects.pulse"),
    getTranslations("skillNames"),
    getTranslations("productivityUnits"),
  ]);
  const reason = view.reason;
  const waiting = view.waiting ?? 0;
  const entries = view.cards.slice(0, ON_THE_CARD).map((e) => quickConfirmEntryView(e, tSkill, tUnit));
  const lineLink = "inline-flex min-h-11 w-fit items-center text-sm font-medium text-brand-blue hover:underline";

  return (
    <Card className="flex flex-col gap-3" data-testid="organization-approvals" data-state={view.state}>
      <h3 className="font-display text-base font-semibold text-text-primary" data-testid="organization-approvals-title">
        {view.waiting === null ? t("titleUnknown") : t("title", { n: waiting })}
      </h3>
      {view.state === "not-reviewer" ? (
        <p className="text-sm leading-relaxed text-text-secondary" data-testid="organization-approvals-not-reviewer">
          {tToday("notReviewer")}
        </p>
      ) : view.state === "unreadable" ? (
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
                {reason.noEmployees ? t("noEmployees") : reason.reviewOff ? t("emptyTitle") : `${t("emptyTitle")} ${t("emptyNext")}`}
              </p>
            }
          />
          {waiting > entries.length ? (
            <Link href={"/dashboard/inbox/quick" as "/dashboard"} className={lineLink} data-testid="organization-approvals-all">
              {t("seeAll", { n: waiting })} →
            </Link>
          ) : null}
        </>
      )}
      {reason.noEmployees && view.state === "empty" ? (
        <Link href={"/dashboard/company/people" as "/dashboard"} className={`${lineLink} inline-flex min-h-11 items-center`} data-testid="organization-approvals-people">
          {t("people")} →
        </Link>
      ) : null}
      {view.state !== "not-reviewer" && reason.reviewOff ? (
        <div className="flex flex-col gap-1" data-testid="organization-approvals-review-off">
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("reviewOff", { off: reason.reviewOff.reviewOff, total: reason.reviewOff.total })}
          </p>
          <Link href={"/dashboard/company/people#org-members" as "/dashboard"} className={lineLink} data-testid="organization-approvals-enable">
            {t("enable")} →
          </Link>
        </div>
      ) : null}
      {reason.ownUnconfirmed > 0 ? (
        <p className="text-xs leading-relaxed text-text-muted" data-testid="organization-approvals-own">
          {t(reason.otherReviewer === true ? "own" : reason.otherReviewer === false ? "ownAlone" : "ownUnknown", { n: reason.ownUnconfirmed })}
        </p>
      ) : null}
      {clientToDecide !== null && clientToDecide > 0 ? (
        <Link href={"/dashboard/inbox/counterparty" as "/dashboard"} className={lineLink} data-testid="organization-approvals-client">
          {tPulse("clientTitle", { n: clientToDecide })} →
        </Link>
      ) : null}
    </Card>
  );
}
