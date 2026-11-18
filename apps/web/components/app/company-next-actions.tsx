import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { Card } from "@/components/ui/Card";
import { NeedDoorLink } from "@/components/app/need-door-link";
import type { CompanyRow, CompanyVerificationStatus } from "@/lib/company/company-setup";
import { runCompanyChecks, type CompanyCheckKey } from "@/lib/company/company-checks";
import type { EmployerContextReason } from "@/lib/company/employer-company-context";
import { EmployerContextNotice } from "@/components/app/employer-context-notice";
import { OpenWorkspaceButton } from "@/components/app/organization/open-workspace-button";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import type { WorkspaceInfo } from "@/lib/company/organization-switch";

/**
 * Company honest STATUS header (automatic-first).
 *
 * A company is usable immediately as `active_unverified`. This surface tells a
 * company user, at a glance: what their company is, its honest status, and
 * what (if anything) needs fixing — computed from the REAL saved row via
 * runCompanyChecks. It NEVER says "wait for admin approval" and never fakes
 * verification/hiring/AI.
 *
 * Consolidated (canonical-user-journey v1): the former four static explainer
 * cards (complete details / team / requests / verification) duplicated the
 * page's CompanyActionNextActions room card and were removed — ONE action
 * center per page. Only the data-driven status/fix parts plus the tracked
 * door into the demand intake (`NeedDoorLink`) remain.
 *
 * Pure read + render: it receives the already-RLS-scoped company row (the
 * caller only ever passes the signed-in user's own company). No mutations, no
 * companies UPDATE — edits go through the existing setup form / RPC.
 */

const STATUS_TONE: Record<CompanyVerificationStatus, string> = {
  draft: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  active_unverified: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  needs_checks: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  pending_verification: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  unverified: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  verified: "border-state-success/40 bg-state-success/5 text-state-success",
};

/** Optional fields whose absence/malformation we surface as "to fix". */
const FIXABLE_KEYS: CompanyCheckKey[] = [
  "country",
  "registrationCode",
  "website",
  "contactEmail",
];

