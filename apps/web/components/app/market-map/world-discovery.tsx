"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { MarketMap, type MarketMapViewport } from "./market-map";
import type { MarketAnchor } from "./market-map-model";
import { loadWorldViewAction } from "@/lib/market-map/world-actions";
import {
  WORLD_LAYERS,
  WORLD_LAYER_TO_MAP_LAYER,
  WORLD_OBJECT_CAP,
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

export function WorldDiscovery({
  initial,
  initialLayer = "demand",
}: {
  /** The first view, rendered on the server for the default viewport. */
  initial: WorldViewResult;
  initialLayer?: WorldLayer;
}) {
  const t = useTranslations("marketMap.world");
  const locale = useLocale();
  const [layer, setLayer] = useState<WorldLayer>(initialLayer);
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
      refresh(layer);
    },
    [layer, refresh],
  );

  const chooseLayer = (next: WorldLayer) => {
    if (next === layer) return;
    setLayer(next);
    setSelectedKey(null);
    refresh(next);
  };

  const onSelectAnchor = useCallback((anchor: MarketAnchor) => {
    setSelectedKey((k) => (k === anchor.id ? null : anchor.id));
  }, []);

  const view = result.kind === "ok" ? result.view : null;
  const clusters: readonly WorldCluster[] = view?.clusters ?? [];
  const counts = view?.counts ?? null;
  const stateKind: LayerStateKind = fetchFailed
    ? "fetch_failed"
    : result.kind === "ok"
      ? result.view.state.kind
      : result.kind;

  const stateText = (() => {
    switch (stateKind) {
      case "ok":
        return null;
      case "empty":
        return t(`state.empty.${layer}`);
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

  return (
    <section className="flex flex-col gap-2" data-testid="market-map-world" data-world-layer={layer}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-meta uppercase tracking-label text-brand-cyan">
          {t("title")}
        </h2>
        <div
          role="group"
          aria-label={t("layersLabel")}
          className="flex flex-wrap gap-1"
          data-testid="world-layers"
        >
          {WORLD_LAYERS.map((l) => {
            const active = l === layer;
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
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">{t("lead")}</p>

      <MarketMap
        view={view?.view ?? EMPTY_VIEW}
        mode="dashboard"
        layer={WORLD_LAYER_TO_MAP_LAYER[layer]}
        autoFly={false}
        onViewportChange={onViewportChange}
        onSelectAnchor={onSelectAnchor}
      />

      {/* Counts — the honest "what is and is not on screen" strip. */}
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
            <span data-testid="world-counts-scale">
              {t("scale.label", { scale: t(`scale.${view!.scale}`) })}
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
        <span data-testid="world-counts-cap">{t("counts.cap", { cap: WORLD_OBJECT_CAP })}</span>
        {pending ? <span data-testid="world-loading">{t("loading")}</span> : null}
      </div>

      {/* FACT / DERIVED — material AND words (never colour alone). */}
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-relaxed text-text-secondary"
        data-testid="world-provenance-legend"
      >
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block size-3 rounded-full border-2 border-current bg-current/50" />
          <strong className="font-semibold text-text-primary">{t("provenance.fact")}</strong>
          <span>— {t("provenance.factHint")}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block size-3 rounded-full border-2 border-dashed border-current" />
          <strong className="font-semibold text-text-primary">{t("provenance.derived")}</strong>
          <span>— {t("provenance.derivedHint")}</span>
        </span>
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

      {view?.notes.includes("aggregate_only") ? (
        <p className="text-xs leading-relaxed text-text-muted" data-testid="world-note-aggregate">
          {t("notes.aggregateOnly")}
        </p>
      ) : null}

      {/* The list equivalent — the same places, always present (design S). */}
      <div className="flex flex-col gap-1" data-testid="world-list">
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("list.title", { count: clusters.length })}
        </h3>
        {clusters.length > 0 ? (
          <ol className="flex flex-col divide-y divide-ink-700 rounded-md border border-ink-600 bg-ink-800/30">
            {clusters.map((c) => {
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
                    <span className="font-mono text-xs text-text-secondary">
                      {t("list.count", { count: c.count })}
                      {" · "}
                      {t(`provenance.${c.provenance}`)}
                      {c.precision === "country" ? ` · ${t("list.approx")}` : ""}
                      {selected ? ` · ${t("list.selected")}` : ""}
                    </span>
                  </div>
                  {selected && c.members.length > 0 ? (
                    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                      {c.members.map((m) => (
                        <li key={m.id}>{m.label}</li>
                      ))}
                      {c.moreMembers > 0 ? <li>{t("list.more", { count: c.moreMembers })}</li> : null}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </section>
  );
}

/** A view with nothing in it — drawn while a non-ok result is explained in words. */
const EMPTY_VIEW = {
  origin: "live" as const,
  center: [52.2, 6.0] as const,
  zoom: 5,
  regions: [] as const,
};
