import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnCustomer } from "@/lib/buyer/customers";
import { BuyerSetupForm } from "@/components/app/buyer-setup-form";

/**
 * Stage 2 PR 1 — Buyer / customer setup (real persistence).
 *
 * Renders the real setup form backed by public.customers via the
 * save_customer_setup RPC. When migration 0026 is not yet applied
 * on prod, getOwnCustomer() returns kind: "needs-migration" and the
 * page surfaces an explicit blocker banner (mirroring the PR #99
 * agency-side pattern). After the migration is applied, the form
 * persists to the DB without any code change.
 */

export default async function BuyerStartPage({
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

  const t = await getTranslations("roleDashboards.buyer.setup");
  const customerRead = await getOwnCustomer();
  const migrationNeeded = customerRead.kind === "needs-migration";
  const customer = customerRead.kind === "ok" ? customerRead.row : null;

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  const formLabels = {
    title: t("formTitle"),
    subtitle: t("formSubtitle"),
    contactName: t("contactName"),
    contactNameHelp: t("contactNameHelp"),
    customerType: t("customerType"),
    customerTypeOptions: {
      individual: t("customerTypeOptions.individual"),
      small_business: t("customerTypeOptions.small_business"),
      nonprofit: t("customerTypeOptions.nonprofit"),
      other: t("customerTypeOptions.other"),
    },
    country: t("country"),
    countryPlaceholder: t("countryPlaceholder"),
    market: t("market"),
    marketPlaceholder: t("marketPlaceholder"),
    needSummary: t("needSummary"),
    needSummaryHelp: t("needSummaryHelp"),
    contactPreference: t("contactPreference"),
    contactPreferenceOptions: {
      email: t("contactPreferenceOptions.email"),
      phone: t("contactPreferenceOptions.phone"),
      platform_message: t("contactPreferenceOptions.platform_message"),
    },
    manualReviewNote: t("manualReviewNote"),
    manualReviewNoteHelp: t("manualReviewNoteHelp"),
    submit: t("submit"),
    statusSaved: t("statusSaved"),
    statusNeedsMigration: t("statusNeedsMigration"),
    statusInvalid: t("statusInvalid"),
    statusError: t("statusError"),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="buyer-start-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {label("PIRKĖJO BŪSENA", "BUYER STATE")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {label("Pirkėjo / kliento paskyra", "Buyer / client account")}
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
          data-testid="buyer-start-migration-blocker"
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

      {customer ? (
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="buyer-start-existing"
        >
          <header className="flex items-center gap-2">
            <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
              {label("✓ Pradėta", "✓ Started")}
            </span>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("existingHeading")}
            </h2>
          </header>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">{t("contactName")}</dt>
              <dd className="text-text-primary">{customer.contactName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("customerType")}</dt>
              <dd className="text-text-primary">
                {t(`customerTypeOptions.${customer.customerType}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("country")}</dt>
              <dd className="text-text-primary">{customer.country ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("market")}</dt>
              <dd className="text-text-primary">{customer.market ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("contactPreference")}</dt>
              <dd className="text-text-primary">
                {t(`contactPreferenceOptions.${customer.contactPreference}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t("reviewStatus")}</dt>
              <dd className="text-text-primary">
                {t(`reviewStatusOptions.${customer.reviewStatus}`)}
              </dd>
            </div>
          </dl>
          <Link
            href={"/dashboard/buyer" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="buyer-start-goto-buyer-dashboard"
          >
            {label("Atidaryti pirkėjo dashboardą →", "Open buyer dashboard →")}
          </Link>
        </section>
      ) : null}

      <section
        className="card-border flex flex-col gap-4 p-5"
        data-testid="buyer-start-form-section"
      >
        <BuyerSetupForm existing={customer} labels={formLabels} />
      </section>
    </div>
  );
}
