import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { AuthCtaLink } from "@/components/layouts/auth-cta-link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("companyNeed", locale, "/company-need");
}
import { buttonLinkClassName } from "@/components/ui/Button";
import {
  CompanyNeedForm,
  type CompanyNeedFormLabels,
} from "@/components/app/company-need-form";
import { buildWorkCategoryOptions } from "@/lib/taxonomy/work-categories";
import { READINESS_COUNTRIES } from "@/lib/country-readiness/types";

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
    contactPerson: t("contactPerson"),
    contactPersonHelp: t("contactPersonHelp"),
    contactEmail: t("contactEmail"),
    contactEmailHelp: t("contactEmailHelp"),
    profession: t("profession"),
    country: t("country"),
    countryHelp: t("countryHelp"),
    cityRegion: t("cityRegion"),
    cityRegionHelp: t("cityRegionHelp"),
    numberOfWorkers: t("numberOfWorkers"),
    startDate: t("startDate"),
    expectedDuration: t("expectedDuration"),
    expectedDurationHelp: t("expectedDurationHelp"),
    urgency: t("urgency"),
    urgencyAsap: t("urgencyAsap"),
    urgencyWeeks: t("urgencyWeeks"),
    urgencyFlexible: t("urgencyFlexible"),
    preparedTitle: t("preparedTitle"),
    preparedBody: t("preparedBody"),
    receivedTitle: t("receivedTitle"),
    receivedBody: t("receivedBody"),
    partnerRouteTitle: t("partnerRouteTitle"),
    partnerRouteBody: t("partnerRouteBody"),
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

  // Constrained country choice — the current target markets (same set as
  // lib/country-readiness), localized display names from the catalog. No
  // free-text ISO-code guessing, no big country-database dependency.
  const countryOptions = READINESS_COUNTRIES.map((code) => ({
    code,
    label: t(`countries.${code}`),
  }));

  return (
    <div
      className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-14 sm:px-12"
      id="main-content"
    >
      {/* Honest-capability note ABOVE the form (nav/funnel consistency PR):
          this public step prepares a reviewable draft; nothing is saved or
          published here. The real submission happens after signup (bridge
          below). */}
      <p
        className="card-border p-4 text-sm leading-relaxed text-text-secondary"
        data-testid="company-need-honest-note"
      >
        {t("honestNote")}
      </p>

      <CompanyNeedForm
        labels={labels}
        categories={categories}
        countryOptions={countryOptions}
      />

      {/* Funnel bridge: this public form only previews/drafts (no persistence).
          To post a real need and run scouting/matching, the employer continues
          into the real account + dashboard demand flow. */}
      <div className="card-border flex flex-col gap-3 p-5" data-testid="need-bridge">
        <p className="text-sm leading-relaxed text-text-secondary">{t("bridgeNote")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* AuthCtaLink (plain <a>, not the SPA Link): auth is a full-page
              boundary. Single-domain policy: the link stays relative — the
              whole flow lives on labourmarket.ai. */}
          <AuthCtaLink
            relPath={`/${locale}/auth/signup`}
            className={buttonLinkClassName()}
          >
            {t("bridgeSignup")} →
          </AuthCtaLink>
          <AuthCtaLink
            relPath={`/${locale}/auth/login`}
            className={buttonLinkClassName("secondary")}
          >
            {t("bridgeLogin")}
          </AuthCtaLink>
        </div>
      </div>
    </div>
  );
}
