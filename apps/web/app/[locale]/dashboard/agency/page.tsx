import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { OrgTier1Warning } from "@/components/app/org-tier1-warning";
import { PilotDraftForm } from "@/components/app/pilot-draft-form";
import { TeamRosterEmptyState } from "@/components/app/team-roster-empty-state";
import { Tier2ReadinessExplainer } from "@/components/app/tier2-readiness-explainer";
import { AgencyWorkersSection } from "@/components/app/agency-workers-section";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getPilotDraft } from "@/lib/pilot/pilot-drafts";
import {
  getOwnAgency,
  listActiveAgencyWorkers,
  listAgencyWorkerInvitations,
} from "@/lib/agency/agency-workers";

const AGENCY_FIELDS = [
  { key: "candidateRoles" as const, labelKey: "field.candidateRoles.label", placeholderKey: "field.candidateRoles.placeholder", variant: "text" as const },
  { key: "skillAreas" as const, labelKey: "field.skillAreas.label", placeholderKey: "field.skillAreas.placeholder", variant: "text" as const },
  { key: "countries" as const, labelKey: "field.countries.label", placeholderKey: "field.countries.placeholder", variant: "text" as const },
  { key: "languages" as const, labelKey: "field.languages.label", placeholderKey: "field.languages.placeholder", variant: "text" as const },
  { key: "availability" as const, labelKey: "field.availability.label", placeholderKey: "field.availability.placeholder", variant: "text" as const },
  { key: "documentation" as const, labelKey: "field.documentation.label", placeholderKey: "field.documentation.placeholder", variant: "text" as const },
  { key: "notes" as const, labelKey: "field.notes.label", placeholderKey: "field.notes.placeholder", variant: "textarea" as const },
];

export default async function AgencyDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "agency");

  const t = await getTranslations("roleDashboards.agency");
  const tWorkers = await getTranslations("roleDashboards.agency.workers");
  const existingDraft = await getPilotDraft("agency_offer");

  const ownAgency = await getOwnAgency();
  const workersResult = ownAgency
    ? await listActiveAgencyWorkers(ownAgency.id)
    : ({ kind: "ok", rows: [] } as const);
  const invitationsResult = ownAgency
    ? await listAgencyWorkerInvitations(ownAgency.id)
    : ({ kind: "ok", rows: [] } as const);

  const workersLabels = {
    title: tWorkers("title"),
    subtitle: tWorkers("subtitle"),
    emptyState: tWorkers("emptyState"),
    emptyCta: tWorkers("emptyCta"),
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
    statusNoAgency: tWorkers("statusNoAgency"),
    migrationBlockerHeading: tWorkers("migrationBlockerHeading"),
    migrationBlockerBody: tWorkers("migrationBlockerBody"),
    activeWorkersHeading: tWorkers("activeWorkersHeading"),
    columnEmail: tWorkers("columnEmail"),
    columnStatus: tWorkers("columnStatus"),
    columnInvitedAt: tWorkers("columnInvitedAt"),
    noWorkersHeading: tWorkers("noWorkersHeading"),
    noWorkersBody: tWorkers("noWorkersBody"),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="agency-dashboard">
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
        data-testid="agency-dashboard-pilot-disclaimer"
      >
        <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
          PILOT
        </p>
        <p className="text-sm text-text-secondary">{t("pilotDisclaimer")}</p>
      </section>

      <OrgTier1Warning />

      <Tier2ReadinessExplainer
        source="dashboard_agency_tier2_readiness"
        testId="agency-dashboard-tier2-readiness"
      />

      <TeamRosterEmptyState variant="agency" />

      <AgencyWorkersSection
        workersResult={workersResult}
        invitationsResult={invitationsResult}
        labels={workersLabels}
      />

      <section
        className="card-border flex flex-col gap-4 p-5"
        data-testid="agency-dashboard-first-action"
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
          draftType="agency_offer"
          fields={AGENCY_FIELDS}
          i18nNamespace="roleDashboards.agency.draftForm"
          initialDraft={existingDraft}
        />
      </section>

      <Link
        href="/dashboard/profile"
        className="self-start text-sm text-brand-blue hover:underline"
        data-testid="agency-dashboard-profile-link"
      >
        {t("profileLink")} →
      </Link>
    </div>
  );
}
