import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { listAgencyClients, listAgencyDemands } from "@/lib/agency/clients";
import {
  listAgencyConnections,
  listMyConnectionInvites,
  listSharedRequestsByClient,
  listSharedRequestsForAgency,
  listAgencyOfferProgress,
} from "@/lib/agency/bridge-read";
import {
  readAgencyBridgeLabels,
  readAgencyClientsLabels,
  readClientBridgeLabels,
} from "@/lib/company/company-section-labels";
import { AgencyClientsSection } from "@/components/app/agency-clients-section";
import { AgencyBridgeSection } from "@/components/app/agency-bridge-section";
import { ClientAgencyBridgeSection } from "@/components/app/client-agency-bridge-section";
import { CompanyNoProfileGuide } from "@/components/app/company-next-actions";
import { resolveDemandTitle } from "@/lib/demand/sanitize-demand-title";

/**
 * KLIENTAI IR PARTNERIAI — the relationship door (owner IA correction
 * 2026-09-16, design/final/03 §2).
 *
 * A staffing agency sees its operating mode, its client records and the real
 * two-subject bridge (invite a client company, see only shared requests,
 * offer a roster worker, watch the derived stage). Any other organization
 * sees the client side of that same bridge — the agencies that invited it and
 * the requests it chose to share. Same components, same reads as the hub;
 * the door exists only when the relationship exists (`loadOrganizationDoors`).
 */
