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
import { MarketSignalsRail } from "@/components/app/market-map/market-signals-rail";
import {
  loadDefaultWorldView,
  loadMarketBrief,
  loadOwnSpatialOnce,
  loadVacancyVolumeOnce,
} from "@/lib/market-map/market-brief";
import type { WorldLayer, WorldViewResult } from "@/lib/market-map/world-model";
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
/**
 * `?layer=` — the edge from a market signal (the home's market region, the
 * signals rail) to the layer of THIS map that shows exactly it. Only the four
 * layers a signal can name are accepted; anything else opens the default
 * (demand), and a static layer the person has no data for falls back too —
 * never an empty layer reached by a typed URL.
 */
const WORLD_LAYER_PARAM: Readonly<Record<string, WorldLayer>> = {
  demand: "demand",
  projects: "projects",
};
const STATIC_LAYER_PARAM: Readonly<Record<string, StaticLayerKey>> = {
  jobs: "jobs",
  territory: "territory",
};

export default async function MarketMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const layerParam = typeof sp.layer === "string" ? sp.layer : "";
  const worldLayer: WorldLayer = WORLD_LAYER_PARAM[layerParam] ?? "demand";
  const staticKey: StaticLayerKey | undefined = STATIC_LAYER_PARAM[layerParam];
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
  // The same request-cached reads the market brief composes — one read per
  // layer, shared between the map, the signals rail and the home.
  const [initialWorldRead, vacancyVolume, spatial, brief] = await Promise.all([
    loadDefaultWorldView(worldLayer),
    loadVacancyVolumeOnce(),
    loadOwnSpatialOnce(),
    loadMarketBrief(),
  ]);
  const initialWorld: WorldViewResult = initialWorldRead ?? { kind: "invalid" };

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
    <div className="flex flex-col gap-4 max-lg:pb-24">
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

      {/* ONE map: layers, location + radius, the map, its places — with the
          market's signals beside it (a bottom sheet over it on a phone). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0">
          {/* Keyed on the requested layer: a signal that links to another layer
              of THIS page re-opens the one map on that layer with its server
              view (the client keeps its own layer state otherwise). */}
          <WorldDiscovery
            key={layerParam || "default"}
            initial={initialWorld}
            initialLayer={worldLayer}
            initialKey={staticKey}
            ownLocation={{ identity }}
            staticLayers={staticLayers}
            placeLink={{
              hrefTemplate: `/${locale}/dashboard/opportunities?country={country}`,
              label: tMap("connections.opportunities"),
            }}
            entityLinks={{
              projectHrefTemplate: `/${locale}/dashboard/projects/{id}`,
              companyHref: `/${locale}/dashboard/company`,
            }}
          />
        </div>
        <div className="min-w-0 max-lg:contents lg:sticky lg:top-4">
          <MarketSignalsRail brief={brief} />
        </div>
      </div>

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
