"use client";

import { PlacePrecision } from "@/components/app/work-world/primitives";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { MarketMap, type MarketMapViewport } from "./market-map";
import type {
  MarketAnchor,
  MarketMapLayer,
  MarketMapMode,
  MarketMapView,
} from "./market-map-model";
import {
  MapLocationControls,
  overlayFor,
  useOwnLocation,
} from "./map-location-controls";
import type { MapIdentity } from "./own-location-layer";
import { loadWorldViewAction } from "@/lib/market-map/world-actions";
import {
  WORLD_LAYERS,
  WORLD_LAYER_TO_MAP_LAYER,
  WORLD_ROW_LIMIT,
  type WorldCluster,
  type WorldLayer,
  type WorldViewResult,
} from "@/lib/market-map/world-model";

/**
 * WORLD DISCOVERY — the P8 subset on the existing market-map container.
 *
 * One canonical `<MarketMap>` (no new map, no new engine), fed by the
 * viewport-BOUNDED read: every pan/zoom asks the server for the one active
 * layer inside the bounds the person is looking at, and the server answers
 * with ≤ WORLD_OBJECT_CAP clustered places plus the counts of what it did NOT
 * draw. The layer changes by hand (pills) — the sentence path is World State
 * and stays out of this subset.
 *
 * ACCESSIBILITY (design S): the map alternative is a number + the SAME places
 * as a list, always rendered; state is never colour alone (FACT / DERIVED are
 * named in text beside the dashed/solid swatch); pills carry `aria-pressed`;
 * the counts strip is a polite live region.
 *
 * READ-ONLY. This component never writes; the guard
 * `lib/guards/world-discovery-subset.test.ts` pins that.
 */

const FETCH_DEBOUNCE_MS = 250;

type LayerStateKind = "ok" | "empty" | "error" | "unavailable" | "not_authenticated" | "invalid" | "fetch_failed";

/**
 * FROM A PLACE TO ITS OPPORTUNITIES (owner direction 2026-09-13: "iš
 * žemėlapio pereinama į kompaktišką rezultatą/detalę").
 *
 * The map answers "where is there work"; the compact banded list answers
 * "what of it fits me, and why". This prop is the one edge between them: a
 * place's row gets a link into the SAME page's EXISTING country filter
 * (`?country=`), so selecting a place narrows the list the person is
 * already reading. No second board, no second filter vocabulary.
 *
 * `hrefTemplate` carries `{country}`, replaced with the cluster's ISO-2
 * code. It is a template rather than a callback because this is a client
 * component and its server parent cannot hand it a function.
 */
export interface WorldPlaceLink {
  readonly hrefTemplate: string;
  readonly label: string;
}

/**
 * FROM A MARKET OBJECT TO THE REAL ENTITY. A project the caller can see (own,
 * assigned or managed — the map's RLS read) opens its project route, which
 * authorises again on arrival; a place of the caller's own company territory
 * opens the company context. Needs carry NO per-request link: a foreign
 * customer request must never become detail access by id, so a need leads
 * only to the opportunities list for its country (`placeLink`).
 */
export interface WorldEntityLinks {
  /** `{id}` is the project uuid. */
  readonly projectHrefTemplate: string;
  readonly companyHref: string;
}

/** Layers drawn from a prepared view instead of the bounded world read. */
export type StaticLayerKey = "jobs" | "territory";
export interface StaticLayer {
  readonly view: MarketMapView;
  /** One quiet line under the map (e.g. the vacancy count). */
  readonly caption?: string;
}
export type LayerKey = WorldLayer | StaticLayerKey;
const STATIC_LAYER_ORDER: readonly StaticLayerKey[] = ["jobs", "territory"];
const STATIC_TO_MAP_LAYER: Record<StaticLayerKey, MarketMapLayer> = {
  jobs: "jobs",
  territory: "territory",
};

/** The window event a signal uses to ask the map for a layer (detail = layer). */
export const MARKET_LAYER_EVENT = "market-map:choose-layer";

