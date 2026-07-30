"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";

import { MarketMap } from "@/components/app/market-map/market-map";
import {
  LANDING_SCENARIOS,
  routeQuestion,
  type LandingScenario,
} from "@/components/app/market-map/landing-scenario";
import { topRegion } from "@/components/app/market-map/market-map-model";

/**
 * THE HERO IS THE PRODUCT.
 *
 * Not a description of the product, not a screenshot of it — the actual
 * conversation surface and the actual canonical MarketMap, wired together, so
 * the first screen IS a session:
 *
 *     question → AI acts → the map reacts → a result card appears
 *
 * Everything here is the real thing: `<MarketMap>` is the same Leaflet
 * component the authenticated ResultPanel mounts, on real OSM tiles and real
 * city coordinates. Only the DATA is the scripted landing scenario, and that is
 * labelled on screen — see `landing-scenario.ts`.
 *
 * The demo auto-plays once so a passive visitor still sees the whole loop, then
 * stops. It never loops forever: a hero that keeps re-animating competes with
 * the reading it is supposed to support, and `prefers-reduced-motion` skips
 * straight to the settled end state.
 */
/**
 * The felt sequence is NOT question -> map -> card. It is:
 *
 *   question -> AI reasoning -> market reaction -> explanation -> decision -> action
 *
 * `reasoning` surfaces WHAT is being weighed (a spinner only says "wait");
 * `reacting` lands the market signals one by one so the map is visibly
 * responding; `decided` states a decision that answers why here, why now, why
 * you, and what to do next — with the action available immediately.
 */
type Phase = "idle" | "typing" | "reasoning" | "reacting" | "decided";

