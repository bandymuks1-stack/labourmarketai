import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  WorkerIntakeForm,
  type WorkerIntakeFormLabels,
} from "@/components/app/worker-intake-form";

/**
 * Worker intake page (Staffing Operating Model v1, PR2 UI + PR10 AI display).
 * A real, usable intake: a worker enters their trade, availability and logistics
 * and gets an AI profile DRAFT as a labelled suggestion (disabled until the
 * owner enables a provider). Nothing is persisted here; the draft is reviewed.
 */

// Profession slugs known to exist in the shared professions taxonomy.
const INTAKE_PROFESSIONS = [
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

export default async function WorkerIntakePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("workerIntake");
  const tp = await getTranslations("professions");

  const labels: WorkerIntakeFormLabels = {
    title: t("title"),
    subtitle: t("subtitle"),
    fullName: t("fullName"),
    profession: t("profession"),
    targetCountries: t("targetCountries"),
    targetCountriesHelp: t("targetCountriesHelp"),
    availableFrom: t("availableFrom"),
    accommodation: t("accommodation"),
    accNeeds: t("accNeeds"),
    accHasOwn: t("accHasOwn"),
    accHelp: t("accHelp"),
    accShare: t("accShare"),
    transport: t("transport"),
    trHas: t("trHas"),
    trLicence: t("trLicence"),
    trPickup: t("trPickup"),
    trNone: t("trNone"),
    engagement: t("engagement"),
    engEmployee: t("engEmployee"),
    engZzp: t("engZzp"),
    engSubcontractor: t("engSubcontractor"),
    engBrigade: t("engBrigade"),
    engAgency: t("engAgency"),
    languages: t("languages"),
    languagesHelp: t("languagesHelp"),
    comment: t("comment"),
    commentHelp: t("commentHelp"),
    submit: t("submit"),
    aiBadge: t("aiBadge"),
    aiNotVerified: t("aiNotVerified"),
    aiDisabled: t("aiDisabled"),
    aiHeadline: t("aiHeadline"),
    aiSkills: t("aiSkills"),
    aiMissing: t("aiMissing"),
    aiNone: t("aiNone"),
    statusInvalid: t("statusInvalid"),
    statusError: t("statusError"),
    zzpHeading: t("zzpHeading"),
    zzpNote: t("zzpNote"),
    businessName: t("businessName"),
    vatNumber: t("vatNumber"),
    teamSize: t("teamSize"),
    teamProfessions: t("teamProfessions"),
    teamProfessionsHelp: t("teamProfessionsHelp"),
    tools: t("tools"),
    toolsHelp: t("toolsHelp"),
    insurance: t("insurance"),
    invoiceReady: t("invoiceReady"),
    invoiceYes: t("invoiceYes"),
    invoiceNo: t("invoiceNo"),
  };

  const professions = INTAKE_PROFESSIONS.map((slug) => ({
    slug,
    label: tp(slug),
  }));

  return (
    <div className="mx-auto max-w-2xl px-6 py-14 sm:px-12" id="main-content">
      <WorkerIntakeForm labels={labels} professions={professions} />
    </div>
  );
}
