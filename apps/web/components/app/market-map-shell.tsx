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

/** Planned data layers. Each is "planned" until a real geo source exists
 *  (see docs/audit/live-market-map-foundation-v1.md data-source matrix). */
const LAYERS = [
  { key: "workers", icon: Users },
  { key: "demand", icon: ClipboardList },
  { key: "projects", icon: FolderKanban },
  { key: "accommodation", icon: Home },
  { key: "teams", icon: UsersRound },
  { key: "readiness", icon: ShieldCheck },
  { key: "rates", icon: Coins },
  { key: "countryFit", icon: Globe2 },
  { key: "nextActions", icon: Compass },
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
        {/* Map canvas — empty foundation state, no markers */}
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
              {LAYERS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm text-text-primary">
                      {t(`layers.${key}.label`)}
                      <span className="rounded-sm border border-state-warning/40 bg-state-warning/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label text-state-warning">
                        {t("layerPlanned")}
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-text-muted">
                      {t(`layers.${key}.desc`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

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
