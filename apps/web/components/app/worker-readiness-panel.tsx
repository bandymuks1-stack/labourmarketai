import { getTranslations } from "next-intl/server";
import { Check, ArrowRight, FileText } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import { deriveWorkerReadiness } from "@/lib/player-card/readiness";
import { readinessNextSteps } from "@/lib/player-card/readiness-steps";

/**
 * Worker readiness panel (full-completion train PR 2) — closes the chain
 * Documents + Skills + Work Journal → Readiness → next action.
 *
 * Honest by construction:
 *   - shows every readiness signal as met (✓) or a concrete NEXT STEP the
 *     worker controls (a real in-app route) — never a fake "verified";
 *   - the country-fit line states plainly that cross-border work needs the
 *     right documents and that, without them, the worker is NOT shown as ready
 *     abroad (only legal-route options). No fake eligibility, no legal promise.
 *
 * Server component; copy from the `playerCard.readinessSteps` /
 * `playerCard.readinessPanel` namespaces.
 */
export async function WorkerReadinessPanel({ card }: { card: WorkerPlayerCard }) {
  const t = await getTranslations("playerCard");
  const readiness = deriveWorkerReadiness(card);
  const steps = readinessNextSteps(readiness);
  const stepKeys = new Set(steps.map((s) => s.pillar));

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="worker-readiness-panel"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("readinessPanel.title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {readiness.met === readiness.total
            ? t("readinessPanel.allReady")
            : t("readinessPanel.intro")}
        </p>
      </header>

      <ul className="flex flex-col gap-2" data-testid="readiness-pillars">
        {readiness.pillars.map((p) => {
          const isStep = stepKeys.has(p.key);
          const step = steps.find((s) => s.pillar === p.key);
          return (
            <li
              key={p.key}
              className="flex items-center justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
              data-pillar={p.key}
              data-met={p.met ? "yes" : "no"}
            >
              <span className="flex items-center gap-2 text-sm text-text-primary">
                <span
                  aria-hidden
                  className={
                    p.met
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-state-success/15 text-state-success"
                      : "inline-flex h-5 w-5 items-center justify-center rounded-full border border-ink-500 text-text-muted"
                  }
                >
                  {p.met ? <Check className="h-3 w-3" /> : null}
                </span>
                {t(`readinessSteps.pillar.${p.key}`)}
              </span>
              {!p.met && isStep && step ? (
                <Link
                  href={step.href as "/dashboard"}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-cyan"
                  data-testid={`readiness-step-${p.key}`}
                >
                  {t(`readinessSteps.action.${step.labelKey}`)}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Honest country-fit / documents gate — never "ready abroad" without docs. */}
      <div
        className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-1/60 px-3 py-2 text-[11px] leading-relaxed text-text-secondary"
        data-testid="readiness-country-fit"
      >
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
        <span>{t("readinessPanel.countryFit")}</span>
      </div>
    </section>
  );
}
