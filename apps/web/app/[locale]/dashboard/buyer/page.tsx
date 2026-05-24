import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PilotDraftForm } from "@/components/app/pilot-draft-form";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getPilotDraft } from "@/lib/pilot/pilot-drafts";

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
  const existingDraft = await getPilotDraft("buyer_request");

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
