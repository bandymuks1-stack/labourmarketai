import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { JobPostingForm } from "@/components/app/job-posting-form";
import { JobPostingsList } from "@/components/app/job-postings-list";
import { OrgTier1Warning } from "@/components/app/org-tier1-warning";
import { PilotDraftForm } from "@/components/app/pilot-draft-form";
import { TeamRosterEmptyState } from "@/components/app/team-roster-empty-state";
import { Tier2ReadinessExplainer } from "@/components/app/tier2-readiness-explainer";
import { CompanyWorkersSection } from "@/components/app/company-workers-section";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { listJobPostingsForOwnCompany } from "@/lib/job-postings/job-postings";
import {
  getOwnCompany,
  listActiveCompanyWorkers,
  listCompanyWorkerInvitations,
} from "@/lib/company/company-workers";
import { getPilotDraft } from "@/lib/pilot/pilot-drafts";
import { isOperationsRoleEnabled } from "@/lib/operations/role-capabilities";

const COMPANY_FIELDS = [
  { key: "title" as const, labelKey: "field.title.label", placeholderKey: "field.title.placeholder", variant: "text" as const },
  { key: "capabilities" as const, labelKey: "field.capabilities.label", placeholderKey: "field.capabilities.placeholder", variant: "text" as const },
  { key: "location" as const, labelKey: "field.location.label", placeholderKey: "field.location.placeholder", variant: "text" as const },
  { key: "timing" as const, labelKey: "field.timing.label", placeholderKey: "field.timing.placeholder", variant: "text" as const },
  { key: "accommodation" as const, labelKey: "field.accommodation.label", placeholderKey: "field.accommodation.placeholder", variant: "select" as const, selectOptionsKey: "accommodation" },
  { key: "languages" as const, labelKey: "field.languages.label", placeholderKey: "field.languages.placeholder", variant: "text" as const },
  { key: "notes" as const, labelKey: "field.notes.label", placeholderKey: "field.notes.placeholder", variant: "textarea" as const },
];

const ACCOMMODATION_OPTIONS = [
  { value: "yes", labelKey: "field.accommodation.options.yes" },
  { value: "no", labelKey: "field.accommodation.options.no" },
  { value: "unknown", labelKey: "field.accommodation.options.unknown" },
];

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("roleDashboards.company");
  const tJobs = await getTranslations("jobPostings");
  const tWorkers = await getTranslations("roleDashboards.company.workers");
  const existingDraft = await getPilotDraft("company_request");
  const jobPostingsResult = await listJobPostingsForOwnCompany();
  const jobPostings = jobPostingsResult.ok ? jobPostingsResult.data : [];
  const jobPostingsError =
    jobPostingsResult.ok ? null : jobPostingsResult.message;

  const ownCompany = await getOwnCompany();
  const workersResult = ownCompany
    ? await listActiveCompanyWorkers(ownCompany.id)
    : ({ kind: "ok", rows: [] } as const);
  const invitationsResult = ownCompany
    ? await listCompanyWorkerInvitations(ownCompany.id)
    : ({ kind: "ok", rows: [] } as const);

  const workersLabels = {
    title: tWorkers("title"),
    subtitle: tWorkers("subtitle"),
    activeWorkersHeading: tWorkers("activeWorkersHeading"),
    noWorkersHeading: tWorkers("noWorkersHeading"),
    noWorkersBody: tWorkers("noWorkersBody"),
    inviteHeading: tWorkers("inviteHeading"),
    inviteDescription: tWorkers("inviteDescription"),
    inviteEmailLabel: tWorkers("inviteEmailLabel"),
    inviteEmailPlaceholder: tWorkers("inviteEmailPlaceholder"),
    inviteNoteLabel: tWorkers("inviteNoteLabel"),
    inviteNoteHint: tWorkers("inviteNoteHint"),
    inviteSubmit: tWorkers("inviteSubmit"),
    invitationsHeading: tWorkers("invitationsHeading"),
    invitationsEmpty: tWorkers("invitationsEmpty"),
    statusInvited: tWorkers("statusInvited"),
    statusAlreadyPending: tWorkers("statusAlreadyPending"),
    statusAlreadyLinked: tWorkers("statusAlreadyLinked"),
    statusNotOwner: tWorkers("statusNotOwner"),
    statusInvalidEmail: tWorkers("statusInvalidEmail"),
    statusError: tWorkers("statusError"),
    statusNoCompany: tWorkers("statusNoCompany"),
    migrationBlockerHeading: tWorkers("migrationBlockerHeading"),
    migrationBlockerBody: tWorkers("migrationBlockerBody"),
    columnEmail: tWorkers("columnEmail"),
    columnStatus: tWorkers("columnStatus"),
    columnInvitedAt: tWorkers("columnInvitedAt"),
    coordinationHeading: tWorkers("coordinationHeading"),
    coordinationBody: tWorkers("coordinationBody"),
    coordinationNextAction: tWorkers("coordinationNextAction"),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="company-dashboard">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      <section
        className="card-border flex flex-col gap-2 p-4"
        data-testid="company-dashboard-pilot-disclaimer"
      >
        <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
          PILOT
        </p>
        <p className="text-sm text-text-secondary">{t("pilotDisclaimer")}</p>
      </section>

      <OrgTier1Warning />

      <Tier2ReadinessExplainer
        source="dashboard_company_tier2_readiness"
        testId="company-dashboard-tier2-readiness"
      />

      <TeamRosterEmptyState variant="company" />

      <CompanyWorkersSection
        workersResult={workersResult}
        invitationsResult={invitationsResult}
        labels={workersLabels}
        roleCoordinationEnabled={isOperationsRoleEnabled("foreman")}
      />

      <section
        className="card-border flex flex-col gap-4 p-5"
        data-testid="company-dashboard-job-postings"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {tJobs("list.title")}
          </h2>
          <p className="text-sm text-text-secondary">{tJobs("list.body")}</p>
        </header>
        {jobPostingsError && (
          <p
            className="rounded border border-state-error bg-state-error/10 px-3 py-2 text-sm text-state-error"
            role="alert"
            data-testid="company-dashboard-job-postings-error"
          >
            {jobPostingsError}
          </p>
        )}
        <JobPostingsList rows={jobPostings} />
        <details
          className="rounded border border-border-default bg-surface-1 p-3"
          data-testid="company-dashboard-job-postings-create"
        >
          <summary className="cursor-pointer text-sm font-semibold text-text-primary">
            {tJobs("form.openCreate")}
          </summary>
          <div className="mt-3">
            <JobPostingForm locale={locale} />
          </div>
        </details>
      </section>

      <section
        className="card-border flex flex-col gap-4 p-5"
        data-testid="company-dashboard-first-action"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("firstAction.title")}
          </h2>
          <p className="text-sm text-text-secondary">
            {t("firstAction.body")}
          </p>
        </header>
        <PilotDraftForm
          draftType="company_request"
          fields={COMPANY_FIELDS}
          i18nNamespace="roleDashboards.company.draftForm"
          initialDraft={existingDraft}
          selectOptions={{ accommodation: ACCOMMODATION_OPTIONS }}
        />
      </section>

      <Link
        href="/dashboard/profile"
        className="self-start text-sm text-brand-blue hover:underline"
        data-testid="company-dashboard-profile-link"
      >
        {t("profileLink")} →
      </Link>
    </div>
  );
}
