"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import { recognizeIntent } from "@/lib/market/recognition";
import type {
  RecognitionIntent,
  RecognizedCard,
  JobDemandFieldKey,
} from "@/lib/market/recognition";

/**
 * Offer–Demand recognizer (pre-search gate v1) — one entry point for "what do you
 * need or offer?". It is the PREPARATION step before search/request: for any of the
 * four intents it asks the right questions, recognizes what is known, shows what is
 * missing + risks + readiness, and hands off to the EXISTING real surface with up
 * to 3 working next actions. Pure & non-persisted — it saves nothing and contacts
 * no one (handoff targets are real existing routes).
 */

const INTENTS: readonly RecognitionIntent[] = [
  "need_work",
  "need_workers",
  "offer_services",
  "have_project",
];

const INTENT_LABEL: Record<RecognitionIntent, string> = {
  need_work: "intent.needWork",
  offer_services: "intent.offerServices",
  need_workers: "intent.needWorkers",
  have_project: "intent.haveProject",
};

export function OfferDemandRecognizer() {
  const t = useTranslations("marketRecognition");
  const [intent, setIntent] = useState<RecognitionIntent>("need_work");
  const [text, setText] = useState("");
  const [card, setCard] = useState<RecognizedCard | null>(null);

  const chooseIntent = (next: RecognitionIntent) => {
    setIntent(next);
    setCard(null);
  };

  const fieldLabel = (key: JobDemandFieldKey) => t(`field.${key}`);

  return (
    <section className="flex flex-col gap-6" data-testid="offer-demand-recognizer">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {t("subtitle")}
        </p>
        {/* Preparation framing — this is the step BEFORE search/request. */}
        <p
          className="max-w-prose rounded-md border border-ink-600 bg-ink-800/40 p-3 text-[13px] leading-relaxed text-text-secondary"
          data-testid="recognizer-prep"
        >
          {t("prep")}
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

      {/* One guided input for every intent. */}
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
          onClick={() => setCard(recognizeIntent(intent, { rawText: text }))}
          disabled={text.trim().length === 0}
          className="self-start rounded-md border border-brand-blue bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("recognizeCta")}
        </button>
      </div>

      {/* Recognition result — recognized / missing / risks / readiness / next. */}
      {card ? (
        <div
          className="flex flex-col gap-5 card-border bg-ink-900/40 p-5 sm:p-6"
          data-testid="recognizer-result"
          data-intent={card.intent}
        >
          {/* Readiness (honest label + real field count, never a rating). */}
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("readinessTitle")}
            </span>
            <span
              className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 font-mono text-[11px] text-text-secondary"
              data-testid="recognizer-readiness"
              data-label={card.readiness.label}
            >
              {t(`readinessLabel.${card.readiness.label}`)} · {card.readiness.met}/
              {card.readiness.total}
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

          {/* Up to 3 next steps → existing real surfaces. No dead end. */}
          <div className="flex flex-col gap-2 border-t border-ink-600 pt-4">
            <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
              {t("nextActionTitle")}
            </span>
            {card.nextActions.map((a) => (
              <Link
                key={a.code}
                href={(a.href ?? "/dashboard/profile") as "/dashboard"}
                data-testid={`recognizer-next-${a.code}`}
                className="flex min-h-[2.75rem] items-center justify-between gap-3 rounded-md border border-brand-blue bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/20"
              >
                <span className="truncate">{t(`action.${a.code}`)}</span>
                <span aria-hidden className="shrink-0 text-text-muted">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
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
