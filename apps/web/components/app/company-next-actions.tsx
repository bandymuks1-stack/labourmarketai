import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { TrackedLink } from "@/components/app/tracked-link";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import type { CompanyRow, CompanyVerificationStatus } from "@/lib/company/company-setup";
import { runCompanyChecks, type CompanyCheckKey } from "@/lib/company/company-checks";

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
 * demand CTA (activation funnel P0-A) remain.
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
            className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[status]}`}
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
              className="mt-1 inline-block text-[11px] font-medium text-brand-blue hover:underline"
              data-testid="company-next-actions-fix-link"
            >
              {t("fixCta")} →
            </Link>
          </div>
        ) : null}
      </div>

      {/* Activation funnel (P0-A): the tracked demand/requests CTA — real
          telemetry kept when the duplicate explainer cards were consolidated
          out (canonical-user-journey v1). Hash href to the real requests
          section below. */}
      <TrackedLink
        event={FUNNEL_EVENTS.companyDemandActionClicked}
        eventMetadata={{ surface: "company", entity_type: "company_request" }}
        href={"#company-requests" as "/dashboard"}
        className="inline-flex w-fit items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-[11px] font-semibold text-text-primary transition-colors hover:border-brand-blue"
      >
        {t("cards.requests.cta")} →
      </TrackedLink>
    </section>
  );
}

/** Clean no-company guide — shown when a company-role holder has no company row
 *  yet. Guides to the setup route; never shows empty technical blocks. */
export async function CompanyNoProfileGuide() {
  const t = await getTranslations("roleDashboards.company.nextActions");
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
