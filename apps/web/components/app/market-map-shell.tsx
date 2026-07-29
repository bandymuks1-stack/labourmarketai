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
  ArrowRight,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { SUPPORTED_COUNTRIES } from "@/lib/labour-market/country-evidence";
import { SECTORS } from "@/lib/structuring/sectors";
import { getOwnDemandLocationSummary, getOwnDemandSignalBoard } from "@/lib/demand/demand-location";
import { getOwnMarketSignals } from "@/lib/market-map/signals";
import { MarketMapSignalLayer } from "@/components/app/market-map-signal-layer";
import { MarketMapMySignals } from "@/components/app/market-map-my-signals";
import {
  MAP_LAYER_KINDS,
  mapEligibleCategories,
  ATLAS_BLOCK_COUNT,
} from "@/lib/work-market/atlas";

/**
 * Market map — the logged-in owner's working market-signal space. It renders
 * the caller's OWN signals (profile / company / preferred / login / company-need
 * / project) via the #459 owner read layer — RLS-scoped, country/region level,
 * no fake markers, no external map API / key. The capture panel (page.tsx) lets
 * the owner add/manage those signals.
 *
 * Honest limits stay explicit: no public cross-user aggregate yet (a future
 * owner-gated layer with aggregation safeguards), other users' signals are not
 * shown, exact location is hidden until confirmed, login is approximate +
 * consent-gated. Future signal layers are clearly separated as "next stage".
 */

/** Signal layers. ACTIVE layers already surface the owner's own signals today
 *  (preferred → workers, company-need → demand, projects). NEXT-STAGE layers are
 *  honestly separated as future additions — they fill only from real signals,
 *  never invented points. */
const ACTIVE_LAYERS = [
  { key: "workers", icon: Users },
  { key: "demand", icon: ClipboardList },
  { key: "projects", icon: FolderKanban },
] as const;

