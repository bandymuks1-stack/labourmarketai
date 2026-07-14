import { getTranslations } from "next-intl/server";

import type {
  IntelligenceCardState,
  IntelligenceCardV1,
  IntelligenceSourceBadge,
} from "@/lib/intelligence/intelligence-view-model";
import type { IntelligenceValueClass } from "@/lib/intelligence/skills-demand-model";

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
 *    with external origin visually distinct from internal;
 *  - the FULL explanation (the six questions: meaning, data basis,
 *    window/geo/sample, origin, next action, uncertainty) sits behind ONE
 *    disclosure action (`<details>` — server-renderable, no client JS).
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

const STATE_TONE: Record<IntelligenceCardState, string> = {
  ready: "border-state-success/40 bg-state-success/10 text-state-success",
  insufficient_data: "border-ink-500 bg-ink-800/40 text-text-muted",
  needs_migration: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  stale: "border-state-amber/40 bg-state-amber/10 text-state-amber",
};

/** External origin is ALWAYS visually separated from internal (doctrine). */
const ORIGIN_TONE: Record<IntelligenceSourceBadge["originKind"], string> = {
  internal: "border-ink-500 bg-ink-800/40 text-text-secondary",
  external: "border-brand-orange/50 bg-brand-orange/10 text-brand-orange",
  blended: "border-state-amber/50 bg-state-amber/10 text-state-amber",
};

const CHIP_CLASS =
  "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label";

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

  const e = card.explanation;
  const observed = fmtIso(card.sourceBadge.observedAtIso);
  const windowStart = fmtIso(e.window.start);
  const windowEnd = fmtIso(e.window.end);

  function SourceBadge({ badge }: { badge: IntelligenceSourceBadge }) {
    return (
      <p
        className="flex flex-wrap items-center gap-2"
        data-testid="intelligence-source-badge"
        data-origin={badge.originKind}
      >
        <span className={`${CHIP_CLASS} ${ORIGIN_TONE[badge.originKind]}`}>
          {t(`origin.${badge.originKind}`)}
        </span>
        <span className="text-[11px] text-text-muted">
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
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {tc(card.kindCode)}
        </span>
        <span className={`${CHIP_CLASS} ${STATE_TONE[card.state]}`}>
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
        <span className={`${CHIP_CLASS} border-ink-500 text-text-muted`}>
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
              <span className={`${CHIP_CLASS} border-ink-500 text-text-muted`}>
                {t(`valueClass.${VALUE_CLASS_KEY[item.valueClass]}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {card.nextActionCode ? (
        <p className="text-xs text-text-secondary" data-testid="intelligence-card-next-action">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("explain.nextAction")}:
          </span>{" "}
          {tc(card.nextActionCode)}
        </p>
      ) : null}

      {/* The ONE explanation action — all six questions behind one toggle. */}
      <details
        className="group rounded-md border border-ink-600 bg-ink-800/40"
        data-testid="intelligence-card-explain"
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-text-primary marker:text-text-muted">
          {t("explain.toggle")}
        </summary>
        <dl className="flex flex-col gap-2 px-3 pb-3 text-xs leading-relaxed text-text-secondary">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("explain.meaning")}
            </dt>
            <dd>{tc(e.meaningCode)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("explain.dataBasis")}
            </dt>
            <dd>
              <ul className="list-inside list-disc">
                {e.dataBasisCodes.map((code) => (
                  <li key={code}>{tc(code)}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("explain.window")} · {t("explain.geo")} · {t("explain.sample")}
            </dt>
            <dd>
              {windowStart && windowEnd
                ? `${windowStart} – ${windowEnd}`
                : t("explain.windowNone")}
              {" · "}
              {e.geoLabel ?? t("explain.geoNone")}
              {" · "}
              {e.sampleSize !== null ? e.sampleSize : t("explain.sampleNone")}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("explain.origin")}
            </dt>
            <dd className="pt-1">
              <SourceBadge badge={card.sourceBadge} />
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("explain.nextAction")}
            </dt>
            <dd>{e.nextActionCode ? tc(e.nextActionCode) : t("explain.none")}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("explain.uncertainty")}
            </dt>
            <dd>
              {e.uncertaintyCodes.length > 0 ? (
                <ul className="list-inside list-disc">
                  {e.uncertaintyCodes.map((code) => (
                    <li key={code}>{tc(code)}</li>
                  ))}
                </ul>
              ) : (
                t("explain.none")
              )}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