export async function CompanyNextActions({ company }: { company: CompanyRow }) {
  const t = await getTranslations("roleDashboards.company.nextActions");
  const tSetup = await getTranslations("roleDashboards.company.setup");

  const status = company.verificationStatus;
  const checks = runCompanyChecks({
    legalName: company.legalName,
    country: company.country,
    registrationCode: company.registrationCode,
    website: company.website,
    contactEmail: company.contactEmail,
    requesterRole: company.requesterRole,
  });
  const toFix = checks
    .filter((c) => FIXABLE_KEYS.includes(c.key) && c.outcome === "warn")
    .map((c) => c.key);

  // Field labels reuse the setup namespace so copy stays consistent.
  const fieldLabel = (key: CompanyCheckKey): string => {
    switch (key) {
      case "country":
        return tSetup("country");
      case "registrationCode":
        return tSetup("registrationCode");
      case "website":
        return tSetup("website");
      case "contactEmail":
        return tSetup("contactEmail");
      default:
        return key;
    }
  };

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="company-next-actions"
      data-status={status}
    >
      {/* Status header */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {/* Dead-UI repair: the company NAME is the natural first tap —
                it opens the full identity readback (create/edit surface). */}
            <Link
              href="/dashboard/start/company"
              className="rounded-sm transition-colors hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              data-testid="company-name-link"
            >
              {company.legalName ?? "—"}
            </Link>
            {company.country ? (
              <span className="ml-2 font-mono text-xs font-normal uppercase tracking-label text-text-muted">
                {company.country}
              </span>
            ) : null}
          </h2>
          <span
            className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[status]}`}
            data-testid="company-next-actions-status"
          >
            {tSetup(`verificationStatus.${status}`)}
          </span>
        </div>
        <p
          className="text-xs leading-relaxed text-text-secondary"
          data-testid="company-next-actions-explainer"
        >
          {tSetup(`verificationExplainer.${status}`)}
        </p>

        {toFix.length > 0 ? (
          <div
            className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs text-text-secondary"
            data-testid="company-next-actions-tofix"
          >
            <p className="font-medium text-state-warning">
              {status === "needs_checks" ? t("fixHeading") : t("missingHeading")}
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {toFix.map((k) => (
                <li key={k} className="text-text-secondary">
                  • {fieldLabel(k)}
                </li>
              ))}
            </ul>
            <Link
              href={"/dashboard/start/company" as "/dashboard"}
              className="mt-1 inline-block text-meta font-medium text-brand-blue hover:underline"
              data-testid="company-next-actions-fix-link"
            >
              {t("fixCta")} →
            </Link>
          </div>
        ) : null}
      </div>

      {/* Activation funnel: the tracked door into the demand intake. It used
          to be a hash to the requests section — which only the Needs door
          holds, so on this Settings page the click went nowhere and was the
          ONLY one ever counted (activation audit 2026-10-26 §2). The shared
          door names the real route, the label and the surface. */}
      <NeedDoorLink
        surface="company_settings"
        testId="company-next-actions-need-door"
        className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-meta font-semibold text-text-primary transition-colors hover:border-brand-blue"
      />
    </section>
  );
}

/** Clean no-company guide — shown when a company-role holder has no company row
 *  yet. Guides to the setup route; never shows empty technical blocks. */
/**
 * "You are IN an organization, but it does not act as a company for you" —
 * a MEMBERSHIP state, not a missing company. `company-not-owned` = the
 * person holds a non-employer membership (member) or only employment;
 * `not-a-member` = the pointer names an organization outside their list.
 */
export function isMembershipEntryRefusal(
  reason: EmployerContextReason | null | undefined,
): boolean {
  return reason === "company-not-owned" || reason === "not-a-member";
}

/**
 * The honest state of a company door when no company row could be read.
 *
 * Until 2026-09-23 this was ONE sentence for every cause: "Start your company
 * profile". A manager of the canonical organization read it on every door
 * (the owner/admin-only read behind the pages refused them — fixed in
 * `getAccessibleCompanyById`), and a plain member or an employee standing in
 * their organization's workspace still reads it today unless the reason is
 * passed: the guide would tell someone who BELONGS to an organization to
 * create a second one. With a membership reason it renders the existing
 * employer-context notice (which space, what would change it) and points the
 * member at the directory that is theirs to see.
 */
export async function CompanyNoProfileGuide({
  reason = null,
  activeWorkspaceName = null,
}: {
  /** The employer resolver's refusal, when the caller has one. */
  reason?: EmployerContextReason | null;
  activeWorkspaceName?: string | null;
} = {}) {
  const t = await getTranslations("roleDashboards.company.nextActions");
  // THE PERSONAL SPACE IS NOT "NO COMPANY" (local UX review 2026-10-24, rows
  // 1.5/1.10). An owner who switched to their personal space was told "You
  // have no company profile yet — create one", inviting a DUPLICATE of the
  // organization they own. When the person has organization workspaces, name
  // them and offer the membership-checked switch into each instead; the
  // setup guide stays only for someone with no organization at all.
  if (reason === "personal-workspace") {
    let organizations: readonly WorkspaceInfo[] = [];
    try {
      organizations = (await getWorkspaceContext()).workspaces.filter(
        (w) => w.kind === "organization",
      );
    } catch {
      organizations = [];
    }
    if (organizations.length > 0) {
      const tChat = await getTranslations("conversation.chat");
      const tOpen = await getTranslations("companyWorkHistory.business.workspace");
      return (
        <section data-testid="company-personal-space-guide">
          <Card className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold text-text-primary">
            {t("personalSpace.title")}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
            {t("personalSpace.body")}
          </p>
          <ul className="flex flex-col gap-2">
            {organizations.map((o) => {
              const name = o.name.trim() || tChat("workspaceUnnamed");
              return (
                <li key={o.id} data-testid="company-personal-space-org">
                  <OpenWorkspaceButton
                    organizationId={o.id}
                    label={tOpen("open", { name })}
                    pendingLabel={tOpen("opening")}
                    errorLabel={tOpen("error")}
                  />
                </li>
              );
            })}
          </ul>
          </Card>
        </section>
      );
    }
  }
  if (reason && isMembershipEntryRefusal(reason)) {
    const tEntry = await getTranslations("organizationMembers.entry");
    return (
      <section
        className="flex flex-col gap-3"
        data-testid="company-membership-entry-notice"
        data-reason={reason}
      >
        <EmployerContextNotice reason={reason} activeWorkspaceName={activeWorkspaceName} />
        {reason === "company-not-owned" ? (
          <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
            {tEntry("memberOnly")}{" "}
            <Link
              href={"/dashboard/company/settings#organization-members" as "/dashboard"}
              className="font-medium text-brand-blue underline-offset-2 hover:underline"
              data-testid="company-membership-entry-members-link"
            >
              {tEntry("openMembers")} →
            </Link>
          </p>
        ) : null}
      </section>
    );
  }
  return (
    <section
      className="card-border flex flex-col gap-3 p-6"
      data-testid="company-no-profile-guide"
    >
      <h2 className="font-display text-xl font-semibold text-text-primary">
        {t("noCompany.title")}
      </h2>
      <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
        {t("noCompany.body")}
      </p>
      <Link
        href={"/dashboard/start/company" as "/dashboard"}
        className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80"
        data-testid="company-no-profile-cta"
      >
        {t("noCompany.cta")} →
      </Link>
    </section>
  );
}
