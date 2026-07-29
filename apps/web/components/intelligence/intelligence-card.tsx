import { getTranslations } from "next-intl/server";

import type {
  IntelligenceCardState,
  IntelligenceCardV1,
  IntelligenceSourceBadge,
} from "@/lib/intelligence/intelligence-view-model";
import type { IntelligenceValueClass } from "@/lib/intelligence/skills-demand-model";
import {
  INTEL_CHIP_CLASS,
  INTEL_ORIGIN_TONE,
  INTEL_STATE_TONE,
} from "./badge-styles";
import { ExplainabilityDrawer } from "./explainability-drawer";

/**
 * ONE insight card (Labour Market Intelligence v1) — a pure server renderer
 * over an IntelligenceCardV1 produced by lib/intelligence's view-model
 * builders. No fetching, no computation: every number and every i18n code
 * arrives pre-built from the model layer (§18 — the UI never invents a
 * figure).
 *
 * Honesty contract:
 *  - the card state (ready / insufficient_data / needs_migration / stale) is
 *    always visible as a labelled chip + an honest state note;
 *  - the source badge (origin kind, source, observed date) always renders,
 *    with external origin visually distinct from internal (tones from the
 *    ONE badge design language, ./badge-styles.ts);
 *  - the FULL explanation sits behind the ONE shared explainability drawer
 *    (./explainability-drawer.tsx) — V1 cards carry no trust report, so the
 *    drawer's confidence/freshness/observation rows degrade to their honest
 *    "unknown" states rather than disappearing.
 */

/** valueClass → i18n leaf under intelligence.valueClass.* */
const VALUE_CLASS_KEY: Record<IntelligenceValueClass, string> = {
  user_entered: "userEntered",
  system_suggestion: "systemSuggestion",
  confirmed: "confirmed",
  available_capacity: "availableCapacity",
  calculated_gap: "calculatedGap",
};

/** card state → i18n leaf under intelligence.state.* / stateNote.* */
const STATE_KEY: Record<IntelligenceCardState, string> = {
  ready: "ready",
  insufficient_data: "insufficientData",
  needs_migration: "needsMigration",
  stale: "stale",
};

/** Strip the model layer's stable `intelligence.` code prefix so the code
 *  resolves inside the `intelligence` message namespace. */
function leaf(code: string): string {
  return code.replace(/^intelligence\./, "");
}

export async function IntelligenceCard({
  card,
  locale,
}: {
  card: IntelligenceCardV1;
  locale: string;
}) {
  const t = await getTranslations("intelligence");
  const tc = (code: string, params?: Record<string, string | number>) =>
    t(leaf(code) as never, params as never) as string;

  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const fmtIso = (iso: string | null): string | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? dateFmt.format(new Date(ms)) : null;
  };

  const observed = fmtIso(card.sourceBadge.observedAtIso);

  function SourceBadge({ badge }: { badge: IntelligenceSourceBadge }) {
    return (
      <p
        className="flex flex-wrap items-center gap-2"
        data-testid="intelligence-source-badge"
        data-origin={badge.originKind}
      >
        <span className={`${INTEL_CHIP_CLASS} ${INTEL_ORIGIN_TONE[badge.originKind]}`}>
          {t(`origin.${badge.originKind}`)}
        </span>
        <span className="text-meta text-text-muted">
          {t("badge.source")}: {tc(`intelligence.sources.key.${badge.sourceKey}`)}
          {" · "}
          {t("badge.observedAt")}: {observed ?? t("badge.notObserved")}
        </span>
      </p>
    );
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/30 p-4"
      data-testid={`intelligence-card-${card.id}`}
      data-state={card.state}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {tc(card.kindCode)}
        </span>
        <span className={`${INTEL_CHIP_CLASS} ${INTEL_STATE_TONE[card.state]}`}>
          {t(`state.${STATE_KEY[card.state]}`)}
        </span>
      </div>

      <p className="text-sm font-semibold text-text-primary">
        {tc(card.headlineCode, { ...card.headlineParams })}
      </p>

      {/* Honest state note for every non-ready state — never a fake number. */}
      {card.state !== "ready" ? (
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs text-text-secondary"
          data-testid="intelligence-card-state-note"
        >
          {t(`stateNote.${STATE_KEY[card.state]}`)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className={`${INTEL_CHIP_CLASS} border-ink-500 text-text-muted`}>
          {t(`valueClass.${VALUE_CLASS_KEY[card.valueClass]}`)}
        </span>
      </div>

      <SourceBadge badge={card.sourceBadge} />

      {card.items.length > 0 ? (
        // Bounded by the view model (max items per card) — never an
        // unbounded table.
        <ul className="flex flex-col gap-1" data-testid="intelligence-card-items">
          {card.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-1.5 text-xs text-text-primary"
            >
              <span>{tc(item.labelCode, { ...item.labelParams })}</span>
              <span className={`${INTEL_CHIP_CLASS} border-ink-500 text-text-muted`}>
                {t(`valueClass.${VALUE_CLASS_KEY[item.valueClass]}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {card.nextActionCode ? (
        <p className="text-xs text-text-secondary" data-testid="intelligence-card-next-action">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("explain.nextAction")}:
          </span>{" "}
          {tc(card.nextActionCode)}
        </p>
      ) : null}

      {/* The ONE shared explainability drawer — no trust report exists for
          V1 cards, so its trust rows render honest unknowns. */}
      <ExplainabilityDrawer
        locale={locale}
        explanation={card.explanation}
        sourceKeys={[card.sourceBadge.sourceKey]}
        originKind={card.sourceBadge.originKind}
      />
    </section>
  );
}
