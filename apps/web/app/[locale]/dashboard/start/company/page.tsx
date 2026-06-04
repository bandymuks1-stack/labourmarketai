import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getOwnCompany,
  type CompanyVerificationStatus,
} from "@/lib/company/company-setup";
import {
  CompanySetupForm,
  type CompanySetupFormLabels,
} from "@/components/app/company-setup-form";

/**
 * Company profile-REQUEST setup (real persistence + honest verification).
 *
 * Replaces the old one-field (`name` only) form. A user starts an
 * organisation profile request from their personal account with real
 * details (name, country, registration code, address, website, contact,
 * their role in the company). The row is created with a verification ladder
 * — draft → pending_verification → unverified → verified — and full company
 * use is gated on a VERIFIED status that only a human admin can grant. This
 * page never fakes a verified company.
 *
 * When migration 20260604120000 is not yet applied, getOwnCompany() returns
 * kind: "needs-migration" and the page shows an explicit blocker (mirrors the
 * buyer / customer pattern from migration 0026). No crash, no fake success.
 */

const KNOWN_REQUESTER_ROLES = ["owner", "director", "manager", "hr", "other"];

const STATUS_TONE: Record<CompanyVerificationStatus, string> = {
  draft: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  pending_verification: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  unverified: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  verified: "border-state-success/40 bg-state-success/5 text-state-success",
};

export default async function CompanyStartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("roleDashboards.company.setup");
  const companyRead = await getOwnCompany();
  const migrationNeeded = companyRead.kind === "needs-migration";
  const company = companyRead.kind === "ok" ? companyRead.row : null;

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  const formLabels: CompanySetupFormLabels = {
    title: t("formTitle"),
    subtitle: t("formSubtitle"),
    legalName: t("legalName"),
    legalNameHelp: t("legalNameHelp"),
    legalNamePlaceholder: t("legalNamePlaceholder"),
    country: t("country"),
    countryPlaceholder: t("countryPlaceholder"),
    registrationCode: t("registrationCode"),
    registrationCodeHelp: t("registrationCodeHelp"),
    address: t("address"),
    addressPlaceholder: t("addressPlaceholder"),
    website: t("website"),
    websitePlaceholder: t("websitePlaceholder"),
    contactEmail: t("contactEmail"),
    contactPhone: t("contactPhone"),
    requesterRole: t("requesterRole"),
    requesterRoleOptions: {
      owner: t("requesterRoleOptions.owner"),
      director: t("requesterRoleOptions.director"),
      manager: t("requesterRoleOptions.manager"),
      hr: t("requesterRoleOptions.hr"),
      other: t("requesterRoleOptions.other"),
    },
    verificationNotice: t("verificationNotice"),
    saveDraft: t("saveDraft"),
    submitRequest: t("submitRequest"),
    statusDraftSaved: t("statusDraftSaved"),
    statusSubmitted: t("statusSubmitted"),
    statusNeedsMigration: t("statusNeedsMigration"),
    statusInvalid: t("statusInvalid"),
    statusError: t("statusError"),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="company-start-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {label("ĮMONĖS NUSTATYMAS", "COMPANY SETUP")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {label("Įmonės profilis", "Company profile")}
        </h1>
      </header>

      <Link
        href={"/dashboard/start" as "/dashboard"}
        className="self-start text-sm text-text-secondary hover:underline"
      >
        ← {label("Grįžti į veiklos pradžią", "Back to activity start")}
      </Link>

      {migrationNeeded ? (
        <section
          className="card-border flex flex-col gap-2 p-5"
          data-testid="company-start-migration-blocker"
        >
          <header className="flex items-center gap-2">
            <span className="rounded bg-state-warning/20 px-2 py-0.5 text-xs text-state-warning">
              {label("blokuota", "blocked")}
            </span>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("migrationBlockerHeading")}
            </h2>
          </header>
          <p className="text-sm text-text-secondary">{t("migrationBlockerBody")}</p>
        </section>
      ) : null}

      {company ? (
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="company-start-existing"
        >
          <header className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("existingHeading")}
            </h2>
            <span
              className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[company.verificationStatus]}`}
              data-testid="company-start-verification-status"
            >
              {t(`verificationStatus.${company.verificationStatus}`)}
            </span>
          </header>
          <p
            className="text-xs leading-relaxed text-text-secondary"
            data-testid="company-start-verification-explainer"
          >
            {t(`verificationExplainer.${company.verificationStatus}`)}
          </p>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">{t("legalName")}</dt>
              <dd className="text-text-primary">{company.legalName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("country")}</dt>
              <dd className="text-text-primary">{company.country ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("registrationCode")}</dt>
              <dd className="text-text-primary">
                {company.registrationCode ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("address")}</dt>
              <dd className="text-text-primary">{company.address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("website")}</dt>
              <dd className="text-text-primary">{company.website ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("requesterRole")}</dt>
              <dd className="text-text-primary">
                {company.requesterRole
                  ? KNOWN_REQUESTER_ROLES.includes(company.requesterRole)
                    ? t(`requesterRoleOptions.${company.requesterRole}`)
                    : company.requesterRole
                  : "—"}
              </dd>
            </div>
          </dl>
          <Link
            href={"/dashboard/company" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="company-start-goto-dashboard"
          >
            {label("Eiti į įmonės erdvę →", "Go to company space →")}
          </Link>
        </section>
      ) : null}

      {!migrationNeeded ? (
        <section
          className="card-border flex flex-col gap-4 p-5"
          data-testid="company-start-form-section"
        >
          <CompanySetupForm existing={company} labels={formLabels} />
        </section>
      ) : null}
    </div>
  );
}