export function HeroLiveDemo() {
  const t = useTranslations("landing.hero");
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const [steps, setSteps] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [draft, setDraft] = useState("");
  const [unmatched, setUnmatched] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scenario: LandingScenario = LANDING_SCENARIOS[index];
  const decided = phase === "decided";

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  /** Run one scenario end to end. */
  const play = useCallback(
    (i: number, asked?: string) => {
      clearTimers();
      setIndex(i);
      setUnmatched(false);
      const text = asked ?? t(`scenario.${LANDING_SCENARIOS[i].promptKey}`);

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      if (reduced) {
        // Reduced motion still gets the REASONING and the DECISION — only the
        // pacing is removed. Skipping to a bare card would hide the part that
        // makes this a decision rather than a number.
        setTyped(text);
        setSteps(LANDING_SCENARIOS[i].reasoningKeys.length);
        setReveal(Number.POSITIVE_INFINITY);
        setPhase("decided");
        return;
      }

      setTyped("");
      setSteps(0);
      setReveal(0);
      setPhase("typing");

      const step = 26;
      const typeMs = text.length * step;
      for (let c = 1; c <= text.length; c += 1) {
        after(c * step, () => setTyped(text.slice(0, c)));
      }

      // AI reasoning — one visible consideration at a time.
      const reasons = LANDING_SCENARIOS[i].reasoningKeys;
      after(typeMs + 200, () => setPhase("reasoning"));
      reasons.forEach((_, r) => {
        after(typeMs + 320 + r * 520, () => setSteps(r + 1));
      });

      // Market reaction — signals land one after another.
      const reasonMs = typeMs + 320 + reasons.length * 520;
      const total = LANDING_SCENARIOS[i].view.regions.reduce(
        (n, reg) =>
          n +
          reg.anchors.filter((a) => a.layer === LANDING_SCENARIOS[i].layer)
            .length,
        0,
      );
      after(reasonMs, () => setPhase("reacting"));
      for (let k = 1; k <= total; k += 1) {
        after(reasonMs + k * 150, () => setReveal(k));
      }

      after(reasonMs + total * 150 + 420, () => setPhase("decided"));
    },
    [after, clearTimers, t],
  );

  /** The visitor asks their own question — the answer is routed from it. */
  const ask = useCallback(
    (text: string) => {
      const hit = routeQuestion(text);
      if (!hit) {
        // Say so rather than answering a question nobody asked.
        setUnmatched(true);
        return;
      }
      setUnmatched(false);
      play(LANDING_SCENARIOS.indexOf(hit), text);
    },
    [play],
  );

  // Auto-play the first scenario once on mount, then stop.
  useEffect(() => {
    play(0);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const region = topRegion(scenario.view);

  return (
    <section
      className="grid gap-4 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-5"
      data-testid="hero-live-demo"
    >
      {/* ── left: the conversation ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-col gap-3 rounded-card border border-ink-600 bg-ink-800/45 p-4 sm:p-5">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("chatLabel")}
        </p>

        <div className="flex flex-col gap-3">
          <div className="self-end rounded-2xl rounded-br-sm bg-brand-blue/15 px-3.5 py-2.5 text-basis text-text-primary">
            {typed}
            {phase === "typing" ? (
              <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-brand-blue align-middle" />
            ) : null}
          </div>

          {/* AI REASONING — what is being weighed, not a spinner. */}
          {steps > 0 ? (
            <ul className="flex flex-col gap-1.5" data-testid="hero-reasoning">
              {scenario.reasoningKeys.slice(0, steps).map((k, i) => (
                <li
                  key={k}
                  className="flex items-start gap-2 text-meta text-text-secondary"
                >
                  <Sparkles
                    className={`mt-0.5 size-3.5 shrink-0 ${
                      i === steps - 1 && !decided
                        ? "animate-pulse text-brand-cyan"
                        : "text-brand-cyan/60"
                    }`}
                    aria-hidden
                  />
                  <span>{t(`reason.${k}`)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* MARKET REACTION — stated while the signals are landing. */}
          {phase === "reacting" && reveal > 0 ? (
            <p className="text-meta text-brand-cyan" data-testid="hero-reacting">
              {t("reacting", { count: reveal })}
            </p>
          ) : null}

          {/* THE DECISION — why here, why now, why you, what next. */}
          {decided && region ? (
            <div
              className="rounded-card border border-brand-blue/35 bg-ink-900/70 p-3.5"
              data-testid="hero-result-card"
            >
              <p className="font-mono text-meta uppercase tracking-label text-brand-cyan">
                {t("decisionLabel")}
              </p>
              <p className="mt-1 font-display text-card-title font-semibold text-text-primary">
                {t(`result.${scenario.resultKey}`)}
              </p>

              <dl className="mt-3 flex flex-col gap-2 border-t border-ink-600 pt-2.5">
                {(["whyHere", "whyNow", "whyYou"] as const).map((k) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t(`decisionField.${k}`)}
                    </dt>
                    <dd className="text-basis text-text-secondary">
                      {t(`decision.${scenario.decisionKey}.${k}`)}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* CONFIDENCE — a recommendation without one asks to be trusted
                  blindly. This one makes a claim the visitor can weigh. */}
              <div className="mt-3 flex items-center gap-2.5 border-t border-ink-600 pt-2.5">
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("confidenceLabel")}
                </span>
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700"
                  aria-hidden
                >
                  <span
                    className="block h-full rounded-full bg-brand-cyan"
                    style={{ width: `${Math.round(scenario.confidence * 100)}%` }}
                  />
                </span>
                <span
                  className="font-mono text-meta text-brand-cyan"
                  data-testid="hero-confidence"
                >
                  {Math.round(scenario.confidence * 100)}%
                </span>
              </div>

              {/* WHY NOT SOMEWHERE ELSE — the trade-off the AI already weighed.
                  Without it a recommendation hides the alternatives it beat. */}
              <div className="mt-2.5 flex flex-col gap-0.5">
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("decisionField.whyNotElsewhere")}
                </span>
                <span className="text-basis text-text-secondary">
                  {t(`decision.${scenario.decisionKey}.whyNotElsewhere`)}
                </span>
              </div>

              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-600 pt-2.5">
                {region.anchors.slice(0, 3).map((a) => (
                  <li key={a.id} className="text-meta text-text-muted">
                    {a.label}{" "}
                    <span className="font-mono text-brand-cyan">{a.weight}</span>
                  </li>
                ))}
              </ul>

              {/* IMMEDIATE ACTION — the decision is actionable right here. */}
              <Link
                // Locale-aware: a hardcoded /lt/ would send every other locale
                // to the wrong place.
                href="/auth/signup"
                data-testid="hero-next-action"
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-blue px-4 text-support font-semibold text-white transition-opacity hover:opacity-90"
              >
                {t(`decision.${scenario.decisionKey}.next`)}
                <ArrowRight className="size-3.5 shrink-0" aria-hidden />
              </Link>
            </div>
          ) : null}
        </div>

        {/* THE VISITOR ASKS THEIR OWN QUESTION. Different questions take
            different reasoning paths, different map layers and different
            decisions — this is a session, not a replay. */}
        <form
          className="mt-auto flex gap-2 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("askPlaceholder")}
            aria-label={t("askPlaceholder")}
            data-testid="hero-ask-input"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-ink-500 bg-ink-900/60 px-4 text-basis text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
          />
          <button
            type="submit"
            data-testid="hero-ask-submit"
            className="min-h-11 shrink-0 rounded-full bg-brand-blue px-4 text-support font-semibold text-white transition-opacity hover:opacity-90"
          >
            {t("askSubmit")}
          </button>
        </form>

        {unmatched ? (
          <p className="text-meta text-state-amber" data-testid="hero-unmatched">
            {t("unmatched")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {LANDING_SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => play(i)}
              data-testid="hero-scenario-chip"
              aria-pressed={i === index}
              className={`min-h-11 rounded-full border px-3 text-support font-medium transition-colors ${
                i === index
                  ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-brand-blue"
              }`}
            >
              {t(`scenario.${s.promptKey}`)}
            </button>
          ))}
        </div>
      </div>

      {/* ── right: the canonical map ───────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("mapLabel")}
          </p>
          {/* The data badge is not decoration: the visitor must never mistake a
              demonstration for today's live market. */}
          <span
            data-testid="hero-map-origin"
            className="rounded-sm border border-state-amber/40 bg-state-amber/10 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-amber"
          >
            {t("demoBadge")}
          </span>
        </div>

        <MarketMap
          view={scenario.view}
          mode="landing"
          layer={scenario.layer}
          selectedCode={
            phase === "reacting" || decided ? scenario.focusCode : null
          }
          revealCount={reveal}
        />

        <p className="flex items-center gap-1.5 text-meta text-text-muted">
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          {t("mapHint")}
        </p>
      </div>
    </section>
  );
}
