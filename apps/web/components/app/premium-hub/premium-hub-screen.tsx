import { getTranslations } from "next-intl/server";

import { PREMIUM_HUB_PREVIEW } from "./premium-hub-fixtures";
import { PremiumHubPersonCard } from "./premium-hub-person-card";
import { PremiumHubCompanyCard } from "./premium-hub-company-card";
import { PremiumHubMarketMap } from "./premium-hub-market-map";
import { PremiumHubProjectCard } from "./premium-hub-project-card";

/**
 * Premium Hub — one canonical premium dashboard surface that instantly explains
 * the system: person + company + market + project as one connected control room.
 *
 * Honest by construction (doctrine §18): the whole surface is marked a CONCEPT
 * PREVIEW carrying stand-in data (see premium-hub-fixtures.ts). Real data wiring
 * is a follow-up — docs/launch/premium-hub-screen-data-bindings.md.
 *
 * Layout: desktop 3 columns — left = person (full height), middle top = company,
 * middle bottom = market map, right = project (full height). On mobile the DOM
 * order (person → company → map → project) stacks into the required vertical
 * flow with no horizontal overflow.
 */
export async function PremiumHubScreen() {
  const t = await getTranslations("premiumHub");
  const data = PREMIUM_HUB_PREVIEW;

  return (
    <div className="flex flex-col gap-5" data-testid="premium-hub-screen">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold uppercase tracking-label text-brand-cyan">
            {t("brand")}
          </span>
          <span
            data-testid="premium-hub-concept-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-state-warning/40 bg-state-warning/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-state-warning"
          >
            {t("conceptBadge")}
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("pageTitle")}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("pageLead")}
        </p>
      </header>

      {/* Connected premium shell — one surface, not four loose cards. */}
      <div className="rounded-3xl border border-ink-600 bg-gradient-to-b from-ink-800/50 to-ink-900/30 p-4 shadow-card sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
          <PremiumHubPersonCard person={data.person} />
          <div className="flex flex-col gap-4">
            <PremiumHubCompanyCard company={data.company} />
            <PremiumHubMarketMap nodes={data.mapNodes} />
          </div>
          <PremiumHubProjectCard project={data.project} />
        </div>
      </div>
    </div>
  );
}
