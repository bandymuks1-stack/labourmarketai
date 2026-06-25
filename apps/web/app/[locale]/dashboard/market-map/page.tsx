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
  const [preferred, login, demand, availability, capabilities] = await Promise.all([
    listOwnPreferredLocations(),
    getOwnLoginConsent(),
    listOwnDemandLocations(),
    getOwnAvailability(),
    getOwnCapabilities(),
  ]);
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
      <FeatureNote testId="feature-note-market-map">
        {tNote("marketplaceMap")}
      </FeatureNote>
      {/* CANONICAL map FIRST — the provider-free location coordinate map
          (coordinate-map v1: real coordinates + search radius, no tile/street
          layer, no external provider). This is the primary surface of the page;
          everything below is secondary and must not lead the flow. */}
      <MarketMapBase />
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
