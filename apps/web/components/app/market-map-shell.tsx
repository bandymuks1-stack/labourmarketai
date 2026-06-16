import { getTranslations } from "next-intl/server";
import {
  Map as MapIcon,
  Users,
  ClipboardList,
  FolderKanban,
  Home,
  UsersRound,
  ShieldCheck,
  Coins,
  Globe2,
  Compass,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { SUPPORTED_COUNTRIES } from "@/lib/labour-market/country-evidence";
import { SECTORS } from "@/lib/structuring/sectors";
import { getOwnDemandLocationSummary, getOwnDemandSignalBoard } from "@/lib/demand/demand-location";
import { demandLayerStatus } from "@/lib/market-map/demand-locations";
import { MarketMapSignalLayer } from "@/components/app/market-map-signal-layer";
import {
  MAP_LAYER_KINDS,
  mapEligibleCategories,
  ATLAS_BLOCK_COUNT,
} from "@/lib/work-market/atlas";

/**
 * Live market map — FOUNDATION shell (v1). NO fake markers, NO seeded geo
 * points, NO external map API / key. It is an honest scaffold: hero, an empty
 * map canvas, the planned data layers (each marked "planned" — they fill only
 * from REAL data once a geo field exists), a filter bar over real dimensions
 * (countries + sectors that already exist in the app), a status legend, and a
 * next-action panel that links to real existing flows.
 *
 * Copy says plainly: a living labour-market map, built from real workers /
 * company needs / projects / accommodation — never invented points.
 */

/** Data layers. Most are "planned" until a real geo source exists; the demand
 *  layer is the FIRST real candidate — its additive geo table is prepared as a
 *  human-gated RED schema draft (company-demand-locations-red-draft-v1). It
 *  shows "schema prepared" (not "planned", not "live") and plots NO points until
 *  the migration is owner-applied AND real, geocode-verified rows exist.
 *  See docs/audit/live-market-map-foundation-v1.md data-source matrix. */
const LAYERS = [
  { key: "workers", icon: Users, status: "planned" },
  { key: "demand", icon: ClipboardList, status: "schemaPrepared" },
  { key: "projects", icon: FolderKanban, status: "planned" },
  { key: "accommodation", icon: Home, status: "planned" },
  { key: "teams", icon: UsersRound, status: "planned" },
  { key: "readiness", icon: ShieldCheck, status: "planned" },
  { key: "rates", icon: Coins, status: "planned" },
  { key: "countryFit", icon: Globe2, status: "planned" },
  { key: "nextActions", icon: Compass, status: "planned" },
] as const;

/** Pill copy + tone per layer status. "schemaPrepared" = schema ready, no rows
 *  yet; "signalOnly" = REAL captured rows exist but none are mappable (no
 *  confirmed coordinates) — still zero markers. */
const LAYER_STATUS_KEY = {
  planned: "layerPlanned",
  schemaPrepared: "layerSchemaPrepared",
  signalOnly: "layerSignalOnly",
} as const;

type LayerStatus = keyof typeof LAYER_STATUS_KEY;

/** Safe first actions → real existing routes. Accommodation is a PLANNED
 *  layer note, not a link (no route / no data yet). */
const NEXT_ACTIONS = [
  { key: "workerCountry", href: "/dashboard/profile" },
  { key: "companyNeed", href: "/dashboard/company" },
  { key: "project", href: "/dashboard/company/projects/new" },
] as const;

const LEGEND = ["ready", "needsDocs", "noData"] as const;
const LEGEND_TONE: Record<(typeof LEGEND)[number], string> = {
  ready: "bg-state-success",
  needsDocs: "bg-state-warning",
  noData: "bg-ink-500",
};

export async function MarketMapShell() {
  const t = await getTranslations("marketMap");

  // Real signal-only count from the company_demand_locations table (#423),
  // RLS-scoped to the caller's own demands. Defensive: any null → fall back to
  // the static "schema prepared" state. Still ZERO markers either way — a row
  // is only mappable once coordinates are confirmed (verified/manual).
  const demandSummary = await getOwnDemandLocationSummary();
  // schema_prepared (0 rows) → "schemaPrepared"; any real rows → "signalOnly".
  // This v1 never reaches "live" (signal-only rows carry no coordinates, so
  // none are mappable) — kept defensive so a stray mappable row still shows as
  // a signal, never a marker.
  const demandStatus: LayerStatus =
    demandSummary && demandLayerStatus(demandSummary) !== "schema_prepared"
      ? "signalOnly"
      : "schemaPrepared";
  const demandSignalCount = demandSummary?.total ?? 0;

  // Signal-only READ LAYER: real demand signals grouped by country, no points.
  const signalBoard = await getOwnDemandSignalBoard();
  const hasSignals = !!signalBoard && signalBoard.total > 0;

  return (
    <div className="flex flex-col gap-6" data-testid="market-map-shell">
      {/* Hero */}
      <header className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="self-start text-xs font-medium text-brand-blue transition-colors hover:underline"
          data-testid="back-to-action-center"
        >
          ← {t("backToActions")}
        </Link>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tightest text-text-primary">
          <MapIcon className="h-7 w-7 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("title")}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("subtitle")}
        </p>
      </header>

      {/* Honest foundation notice — no fake markers */}
      <p
        className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
        data-testid="market-map-foundation-notice"
      >
        {t("foundationNotice")}
      </p>

      {/* Filter bar over REAL dimensions (countries + sectors already in app) */}
      <section
        className="card-border flex flex-col gap-2 p-4"
        data-testid="market-map-filters"
      >
        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("filtersTitle")} · {t("preparing")}
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border-subtle bg-surface-1 px-3 py-1 text-xs text-text-secondary">
            {t("filterCountry")}: {t("filterAll")} ({SUPPORTED_COUNTRIES.length})
          </span>
          <span className="rounded-full border border-border-subtle bg-surface-1 px-3 py-1 text-xs text-text-secondary">
            {t("filterSector")}: {t("filterAll")} ({SECTORS.length})
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        {/* Map canvas — the signal-only READ LAYER when real signals exist
            (grouped by country, NO markers / NO coordinates), else the honest
            empty foundation state. */}
        {hasSignals && signalBoard ? (
          <section
            className="card-border flex min-h-[320px] flex-col gap-4 p-6"
            data-testid="market-map-canvas"
          >
            <MarketMapSignalLayer board={signalBoard} />
          </section>
        ) : (
          <section
            className="card-border flex min-h-[320px] flex-col items-center justify-center gap-2 p-6 text-center"
            data-testid="market-map-canvas"
          >
            <MapIcon className="h-10 w-10 text-text-muted" strokeWidth={1.25} aria-hidden />
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("canvasEmptyTitle")}
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-text-secondary">
              {t("canvasEmptyBody")}
            </p>
          </section>
        )}

        {/* Side: legend + layers */}
        <aside className="flex flex-col gap-6">
          {/* Status legend */}
          <section
            className="card-border flex flex-col gap-2 p-4"
            data-testid="market-map-legend"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("legendTitle")}
            </p>
            <ul className="flex flex-col gap-1.5">
              {LEGEND.map((s) => (
                <li key={s} className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_TONE[s]}`} aria-hidden />
                  {t(`legend.${s}`)}
                </li>
              ))}
            </ul>
          </section>

          {/* Planned layers */}
          <section
            className="card-border flex flex-col gap-3 p-4"
            data-testid="market-map-layers"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("layersTitle")}
            </p>
            <ul className="flex flex-col gap-2.5">
              {LAYERS.map(({ key, icon: Icon, status }) => {
                // The demand layer's status is REAL/dynamic (#423 table); the
                // rest stay as declared. signalOnly + schemaPrepared are both
                // "blue" (prepared/real-but-no-markers); planned is "warning".
                const effectiveStatus: LayerStatus =
                  key === "demand" ? demandStatus : status;
                const blue =
                  effectiveStatus === "schemaPrepared" ||
                  effectiveStatus === "signalOnly";
                return (
                <li key={key} className="flex items-start gap-2.5" data-testid={`market-map-layer-${key}`}>
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm text-text-primary">
                      {t(`layers.${key}.label`)}
                      <span
                        data-testid={`market-map-layer-${key}-status`}
                        className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label ${
                          blue
                            ? "border-brand-blue/40 bg-brand-blue/5 text-brand-blue"
                            : "border-state-warning/40 bg-state-warning/5 text-state-warning"
                        }`}
                      >
                        {t(LAYER_STATUS_KEY[effectiveStatus])}
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-text-muted">
                      {t(`layers.${key}.desc`)}
                    </span>
                    {key === "demand" && effectiveStatus === "schemaPrepared" && (
                      <span
                        className="mt-0.5 text-[11px] leading-relaxed text-text-muted"
                        data-testid="market-map-demand-schema-note"
                      >
                        {t("demandSchemaNote")}
                      </span>
                    )}
                    {key === "demand" && effectiveStatus === "signalOnly" && (
                      <span
                        className="mt-0.5 text-[11px] leading-relaxed text-text-muted"
                        data-testid="market-map-demand-signal-note"
                      >
                        {t("demandSignalNote", { count: demandSignalCount })}
                      </span>
                    )}
                  </span>
                </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>

      {/* Work Market Atlas binding — the map's layer taxonomy comes from the
          atlas (PR 5). Every layer is SIGNAL-ONLY: a point appears only with
          verified coordinates, so nothing here plots a marker. */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="market-map-atlas-layers"
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {t("atlas.title")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("atlas.intro", { categories: mapEligibleCategories().length, blocks: ATLAS_BLOCK_COUNT })}
          </p>
        </div>
        <ul className="flex flex-wrap gap-2" data-testid="market-map-atlas-kinds">
          {MAP_LAYER_KINDS.map((kind) => (
            <li
              key={kind}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-500 bg-ink-800/40 px-2.5 py-1 text-[11px] text-text-secondary"
              data-layer-kind={kind}
            >
              {t(`atlas.kind.${kind}`)}
            </li>
          ))}
        </ul>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t("atlas.signalOnlyNote")}
        </p>
      </section>

      {/* Next action panel */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="market-map-next-actions"
      >
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("nextActionsTitle")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {NEXT_ACTIONS.map(({ key, href }) => (
            <Link
              key={key}
              href={href as "/dashboard"}
              data-testid={`market-map-action-${key}`}
              className="flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-1 p-3 transition-colors hover:border-brand-blue"
            >
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" strokeWidth={2} aria-hidden />
              <span className="text-sm font-medium text-text-primary">
                {t(`nextActions.${key}`)}
              </span>
            </Link>
          ))}
        </div>
        {/* Accommodation is a PLANNED future layer, not an action yet. */}
        <p className="text-xs leading-relaxed text-text-muted" data-testid="market-map-accommodation-note">
          {t("nextActions.accommodationNote")}
        </p>
      </section>
    </div>
  );
}
