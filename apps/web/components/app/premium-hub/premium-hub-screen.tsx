import { getTranslations } from "next-intl/server";

import type { PremiumHubViewModel } from "./premium-hub-data";
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
 *
 * `embedded` (dashboard consolidation v1): when the hub leads the canonical
 * /dashboard, the page already owns the greeting heading, so the hub drops its
 * own page title/lead and shows only the status badge above the grid — no
 * competing <h1>, no duplicated heading. Standalone mode keeps the full header.
 */
export async function PremiumHubScreen({
  vm,
  embedded = false,
  contextual = false,
}: {
  vm: PremiumHubViewModel;
  embedded?: boolean;
  /** Primary-action hierarchy v1 (worker dashboard): the hub's PRIMARY slot
   *  carries only company/project cards that have REAL data
   *  (`status === "ready"`). Empty/unavailable company & project cards and
   *  the map preview move to the collapsed review section — the page renders
   *  them there itself, so every door and honest empty state survives one
   *  tap away. Contextual rendering follows real state, never a guess. */
  contextual?: boolean;
}) {
  const t = await getTranslations("premiumHub");

  // F7/F16 (production UX repair v2): the "Gyvi duomenys · kai kurie blokai
  // dar neužpildyti" badge was architecture reassurance the user cannot act
  // on — internal data-source vocabulary is banned from the primary
  // hierarchy, so the hub renders no data-provenance badge at all.

  const showCompany = !contextual || vm.company.status === "ready";
  const showProject = !contextual || vm.project.status === "ready";
  const showMap = !contextual;
  const columns = (showCompany || showMap ? 1 : 0) + (showProject ? 1 : 0);

  // W3 row 1: the PERSON block is gone from here. It was a second, lesser
  // rendering of the canonical player card — and it carried the only
  // availability/location/pay editor, which moved with it into the
  // `player-card` RESULT. The hub keeps what is still its own subject: the
  // organization, the market and the project (rows 2, 4 and 3).
  const grid = (
    <div
      className={`grid gap-4 lg:items-stretch ${
        columns === 2 ? "lg:grid-cols-2" : ""
      }`}
    >
      {showCompany || showMap ? (
        <div className="flex flex-col gap-4">
          {showCompany ? <PremiumHubCompanyCard company={vm.company} /> : null}
          {showMap ? <PremiumHubMarketMap market={vm.market} /> : null}
        </div>
      ) : null}
      {showProject ? <PremiumHubProjectCard project={vm.project} /> : null}
    </div>
  );

  if (embedded) {
    return (
      <div
        className="rounded-xl border border-ink-600 bg-gradient-to-b from-ink-800/50 to-ink-900/30 p-4 shadow-card sm:p-6"
        data-testid="premium-hub-screen"
      >
        {grid}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="premium-hub-screen">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs font-semibold uppercase tracking-label text-brand-cyan">
          {t("brand")}
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("pageTitle")}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("pageLead")}
        </p>
      </header>

      <div className="rounded-xl border border-ink-600 bg-gradient-to-b from-ink-800/50 to-ink-900/30 p-4 shadow-card sm:p-6">
        {grid}
      </div>
    </div>
  );
}
