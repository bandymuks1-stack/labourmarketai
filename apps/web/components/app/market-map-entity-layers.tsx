"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Building2, Hammer, Eye, EyeOff } from "lucide-react";
import type {
  SpatialEntityCollections,
  SpatialEntityKind,
} from "@/lib/market-map/spatial-entities";

/**
 * MarketMapEntityLayers — the three spatial entities as three TOGGLEABLE
 * layers with three DISTINCT visual languages (Sprint v2 §6: person, company
 * operating territory, project location — never mixed):
 *
 *   - person_presence   → rounded AREA CHIP (filled square, brand-blue):
 *                         coarse aggregated presence per area, count shown
 *                         only when n >= 5, otherwise the "<5" band (§20).
 *                         No name, no contact, no exact point — ever.
 *   - company_territory → dashed OUTLINE ring (brand-cyan): an operating
 *                         territory/area, deliberately never a point-pin so
 *                         it cannot be mistaken for a person or a project.
 *   - project_location  → DIAMOND marker (rotated square, amber): a typed
 *                         project row; "confirmed" tag only when the project
 *                         location was explicitly confirmed.
 *
 * There is NO combined "everything" pin type: the component receives the
 * typed collections and renders each kind in its own section with its own
 * honest empty state. Communication happens only through the platform
 * workflow — no entity shows contact details (contactNote states this).
 *
 * Presentational + local toggle state only. Data arrives via props from the
 * owner-scoped server composer — this file never imports the fetchers
 * (mirrors the market-map-my-signals props-only pattern).
 */