export function WorldDiscovery({
  initial,
  initialLayer = "demand",
  initialKey,
  placeLink,
  entityLinks,
  mapMode = "dashboard",
  ownLocation,
  staticLayers,
}: {
  /** The first view, rendered on the server for the default viewport. */
  initial: WorldViewResult;
  initialLayer?: WorldLayer;
  /** Open on a static layer (`jobs` / `territory`) when its data exists. */
  initialKey?: StaticLayerKey;
  placeLink?: WorldPlaceLink;
  entityLinks?: WorldEntityLinks;
  /**
   * The canonical container height (`MODE_HEIGHT`). The market map page is
   * the map's own screen and keeps `dashboard` (60vh). On PASAULIS the map
   * is the BASE of a page whose next section is the banded list, so it uses
   * `result` (32vh): on a 390 px phone the map and the first rows of the
   * list share one screen, which is the point of putting them together.
   * Not a new size — one of the four the model already defines.
   */
  mapMode?: MarketMapMode;
  /**
   * Location + radius as controls OF this map. When present the viewer's own
   * saved location and search radius are drawn on the map and the compact
   * control bar is shown (use my location / radius / change). Omit to render
   * the world without any own-location chrome.
   */
  ownLocation?: { identity?: MapIdentity; suppressOwnMarker?: boolean };
  /**
   * Further layers of the SAME map whose data is already read on the server
   * and is not viewport-bounded (public vacancy volume, the owner company's
   * territory). A layer is offered only when its entry exists — never a
   * placeholder for data that is not there.
   */
  staticLayers?: Partial<Record<StaticLayerKey, StaticLayer>>;
}) {
  const t = useTranslations("marketMap.world");
  const locale = useLocale();
  const tSig = useTranslations("marketMap.signals");
  const [layerKey, setLayerKey] = useState<LayerKey>(
    initialKey && staticLayers?.[initialKey] ? initialKey : initialLayer,
  );
  const own = useOwnLocation();
  const isStatic = (STATIC_LAYER_ORDER as readonly string[]).includes(layerKey);
  const staticLayer = isStatic ? staticLayers?.[layerKey as StaticLayerKey] : undefined;
  // The bounded read only ever runs for a world layer.
  const layer: WorldLayer = isStatic ? initialLayer : (layerKey as WorldLayer);
  const availableStatic = STATIC_LAYER_ORDER.filter((k) => staticLayers?.[k]);
  const [result, setResult] = useState<WorldViewResult>(initial);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const viewportRef = useRef<MarketMapViewport | null>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const countryName = useCallback(
    (code: string) => {
      try {
        return regionNames?.of(code) ?? code;
      } catch {
        return code;
      }
    },
    [regionNames],
  );

  // ONE in-flight answer wins: a stale response (older sequence) is ignored,
  // so quick pans never paint an earlier viewport over a later one.
  const refresh = useCallback(
    (nextLayer: WorldLayer) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const seq = ++seqRef.current;
        setPending(true);
        try {
          const r = await loadWorldViewAction({
            bounds: viewport.bounds,
            zoom: viewport.zoom,
            layer: nextLayer,
          });
          if (seq !== seqRef.current) return;
          setResult(r);
          setFetchFailed(false);
        } catch {
          if (seq !== seqRef.current) return;
          setFetchFailed(true);
        } finally {
          if (seq === seqRef.current) setPending(false);
        }
      }, FETCH_DEBOUNCE_MS);
    },
    [],
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const onViewportChange = useCallback(
    (viewport: MarketMapViewport) => {
      viewportRef.current = viewport;
      if (!isStatic) refresh(layer);
    },
    [layer, isStatic, refresh],
  );

  const chooseLayer = (next: LayerKey) => {
    if (next === layerKey) return;
    setLayerKey(next);
    setSelectedKey(null);
    if (!(STATIC_LAYER_ORDER as readonly string[]).includes(next)) refresh(next as WorldLayer);
  };

  // A signal on THIS page (the rail / sheet) asks the one map for a layer. It is
  // a client event, not a navigation: the layer switch needs no server round
  // trip, and the page URL is updated by the sender so the choice is shareable.
  const chooseLayerRef = useRef(chooseLayer);
  chooseLayerRef.current = chooseLayer;
  useEffect(() => {
    const onChoose = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      const world = next === "demand" || next === "supply" || next === "projects";
      const prepared = (STATIC_LAYER_ORDER as readonly string[]).includes(next) && !!staticLayers?.[next as StaticLayerKey];
      if (world || prepared) chooseLayerRef.current(next as LayerKey);
    };
    window.addEventListener(MARKET_LAYER_EVENT, onChoose);
    return () => window.removeEventListener(MARKET_LAYER_EVENT, onChoose);
  }, [staticLayers]);

  const onSelectAnchor = useCallback((anchor: MarketAnchor) => {
    setSelectedKey((k) => (k === anchor.id ? null : anchor.id));
  }, []);

  const view = result.kind === "ok" ? result.view : null;
  const worldClusters: readonly WorldCluster[] = view?.clusters ?? [];
  // A prepared layer lists the same places the map draws (design S: the list
  // equivalent), in the one row shape.
  const staticRows: readonly ListRow[] = staticLayer
    ? staticLayer.view.regions.flatMap((r) =>
        r.anchors.map((a) => ({
          key: a.id,
          label: a.label,
          country: a.country,
          precision: a.precision ?? "city",
          provenance: a.precision === "country" ? ("derived" as const) : ("fact" as const),
          count: typeof a.weight === "number" ? a.weight : null,
          members: [] as readonly { id: string; label: string }[],
          moreMembers: 0,
        })),
      )
    : [];
  const rows: readonly ListRow[] = staticLayer
    ? staticRows
    : worldClusters.map((c) => ({
        key: c.key,
        label: c.label,
        country: c.country,
        precision: c.precision,
        provenance: c.provenance,
        count: c.count,
        members: c.members,
        moreMembers: c.moreMembers,
      }));
  const counts = staticLayer ? null : (view?.counts ?? null);
  const stateKind: LayerStateKind = staticLayer
    ? rows.length > 0
      ? "ok"
      : "empty"
    : fetchFailed
      ? "fetch_failed"
      : result.kind === "ok"
        ? result.view.state.kind
        : result.kind;

  const stateText = (() => {
    switch (stateKind) {
      case "ok":
        return null;
      case "empty":
        // People below the privacy threshold are WITHHELD, not absent: say so,
        // and never let an empty people layer read as "nobody is available".
        return layerKey === "supply" && (view?.counts.withheld ?? 0) > 0
          ? t("state.suppressed")
          : t(`state.empty.${layerKey}`);
      case "error":
        return t("state.error");
      case "unavailable":
        return t("state.noPlaces");
      case "not_authenticated":
        return t("state.signIn");
      case "fetch_failed":
        return t("state.fetchFailed");
      case "invalid":
        return t("state.error");
    }
  })();

  const mapLayer: MarketMapLayer = staticLayer
    ? STATIC_TO_MAP_LAYER[layerKey as StaticLayerKey]
    : WORLD_LAYER_TO_MAP_LAYER[layer];
  const pillKeys: readonly LayerKey[] = [...WORLD_LAYERS, ...availableStatic];
  // A place opens the opportunities list only where the layer IS opportunities.
  const linkApplies = placeLink && (layerKey === "demand" || layerKey === "jobs");
  const caption = staticLayer?.caption ?? null;

  return (
    <section className="flex flex-col gap-3" data-testid="market-map-world" data-world-layer={layerKey}>
      {/* Layers — filters of the SAME map. Only layers whose data exists. */}
      <div
        role="group"
        aria-label={t("layersLabel")}
        className="flex flex-wrap gap-1"
        data-testid="world-layers"
      >
        {pillKeys.map((l) => {
          const active = l === layerKey;
          return (
            <button
              key={l}
              type="button"
              aria-pressed={active}
              data-testid={`world-layer-${l}`}
              onClick={() => chooseLayer(l)}
              className={`min-h-11 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-brand-cyan bg-brand-cyan/15 text-text-primary"
                  : "border-ink-500 bg-ink-800/40 text-text-secondary hover:border-brand-blue"
              }`}
            >
              {t(`layers.${l}`)}
            </button>
          );
        })}
      </div>

      {ownLocation ? <MapLocationControls state={own} /> : null}

      <MarketMap
        view={staticLayer ? staticLayer.view : (view?.view ?? EMPTY_VIEW)}
        mode={mapMode}
        layer={mapLayer}
        autoFly={staticLayer ? true : false}
        onViewportChange={onViewportChange}
        onSelectAnchor={onSelectAnchor}
        own={
          ownLocation
            ? overlayFor(own, {
                identity: ownLocation.identity,
                suppress: ownLocation.suppressOwnMarker,
              })
            : undefined
        }
      />

      {/* What is and is not on screen — only the parts that are non-zero. */}
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-text-muted"
        data-testid="world-counts"
        aria-live="polite"
      >
        {counts ? (
          <>
            <span data-testid="world-counts-inview">
              {t("counts.inView", {
                places: counts.renderedClusters,
                objects: counts.inViewObjects,
              })}
            </span>
            {counts.overflowClusters > 0 ? (
              <span data-testid="world-counts-overflow" className="text-state-amber">
                {t("counts.overflow", {
                  places: counts.overflowClusters,
                  objects: counts.overflowObjects,
                })}
              </span>
            ) : null}
            {counts.unplaced > 0 ? (
              <span data-testid="world-counts-unplaced">
                {t("counts.unplaced", { count: counts.unplaced })}
              </span>
            ) : null}
            {counts.withheld > 0 ? (
              <span data-testid="world-counts-withheld">
                {t("counts.withheld", { count: counts.withheld })}
              </span>
            ) : null}
            {counts.truncated ? (
              <span data-testid="world-counts-truncated" className="text-state-amber">
                {t("counts.truncated", { limit: WORLD_ROW_LIMIT })}
              </span>
            ) : null}
          </>
        ) : null}
        {caption ? <span data-testid="world-caption">{caption}</span> : null}
        {rows.length > 0 ? <span data-testid="world-size-note">{tSig("sizeNote")}</span> : null}
        {pending ? <span data-testid="world-loading">{t("loading")}</span> : null}
      </div>

      {stateText ? (
        <p
          className={`rounded-md border p-3 text-sm ${
            stateKind === "error" || stateKind === "fetch_failed"
              ? "border-state-danger/40 bg-state-danger/5 text-state-danger"
              : "border-ink-500 bg-ink-800/40 text-text-secondary"
          }`}
          data-testid="world-layer-state"
          data-world-state={stateKind}
        >
          {stateText}
        </p>
      ) : null}

      {view?.notes.includes("aggregate_only") && layerKey === "supply" ? (
        <p className="text-xs leading-relaxed text-text-muted" data-testid="world-note-aggregate">
          {t("notes.aggregateOnly")}
        </p>
      ) : null}

      {/* The list equivalent — the same places, always present (design S). */}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="world-list">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("list.title", { count: rows.length })}
          </h3>
          <ol className="flex flex-col divide-y divide-ink-700 rounded-md border border-ink-600 bg-ink-800/30">
            {rows.map((c) => {
              const selected = c.key === selectedKey;
              return (
                <li
                  key={c.key}
                  data-testid="world-list-row"
                  data-provenance={c.provenance}
                  aria-current={selected ? "true" : undefined}
                  className={`flex flex-col gap-0.5 px-3 py-2 text-sm ${
                    selected ? "bg-brand-cyan/10" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="font-semibold text-text-primary">
                      {c.label}
                      {c.country !== c.label ? (
                        <span className="font-normal text-text-secondary"> · {countryName(c.country)}</span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-text-secondary">
                      {/* WHERE-precision (work-world grammar): a stated city is
                          cyan fact, a country-only position is a dashed
                          approximation — the chip says which, so the row can
                          never read more precisely than the record does. */}
                      <PlacePrecision kind={c.precision} label={t(`precision.${c.precision}`)} />
                      {c.count !== null ? (
                        <span>
                          {t("list.count", { count: c.count })}
                          {selected ? ` · ${t("list.selected")}` : ""}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {(selected || layerKey === "projects") && c.members.length > 0 ? (
                    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                      {c.members.map((m) => (
                        <li key={m.id}>
                          {layerKey === "projects" && entityLinks && m.id.startsWith("project:") ? (
                            <a
                              href={entityLinks.projectHrefTemplate.replace("{id}", m.id.slice("project:".length))}
                              data-testid="world-project-link"
                              aria-label={`${t("list.openProject")}: ${m.label}`}
                              className="inline-flex min-h-11 items-center font-medium text-brand-blue underline-offset-4 hover:underline"
                            >
                              {m.label} →
                            </a>
                          ) : (
                            m.label
                          )}
                        </li>
                      ))}
                      {c.moreMembers > 0 ? <li>{t("list.more", { count: c.moreMembers })}</li> : null}
                    </ul>
                  ) : null}
                  {layerKey === "territory" && entityLinks ? (
                    <a
                      href={entityLinks.companyHref}
                      data-testid="world-company-link"
                      className="inline-flex min-h-11 w-fit items-center text-xs font-medium text-brand-blue underline-offset-4 hover:underline"
                    >
                      {t("list.openCompany")} →
                    </a>
                  ) : null}
                  {linkApplies && placeLink ? (
                    <a
                      href={placeLink.hrefTemplate.replace("{country}", c.country)}
                      data-testid="world-place-link"
                      data-country={c.country}
                      className="inline-flex min-h-11 w-fit items-center text-xs font-medium text-brand-blue underline-offset-4 hover:underline"
                    >
                      {placeLink.label} →
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

interface ListRow {
  readonly key: string;
  readonly label: string;
  readonly country: string;
  readonly precision: "city" | "country";
  readonly provenance: "fact" | "derived";
  /** `null` = the place stands for itself, no quantity (UNKNOWN is not zero). */
  readonly count: number | null;
  readonly members: readonly { id: string; label: string }[];
  readonly moreMembers: number;
}

/** A view with nothing in it — drawn while a non-ok result is explained in words. */
const EMPTY_VIEW = {
  origin: "live" as const,
  center: [52.2, 6.0] as const,
  zoom: 5,
  regions: [] as const,
};
