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
type Phase =
  | "idle"
  | "typing"
  | "reasoning"
  | "reacting"
  | "decided"
  /**
   * SESSION ZERO. The decision does not dead-end at a signup wall — it
   * CONTINUES into the product: the visitor steps from the decision to the
   * people behind it, still on the landing, still without an account.
   *
   * Signup is the persistence layer, not the destination. It is asked for only
   * when the visitor wants to keep something (save, apply, contact, export) —
   * never to see the next honest step.
   */
  | "continued";

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
  const decided = phase === "decided" || phase === "continued";
  const continued = phase === "continued";
  /**
   * The demo is WORKING — typing the question, reasoning, or landing signals on
   * the map. Derived from the phase machine, never a second piece of state that
   * could drift out of step with it.
   *
   * The submit is deliberately NOT disabled while this is true: re-asking is a
   * legitimate thing to want mid-run, and locking the one interactive control
   * on the landing for four seconds reads as broken. `aria-busy` states the
   * same fact without taking the control away.
   */
  const running = phase === "typing" || phase === "reasoning" || phase === "reacting";

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

              {/* WHAT THIS RESTS ON — a recommendation has to say what it is
                  built from. It must NOT say how SURE it is.

                  This row used to be a "Confidence 86%" meter driven by a
                  literal in landing-scenario.ts. The landing runs no model and
                  reads no live supply, so there was nothing to measure and the
                  number was fabricated. It is replaced by the honest version of
                  the same job: name the basis, and put the demonstration
                  qualifier NEXT TO the claim instead of ~180 lines away in the
                  badge. No score, no meter, no percentage. */}
              <div
                className="mt-3 flex flex-col gap-0.5 border-t border-ink-600 pt-2.5"
                data-testid="hero-basis"
              >
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("basisLabel")}
                </span>
                <span className="text-basis text-text-secondary">
                  {t("basisNote", { count: scenario.reasoningKeys.length })}
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
              {/* The decision continues INTO the product. No account needed to
                  take the next honest step. */}
              {!continued ? (
                <button
                  type="button"
                  onClick={() => setPhase("continued")}
                  data-testid="hero-next-action"
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-blue px-4 text-support font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {t(`decision.${scenario.decisionKey}.next`)}
                  <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* CONTINUATION — the session keeps going: decision -> the people
            behind it, as a COMPACT Player Card preview. The full card lives in
            the authenticated ResultPanel; this is the preview that earns it. */}
        {continued ? (
          <div
            className="rounded-card border border-ink-500 bg-ink-800/50 p-3.5"
            data-testid="hero-player-preview"
          >
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("previewLabel")}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-cyan/40 bg-brand-cyan/10 font-display text-card-title font-semibold text-brand-cyan"
              >
                J
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-card-title font-semibold text-text-primary">
                  {t("previewName")}
                </p>
                <p className="truncate text-meta text-text-secondary">
                  {t("previewRole")}
                </p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-600 pt-2.5">
              {(["entries", "skills", "years"] as const).map((k) => (
                <div key={k} className="flex flex-col">
                  <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(`previewMetric.${k}`)}
                  </dt>
                  <dd className="font-display text-card-title font-semibold text-text-primary">
                    {t(`previewValue.${k}`)}
                  </dd>
                </div>
              ))}
            </dl>
            {/* PERSISTENCE, not a wall: the account is asked for only to KEEP
                something — never to see the next step. */}
            <Link
              href="/auth/signup"
              data-testid="hero-persist-action"
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brand-blue px-4 text-support font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
            >
              {t("persistAction")}
              <ArrowRight className="size-3.5 shrink-0" aria-hidden />
            </Link>
            <p className="mt-1.5 text-meta text-text-muted">{t("persistWhy")}</p>
          </div>
        ) : null}

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
            // The one control on the landing that starts work owed a visible
            // answer to "did that do anything?". The dot is the visual half and
            // `aria-busy` the assistive half; neither invents a state, both
            // read the phase machine.
            aria-busy={running}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-brand-blue px-4 text-support font-semibold text-white transition-opacity hover:opacity-90"
          >
            {t("askSubmit")}
            {running ? (
              <span
                aria-hidden
                data-testid="hero-ask-pending"
                className="size-1.5 animate-pulse rounded-full bg-white/90"
              />
            ) : null}
          </button>
        </form>

        {unmatched ? (
          // A question the demo cannot answer is a RESULT, and a result the
          // visitor cannot see announced is a silent submit. `status` rather
          // than `alert`: it is informative, not urgent.
          <p
            role="status"
            className="text-meta text-state-amber"
            data-testid="hero-unmatched"
          >
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
