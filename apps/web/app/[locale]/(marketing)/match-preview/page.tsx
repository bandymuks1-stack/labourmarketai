import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  MatchPreviewForm,
  type MatchPreviewLabels,
} from "@/components/app/match-preview-form";
import { buildWorkCategoryOptions } from "@/lib/taxonomy/work-categories";

/**
 * Match preview (Staffing Operating Model v1, PR8). NON-PERSISTED. Enter a
 * worker's facts + a company need → deterministic fit + an AI fit explanation.
 * Clearly "preview only — not booked / not saved as a booking request". No
 * booking, no persistence, no contact, no migration. Work-type options come
 * from the shared multi-sector taxonomy (lib/taxonomy/work-categories).
 */

export default async function MatchPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("matchPreview");

  const labels: MatchPreviewLabels = {
    title: t("title"),
    subtitle: t("subtitle"),
    previewOnly: t("previewOnly"),
    workerSection: t("workerSection"),
    needSection: t("needSection"),
    trade: t("trade"),
    wAvailable: t("wAvailable"),
    wAccommodation: t("wAccommodation"),
    wAccNeeds: t("wAccNeeds"),
    wAccOwn: t("wAccOwn"),
    wTransport: t("wTransport"),
    wTrHas: t("wTrHas"),
    wTrPickup: t("wTrPickup"),
    wLanguages: t("wLanguages"),
    nCountry: t("nCountry"),
    nStart: t("nStart"),
    nAccommodation: t("nAccommodation"),
    nAccProvided: t("nAccProvided"),
    nAccNone: t("nAccNone"),
    nTransport: t("nTransport"),
    nLanguages: t("nLanguages"),
    nAcceptsNonEnglish: t("nAcceptsNonEnglish"),
    yes: t("yes"),
    no: t("no"),
    submit: t("submit"),
    scoreTitle: t("scoreTitle"),
    fit: t("fit"),
    mismatch: t("mismatch"),
    unknown: t("unknown"),
    of: t("of"),
    dimProfession: t("dimProfession"),
    dimAccommodation: t("dimAccommodation"),
    dimTransport: t("dimTransport"),
    dimLanguage: t("dimLanguage"),
    dimStartDate: t("dimStartDate"),
    verdictFit: t("verdictFit"),
    verdictMismatch: t("verdictMismatch"),
    verdictUnknown: t("verdictUnknown"),
    blockersTitle: t("blockersTitle"),
    aiBadge: t("aiBadge"),
    aiExplanationTitle: t("aiExplanationTitle"),
    aiDisabled: t("aiDisabled"),
    aiNone: t("aiNone"),
    statusInvalid: t("statusInvalid"),
  };

  const categories = buildWorkCategoryOptions(locale);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-12" id="main-content">
      <MatchPreviewForm labels={labels} categories={categories} />
    </div>
  );
}