export function MarketMapEntityLayers({
  collections,
  companyTerritorySource,
  countryNames,
}: {
  collections: SpatialEntityCollections;
  companyTerritorySource: "ok" | "needs-migration" | "error";
  /** Already-localized country display names keyed by ISO-2 code. */
  countryNames: Record<string, string>;
}) {
  const t = useTranslations("marketMap.entities");
  const [visible, setVisible] = useState<Record<SpatialEntityKind, boolean>>({
    person_presence: true,
    company_territory: true,
    project_location: true,
  });

  const toggle = (kind: SpatialEntityKind) =>
    setVisible((v) => ({ ...v, [kind]: !v[kind] }));

  const countryName = (code: string) => countryNames[code] ?? code;
  const areaLabel = (country: string, region: string | null, city: string | null) =>
    [city, region, countryName(country)].filter(Boolean).join(", ");

  const layers: {
    kind: SpatialEntityKind;
    icon: typeof Users;
    count: number;
    /** Distinct legend swatch per kind — the visual contract, documented above. */
    swatch: React.ReactNode;
  }[] = [
    {
      kind: "person_presence",
      icon: Users,
      count: collections.personPresence.length,
      swatch: (
        <span
          aria-hidden
          className="inline-block h-3 w-3 shrink-0 rounded bg-brand-blue/70"
        />
      ),
    },
    {
      kind: "company_territory",
      icon: Building2,
      count: collections.companyTerritories.length,
      swatch: (
        <span
          aria-hidden
          className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-brand-cyan bg-transparent"
        />
      ),
    },
    {
      kind: "project_location",
      icon: Hammer,
      count: collections.projectLocations.length,
      swatch: (
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 shrink-0 rotate-45 bg-state-warning/80"
        />
      ),
    },
  ];

  const I18N: Record<SpatialEntityKind, "person" | "company" | "project"> = {
    person_presence: "person",
    company_territory: "company",
    project_location: "project",
  };

  return (
    <section
      className="flex flex-col gap-3 card-border bg-ink-900/40 p-4"
      data-testid="market-map-entity-layers"
      aria-label={t("title")}
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-sm font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>
        {/* The separation + communication contract, stated to the user. */}
        <p
          className="text-meta leading-relaxed text-text-muted"
          data-testid="entity-layers-never-mixed"
        >
          {t("neverMixedNote")} {t("contactNote")}
        </p>
      </header>

      {/* Layer toggles + legend — one row per kind, distinct swatch. */}
      <ul className="flex flex-col gap-1.5" data-testid="entity-layers-legend">
        {layers.map(({ kind, icon: Icon, count, swatch }) => {
          const on = visible[kind];
          return (
            <li key={kind}>
              <button
                type="button"
                onClick={() => toggle(kind)}
                aria-pressed={on}
                data-testid={`entity-layer-toggle-${kind}`}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                  on ? "border-ink-500 bg-ink-800/40" : "border-ink-600 bg-ink-900/40 opacity-60"
                }`}
              >
                {swatch}
                <Icon className="h-4 w-4 shrink-0 text-text-secondary" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-text-primary">
                    {t(`${I18N[kind]}.name`)}
                  </span>
                  <span className="block text-meta leading-relaxed text-text-muted">
                    {t(`${I18N[kind]}.legend`)}
                  </span>
                </span>
                <span className="font-mono text-meta text-text-muted">{count}</span>
                {on ? (
                  <Eye className="h-3.5 w-3.5 shrink-0 text-text-secondary" strokeWidth={1.75} aria-hidden />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* 1 · Person presence — aggregated area chips only (never a point). */}
      {visible.person_presence && (
        <div className="flex flex-col gap-1.5" data-testid="entity-layer-person_presence">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("person.name")}
          </span>
          {collections.personPresence.length === 0 ? (
            <p
              className="text-xs leading-relaxed text-text-muted"
              data-testid="entity-layer-empty-person_presence"
            >
              {t("person.empty")}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {collections.personPresence.map((e) => (
                <li key={e.areaKey}>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-blue/40 bg-brand-blue/10 px-2.5 py-1 text-xs text-text-primary">
                    <span aria-hidden className="h-2 w-2 rounded bg-brand-blue/70" />
                    {areaLabel(e.country, e.region, e.city)}
                    <span className="font-mono text-meta text-text-secondary">
                      {e.band.kind === "exact"
                        ? t("person.countLabel", { count: e.band.count })
                        : t("person.smallSample")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-meta leading-relaxed text-text-muted">
            {t("person.visibilityNote")}
          </p>
        </div>
      )}

      {/* 2 · Company operating territory — outlined areas, never point-pins. */}
      {visible.company_territory && (
        <div className="flex flex-col gap-1.5" data-testid="entity-layer-company_territory">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("company.name")}
          </span>
          {companyTerritorySource === "needs-migration" ? (
            <p
              className="text-xs leading-relaxed text-text-muted"
              data-testid="entity-layer-company-territory-gated"
            >
              {t("company.storeInactive")}
            </p>
          ) : companyTerritorySource === "error" ? (
            <p className="text-xs leading-relaxed text-state-warning">
              {t("company.readError")}
            </p>
          ) : collections.companyTerritories.length === 0 ? (
            <p
              className="text-xs leading-relaxed text-text-muted"
              data-testid="entity-layer-empty-company_territory"
            >
              {t("company.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {collections.companyTerritories.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-md border-2 border-dashed border-brand-cyan/40 bg-ink-800/30 px-3 py-1.5 text-xs text-text-primary"
                >
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-brand-cyan"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {e.label ?? areaLabel(e.country, e.region, e.city)}
                  </span>
                  <span className="shrink-0 rounded-full border border-ink-500 px-2 py-0.5 text-meta text-text-muted">
                    {t(`company.kinds.${e.territoryKind}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-meta leading-relaxed text-text-muted">
            {t("company.visibilityNote")}
          </p>
        </div>
      )}

      {/* 3 · Project locations — typed diamond entries, honest confirmation. */}
      {visible.project_location && (
        <div className="flex flex-col gap-1.5" data-testid="entity-layer-project_location">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("project.name")}
          </span>
          {collections.projectLocations.length === 0 ? (
            <p
              className="text-xs leading-relaxed text-text-muted"
              data-testid="entity-layer-empty-project_location"
            >
              {t("project.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {collections.projectLocations.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-1.5 text-xs text-text-primary"
                >
                  <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 bg-state-warning/80" />
                  <span className="min-w-0 flex-1 truncate">
                    {areaLabel(e.country, null, e.city)}
                  </span>
                  <span className="shrink-0 rounded-full border border-ink-500 px-2 py-0.5 text-meta text-text-muted">
                    {e.confirmed ? t("project.confirmedTag") : t("project.unconfirmedTag")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-meta leading-relaxed text-text-muted">
            {t("project.visibilityNote")}
          </p>
        </div>
      )}
    </section>
  );
}
