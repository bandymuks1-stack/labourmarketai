"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";

import { MarketMap } from "@/components/app/market-map/market-map";
import {
  LANDING_SCENARIOS,
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
type Phase = "idle" | "typing" | "thinking" | "revealed";

export function HeroLiveDemo() {
  const t = useTranslations("landing.hero");
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scenario: LandingScenario = LANDING_SCENARIOS[index];
  const revealed = phase === "revealed";

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  /** Run one scenario end to end. */
  const play = useCallback(
    (i: number) => {
      clearTimers();
      setIndex(i);
      const text = t(`scenario.${LANDING_SCENARIOS[i].promptKey}`);

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      if (reduced) {
        // Reduced motion still gets the ANSWER — only the theatre is skipped.
        setTyped(text);
        setPhase("revealed");
        return;
      }

      setTyped("");
      setPhase("typing");
      const step = 28;
      for (let c = 1; c <= text.length; c += 1) {
        after(c * step, () => setTyped(text.slice(0, c)));
      }
      after(text.length * step + 260, () => setPhase("thinking"));
      after(text.length * step + 1250, () => setPhase("revealed"));
    },
    [after, clearTimers, t],
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

          {phase === "thinking" || revealed ? (
            <div className="flex items-center gap-2 text-meta text-text-secondary">
              <Sparkles className="size-3.5 shrink-0 text-brand-cyan" aria-hidden />
              {phase === "thinking" ? t("thinking") : t("answered")}
            </div>
          ) : null}

          {revealed && region ? (
            <div
              className="rounded-card border border-ink-500 bg-ink-900/70 p-3.5"
              data-testid="hero-result-card"
            >
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("resultLabel")}
              </p>
              <p className="mt-1 font-display text-card-title font-semibold text-text-primary">
                {t(`result.${scenario.resultKey}`)}
              </p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {region.anchors.slice(0, 3).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-baseline justify-between gap-3 text-basis"
                  >
                    <span className="min-w-0 truncate text-text-secondary">
                      {a.label}
                    </span>
                    <span className="shrink-0 font-mono text-meta text-brand-cyan">
                      {a.weight}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Ask another question — the visitor drives the product themselves. */}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
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
          selectedCode={revealed ? scenario.focusCode : null}
        />

        <p className="flex items-center gap-1.5 text-meta text-text-muted">
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          {t("mapHint")}
        </p>
      </div>
    </section>
  );
}
