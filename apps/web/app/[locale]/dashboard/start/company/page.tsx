import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_TYPES, type CompanyType } from "@/lib/company/company-profile-shared";
import {
  COMPANY_COUNTRY_CODES,
  listOwnedCompanies,
  type CompanyRow,
  type CompanyVerificationStatus,
} from "@/lib/company/company-setup";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import {
  CompanySetupForm,
  type CompanySetupFormLabels,
} from "@/components/app/company-setup-form";
import { Card } from "@/components/ui/Card";

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
 * When migration 20260604120000 is not yet applied, listOwnedCompanies()
 * returns kind: "needs-migration" and the page shows an explicit blocker
 * (mirrors the buyer / customer pattern from migration 0026). No crash, no
 * fake success.
 *
 * M-P0-2: the save target is EXPLICIT (active workspace's company, a single
 * unambiguous owned company, or ?new=1 to create). Several owned companies
 * without a company workspace render a fail-closed chooser — never a
 * first/oldest fallback.
 */

const KNOWN_REQUESTER_ROLES = ["owner", "director", "manager", "hr", "other"];

const STATUS_TONE: Record<CompanyVerificationStatus, string> = {
  draft: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  active_unverified: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  needs_checks: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  pending_verification: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  unverified: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  verified: "border-state-success/40 bg-state-success/5 text-state-success",
};

export default async function CompanyStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ new?: string; type?: string; capability?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Universal first-run router presets (lib/onboarding/first-run-intent.ts):
  // an agency intent pre-selects the staffing_agency company TYPE, an
  // education intent declares the training_provider CAPABILITY once the
  // company exists. Both are validated against the closed vocabularies; an
  // unknown value is simply ignored.
  const sp = (await searchParams) ?? {};
  const presetCompanyType = (COMPANY_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as CompanyType)
    : undefined;
  const presetCapability = sp.capability === "training_provider" ? "training_provider" : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("roleDashboards.company.setup");

  // M-P0-2 target resolution — the save target is EXPLICIT, never inferred
  // from "the" company of the profile (a profile may own several):
  //   1. ?new=1                → CREATE mode (insert-only; existing = null).
  //   2. active company workspace → EDIT that workspace's company.
  //   3. else: 0 owned → CREATE; 1 owned → EDIT that single unambiguous row;
  //      2+ owned without a company workspace → an honest chooser (fail
  //      closed — no first/oldest fallback).
  const createRequested = (await searchParams)?.new === "1";
  const owned = await listOwnedCompanies();
  const migrationNeeded = owned.kind === "needs-migration";
  const ownedRows: readonly CompanyRow[] = owned.kind === "ok" ? owned.rows : [];

  let company: CompanyRow | null = null;
  let targetCompanyId: string = "new";
  let ambiguous = false;
  if (!createRequested && !migrationNeeded) {
    const workspace = await resolveEmployerCompanyContext();
    const workspaceCompany =
      workspace.kind === "ok"
        ? (ownedRows.find((r) => r.id === workspace.companyId) ?? null)
        : null;
    if (workspaceCompany) {
      company = workspaceCompany;
      targetCompanyId = workspaceCompany.id;
    } else if (ownedRows.length === 1) {
      company = ownedRows[0];
      targetCompanyId = ownedRows[0].id;
    } else if (ownedRows.length > 1) {
      ambiguous = true;
    }
  }

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  const formLabels: CompanySetupFormLabels = {
    // Dead-UI rule C (owner smoke 2026-07-05): one route serves create AND
    // edit — the heading must say WHICH, so an existing company is never
    // tricked into thinking it is creating a second one.
    title: company ? t("formTitleEdit") : t("formTitleCreate"),
    subtitle: t("formSubtitle"),
    legalName: t("legalName"),
    legalNameHelp: t("legalNameHelp"),
    legalNamePlaceholder: t("legalNamePlaceholder"),
    companyType: t("companyType"),
    companyTypeHelp: t("companyTypeHelp"),
    companyTypeOptions: {
      construction: t("companyTypeOptions.construction"),
      staffing_agency: t("companyTypeOptions.staffing_agency"),
      subcontractor: t("companyTypeOptions.subcontractor"),
      manufacturing: t("companyTypeOptions.manufacturing"),
      services: t("companyTypeOptions.services"),
      client_customer: t("companyTypeOptions.client_customer"),
      other: t("companyTypeOptions.other"),
    },
    country: t("country"),
    countryPlaceholder: t("countryPlaceholder"),
    countryOptions: Object.fromEntries(
      COMPANY_COUNTRY_CODES.map((code) => [code, t(`countryOptions.${code}`)]),
    ),
    statusInvalidCountry: t("statusInvalidCountry"),
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
    legalLockedNotice: t("legalLockedNotice"),
    saveDraft: t("saveDraft"),
    submitRequest: t("submitRequest"),
    statusDraftSaved: t("statusDraftSaved"),
    statusSubmitted: t("statusSubmitted"),
    goToWorkspace: t("goToWorkspace"),
    capabilityNotDeclared: t("capabilityNotDeclared"),
    statusNeedsMigration: t("statusNeedsMigration"),
    statusInvalid: t("statusInvalid"),
    statusDuplicateCompany: t("statusDuplicateCompany"),
    statusError: t("statusError"),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="company-start-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
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
              className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[company.verificationStatus]}`}
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
              <dt className="text-xs text-text-muted">{t("companyType")}</dt>
              <dd
                className="text-text-primary"
                data-testid="company-start-company-type"
              >
                {t(`companyTypeOptions.${company.companyType}`)}
              </dd>
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

      {!migrationNeeded && ambiguous ? (
        // M-P0-2 fail-closed chooser: several owned companies and no active
        // company workspace — the person picks explicitly; nothing is ever
        // edited by first/oldest fallback.
        <Card compact>
          <div
            className="flex flex-col gap-3"
            data-testid="company-start-ambiguous-chooser"
          >
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Kurią organizaciją tvarkyti?", "Which organization to manage?")}
            </h2>
            <p className="text-sm text-text-secondary">
              {label(
                "Turite kelias organizacijas. Pasirinkite aktyvią erdvę viršuje arba kurkite naują.",
                "You own several organizations. Pick the active workspace in the switcher above, or create a new one.",
              )}
            </p>
            <ul className="flex flex-col gap-1 text-sm text-text-primary">
              {ownedRows.map((row) => (
                <li key={row.id} data-testid="company-start-owned-row">
                  {row.legalName ?? row.displayName ?? row.id.slice(0, 8)}
                </li>
              ))}
            </ul>
            <Link
              href={"/dashboard/start/company?new=1" as "/dashboard"}
              className="self-start text-sm text-brand-blue hover:underline"
              data-testid="company-start-create-new-link"
            >
              {label("+ Kurti naują organizaciją", "+ Create a new organization")}
            </Link>
          </div>
        </Card>
      ) : null}

      {!migrationNeeded && !ambiguous ? (
        <section
          className="card-border flex flex-col gap-4 p-5"
          data-testid="company-start-form-section"
        >
          {company === null ? null : (
            <Link
              href={"/dashboard/start/company?new=1" as "/dashboard"}
              className="self-start text-sm text-brand-blue hover:underline"
              data-testid="company-start-create-another-link"
            >
              {label("+ Kurti naują organizaciją", "+ Create a new organization")}
            </Link>
          )}
          <CompanySetupForm
            existing={company}
            labels={formLabels}
            targetCompanyId={targetCompanyId}
            presetCompanyType={presetCompanyType}
            presetCapability={presetCapability}
          />
        </section>
      ) : null}
    </div>
  );
}
