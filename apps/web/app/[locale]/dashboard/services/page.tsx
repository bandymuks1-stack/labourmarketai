import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { listOwnServiceOfferings } from "@/lib/services/service-offerings";
import {
  ServiceOfferingsSection,
  type ServiceOfferingsLabels,
} from "@/components/app/service-offerings-section";

/**
 * Services — provider-owned service offerings (W8 Phase 1). Authenticated
 * dashboard surface: a provider manages the REAL services they offer (create /
 * edit / activate-pause / delete their own). RLS scopes every row to the caller.
 *
 * Honest degradation: until the owner applies the service_offerings migration,
 * `listOwnServiceOfferings` returns `needs-migration` and the section shows a
 * calm "not available yet" state — never an error, never a fake offering.
 */
export default async function ServicesPage({
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
  if (!user) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/services`);

  const t = await getTranslations("serviceOfferings");
  const result = await listOwnServiceOfferings();
  const needsMigration = result.kind === "needs-migration";
  const rows = result.kind === "ok" ? result.rows : [];

  const labels: ServiceOfferingsLabels = {
    title: t("title"),
    intro: t("intro"),
    notAvailable: t("notAvailable"),
    empty: t("empty"),
    addButton: t("addButton"),
    formTitleLabel: t("form.titleLabel"),
    formTitlePlaceholder: t("form.titlePlaceholder"),
    formDescriptionLabel: t("form.descriptionLabel"),
    formDescriptionPlaceholder: t("form.descriptionPlaceholder"),
    formCategoryLabel: t("form.categoryLabel"),
    formCategoryPlaceholder: t("form.categoryPlaceholder"),
    formCountryLabel: t("form.countryLabel"),
    formCountryPlaceholder: t("form.countryPlaceholder"),
    formRemoteLabel: t("form.remoteLabel"),
    formRateLabel: t("form.rateLabel"),
    formRatePlaceholder: t("form.ratePlaceholder"),
    formRateHint: t("form.rateHint"),
    save: t("save"),
    saving: t("saving"),
    cancel: t("cancel"),
    edit: t("edit"),
    remove: t("remove"),
    activate: t("activate"),
    pause: t("pause"),
    errorTitleRequired: t("errorTitleRequired"),
    errorCountry: t("errorCountry"),
    errorGeneric: t("errorGeneric"),
    remoteBadge: t("remoteBadge"),
    status: {
      draft: t("status.draft"),
      active: t("status.active"),
      paused: t("status.paused"),
    },
  };

  return (
    <div className="flex flex-col gap-4" data-testid="services-page">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("pageLead")}</p>
      </header>
      <ServiceOfferingsSection
        initialRows={rows}
        needsMigration={needsMigration}
        labels={labels}
      />
    </div>
  );
}