const NEXT_STAGE_LAYERS = [
  { key: "accommodation", icon: Home },
  { key: "teams", icon: UsersRound },
  { key: "readiness", icon: ShieldCheck },
  { key: "rates", icon: Coins },
  { key: "countryFit", icon: Globe2 },
] as const;

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

  // Real signal count from the company_demand_locations table (#423),
  // RLS-scoped to the caller's own demands. Country/region signals only — a row
  // is never a marker (no confirmed coordinates are surfaced here).
  const demandSummary = await getOwnDemandLocationSummary();
  const demandSignalCount = demandSummary?.total ?? 0;

  // Signal-only READ LAYER: real demand signals grouped by country, no points.
  const signalBoard = await getOwnDemandSignalBoard();
  const hasSignals = !!signalBoard && signalBoard.total > 0;

  // OWNER VIEW: the logged-in user's OWN normalized market signals (profile,
  // company, login [consent-gated], preferred, company-need, project) via the
  // #459 read layer — RLS-scoped, owner-only, country/region level. This is NOT
  // the public/cross-user aggregate (that stays a future owner-gated source).
  const mySignals = (await getOwnMarketSignals()) ?? [];
  // A real country/region-level signal is a REAL signal — the map renders a live
  // surface, never an empty state.
  const hasRealSignal = mySignals.length > 0 || hasSignals;

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

      {/* Owner scope note — working space + honest limits (no public aggregate) */}
      <p
        className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
        data-testid="market-map-owner-scope-note"
      >
        {t("ownerScopeNote")}
      </p>

      {/* Scope note over REAL dimensions. Dead-UI rule B (owner smoke
          2026-07-05): NOT pill chips — filtering does not exist here yet, so
          this must read as plain information, never as tappable filters. */}
      <section
        className="card-border flex flex-col gap-1 p-4"
        data-testid="market-map-filters"
      >
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("scopeTitle")}
        </p>
        <p className="text-xs text-text-secondary">
          {t("filterCountry")}: {t("filterAll")} ({SUPPORTED_COUNTRIES.length}) ·{" "}
          {t("filterSector")}: {t("filterAll")} ({SECTORS.length})
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        {/* Map canvas. The SELF-SIGNAL always renders first (the logged-in user
            on the shared map — their own country signal or a real
            location-completion action), then the signal-only demand READ LAYER
            when real signals exist (grouped by country, NO markers / NO
            coordinates), else the honest empty foundation state. */}
        <section
          className="card-border flex min-h-[320px] flex-col gap-5 p-6"
          data-testid="market-map-canvas"
        >
          <MarketMapMySignals signals={mySignals} />

          {/* Company-need / demand signals: the real board when locations exist,
              else an action-oriented prompt — NOT an "empty map" claim, because
              the self-signal above is already a real signal. */}
          {hasSignals && signalBoard ? (
            <MarketMapSignalLayer board={signalBoard} />
          ) : (
            <div
              className="flex flex-col gap-2 rounded-md border border-dashed border-ink-600 p-4"
              data-testid="market-map-demand-empty"
            >
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-text-primary">
                <ClipboardList className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
                {t("demandPromptTitle")}
              </h2>
              <p className="max-w-md text-xs leading-relaxed text-text-secondary">
                {t("demandPromptBody")}
              </p>
              <Link
                href={"/dashboard/company" as "/dashboard"}
                data-testid="market-map-demand-add"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-2.5 py-1 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue"
              >
                {t("demandPromptCta")}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </Link>
            </div>
          )}

          {/* When the user has no location signal at all, the self-signal panel
              already shows a real location-completion action; the map is never
              a bare "empty/fake" state. */}
          {!hasRealSignal && (
            <p
              className="text-meta leading-relaxed text-text-muted"
              data-testid="market-map-no-signal-hint"
            >
              {t("noSignalHint")}
            </p>
          )}
        </section>

        {/* Side: legend + layers */}
        <aside className="flex flex-col gap-6">
          {/* Status legend */}
          <section
            className="card-border flex flex-col gap-2 p-4"
            data-testid="market-map-legend"
          >
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
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

          {/* Signal layers — ACTIVE now (driven by the owner's own signals) +
              a clearly separated "next stage" group for future layers. */}
          <section
            className="card-border flex flex-col gap-3 p-4"
            data-testid="market-map-layers"
          >
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("layersTitle")}
            </p>
            <ul className="flex flex-col gap-2.5">
              {ACTIVE_LAYERS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-2.5" data-testid={`market-map-layer-${key}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm text-text-primary">
                      {t(`layers.${key}.label`)}
                      <span
                        data-testid={`market-map-layer-${key}-status`}
                        className="rounded-sm border border-brand-blue/40 bg-brand-blue/5 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-brand-blue"
                      >
                        {t("layerActive")}
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-text-muted">
                      {t(`layers.${key}.desc`)}
                    </span>
                    {key === "demand" && demandSignalCount > 0 && (
                      <span
                        className="mt-0.5 text-meta leading-relaxed text-text-muted"
                        data-testid="market-map-demand-signal-note"
                      >
                        {t("demandSignalNote", { count: demandSignalCount })}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {/* Next stage — future layers, honestly separated (not the centre). */}
            <div
              className="mt-1 flex flex-col gap-2 border-t border-ink-600/60 pt-3"
              data-testid="market-map-next-stage"
            >
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("nextStageTitle")}
              </p>
              <ul className="flex flex-col gap-2">
                {NEXT_STAGE_LAYERS.map(({ key, icon: Icon }) => (
                  <li key={key} className="flex items-start gap-2.5 opacity-70" data-testid={`market-map-layer-${key}`}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm text-text-secondary">
                        {t(`layers.${key}.label`)}
                        <span
                          data-testid={`market-map-layer-${key}-status`}
                          className="rounded-sm border border-border-subtle bg-surface-1 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
                        >
                          {t("layerNextStage")}
                        </span>
                      </span>
                      <span className="text-xs leading-relaxed text-text-muted">
                        {t(`layers.${key}.desc`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-meta leading-relaxed text-text-muted">{t("nextStageNote")}</p>
            </div>
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
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-500 bg-ink-800/40 px-2.5 py-1 text-meta text-text-secondary"
              data-layer-kind={kind}
            >
              {t(`atlas.kind.${kind}`)}
            </li>
          ))}
        </ul>
        <p className="text-meta leading-relaxed text-text-muted">
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
