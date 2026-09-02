import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { MarketMapShell } from "@/components/app/market-map-shell";
import { MarketMapBase } from "@/components/app/market-map-base";
import { LabourMarketWorldMap } from "@/components/app/labour-market-world-map";
import { MarketMapCapture } from "@/components/app/market-map-capture";
import { MarketMapOwnerReadiness } from "@/components/app/market-map-owner-readiness";
import { MapLayersLegend } from "@/components/app/map-layers-legend";
import { MarketMapEntityLayers } from "@/components/app/market-map-entity-layers";
import { MarketMap } from "@/components/app/market-map/market-map";
import { loadMarketResult } from "@/lib/market-map/market-result";
import { loadVacancyVolume } from "@/lib/market-map/vacancy-volume";
import { getOwnSpatialCollections } from "@/lib/market-map/spatial-read";
import { emptySpatialCollections } from "@/lib/market-map/spatial-entities";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
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
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { personMonogram } from "@/lib/visual/avatar-monogram";

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
  // The live-demand map reuses the conversation result's OWN honesty copy
  // (error ≠ empty), and the vacancy layer reuses the market panel's
  // profession + derived-occupation lexicon — one vocabulary per fact.
  const tResults = await getTranslations("conversation.results");
  const tExplanation = await getTranslations("marketExplanation");
  const tProfessions = await getTranslations("professions");
  // Marketplace loop reachability (M7): the OFFER half reuses the loop's own
  // canonical labels (marketplace.hubOffer*) — no parallel copy source.
  const tMarketplace = await getTranslations("marketplace");
  const tLayers = await getTranslations("mapLayers");
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
  // Three-entity spatial read (Sprint v2 §6): typed collections — person
  // presence (aggregate-only, §20), company territory, project locations —
  // composed from the caller's own RLS-scoped rows only.
  const spatial = await getOwnSpatialCollections();
  // THE REAL MARKET on the page named "market map" (this page previously
  // mounted only self-signal surfaces, while the conversation registry's
  // "advanced" link for the market result points here — a promise this page
  // did not keep). Two clearly separated layers, both origin:"live":
  //  - the canonical demand read (`loadMarketResult` — the SAME source the
  //    conversation's market result renders), and
  //  - public vacancy volume for the caller's occupation, projected from the
  //    EXISTING authenticated `getPublicMarketFacts` aggregate.
  const [marketResult, vacancyVolume] = await Promise.all([
    loadMarketResult(),
    loadVacancyVolume(),
  ]);
  const spatialCollections = spatial?.collections ?? emptySpatialCollections();
  const companyTerritorySource = spatial?.companyTerritorySource ?? "error";
  const countryNames = Object.fromEntries(
    MARKET_COUNTRIES.map((code) => [code, tCountries(`countryNames.${code}`)]),
  );
  const activeRole = profileRes.data?.active_role ?? null;
  const isCompanyContext = activeRole === "company" || activeRole === "agency";
  // §11: the map's company identity is the ACTIVE WORKSPACE's organization —
  // workspace-aware (a person owning A and B sees the selected one), never
  // the `companies.profile_id` singleton (which errors at 2 owned rows).
  const employerCtx = isCompanyContext
    ? await resolveEmployerCompanyContext()
    : null;
  const companyName =
    employerCtx && employerCtx.kind === "ok"
      ? employerCtx.organizationName.trim() || null
      : null;
  // The user's OWN person identity for the player-card marker (real data only).
  // ALWAYS built — the personal layer is never suppressed by company context.
  const ownName =
    profileRes.data?.full_name?.trim() ||
    (profileRes.data?.email ? profileRes.data.email.split("@")[0] : "") ||
    (user.email ? user.email.split("@")[0] : "");
  // Neutral marker signals only (silent-trust rule): availability when the
  // worker really set a status. No verified/confirmed-skills badge on the
  // marker — confirmation stays an internal signal, never advertised here.
  const availabilityLabel =
    availability.hasWorker && availability.state !== "unknown"
      ? tMap(`markerAvail.${availability.state}`)
      : null;
  const mapIdentity = ownName
    ? {
        kind: "person" as const,
        name: ownName,
        // Same monogram logic as the Player Card header so the map own-marker
        // shows the identical initials ("Jonas Petraitis" → "JP", not "J").
        initial: personMonogram(ownName),
        avatarUrl: avatar.signedUrl,
        statusLabel: tMap("markerYou"),
        availabilityLabel,
      }
    : undefined;
  // Own needs/demands carry NO coordinates (capture stores country/region only),
  // so they are an honest "not on map yet" panel row, never fake points.
  const needsCount = Array.isArray(demand) ? demand.length : 0;
  // The person signal is honestly "active" ONLY when the user has a real saved
  // location (a preferred_locations row, RLS-scoped own data). With no saved
  // location they are NOT actually on the market map yet, so the row shows an
  // honest "incomplete — add your location" state instead of always claiming an
  // active signal. Existing data only; no fake marker, no schema.
  const hasPreferredLocation = Array.isArray(preferred) && preferred.length > 0;
  // Unified visible-now layer rows (real state only — no fake markers).
  const visibleRows: {
    label: string;
    state: "active" | "incomplete" | "off-map";
    hint?: string;
    href?: string;
  }[] = [
    {
      label: `${tLayers("personSignal")}${ownName ? `: ${ownName}` : ""}`,
      state: hasPreferredLocation ? "active" : "incomplete",
      hint: hasPreferredLocation ? undefined : tLayers("personIncomplete"),
      // Dead-UI rule C: an incomplete row must lead to its fix — the
      // location picker further down this page.
      href: hasPreferredLocation ? undefined : "#market-map-base",
    },
  ];
  if (isCompanyContext) {
    visibleRows.push({
      label: `${tLayers("companyLayer")}${companyName ? `: ${companyName}` : ""}`,
      state: "incomplete",
      hint: tLayers("companyIncomplete"),
      href: `/${locale}/dashboard/company`,
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
      <TelemetryView
        event={FUNNEL_EVENTS.preferredLocationViewed}
        metadata={{ surface: "market_map" }}
      />
      <header className="flex flex-col gap-1" data-testid="market-map-page-header">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {tMap("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {tMap("pageLead")}
        </p>
      </header>
      {/* Pre-search gate entry — answer the right questions BEFORE searching, so
          the market shows fewer but better options. Opens the recognizer (PR
          #561), which hands off to the existing real surfaces. */}
      {/* Owner UX recovery v1: compact one-row entry (was a tall 3-line
          card pushing the map down) — the map is the dominant surface. */}
      <Link
        href={"/dashboard/market/recognize" as "/dashboard"}
        data-testid="market-recognize-entry"
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 card-border bg-ink-900/40 px-3 py-2 transition-colors hover:border-brand-blue"
        title={tRec("entry.body")}
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-meta uppercase tracking-label text-brand-cyan">
            {tRec("entry.title")}
          </span>
          <span className="truncate text-xs leading-relaxed text-text-secondary">
            {tRec("entry.body")}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-text-primary">
          {tRec("entry.cta")}
          <span aria-hidden className="text-text-muted">
            →
          </span>
        </span>
      </Link>
      {/* ONE unified map — the dominant, app-like surface (tall on mobile). The
          personal player-card marker is ALWAYS shown when a real location
          exists; the active context only changes the focused layer/panel below,
          never whether a separate map exists. */}
      <MarketMapBase identity={mapIdentity} />
      {/* ── THE REAL MARKET ──────────────────────────────────────────────
          Live demand from the ONE canonical demand read, on the canonical
          <MarketMap> (same engine + data as the conversation's market
          result). Honest states are kept apart: a failed read is an error,
          zero rows is emptiness — neither borrows the other's sentence, and
          the map's intrinsic origin badge labels the data as live. */}
      <section
        className="flex flex-col gap-2"
        data-testid="market-map-live-demand"
      >
        <h2 className="font-mono text-meta uppercase tracking-label text-brand-cyan">
          {tMap("liveDemand.title")}
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">
          {tMap("liveDemand.lead")}
        </p>
        {marketResult.failed ? (
          <p
            className="rounded-md border border-state-danger/40 bg-state-danger/5 p-3 text-sm text-state-danger"
            data-testid="market-map-live-demand-error"
          >
            {tResults("marketError")}
          </p>
        ) : marketResult.empty ? (
          <p
            className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-secondary"
            data-testid="market-map-live-demand-empty"
          >
            {tResults("marketEmpty")}
          </p>
        ) : (
          <MarketMap view={marketResult.view} mode="result" layer="demand" />
        )}
      </section>
      {/* Public vacancy volume for the caller's occupation — the
          `getPublicMarketFacts` aggregate (imported public advertisements,
          authenticated read) projected onto the same canonical map as its own
          layer. The covered countries are DERIVED from the data and named in
          the copy: the source's true current scope, never a product boundary.
          No profession and no data render nothing; an advertised-nothing
          market renders as words, never as an empty-looking map. */}
      {vacancyVolume.kind === "ok" ? (
        <section
          className="flex flex-col gap-2"
          data-testid="market-map-vacancy-volume"
        >
          <h2 className="font-mono text-meta uppercase tracking-label text-brand-cyan">
            {tMap("vacancyVolume.title")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {tMap("vacancyVolume.scope", {
              count: vacancyVolume.data.activeAds,
              profession: tProfessions.has(vacancyVolume.data.professionSlug)
                ? tProfessions(vacancyVolume.data.professionSlug)
                : vacancyVolume.data.professionSlug,
              countries: vacancyVolume.data.countries
                .map((code) =>
                  tCountries.has(`countryNames.${code}`)
                    ? tCountries(`countryNames.${code}`)
                    : code,
                )
                .join(", "),
            })}
          </p>
          {vacancyVolume.data.derived ? (
            <p
              className="text-xs leading-relaxed text-text-muted"
              data-testid="market-map-vacancy-volume-derived"
            >
              {tExplanation("derivedFromWork")}
            </p>
          ) : null}
          <MarketMap view={vacancyVolume.data.view} mode="result" layer="jobs" />
          {!vacancyVolume.data.rankingWindowCoversAll ? (
            <p
              className="text-xs leading-relaxed text-text-muted"
              data-testid="market-map-vacancy-volume-window"
            >
              {tMap("vacancyVolume.window", {
                window: vacancyVolume.data.rankingWindowAds,
              })}
            </p>
          ) : null}
        </section>
      ) : vacancyVolume.kind === "empty" ? (
        <p
          className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-secondary"
          data-testid="market-map-vacancy-volume-none"
        >
          {tExplanation("noneOpen", {
            profession: tProfessions.has(vacancyVolume.professionSlug)
              ? tProfessions(vacancyVolume.professionSlug)
              : vacancyVolume.professionSlug,
          })}
        </p>
      ) : null}
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
      {/* THREE spatial entities (Sprint v2 §6) — person presence (aggregate
          only, §20-safe), company operating territory, project locations — as
          three toggleable layers with distinct visual languages, never mixed
          into one pin type. Data: owner-scoped typed collections only. */}
      <MarketMapEntityLayers
        collections={spatialCollections}
        companyTerritorySource={companyTerritorySource}
        countryNames={countryNames}
      />
      {/* Operating-layer bridge (§8.9): the map shows WHERE things are; the
          real data is managed on these surfaces. Existing routes only, no fake
          markers, mobile-safe tap targets. The legend (future layers) stays the
          honest "not on map yet" signal; this strip is the actionable bridge. */}
      <section
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-3"
        data-testid="market-map-connections"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {tMap("connections.title")}
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              key: "marketplace",
              href: "/dashboard/service-requests",
              label: tMap("connections.marketplace"),
              note: tMap("connections.marketplaceNote"),
            },
            {
              // Marketplace loop reachability (M7): the loop's OFFER half.
              // Until this link the only door to /dashboard/services was the
              // cross-link inside /dashboard/service-requests itself — a
              // provider could not discover where to publish an offering.
              // Existing route + existing i18n keys; every identity may offer
              // services (registry: services.roles = ALL_ROLES).
              key: "services",
              href: "/dashboard/services",
              label: tMarketplace("hubOffer"),
              note: tMarketplace("hubOfferNote"),
            },
            {
              key: "opportunities",
              href: "/dashboard/opportunities",
              label: tMap("connections.opportunities"),
              note: tMap("connections.opportunitiesNote"),
            },
            {
              key: "bookings",
              href: "/dashboard/bookings",
              label: tMap("connections.bookings"),
              note: tMap("connections.bookingsNote"),
            },
          ].map((l) => (
            <Link
              key={l.key}
              href={l.href as "/dashboard"}
              data-testid={`market-map-connection-${l.key}`}
              className="flex min-h-[3.25rem] flex-col rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue"
            >
              <span className="font-semibold">{l.label}</span>
              <span className="text-xs text-text-muted">{l.note}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* The map + legend above carry the signal visually. Everything below is
          a secondary "Manage my locations & market layers" panel, collapsed by
          default so the map dominates: it LEADS with the functional capture +
          readiness tools, and the explanatory signal board / world overview are
          demoted to the end (progressive disclosure, not the main carrier). */}
      <details className="group flex flex-col gap-4" data-testid="market-map-advanced">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted group-open:hidden">+</span>
          <span className="hidden font-mono text-meta uppercase tracking-label text-text-muted group-open:inline">−</span>
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
