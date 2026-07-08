import { getTranslations } from "next-intl/server";

import type { PremiumHubViewModel } from "./premium-hub-data";
import { PremiumHubPersonCard } from "./premium-hub-person-card";
import { PremiumHubCompanyCard } from "./premium-hub-company-card";
import { PremiumHubMarketMap } from "./premium-hub-market-map";
import { PremiumHubProjectCard } from "./premium-hub-project-card";

/**
 * Premium Hub — one canonical premium dashboard surface (person + company +
 * market + project as one connected control room), now backed by REAL
 * RLS-scoped data (premium-hub-data.ts). No fixtures.
 *
 * Honesty: the header badge states whether every block is live or some are still
 * empty — it never claims "live data" over a fabricated value, because there are
 * none. Each block renders real data, an honest empty state, or a neutral
 * "unavailable" note.
 *
 * Layout is unchanged from PR #688: desktop 3 columns (person | company + market
 * map | project); mobile stacks person → company → map → project.
 */
export async function PremiumHubScreen({ vm }: { vm: PremiumHubViewModel }) {
  const t = await getTranslations("premiumHub");

  return (
    <div className="flex flex-col gap-5" data-testid="premium-hub-screen">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold uppercase tracking-label text-brand-cyan">
            {t("brand")}
          </span>
          <span
            data-testid="premium-hub-status-badge"
            className={
              vm.allReady
                ? "inline-flex items-center gap-1.5 rounded-full border border-state-success/40 bg-state-success/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-state-success"
                : "inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted"
            }
          >
            {vm.allReady ? (
              <span className="live-dot" aria-hidden />
            ) : null}
            {vm.allReady ? t("liveBadge") : t("partialBadge")}
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("pageTitle")}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("pageLead")}
        </p>
      </header>

      <div className="rounded-3xl border border-ink-600 bg-gradient-to-b from-ink-800/50 to-ink-900/30 p-4 shadow-card sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
          <PremiumHubPersonCard person={vm.person} />
          <div className="flex flex-col gap-4">
            <PremiumHubCompanyCard company={vm.company} />
            <PremiumHubMarketMap market={vm.market} />
          </div>
          <PremiumHubProjectCard project={vm.project} />
        </div>
      </div>
    </div>
  );
}
