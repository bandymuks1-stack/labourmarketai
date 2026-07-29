"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  UserRound,
  Building2,
  LogIn,
  Compass,
  ClipboardList,
  FolderKanban,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import type { NormalizedSignal, SignalType } from "@/lib/market-map/signal-model";

/**
 * Market Map — OWNER view, driven by the #459 owner read layer.
 *
 * Renders the caller's OWN signals only (RLS-scoped server fetch), grouped into
 * the six categories, with filter chips. Country/region level only — exact
 * location is hidden until confirmed; login location is approximate and shown
 * ONLY when consented (revoked / not_requested are never rendered);
 * country/region only, no coordinates, no fake markers. This is NOT the
 * public/cross-user aggregate — it shows only the caller's own data.
 */

type Filter = "all" | SignalType;

// `anchor` points the CTA at the on-page capture control (preferred add form /
// login consent) so it does exactly what it says without leaving the map; the
// rest link to where that signal is actually edited (profile / company).
const CATEGORY_ORDER: {
  type: SignalType;
  icon: typeof UserRound;
  labelKey: string;
  href: string;
  ctaKey: string;
  anchor?: string;
}[] = [
  { type: "profile_location", icon: UserRound, labelKey: "profileLabel", href: "/dashboard/profile", ctaKey: "ctaRefineProfile" },
  { type: "company_location", icon: Building2, labelKey: "companyLabel", href: "/dashboard/company", ctaKey: "ctaRefineCompany" },
  { type: "login_location", icon: LogIn, labelKey: "loginLabel", href: "/dashboard/account", ctaKey: "ctaLogin", anchor: "#market-map-login-consent" },
  { type: "preferred_location", icon: Compass, labelKey: "preferredLabel", href: "/dashboard/profile", ctaKey: "ctaAddPreferred", anchor: "#market-map-add-preferred" },
  { type: "company_need_location", icon: ClipboardList, labelKey: "demandLabel", href: "/dashboard/company", ctaKey: "ctaAddDemand" },
  { type: "project_location", icon: FolderKanban, labelKey: "projectLabel", href: "/dashboard/company", ctaKey: "ctaProject" },
];

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: "all", labelKey: "filterAll" },
  { key: "profile_location", labelKey: "filterProfile" },
  { key: "company_location", labelKey: "filterCompany" },
  { key: "login_location", labelKey: "filterLogin" },
  { key: "preferred_location", labelKey: "filterPreferred" },
  { key: "company_need_location", labelKey: "filterDemand" },
  { key: "project_location", labelKey: "filterProject" },
];

export function MarketMapMySignals({ signals }: { signals: NormalizedSignal[] }) {
  const t = useTranslations("marketMap.mySignals");
  const tlm = useTranslations("labourMarket");
  const [filter, setFilter] = useState<Filter>("all");

  const countryName = (code: string | null): string => {
    if (!code) return "";
    const name = tlm(`countryNames.${code}`);
    return name.includes("countryNames.") ? code : name;
  };

  // login is shown ONLY when consented (privacy). Group by category.
  const byType = useMemo(() => {
    const m = new Map<SignalType, NormalizedSignal[]>();
    for (const s of signals) {
      if (s.signalType === "login_location" && s.sourceStatus !== "consented") continue;
      const arr = m.get(s.signalType) ?? [];
      arr.push(s);
      m.set(s.signalType, arr);
    }
    return m;
  }, [signals]);

  /** Country/region/city label, never exact (city only shown as area name). */
  const placeLabel = (s: NormalizedSignal): string => {
    const parts: string[] = [];
    if (s.granularity === "city" && s.city) parts.push(s.city);
    if ((s.granularity === "region" || s.granularity === "city") && s.region) parts.push(s.region);
    parts.push(countryName(s.country));
    return parts.filter(Boolean).join(", ");
  };

  return (
    <section className="flex flex-col gap-3" data-testid="market-map-my-signals">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 font-display text-base font-semibold text-text-primary">
          <UserRound className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("title")}
        </span>
        <p className="text-meta leading-relaxed text-text-muted">{t("note")}</p>
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-2.5 py-1.5 text-meta leading-relaxed text-text-secondary"
          data-testid="market-map-country-level-notice"
        >
          {t("countryLevelNotice")} · {t("exactHidden")}
        </p>
      </div>

      {/* Filter chips / legend */}
      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label={t("filtersAria")}
        data-testid="market-map-filter-chips"
      >
        {FILTERS.map(({ key, labelKey }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(key)}
              data-testid={`market-map-filter-${key}`}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                  : "border-border-subtle bg-surface-1 text-text-secondary hover:border-brand-blue"
              }`}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-2">
        {CATEGORY_ORDER.filter((c) => filter === "all" || filter === c.type).map(
          ({ type, icon: Icon, labelKey, href, ctaKey, anchor }) => {
            const rows = byType.get(type) ?? [];
            const isLogin = type === "login_location";
            return (
              <li
                key={type}
                className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/50 p-3"
                data-testid={`market-map-category-${type}`}
                data-count={rows.length}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
                  <span className="text-sm font-medium text-text-primary">{t(labelKey)}</span>
                  {rows.length > 0 && (
                    <span className="ml-auto font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("countryLevelTag")}
                    </span>
                  )}
                </div>

                {rows.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {rows.map((s) => (
                      <li
                        key={s.signalId}
                        // Neutral tone (dead-UI rule B): these are data
                        // chips, not the active-filter buttons above them.
                        className="inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5 text-xs text-text-secondary"
                      >
                        <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                        {placeLabel(s)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {isLogin ? t("loginNeutral") : t(`empty.${type}`)}
                  </p>
                )}

                {anchor ? (
                  // On-page scroll to the matching capture control (no nav away).
                  <a
                    href={anchor}
                    data-testid={`market-map-cta-${type}`}
                    className="inline-flex w-fit items-center gap-1 text-meta font-semibold text-brand-blue hover:text-brand-cyan"
                  >
                    {t(ctaKey)}
                    <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
                  </a>
                ) : (
                  <Link
                    href={href as "/dashboard"}
                    data-testid={`market-map-cta-${type}`}
                    className="inline-flex w-fit items-center gap-1 text-meta font-semibold text-brand-blue hover:text-brand-cyan"
                  >
                    {t(ctaKey)}
                    <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
                  </Link>
                )}
              </li>
            );
          },
        )}
      </ul>
    </section>
  );
}
