import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import {
  CompanyNeedForm,
  type CompanyNeedFormLabels,
} from "@/components/app/company-need-form";
import { buildWorkCategoryOptions } from "@/lib/taxonomy/work-categories";

/**
 * Company need / vacancy page (Staffing Operating Model v1, PR4 UI / PR10).
 * A company describes the workers it needs and gets a normalized vacancy DRAFT
 * as a labelled AI suggestion (disabled until the owner enables a provider).
 * Nothing is published here; the company reviews the draft.
 */
export default async function CompanyNeedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("companyNeed");

  const labels: CompanyNeedFormLabels = {
    title: t("title"),
    subtitle: t("subtitle"),
    companyName: t("companyName"),
    profession: t("profession"),
    country: t("country"),
    countryHelp: t("countryHelp"),
    numberOfWorkers: t("numberOfWorkers"),
    startDate: t("startDate"),
    accommodation: t("accommodation"),
    accFree: t("accFree"),
    accPaid: t("accPaid"),
    accDeducted: t("accDeducted"),
    accNone: t("accNone"),
    transport: t("transport"),
    transportYes: t("transportYes"),
    transportNo: t("transportNo"),
    languages: t("languages"),
    languagesHelp: t("languagesHelp"),
    engagement: t("engagement"),
    engEmployment: t("engEmployment"),
    engSubcontracting: t("engSubcontracting"),
    engAgency: t("engAgency"),
    description: t("description"),
    descriptionHelp: t("descriptionHelp"),
    submit: t("submit"),
    aiBadge: t("aiBadge"),
    aiNotVerified: t("aiNotVerified"),
    aiDisabled: t("aiDisabled"),
    aiRole: t("aiRole"),
    aiSkills: t("aiSkills"),
    aiDocs: t("aiDocs"),
    aiMissing: t("aiMissing"),
    aiBlockers: t("aiBlockers"),
    aiNone: t("aiNone"),
    statusInvalid: t("statusInvalid"),
    statusError: t("statusError"),
  };

  const categories = buildWorkCategoryOptions(locale);

  return (
    <div
      className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-14 sm:px-12"
      id="main-content"
    >
      <CompanyNeedForm labels={labels} categories={categories} />

      {/* Funnel bridge: this public form only previews/drafts (no persistence).
          To post a real need and run scouting/matching, the employer continues
          into the real account + dashboard demand flow. */}
      <div className="card-border flex flex-col gap-3 p-5" data-testid="need-bridge">
        <p className="text-sm leading-relaxed text-text-secondary">{t("bridgeNote")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/auth/signup">
            <Button>{t("bridgeSignup")} →</Button>
          </Link>
          <Link href="/auth/login">
            <Button variant="secondary">{t("bridgeLogin")}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
