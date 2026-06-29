"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import { recognizeJobDemand } from "@/lib/market/recognition";
import type {
  RecognitionIntent,
  RecognizedJobDemand,
  JobDemandFieldKey,
} from "@/lib/market/recognition";

/**
 * Offer–Demand recognizer (v1) — one entry point for "what do you offer or need?".
 *
 * Pure & non-persisted: it runs the recognition layer (lib/market/recognition) on
 * what the user types and shows recognized / missing / risks / readiness + ONE next
 * step that hands off to an EXISTING real surface. It saves nothing and contacts no
 * one — the demand-side recognition demonstrates the loop; the supply side links to
 * the profile / services surfaces that already recognize worker/company capability.
 */

const INTENTS: readonly RecognitionIntent[] = [
  "need_workers",
  "have_project",
  "need_work",
  "offer_services",
];

const INTENT_LABEL: Record<RecognitionIntent, string> = {
  need_work: "intent.needWork",
  offer_services: "intent.offerServices",
  need_workers: "intent.needWorkers",
  have_project: "intent.haveProject",
};

const DEMAND_INTENTS: ReadonlySet<RecognitionIntent> = new Set([
  "need_workers",
  "have_project",
]);

export function OfferDemandRecognizer() {
  const t = useTranslations("marketRecognition");
  const [intent, setIntent] = useState<RecognitionIntent>("need_workers");
  const [text, setText] = useState("");
  const [card, setCard] = useState<RecognizedJobDemand | null>(null);

  const isDemand = DEMAND_INTENTS.has(intent);

  const chooseIntent = (next: RecognitionIntent) => {
    setIntent(next);
    setCard(null);
  };

  const fieldLabel = (key: JobDemandFieldKey) => t(`field.${key}`);

  return (
    <section
      className="flex flex-col gap-6"
      data-testid="offer-demand-recognizer"
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {t("subtitle")}
        </p>
      </header>

      {/* Intent selector — four real entries, one question. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {INTENTS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => chooseIntent(i)}
            data-active={i === intent ? "yes" : "no"}
            className={
              "min-h-[2.75rem] rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
              (i === intent
                ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                : "border-ink-500 bg-ink-800/40 text-text-secondary hover:border-brand-blue/60")
            }
          >
            {t(INTENT_LABEL[i])}
          </button>
        ))}
      </div>

      {isDemand ? (
        <div className="flex flex-col gap-3">
          <label
            htmlFor="recognizer-input"
            className="font-mono text-[10px] uppercase tracking-label text-text-muted"
          >
            {t("pasteLabel")}
          </label>
          <textarea
            id="recognizer-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={t("pastePlaceholder")}
            className="w-full rounded-md border border-ink-500 bg-ink-900/60 p-3 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setCard(recognizeJobDemand({ rawText: text }))}
            disabled={text.trim().length === 0}
            className="self-start rounded-md border border-brand-blue bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("recognizeCta")}
          </button>
        </div>
      ) : (
        // Supply side: the worker/company capability is already recognized on the
        // existing profile / services surface — hand off there (no duplicate form).
        <div
          className="flex flex-col gap-3 card-border bg-ink-900/40 p-5"
          data-testid="recognizer-supply"
        >
          <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
            {intent === "need_work"
              ? t("supply.needWorkBody")
              : t("supply.offerServicesBody")}
          </p>
          <Link
            href={(intent === "need_work"
              ? "/dashboard/profile"
              : "/dashboard/services") as "/dashboard"}
            className="self-start rounded-md border border-brand-blue bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/20"
          >
            {intent === "need_work"
              ? t("supply.needWorkCta")
              : t("supply.offerServicesCta")}
          </Link>
        </div>
      )}

      {/* Recognition result — recognized / missing / risks / readiness / next. */}
      {isDemand && card && (
        <div
          className="flex flex-col gap-5 card-border bg-ink-900/40 p-5 sm:p-6"
          data-testid="recognizer-result"
        >
          {/* Readiness summary (confidence + real counts, never a rating). */}
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("readinessTitle")}
            </span>
            <span
              className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 font-mono text-[11px] text-text-secondary"
              data-testid="recognizer-confidence"
            >
              {t(`confidence.${card.confidence}`)} · {card.recognized.length}/
              {card.recognized.length + card.missing.length}
            </span>
          </div>

          {/* Recognized */}
          {card.recognized.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-ink-600 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-label text-state-success">
                {t("recognizedTitle")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {card.recognized.map((f) => (
                  <span
                    key={f.key}
                    data-testid={`recognizer-recognized-${f.key}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-state-success/30 bg-state-success/5 px-2.5 py-1 text-[11px] text-text-secondary"
                  >
                    <span aria-hidden className="text-state-success">
                      ✓
                    </span>
                    {fieldLabel(f.key)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing */}
          {card.missing.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-ink-600 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
                {t("missingTitle")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {card.missing.map((f) => (
                  <span
                    key={f.key}
                    data-testid={`recognizer-missing-${f.key}`}
                    data-severity={f.severity}
                    className={
                      "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] " +
                      (f.severity === "important"
                        ? "border-brand-orange/40 bg-brand-orange/5 text-brand-orange"
                        : "border-ink-500 bg-ink-800/40 text-text-muted")
                    }
                  >
                    <span aria-hidden>+</span>
                    {fieldLabel(f.key)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Risks worth clarifying */}
          {card.risks.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-ink-600 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-label text-state-warning">
                {t("risksTitle")}
              </span>
              <ul className="flex flex-col gap-1.5">
                {card.risks.map((r) => (
                  <li
                    key={r.code}
                    data-testid={`recognizer-risk-${r.code}`}
                    className="text-[13px] leading-relaxed text-text-secondary"
                  >
                    • {t(`risk.${r.code}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* One clear next step → existing real surface. No dead end. */}
          <div className="flex flex-col gap-2 border-t border-ink-600 pt-4">
            <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
              {t("nextActionTitle")}
            </span>
            <Link
              href={(card.nextAction.href ?? "/dashboard") as "/dashboard"}
              data-testid="recognizer-next-action"
              className="flex min-h-[2.75rem] items-center justify-between gap-3 rounded-md border border-brand-blue bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/20"
            >
              <span className="truncate">{t(`action.${card.nextAction.code}`)}</span>
              <span aria-hidden className="shrink-0 text-text-muted">
                →
              </span>
            </Link>
          </div>
        </div>
      )}

      {isDemand && !card && (
        <p
          className="text-sm leading-relaxed text-text-muted"
          data-testid="recognizer-empty"
        >
          {t("emptyText")}
        </p>
      )}
    </section>
  );
}
