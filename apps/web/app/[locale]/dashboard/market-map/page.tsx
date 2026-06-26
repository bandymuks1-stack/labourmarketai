import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { MarketMapShell } from "@/components/app/market-map-shell";
import { MarketMapBase } from "@/components/app/market-map-base";
import { LabourMarketWorldMap } from "@/components/app/labour-market-world-map";
import { MarketMapCapture } from "@/components/app/market-map-capture";
import { MarketMapOwnerReadiness } from "@/components/app/market-map-owner-readiness";
import { MapLayersLegend } from "@/components/app/map-layers-legend";
import {
  listOwnPreferredLocations,
  getOwnLoginConsent,
  listOwnDemandLocations,
} from "@/lib/market-map/capture";
import {
  getOwnAvailability,
  getOwnCapabilities,
} from "@/lib/market-map/owner-readiness";
import { FeatureNote } from "@/components/app/feature-note";
import { getOwnAvatar } from "@/lib/profile/avatar";
import { getOwnCompany } from "@/lib/company/company-setup";

/**
 * Live market map — FOUNDATION route (v1). Authenticated (under /dashboard,
 * which the middleware gates; the explicit getUser check is belt-and-suspenders
 * and mirrors the other dashboard rooms). Renders the honest map shell — no
 * fake markers, no external map API / key, no DB geo reads yet (none exist).
 */
export default async function MarketMapPage({
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

  const tNote = await getTranslations("featureNotes");
  const tMap = await getTranslations("marketMap");
  const tLayers = await getTranslations("mapLayers");
  // Owner-scoped current state for the capture forms (RLS — caller's own rows).
  const [preferred, login, demand, availability, capabilities, profileRes, avatar] =
    await Promise.all([
      listOwnPreferredLocations(),
      getOwnLoginConsent(),
      listOwnDemandLocations(),
      getOwnAvailability(),
      getOwnCapabilities(),
      supabase
        .from("profiles")
        .select("full_name, email, active_role")
        .eq("id", user.id)
        .single(),
      getOwnAvatar(),
    ]);
  // ONE unified market map. The active identity only changes which LAYER is
  // focused — never whether a separate map exists. The personal "my person
  // signal" marker stays visible whenever the user has a real location; the
  // company is an additional layer/panel on the SAME map (incomplete when it
  // has no confirmed location — never a fake company point, never the personal
  // marker relabelled as the company).
  const activeRole = profileRes.data?.active_role ?? null;
  const isCompanyContext = activeRole === "company" || activeRole === "agency";
  const companyRead = isCompanyContext ? await getOwnCompany() : null;
  const companyRow =
    companyRead && companyRead.kind === "ok" ? companyRead.row : null;
  const companyName =
    companyRow?.displayName?.trim() || companyRow?.legalName?.trim() || null;
  // The user's OWN person identity for the player-card marker (real data only).
  // ALWAYS built — the personal layer is never suppressed by company context.
  const ownName =
    profileRes.data?.full_name?.trim() ||
    (profileRes.data?.email ? profileRes.data.email.split("@")[0] : "") ||
    (user.email ? user.email.split("@")[0] : "");
  // Real player-card signals for the own marker (no fabrication): availability
  // only when the worker really set a status, and the confirmed-skills count
  // straight from worker_skills.verified. Both omitted/zero → no badge shown.
  const availabilityLabel =
    availability.hasWorker && availability.state !== "unknown"
      ? tMap(`markerAvail.${availability.state}`)
      : null;
  const verifiedSkillsCount = capabilities.counts.confirmed;
  const mapIdentity = ownName
    ? {
        kind: "person" as const,
        name: ownName,
        initial: ownName.slice(0, 1).toUpperCase(),
        avatarUrl: avatar.signedUrl,
        statusLabel: tMap("markerYou"),
        availabilityLabel,
        verifiedSkillsCount,
      }
    : undefined;
  // Own needs/demands carry NO coordinates (capture stores country/region only),
  // so they are an honest "not on map yet" panel row, never fake points.
  const needsCount = Array.isArray(demand) ? demand.length : 0;
  // Unified visible-now layer rows (real state only — no fake markers).
  const visibleRows: {
    label: string;
    state: "active" | "incomplete" | "off-map";
    hint?: string;
  }[] = [
    {
      label: `${tLayers("personSignal")}${ownName ? `: ${ownName}` : ""}`,
      state: "active",
    },
  ];
  if (isCompanyContext) {
    visibleRows.push({
      label: `${tLayers("companyLayer")}${companyName ? `: ${companyName}` : ""}`,
      state: "incomplete",
      hint: tLayers("companyIncomplete"),
    });
  }
  if (needsCount > 0) {
    visibleRows.push({
      label: `${tLayers("needsLayer")} (${needsCount})`,
      state: "off-map",
      hint: tLayers("notOnMapYet"),
    });
  }
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1" data-testid="market-map-page-header">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {tMap("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {tMap("pageLead")}
        </p>
      </header>
      {/* ONE unified map — the dominant, app-like surface (tall on mobile). The
          personal player-card marker is ALWAYS shown when a real location
          exists; the active context only changes the focused layer/panel below,
          never whether a separate map exists. */}
      <MarketMapBase identity={mapIdentity} />
      {/* Unified layers panel — the real visible-now layers WITH state on the
          SAME map: my person signal (active), the selected company (incomplete
          when it has no confirmed location), own needs (off-map until
          coordinates exist) + disabled future layers. No fake markers/data. */}
      <MapLayersLegend
        labels={{
          title: tLayers("title"),
          intro: tLayers("intro"),
          visibleNow: tLayers("visibleNow"),
          futureLayers: tLayers("futureLayers"),
          futureBadge: tLayers("futureBadge"),
          visibleRows,
          futureItems: [
            tLayers("items.workers"),
            tLayers("items.companies"),
            tLayers("items.teams"),
            tLayers("items.opportunities"),
            tLayers("items.workNeeds"),
            tLayers("items.services"),
            tLayers("items.rentals"),
            tLayers("items.shops"),
            tLayers("items.availability"),
            tLayers("items.trust"),
          ],
        }}
      />
      {/* The map + legend above carry the signal visually. Everything below is
          a secondary "Manage my locations & market layers" panel, collapsed by
          default so the map dominates: it LEADS with the functional capture +
          readiness tools, and the explanatory signal board / world overview are
          demoted to the end (progressive disclosure, not the main carrier). */}
      <details className="group flex flex-col gap-4" data-testid="market-map-advanced">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted group-open:hidden">+</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-label text-text-muted group-open:inline">−</span>
          {tMap("advanced")}
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          {/* Functional tools first — manage your real locations + readiness. */}
          <MarketMapCapture preferred={preferred} login={login} demand={demand} />
          <MarketMapOwnerReadiness availability={availability} capabilities={capabilities} />
          {/* Explanatory surfaces demoted to the end — never the primary view. */}
          <FeatureNote testId="feature-note-market-map">
            {tNote("marketplaceMap")}
          </FeatureNote>
          <MarketMapShell />
          <LabourMarketWorldMap />
        </div>
      </details>
    </div>
  );
}
