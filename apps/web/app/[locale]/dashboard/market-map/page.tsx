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
  // Active identity context (map-first marker correction): personal vs company.
  // In company context the marker must show the COMPANY, never the personal
  // username. Company location has no confirmed-coordinate data model yet, so
  // company context renders an honest "location not added" note + NO marker.
  const activeRole = profileRes.data?.active_role ?? null;
  const isCompanyContext = activeRole === "company" || activeRole === "agency";
  const companyRead = isCompanyContext ? await getOwnCompany() : null;
  const companyRow =
    companyRead && companyRead.kind === "ok" ? companyRead.row : null;
  const companyName =
    companyRow?.displayName?.trim() || companyRow?.legalName?.trim() || null;
  // The user's OWN identity for the premium map marker (real data only). Name
  // falls back to the email local-part; initial is the first letter. Never any
  // other user's identity, never a fake signal.
  const ownName =
    profileRes.data?.full_name?.trim() ||
    (profileRes.data?.email ? profileRes.data.email.split("@")[0] : "") ||
    (user.email ? user.email.split("@")[0] : "");
  // PERSONAL context → person marker (real own name + avatar). COMPANY context →
  // no person marker (suppressed); the company has no confirmed location signal
  // yet, so we show an honest note instead of a fake company point.
  const mapIdentity =
    !isCompanyContext && ownName
      ? {
          kind: "person" as const,
          name: ownName,
          initial: ownName.slice(0, 1).toUpperCase(),
          avatarUrl: avatar.signedUrl,
          statusLabel: tMap("markerYou"),
        }
      : undefined;
  // Company context currently never has a confirmed location → suppress any
  // own-marker so the personal location is never shown as the company.
  const suppressOwnMarker = isCompanyContext;
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
      {/* Company context (active company identity). No confirmed company
          location signal exists yet → honest "location not added" state, never
          a fake company marker and never the personal username. */}
      {isCompanyContext && (
        <section
          className="card-border flex flex-col gap-1 p-3"
          data-testid="market-map-company-context"
        >
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {tMap("companyContext.title")}
          </span>
          {companyName && (
            <span className="text-sm font-semibold text-text-primary">
              {companyName}
            </span>
          )}
          <span className="text-sm text-text-secondary">
            {tMap("companyContext.missingLocation")}
          </span>
          <span className="text-xs leading-relaxed text-text-muted">
            {tMap("companyContext.missingLocationHint")}
          </span>
        </section>
      )}
      {/* CANONICAL map FIRST — the provider-free location coordinate map. Map is
          the dominant element (tall on mobile); the honest feature note is moved
          BELOW the map so intro text never pushes the map down the screen.
          Marker respects the active identity (person marker in personal context;
          suppressed in company context until a real company location exists). */}
      <MarketMapBase identity={mapIdentity} suppressOwnMarker={suppressOwnMarker} />
      <FeatureNote testId="feature-note-market-map">
        {tNote("marketplaceMap")}
      </FeatureNote>
      {/* Layers legend (map-first product direction): honestly states which
          market layers are REAL/visible today vs which are preparing (disabled
          chips) — companies, teams, opportunities, work needs, services,
          rentals, shops/offers, availability, trust. No fake markers/data. */}
      <MapLayersLegend
        labels={{
          title: tLayers("title"),
          intro: tLayers("intro"),
          visibleNow: tLayers("visibleNow"),
          futureLayers: tLayers("futureLayers"),
          futureBadge: tLayers("futureBadge"),
          visibleItems: [tLayers("items.selfSignal")],
          futureItems: [
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
      {/* Compact control center: the real map + its controls are the ONE
          primary surface. Every secondary surface (signal board, owner
          readiness, capture forms, conceptual world overview) is collapsed
          behind "Išsamiau" so entering the page reads as one clear room, not a
          warehouse of panels. Nothing is removed — only progressively disclosed. */}
      <details className="group flex flex-col gap-4" data-testid="market-map-advanced">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted group-open:hidden">+</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-label text-text-muted group-open:inline">−</span>
          {tMap("advanced")}
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <MarketMapShell />
          <MarketMapOwnerReadiness availability={availability} capabilities={capabilities} />
          <MarketMapCapture preferred={preferred} login={login} demand={demand} />
          <LabourMarketWorldMap />
        </div>
      </details>
    </div>
  );
}
