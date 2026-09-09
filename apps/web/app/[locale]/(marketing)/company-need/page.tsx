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
import {
  buildWorkCategoryOptions,
  MARKET_COUNTRIES,
} from "@/lib/taxonomy/work-categories";

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
  const tCountries = await getTranslations("labourMarket");

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

  // ── THE MARKETS THIS FORM MAY NAME (owner readiness window, 2026-09-09) ──
  //
  // This list used to be `READINESS_COUNTRIES` — ten countries — under a
  // comment claiming it was "the current target markets". It stopped being
  // that on 2026-07-17, when GE/BE/FR/ES/AT/CH joined `ACTIVE_MARKETS`, and
  // again in 2026-07 when US did. `READINESS_COUNTRIES` answers a DIFFERENT
  // question: where researched, source-backed document/legal guidance exists
  // (see its own docblock). A market and a curated-guidance country are not
  // the same fact, and this select was answering the wrong one.
  //
  // The visible consequence, walked on production today: the landing's map
  // band tells a visitor "the 17 markets LabourMarket.ai operates in today"
  // and lists Belgium, France, Spain, Austria, Switzerland, Georgia and the
  // United States by name. The employer door is the very next click, and a
  // company in any of those seven could not say where it needs people. The
  // landing claimed a capability the first real action could not reach —
  // release-defect class §33.
  //
  // `MARKET_COUNTRIES` is the canonical set and its own docblock already
  // names this exact use ("the allowed country set for structured demand
  // intake"). The signed-in company workspace has read it all along, so this
  // aligns the public door with the workspace behind it rather than
  // inventing a third list. Display names come from the shared
  // `labourMarket.countryNames` catalogue — which carries all 17 in every
  // active locale — instead of `companyNeed.countries`, which carries only
  // the ten and would have rendered raw keys for the rest.
  //
  // Nothing widens downstream: `customer_requests.country` is free text with
  // no CHECK constraint, so this needs no migration, and this public form
  // persists nothing at all (it prepares a draft — see the honest note).
  const countryOptions = MARKET_COUNTRIES.map((code) => ({
    code,
    label: tCountries(`countryNames.${code}`),
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
