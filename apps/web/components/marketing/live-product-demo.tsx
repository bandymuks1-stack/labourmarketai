"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useMounted } from "@/lib/use-mounted";

/**
 * LIVE PRODUCT DEMO — the hero visual (landing rebuild 2026-07-29).
 *
 * Replaces the wall-sized static world map with the thing the owner actually
 * sells: the PRODUCT WORKING. A compact, real-looking conversation window
 * plays the core loop on repeat:
 *
 *   1. the person tells the chat what they did today;
 *   2. a journal entry appears — with an ID, like the real thing;
 *   3. a skill signal strengthens, sourced from that entry;
 *   4. the system explains a NEW matching opportunity and WHY it fits.
 *
 * HONESTY (§18): this is sample content demonstrating the real UI flow, and
 * it SAYS so — the "PAVYZDINĖ SEKA" chip is part of the component, not
 * optional chrome. No fabricated live counts, no fake company names beyond
 * the clearly-sample scenario. Reduced motion: the sequence renders as a
 * static final state (all four steps visible), nothing animates.
 */

const STEP_MS = 2600;
const STEPS = 4;

/** The rotating SECTORS (owner audit §3.3): the same loop, four different
 *  worlds — construction, HoReCa, logistics, IT — so the landing never reads
 *  as a construction-only product. Order = the rotation order. */
const SECTORS = ["construction", "horeca", "logistics", "it"] as const;
type Sector = (typeof SECTORS)[number];

export function LiveProductDemo() {
  // i18n namespace is `landing.loop` (the CORE LOOP sample) — the word "demo"
  // is banned from product copy AND message keys by §18 + the forbidden-terms
  // guard, which scans stringified catalogs (keys included).
  const t = useTranslations("landing.loop");
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(1);
  const [sector, setSector] = useState<Sector>("construction");

  useEffect(() => {
    if (!mounted || reduced) return;
    // Cycle 1→4→1: the window always holds at least the person's message —
    // a briefly EMPTY product window reads as a broken product. A finished
    // cycle hands the window to the NEXT sector (§3.3 rotation), so watching
    // for a while shows the same product carrying four different trades.
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s === STEPS) {
          setSector(
            (cur) => SECTORS[(SECTORS.indexOf(cur) + 1) % SECTORS.length],
          );
          return 1;
        }
        return s + 1;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [mounted, reduced]);

  // Reduced motion / SSR: the whole sequence, statically visible.
  const visible = reduced || !mounted ? STEPS : step;
  /** Interactive sector switch (§3.4) — a real control, not decoration. */
  const pickSector = (s: Sector) => {
    setSector(s);
    setStep(1);
  };
  const s = (key: string) => t(`scenario.${sector}.${key}`);

  const bubble =
    "rounded-2xl border border-ink-500 bg-ink-800/70 px-4 py-3 text-sm leading-relaxed";

  return (
    <div className="relative" data-testid="live-product-demo">
      {/* The honesty chip — sample sequence, real UI. */}
      <p className="mb-3 inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-[11px] uppercase tracking-label text-text-secondary">
        <span className="live-dot" aria-hidden />
        {t("chip")}
      </p>

      {/* Interactive sector switch (§3.3/§3.4): the SAME loop across four
          different trades — tap one, the window replays in that world. */}
      <div
        className="mb-3 flex flex-wrap gap-1.5"
        role="tablist"
        aria-label={t("sectorsLabel")}
        data-testid="live-demo-sectors"
      >
        {SECTORS.map((sec) => (
          <button
            key={sec}
            type="button"
            role="tab"
            aria-selected={sector === sec}
            onClick={() => pickSector(sec)}
            data-testid={`live-demo-sector-${sec}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              sector === sec
                ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                : "border-ink-500 text-text-secondary hover:border-brand-blue/60 hover:text-text-primary"
            }`}
          >
            {t(`sector.${sec}`)}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-500 bg-ink-900/80 shadow-card">
        {/* Window chrome — states this is the product surface. */}
        <div className="flex items-center gap-2 border-b border-ink-600 px-4 py-2.5">
          <span className="flex size-5 items-center justify-center rounded-sm bg-brand-blue text-[10px] font-bold text-white">
            L
          </span>
          <span className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {t("windowTitle")}
          </span>
        </div>

        <div className="flex min-h-[21rem] flex-col gap-3 p-4 sm:min-h-[23rem]">
          <AnimatePresence>
            {visible >= 1 && (
              <motion.div
                key="s1"
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`${bubble} ml-auto max-w-[85%] bg-brand-blue/10`}
              >
                {s("userSays")}
              </motion.div>
            )}
            {visible >= 2 && (
              <motion.div
                key="s2"
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`${bubble} max-w-[85%]`}
              >
                <p className="font-mono text-[10px] uppercase tracking-label text-state-success">
                  {t("entrySaved")}
                </p>
                <p className="mt-1 text-text-primary">{s("entryLine")}</p>
              </motion.div>
            )}
            {visible >= 3 && (
              <motion.div
                key="s3"
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`${bubble} max-w-[85%]`}
              >
                <p className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
                  {t("skillSignal")}
                </p>
                <p className="mt-1 text-text-primary">{s("skillLine")}</p>
                {/* The evidence bar grows — the visual heart of the loop. */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-600">
                  <motion.div
                    initial={reduced ? { width: "72%" } : { width: "38%" }}
                    animate={{ width: "72%" }}
                    transition={{ duration: reduced ? 0 : 0.9, ease: "easeOut" }}
                    className="h-full rounded-full bg-brand-cyan"
                  />
                </div>
              </motion.div>
            )}
            {visible >= 4 && (
              <motion.div
                key="s4"
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`${bubble} max-w-[85%] border-brand-blue/40`}
              >
                <p className="font-mono text-[10px] uppercase tracking-label text-brand-blue">
                  {t("matchFound")}
                </p>
                <p className="mt-1 text-text-primary">{s("matchLine")}</p>
                <p className="mt-1 text-xs text-text-secondary">{s("matchWhy")}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
