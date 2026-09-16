import { setRequestLocale, getTranslations } from "next-intl/server";
import { UserSearch } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { listOwnCustomerRequests } from "@/lib/buyer/customer-requests";
import { listClaimablePublicIntakes } from "@/lib/company/claim-public-intake";
import { listPendingInterestCountsForCompany } from "@/lib/opportunities/interest";
import { readDemandReadbackLabels } from "@/lib/company/company-section-labels";
import { DemandRequestButton } from "@/components/app/demand-request-button";
import { DemandRequestsReadback } from "@/components/app/demand-requests-readback";
import { ClaimPublicIntakeCard } from "@/components/app/claim-public-intake-card";
import { PublicDemandSection } from "@/components/app/public-demand-section";
import { CompanyScoutingBridge } from "@/components/app/company-scouting-bridge";
import { CompanyNoProfileGuide } from "@/components/app/company-next-actions";

// W3 rows 7/8/25: the employer demand kinds the owner readback is scoped to —
// a dual-role user's buyer service requests stay in the buyer room.
const EMPLOYER_DEMAND_KINDS = ["company_request", "agency_offer"] as const;

/**
 * POREIKIAI — the organization's demand door (owner IA correction
 * 2026-09-16, design/final/03 §2).
 *
 * The CANONICAL demand intake (the full describe → criteria → review wizard,
 * structured v2, estimate builder, prefill, draft auto-continue) was the
 * first section of the company hub; it is the first section here, under the
 * same `#demand-intake` anchor every demand door in the product targets, so
 * `/dashboard/company/needs#demand-intake` is the one address for "I need
 * people". The readback of what was already asked for travels WITH it, and
 * matching is one door further (`/dashboard/company/scouting`) — the next
 * step is named at the top, never at the far end of a page.
 */
export default async function CompanyNeedsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const tNeeds = await getTranslations("organizationDoors.pages.needs");
  const tNeedsAgency = await getTranslations("organizationDoors.pages.needsAgency");
  const tWow = await getTranslations("auth.dashboard.wow");
  const tFlow = await getTranslations("auth.dashboard.wow.flow");
  const tReadback = await getTranslations("demandReadback");
  const tClaim = await getTranslations("companyClaimIntake");

  const employerCtx = await resolveEmployerCompanyContext();
  const companyProfile =
    employerCtx.kind === "ok" ? await getOwnedCompanyById(employerCtx.companyId) : null;
  const companyRow =
    companyProfile && companyProfile.kind === "ok" ? companyProfile.row : null;
  if (!companyRow) {
    return (
      <div className="flex flex-col gap-6" data-testid="company-needs">
        <CompanyNoProfileGuide />
      </div>
    );
  }
  const isStaffingAgency = companyRow.companyType === "staffing_agency";
  // SEP-4: an agency's page is about what it OFFERS; the wizard below runs
  // with the `partner` intent (agency_offer) for exactly that reason.
  const t = isStaffingAgency ? tNeedsAgency : tNeeds;
  const orgContext = await getActiveOrganizationContext();
  const capabilityOrgId =
    orgContext.organizations.find((o) => o.legacyCompanyId === companyRow.id)?.id ??
    orgContext.activeOrganizationId;
  const declaredCapabilities = capabilityOrgId
    ? await readOrganizationCapabilities(capabilityOrgId)
    : [];

  const [demandReadback, claimableIntakes, rPendingInterest, readbackLabels] =
    await Promise.all([
      listOwnCustomerRequests(EMPLOYER_DEMAND_KINDS),
      listClaimablePublicIntakes(),
      listPendingInterestCountsForCompany(),
      readDemandReadbackLabels(),
    ]);

  // WHO IS WAITING — one localized line per demand that has hands raised.
  // Resolved here because the plural form is a locale rule.
  const pendingInterest = new Map<string, { count: number; label: string }>();
  for (const [requestId, count] of rPendingInterest) {
    if (count > 0) {
      pendingInterest.set(requestId, {
        count,
        label: tReadback("interestWaiting", { count }),
      });
    }
  }

  // Intent follows the company's own type: a staffing agency supplies
  // candidates (partner), any other company hires (hire_workers).
  const demandIntent = isStaffingAgency ? ("partner" as const) : ("hire_workers" as const);
  const demandPilotKey = demandIntent === "hire_workers" ? "hire" : "partner";

  return (
    <div className="flex flex-col gap-6" data-testid="company-needs">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {/* THE NEXT STEP FIRST: matching lives one door further. */}
      <Link
        href="/dashboard/company/scouting"
        data-testid="company-needs-matching-door"
        className="flex items-center gap-3 rounded-card border border-ink-600 bg-ink-800/40 px-4 py-3 transition-colors hover:border-brand-blue"
      >
        <UserSearch className="h-5 w-5 shrink-0 text-brand-cyan" aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold text-text-primary">{tNeeds("matchingDoor")} →</span>
          <span className="text-xs text-text-secondary">{tNeeds("matchingNote")}</span>
        </span>
      </Link>

      {/* The CANONICAL demand intake. #demand-intake is the stable anchor
          every demand door in the product targets. Position pinned by
          `lib/guards/company-demand-first-action.test.ts`. */}
      <section
        id="company-requests"
        className="card-border flex flex-col gap-5 p-5 scroll-mt-20 sm:p-6"
        data-testid="company-dashboard-first-action"
      >
        <div
          id="demand-intake"
          data-testid="demand-intake-section"
          className="flex flex-col gap-5 scroll-mt-20"
        >
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
              <span className="live-dot" aria-hidden />
              {tFlow("company.eyebrow")}
            </span>
            <h2 className="font-display text-2xl font-semibold tracking-tightest text-text-primary">
              {tWow(`demand.${demandPilotKey}.title`)}
            </h2>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-secondary">
              {tWow(`demand.${demandPilotKey}.body`)}
            </p>
          </div>
          <DemandRequestButton
            intent={demandIntent}
            stepTitles={[tFlow("company.c1"), tFlow("company.c2"), tFlow("company.c3")]}
          />
          {/* Static-stepper honesty note (guarded): the steps show progress,
              they are not live modules. */}
          <p
            className="text-meta leading-relaxed text-text-muted"
            data-testid="journey-progress-helper"
          >
            {tWow("demand.progressHelper")}
          </p>
        </div>
      </section>

      {/* The ONE owner readback of what this organisation already asked for —
          honest stored status only, with the per-demand scouting deep link. */}
      <DemandRequestsReadback
        result={demandReadback}
        labels={readbackLabels}
        locale={locale}
        pendingInterest={pendingInterest}
      />

      {/* Canonical-journey P3 — claim bridge: the caller's own PUBLIC
          /company-need submissions continue here as a real draft demand. */}
      {claimableIntakes.length > 0 ? (
        <div id="company-claims" className="scroll-mt-20">
          <ClaimPublicIntakeCard
            locale={locale}
            intakes={claimableIntakes}
            labels={{
              title: tClaim("title"),
              body: tClaim("body"),
              claimCta: tClaim("claimCta"),
              claimed: tClaim("claimed"),
              error: tClaim("error"),
              workersLabel: tClaim("workersLabel"),
            }}
          />
        </div>
      ) : null}

      {/* Real market demand on the first session (never an empty
          marketplace): the public vacancy pool for staffing agencies and
          education institutions, with its provenance stated on the card. */}
      {isStaffingAgency || declaredCapabilities.includes("training_provider") ? (
        <PublicDemandSection audience={isStaffingAgency ? "agency" : "institution"} />
      ) : null}

      <CompanyScoutingBridge />
    </div>
  );
}
