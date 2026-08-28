"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Link } from "@/lib/i18n/navigation";
import { startDemandFromNeedTextAction } from "@/lib/demand/demand-drafts-actions";
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
 * to 3 working next actions. The hand-off targets are real existing routes.
 *
 * ONE action persists, and only one: the employer's "continue to the demand
 * form". It writes the canonical draft (`customer_requests`, status='draft',
 * owner-scoped, through the existing `save_demand_draft` RPC) so the sentence
 * the employer just typed HERE arrives in the demand wizard instead of being
 * read, scored and discarded. A draft is not a demand: nothing is published,
 * nothing is matched, nobody is contacted, and the wizard's own three steps and
 * explicit create still stand between it and a real request. Everything else on
 * this screen stays pure and non-persisted.
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
  const router = useRouter();
  const locale = useLocale();
  /** The action code currently writing its draft, so only the pressed control
   *  shows a pending state. */
  const [carrying, setCarrying] = useState<string | null>(null);
  /** Honest degradation. `no_company` is an EXPECTED state - a signed-in person
   *  with no employer workspace yet - not an error, so it explains itself and
   *  the navigation still happens rather than trapping the user here. */
  const [carryNote, setCarryNote] = useState<"no_company" | "failed" | null>(
    null,
  );

  /**
   * Carry the need into the canonical draft, then open the demand form.
   *
   * Navigation happens either way. If the draft could not be written the
   * employer is told why and lands on the same form the plain link would have
   * reached - never worse off than before, and never told something was saved
   * when it was not.
   */
  async function carryToDemand(href: string) {
    setCarrying("continue_to_demand");
    setCarryNote(null);
    try {
      const res = await startDemandFromNeedTextAction(text, locale);
      if (!res.ok && res.reason !== "empty") setCarryNote(res.reason);
    } catch {
      setCarryNote("failed");
    } finally {
      setCarrying(null);
    }
    router.push(`/${locale}${href}`);
  }

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
          className="max-w-prose rounded-md border border-ink-600 bg-ink-800/40 p-3 text-basis leading-relaxed text-text-secondary"
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
          className="font-mono text-meta uppercase tracking-label text-text-muted"
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
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("readinessTitle")}
            </span>
            <span
              className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 font-mono text-meta text-text-secondary"
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
              <span className="font-mono text-meta uppercase tracking-label text-state-success">
                {t("recognizedTitle")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {card.recognized.map((f) => (
                  <span
                    key={f.key}
                    data-testid={`recognizer-recognized-${f.key}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-state-success/30 bg-state-success/5 px-2.5 py-1 text-meta text-text-secondary"
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
              <span className="font-mono text-meta uppercase tracking-label text-brand-orange">
                {t("missingTitle")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {card.missing.map((f) => (
                  <span
                    key={f.key}
                    data-testid={`recognizer-missing-${f.key}`}
                    data-severity={f.severity}
                    className={
                      "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-meta " +
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
              <span className="font-mono text-meta uppercase tracking-label text-state-warning">
                {t("risksTitle")}
              </span>
              <ul className="flex flex-col gap-1.5">
                {card.risks.map((r) => (
                  <li
                    key={r.code}
                    data-testid={`recognizer-risk-${r.code}`}
                    className="text-basis leading-relaxed text-text-secondary"
                  >
                    • {t(`risk.${r.code}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Up to 3 next steps → existing real surfaces. No dead end. */}
          <div className="flex flex-col gap-2 border-t border-ink-600 pt-4">
            <span className="font-mono text-meta uppercase tracking-label text-brand-orange">
              {t("nextActionTitle")}
            </span>
            {card.nextActions.map((a) => {
              const href = a.href ?? "/dashboard/profile";
              const style =
                "flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-md border border-brand-blue bg-brand-blue/10 px-4 py-2 text-left text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/20 disabled:cursor-not-allowed disabled:opacity-60";
              const label = (
                <>
                  <span className="truncate">{t(`action.${a.code}`)}</span>
                  <span aria-hidden className="shrink-0 text-text-muted">
                    →
                  </span>
                </>
              );
              // A carrying hand-off must WRITE before it navigates, so it is a
              // button. Every other action stays a real <Link> - same look, same
              // testid, and still a plain navigable anchor for the middle-click
              // and open-in-new-tab that a link is expected to support.
              return a.carriesNeedText ? (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => void carryToDemand(href)}
                  disabled={carrying === a.code}
                  data-testid={`recognizer-next-${a.code}`}
                  data-carries-need-text="yes"
                  className={style}
                >
                  {label}
                </button>
              ) : (
                <Link
                  key={a.code}
                  href={href as "/dashboard"}
                  data-testid={`recognizer-next-${a.code}`}
                  className={style}
                >
                  {label}
                </Link>
              );
            })}
            {carryNote && (
              <p
                className="text-basis leading-relaxed text-state-warning"
                data-testid="recognizer-carry-note"
                data-reason={carryNote}
              >
                {t(`carryNote.${carryNote}`)}
              </p>
            )}
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