export default async function CompanyPartnersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("organizationDoors.pages.partners");
  const tCompany = await getTranslations("roleDashboards.company");
  // A stored placeholder title ("Hiring workers — demand") is English on every
  // row; the display seam renders the locale's label instead (P1-6).
  const tReadback = await getTranslations("demandReadback");
  const syntheticTitle = {
    hiringWorkers: tReadback("syntheticTitle.hiringWorkers"),
    agencyPartnership: tReadback("syntheticTitle.agencyPartnership"),
  };
  const localizeTitles = <T extends { readonly title: string }>(
    state: { kind: "ok"; rows: readonly T[] } | { kind: string },
  ) =>
    state.kind === "ok" && "rows" in state
      ? {
          ...state,
          rows: (state as { rows: readonly T[] }).rows.map((r) => ({
            ...r,
            title: resolveDemandTitle(r.title, syntheticTitle),
          })),
        }
      : state;

  const employerCtx = await resolveEmployerCompanyContext();
  const companyProfile =
    employerCtx.kind === "ok" ? await getOwnedCompanyById(employerCtx.companyId) : null;
  const companyRow =
    companyProfile && companyProfile.kind === "ok" ? companyProfile.row : null;
  if (!companyRow) {
    return (
      <div className="flex flex-col gap-6" data-testid="company-partners">
        <CompanyNoProfileGuide />
      </div>
    );
  }
  const isStaffingAgency = companyRow.companyType === "staffing_agency";
  const ownCompany = { id: companyRow.id };

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="text-sm text-text-secondary">{t("subtitle")}</p>
    </header>
  );

  if (isStaffingAgency) {
    const [
      agencyClientsState,
      agencyDemandsState,
      bridgeConnections,
      bridgeShared,
      bridgeProgress,
      workersResult,
      agencyClientsLabels,
      agencyBridgeLabels,
    ] = await Promise.all([
      listAgencyClients(),
      listAgencyDemands(),
      listAgencyConnections(ownCompany.id),
      listSharedRequestsForAgency(),
      listAgencyOfferProgress(),
      listActiveCompanyWorkers(ownCompany.id),
      readAgencyClientsLabels(),
      readAgencyBridgeLabels(),
    ]);
    const bridgeRosterOptions =
      workersResult.kind === "ok"
        ? workersResult.rows
            .filter((w) => w.status === "active")
            .map((w) => ({
              workerId: w.workerId,
              label:
                w.displayName ??
                (w.email ? w.email.split("@")[0] : `#${w.workerId.slice(0, 6)}`),
            }))
        : [];
    return (
      <div className="flex flex-col gap-6" data-testid="company-partners">
        {header}
        {/* Staffing-agency operating MODE (Direction A, owner decision
            2026-07-05): an agency is this same company profile with
            company_type='staffing_agency' — never a separate dashboard. The
            three actions are the agency's doors: its people, its offer, its
            scouting. */}
        <div id="company-agency" className="flex flex-col gap-6 scroll-mt-20">
          <section
            className="card-border flex flex-col gap-3 p-5"
            data-testid="company-agency-mode"
          >
            <header className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-semibold text-text-primary">
                {tCompany("agencyMode.title")}
              </h2>
              <p className="text-sm text-text-secondary">{tCompany("agencyMode.intro")}</p>
            </header>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { key: "roster", href: "/dashboard/company/people#company-team" },
                { key: "offer", href: "/dashboard/company/needs#demand-intake" },
                { key: "scouting", href: "/dashboard/company/scouting" },
              ].map((a) => (
                <Link
                  key={a.key}
                  href={a.href as "/dashboard"}
                  data-testid={`company-agency-mode-action-${a.key}`}
                  className="flex min-h-[3.25rem] w-full flex-col rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:border-brand-blue"
                >
                  <span className="font-semibold">
                    {tCompany(`agencyMode.actions.${a.key}.label`)}
                  </span>
                  <span className="text-xs text-text-muted">
                    {tCompany(`agencyMode.actions.${a.key}.note`)}
                  </span>
                </Link>
              ))}
            </div>
            <p
              className="text-meta leading-relaxed text-text-muted"
              data-testid="company-agency-mode-legacy-note"
            >
              {tCompany("agencyMode.legacyNote")}
            </p>
          </section>
          {/* P5 "Klientai": client → need → candidates path for the agency. */}
          <AgencyClientsSection
            clients={agencyClientsState}
            demands={localizeTitles(agencyDemandsState) as typeof agencyDemandsState}
            locale={locale}
            labels={agencyClientsLabels}
          />
          {/* REAL two-subject bridge (issue #859) — agency side. */}
          <AgencyBridgeSection
            agencyCompanyId={ownCompany.id}
            connections={bridgeConnections}
            shared={localizeTitles(bridgeShared) as typeof bridgeShared}
            progress={bridgeProgress}
            roster={bridgeRosterOptions}
            labels={agencyBridgeLabels}
            locale={locale}
          />
        </div>
      </div>
    );
  }

  // Client side: a real (non-agency) company accepts a staffing agency's
  // connection, shares specific OWN requests, and reviews proposed candidates
  // on its OWN scouting surface.
  const [clientInvites, clientDemands, clientBridgeLabels] = await Promise.all([
    listMyConnectionInvites(),
    listAgencyDemands(),
    readClientBridgeLabels(),
  ]);
  const clientBridgeDemands =
    clientDemands.kind === "ok"
      ? clientDemands.rows.map((d) => ({
          id: d.id,
          title: resolveDemandTitle(d.title, syntheticTitle),
        }))
      : [];
  const rawShares =
    clientInvites.kind === "ok"
      ? await listSharedRequestsByClient(
          clientInvites.rows.filter((r) => r.status === "active").map((r) => r.id),
        )
      : ({ kind: "ok", rows: [] } as const);
  const clientBridgeShares = localizeTitles(rawShares) as typeof rawShares;

  return (
    <div className="flex flex-col gap-6" data-testid="company-partners">
      {header}
      {clientInvites.kind === "ok" && clientInvites.rows.length > 0 ? (
        <div id="company-partners-bridge" className="scroll-mt-20">
          <ClientAgencyBridgeSection
            invites={clientInvites}
            clientCompanyId={ownCompany.id}
            demands={clientBridgeDemands}
            shared={clientBridgeShares}
            labels={clientBridgeLabels}
          />
        </div>
      ) : (
        <p
          className="rounded-card border border-dashed border-ink-500 p-4 text-sm text-text-secondary"
          data-testid="company-partners-empty"
        >
          {t("empty")}
        </p>
      )}
    </div>
  );
}
