import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CompanyNeedForm,
  type CompanyNeedFormLabels,
} from "@/components/app/company-need-form";

/**
 * Company need / vacancy page (Staffing Operating Model v1, PR4 UI / PR10).
 * A company describes the workers it needs and gets a normalized vacancy DRAFT
 * as a labelled AI suggestion (disabled until the owner enables a provider).
 * Nothing is published here; the company reviews the draft.
 */
const NEED_PROFESSIONS = [
  "general_laborer",
  "carpenter",
  "concrete_worker",
  "drywaller",
  "electrician",
  "mason",
  "painter",
  "plumber",
  "rebar_worker",
  "roofer",
  "tiler",
  "welder",
] as const;

export default async function CompanyNeedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("companyNeed");
  const tp = await getTranslations("professions");

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

  const professions = NEED_PROFESSIONS.map((slug) => ({ slug, label: tp(slug) }));

  return (
    <div className="mx-auto max-w-2xl px-6 py-14 sm:px-12" id="main-content">
      <CompanyNeedForm labels={labels} professions={professions} />
    </div>
  );
}
