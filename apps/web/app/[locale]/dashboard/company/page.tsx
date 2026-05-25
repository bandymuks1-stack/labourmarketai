import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { OrgTier1Warning } from "@/components/app/org-tier1-warning";
import { PilotDraftForm } from "@/components/app/pilot-draft-form";
import { TeamRosterEmptyState } from "@/components/app/team-roster-empty-state";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getPilotDraft } from "@/lib/pilot/pilot-drafts";

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
  const existingDraft = await getPilotDraft("company_request");

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

      <TeamRosterEmptyState variant="company" />

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
