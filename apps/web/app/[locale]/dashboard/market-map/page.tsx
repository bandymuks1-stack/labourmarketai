import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { MarketMapCapture } from "@/components/app/market-map-capture";
import { MarketMapOwnerReadiness } from "@/components/app/market-map-owner-readiness";
import {
  WorldDiscovery,
  type StaticLayer,
  type StaticLayerKey,
} from "@/components/app/market-map/world-discovery";
import { loadWorldView } from "@/lib/market-map/world-read";
import {
  DEFAULT_WORLD_BOUNDS,
  DEFAULT_WORLD_ZOOM,
} from "@/lib/market-map/world-model";
import { loadVacancyVolume } from "@/lib/market-map/vacancy-volume";
import { getOwnSpatialCollections } from "@/lib/market-map/spatial-read";
import { buildTerritoryView } from "@/lib/market-map/territory-view";
import {
  listOwnPreferredLocations,
  getOwnLoginConsent,
  listOwnDemandLocations,
} from "@/lib/market-map/capture";
import {
  getOwnAvailability,
  getOwnCapabilities,
} from "@/lib/market-map/owner-readiness";
import { getOwnAvatar } from "@/lib/profile/avatar";
import { personMonogram } from "@/lib/visual/avatar-monogram";

/**
 * THE ONE MAP (owner target: one map, not several).
 *
 * `WorldDiscovery` mounts the single canonical `MarketMap` (one Leaflet
 * engine, one instance on this page). Everything else is a CONTROL or a LAYER
 * of that one map, never a second map:
 *
 *  - location + radius: the compact control bar above the map; the saved
 *    location and its radius are drawn on the same map;
 *  - layers (filters): needs / people / projects from the viewport-bounded
 *    world read, plus public vacancies and the owner company's territory as
 *    layers of the same map — each offered ONLY when its data exists for this
 *    viewer (no placeholders, no "coming soon" catalogue);
 *  - open: each place leads to the opportunities list for that country.
 *
 * Authenticated (under /dashboard, which the middleware gates; the explicit
 * getUser check is belt-and-suspenders). RLS owns visibility on every read.
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

  const tMap = await getTranslations("marketMap");
  const tProfessions = await getTranslations("professions");
  const tMarketplace = await getTranslations("marketplace");
  const tRec = await getTranslations("marketRecognition");
  const tCountries = await getTranslations("labourMarket");
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
        .select("full_name, email")
        .eq("id", user.id)
        .single(),
      getOwnAvatar(),
    ]);

  // The canonical demand / people / projects reads, viewport-bounded and
  // clustered; first rendered for the default Europe viewport, then re-read by
  // the client for the real viewport on every pan/zoom. Public vacancy volume
  // (the caller's occupation) and the owner's company territory are read once
  // and offered as further layers of the SAME map.
  const [initialWorld, vacancyVolume, spatial] = await Promise.all([
    loadWorldView({
      bounds: DEFAULT_WORLD_BOUNDS,
      zoom: DEFAULT_WORLD_ZOOM,
      layer: "demand",
    }),
    loadVacancyVolume(),
    getOwnSpatialCollections(),
  ]);

  const countryName = (code: string) =>
    tCountries.has(`countryNames.${code}`) ? tCountries(`countryNames.${code}`) : code;

  const staticLayers: Partial<Record<StaticLayerKey, StaticLayer>> = {};
  if (vacancyVolume.kind === "ok") {
    const profession = tProfessions.has(vacancyVolume.data.professionSlug)
      ? tProfessions(vacancyVolume.data.professionSlug)
      : vacancyVolume.data.professionSlug;
    staticLayers.jobs = {
      view: vacancyVolume.data.view,
      caption: tMap("vacancyVolume.scope", {
        count: vacancyVolume.data.activeAds,
        profession,
        countries: vacancyVolume.data.countries.map(countryName).join(", "),
      }),
    };
  }
  const territories = spatial?.collections.companyTerritories ?? [];
  if (territories.length > 0) {
    const territoryView = buildTerritoryView(territories, countryName);
    if (territoryView.regions.length > 0) {
      staticLayers.territory = { view: territoryView };
    }
  }

  // The user's OWN person identity for the own-location marker (real data only).
  const ownName =
    profileRes.data?.full_name?.trim() ||
    (profileRes.data?.email ? profileRes.data.email.split("@")[0] : "") ||
    (user.email ? user.email.split("@")[0] : "");
  // Neutral marker signals only (silent-trust rule): availability when the
  // worker really set a status. No verified/confirmed-skills badge on the marker.
  const availabilityLabel =
    availability.hasWorker && availability.state !== "unknown"
      ? tMap(`markerAvail.${availability.state}`)
      : null;
  const identity = ownName
    ? {
        kind: "person" as const,
        name: ownName,
        initial: personMonogram(ownName),
        avatarUrl: avatar.signedUrl,
        statusLabel: tMap("markerYou"),
        availabilityLabel,
      }
    : undefined;

  const links = [
    {
      key: "opportunities",
      href: "/dashboard/opportunities",
      label: tMap("connections.opportunities"),
    },
    {
      key: "marketplace",
      href: "/dashboard/service-requests",
      label: tMap("connections.marketplace"),
    },
    {
      // Marketplace loop reachability (M7): the loop's OFFER half.
      key: "services",
      href: "/dashboard/services",
      label: tMarketplace("hubOffer"),
    },
    {
      key: "bookings",
      href: "/dashboard/bookings",
      label: tMap("connections.bookings"),
    },
    {
      // Pre-search gate entry (the recognizer): answer the right questions
      // BEFORE searching, so the market shows fewer but better options.
      key: "recognize",
      href: "/dashboard/market/recognize",
      label: tRec("entry.cta"),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <TelemetryView
        event={FUNNEL_EVENTS.preferredLocationViewed}
        metadata={{ surface: "market_map" }}
      />
      <h1
        className="font-display text-2xl font-bold tracking-tightest text-text-primary"
        data-testid="market-map-page-header"
      >
        {tMap("pageTitle")}
      </h1>

      {/* ONE map: layers, location + radius, the map, its places. */}
      <WorldDiscovery
        initial={initialWorld}
        ownLocation={{ identity }}
        staticLayers={staticLayers}
        placeLink={{
          hrefTemplate: `/${locale}/dashboard/opportunities?country={country}`,
          label: tMap("connections.opportunities"),
        }}
      />

      {/* Where the data behind the map is managed — existing routes only. */}
      <nav
        aria-label={tMap("pageTitle")}
        className="flex flex-wrap gap-2"
        data-testid="market-map-connections"
      >
        {links.map((l) => (
          <Link
            key={l.key}
            href={l.href as "/dashboard"}
            data-testid={`market-map-connection-${l.key}`}
            className="inline-flex min-h-11 items-center rounded-md border border-ink-500 bg-ink-800/40 px-3 text-sm font-medium text-text-primary transition-colors hover:border-brand-blue"
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* The functional tools that feed the map's layers — manage your own
          locations and readiness. Collapsed so the map dominates. */}
      <details className="group flex flex-col gap-4" data-testid="market-map-advanced">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted group-open:hidden">+</span>
          <span className="hidden font-mono text-meta uppercase tracking-label text-text-muted group-open:inline">−</span>
          {tMap("advanced")}
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <MarketMapCapture preferred={preferred} login={login} demand={demand} />
          <MarketMapOwnerReadiness availability={availability} capabilities={capabilities} />
        </div>
      </details>
    </div>
  );
}
