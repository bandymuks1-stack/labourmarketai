import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { OrgTier1Warning } from "@/components/app/org-tier1-warning";
import { PilotDraftForm } from "@/components/app/pilot-draft-form";
import { Tier2ReadinessExplainer } from "@/components/app/tier2-readiness-explainer";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getPilotDraft } from "@/lib/pilot/pilot-drafts";
import { getOwnCustomer } from "@/lib/buyer/customers";

const BUYER_FIELDS = [
  { key: "serviceType" as const, labelKey: "field.serviceType.label", placeholderKey: "field.serviceType.placeholder", variant: "text" as const },
  { key: "location" as const, labelKey: "field.location.label", placeholderKey: "field.location.placeholder", variant: "text" as const },
  { key: "timing" as const, labelKey: "field.timing.label", placeholderKey: "field.timing.placeholder", variant: "text" as const },
  { key: "budget" as const, labelKey: "field.budget.label", placeholderKey: "field.budget.placeholder", variant: "text" as const },
  { key: "notes" as const, labelKey: "field.notes.label", placeholderKey: "field.notes.placeholder", variant: "textarea" as const },
];

export default async function BuyerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "customer");

  const t = await getTranslations("roleDashboards.buyer");
  const tSetup = await getTranslations("roleDashboards.buyer.setup");
  const existingDraft = await getPilotDraft("buyer_request");
  const customerRead = await getOwnCustomer();
  const customer = customerRead.kind === "ok" ? customerRead.row : null;
  const migrationNeeded = customerRead.kind === "needs-migration";

  return (
    <div className="flex flex-col gap-6" data-testid="buyer-dashboard">
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
        data-testid="buyer-dashboard-pilot-disclaimer"
      >
        <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
          PILOT
        </p>
        <p className="text-sm text-text-secondary">{t("pilotDisclaimer")}</p>
      </section>

      <OrgTier1Warning />

      {customer ? (
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="buyer-dashboard-customer-state"
        >
          <header className="flex items-center gap-2">
            <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
              ✓
            </span>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {tSetup("existingHeading")}
            </h2>
          </header>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">{tSetup("contactName")}</dt>
              <dd className="text-text-primary">{customer.contactName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("customerType")}</dt>
              <dd className="text-text-primary">
                {tSetup(`customerTypeOptions.${customer.customerType}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("country")}</dt>
              <dd className="text-text-primary">{customer.country ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("market")}</dt>
              <dd className="text-text-primary">{customer.market ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("contactPreference")}</dt>
              <dd className="text-text-primary">
                {tSetup(`contactPreferenceOptions.${customer.contactPreference}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("reviewStatus")}</dt>
              <dd className="text-text-primary">{customer.reviewStatus}</dd>
            </div>
          </dl>
          <Link
            href={"/dashboard/start/buyer" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="buyer-dashboard-edit-setup"
          >
            ← {tSetup("formTitle")}
          </Link>
        </section>
      ) : migrationNeeded ? (
        <section
          className="card-border flex flex-col gap-2 p-5"
          data-testid="buyer-dashboard-migration-blocker"
        >
          <header className="flex items-center gap-2">
            <span className="rounded bg-state-warning/20 px-2 py-0.5 text-xs text-state-warning">
              blokuota
            </span>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {tSetup("migrationBlockerHeading")}
            </h2>
          </header>
          <p className="text-sm text-text-secondary">
            {tSetup("migrationBlockerBody")}
          </p>
        </section>
      ) : (
        <section
          className="card-border flex flex-col gap-2 p-5"
          data-testid="buyer-dashboard-no-customer-yet"
        >
          <p className="text-sm text-text-secondary">
            {tSetup("formSubtitle")}
          </p>
          <Link
            href={"/dashboard/start/buyer" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="buyer-dashboard-goto-setup"
          >
            {tSetup("submit")} →
          </Link>
        </section>
      )}

      <Tier2ReadinessExplainer
        source="dashboard_buyer_tier2_readiness"
        testId="buyer-dashboard-tier2-readiness"
      />

      <section
        className="card-border flex flex-col gap-4 p-5"
        data-testid="buyer-dashboard-first-action"
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
          draftType="buyer_request"
          fields={BUYER_FIELDS}
          i18nNamespace="roleDashboards.buyer.draftForm"
          initialDraft={existingDraft}
        />
      </section>

      <Link
        href="/dashboard/profile"
        className="self-start text-sm text-brand-blue hover:underline"
        data-testid="buyer-dashboard-profile-link"
      >
        {t("profileLink")} →
      </Link>
    </div>
  );
}
