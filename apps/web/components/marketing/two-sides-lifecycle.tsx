"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  Building2,
  ClipboardList,
  History,
  MessagesSquare,
  Repeat,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * TWO SIDES, ONE SPINE — the homepage's signature visual (premium completion
 * mission §12).
 *
 *   PROFESSIONAL  ─┐
 *   FIND → CONNECT → WORK → VERIFY → GROW → CONTINUE   (the shared spine)
 *   COMPANY       ─┘
 *
 * It answers ONE question a visitor has in five seconds: "is this just a job
 * board?" No — both sides live on the same lifecycle, and it does not end at
 * the hire.
 *
 * MOTION EXPLAINS CAUSALITY, not decoration. A single token travels the spine:
 * it is EVIDENCE (cyan) while the work is being done, becomes CONFIRMED (green)
 * at VERIFY, and arrives at GROW as HISTORY (gold) — the work did not vanish,
 * it became the professional's history and the company's report. It plays once
 * when scrolled into view and never loops; with reduced motion there is no
 * token at all and the spine is shown whole.
 *
 * ACCESSIBILITY. The spine is an ordered list; each step carries both lane
 * sentences as text. The line and token are decorative (aria-hidden).
 *
 * HONESTY. Illustrative, not data: the portrait is the labelled sample
 * monogram and no figure appears anywhere.
 */

const ICONS: LucideIcon[] = [Search, MessagesSquare, ClipboardList, BadgeCheck, History, Repeat];
// The token's meaning at each step: evidence while work is done, confirmed at
// VERIFY, history from GROW on. Semantic colours only (design rule #4).
const TOKEN_COLORS = [
  "rgb(var(--c-brand-cyan))",
  "rgb(var(--c-brand-cyan))",
  "rgb(var(--c-brand-cyan))",
  "rgb(var(--c-state-success))",
  "rgb(var(--c-brand-blue))",
  "rgb(var(--c-brand-blue))",
];

export interface TwoSidesStep {
  readonly label: string;
  readonly worker: string;
  readonly company: string;
}

export function TwoSidesLifecycle({
  title,
  professionalLabel,
  companyLabel,
  steps,
}: {
  readonly title: string;
  readonly professionalLabel: string;
  readonly companyLabel: string;
  readonly steps: readonly TwoSidesStep[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduce = useReducedMotion();
  const n = steps.length;
  // Token x (as % along the spine) at each step centre, and the colour there.
  const xs = steps.map((_, i) => (n > 1 ? (i / (n - 1)) * 100 : 0));
  const play = inView && !reduce;

  return (
    <section
      ref={ref}
      aria-label={title}
      className="relative mt-16"
      data-testid="two-sides-lifecycle"
    >
      <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-4xl">
        {title}
      </h2>

      <div className="mt-8 rounded-2xl border border-ink-600 bg-surface-1/60 p-4 sm:p-8">
        <div className="md:grid md:grid-cols-[11.5rem_minmax(0,1fr)] md:gap-x-4">
          {/* Lane labels (desktop): the two sides, aligned to their rows. */}
          <div aria-hidden className="hidden md:grid md:grid-rows-[auto_auto_auto] md:gap-y-4">
            <div className="flex min-h-[5.5rem] items-center gap-3">
              <span className="flex h-[55px] w-11 items-center justify-center rounded-xl border border-ink-500 bg-ink-700 text-text-primary">
                <UserRound className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="font-mono text-meta uppercase tracking-label text-text-primary">
                {professionalLabel}
              </span>
            </div>
            <div className="h-12" />
            <div className="flex min-h-[5.5rem] items-center gap-3">
              <span className="flex h-[55px] w-11 items-center justify-center rounded-xl border border-ink-500 bg-ink-700 text-text-primary">
                <Building2 className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="font-mono text-meta uppercase tracking-label text-text-primary">
                {companyLabel}
              </span>
            </div>
          </div>

          <ol className="relative grid gap-6 md:grid-flow-col md:auto-cols-fr md:gap-3">
            {/* The spine (decorative). Vertical on phones, horizontal on md+. */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-6 left-[1.5rem] top-6 w-px bg-ink-600 md:inset-x-6 md:bottom-auto md:left-6 md:right-6 md:top-[calc(5.5rem+1rem+1.5rem)] md:h-px md:w-auto"
            />
            {steps.map((s, i) => {
              const Icon = ICONS[i] ?? Repeat;
              return (
                <li
                  key={s.label}
                  className="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 gap-y-1 md:grid-cols-1 md:gap-y-4"
                >
                  {/* Spine node */}
                  <div className="row-span-2 flex items-start md:order-2 md:row-span-1 md:items-center">
                    <span
                      className={cn(
                        "relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 bg-ink-900",
                        i === 3 ? "border-state-success text-state-success" : i >= 4 ? "border-brand-blue text-brand-blue" : "border-brand-cyan text-brand-cyan",
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                  </div>
                  {/* Professional lane */}
                  <div className="min-w-0 md:order-1 md:flex md:min-h-[5.5rem] md:items-center">
                    <p className="font-mono text-meta uppercase tracking-label text-text-primary md:hidden">{s.label}</p>
                    <p className="flex items-start gap-2 text-sm text-text-primary [overflow-wrap:anywhere]">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-text-muted md:hidden" strokeWidth={1.75} aria-hidden />
                      <span>
                        <span className="sr-only">{`${professionalLabel}: `}</span>
                        {s.worker}
                      </span>
                    </p>
                  </div>
                  {/* Company lane */}
                  <div className="min-w-0 md:order-3 md:flex md:min-h-[5.5rem] md:items-center">
                    <p className="flex items-start gap-2 text-sm text-text-secondary [overflow-wrap:anywhere]">
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-text-muted md:hidden" strokeWidth={1.75} aria-hidden />
                      <span>
                        <span className="sr-only">{`${companyLabel}: `}</span>
                        {s.company}
                      </span>
                    </p>
                  </div>
                  {/* Desktop step label under the spine node */}
                  <span className="hidden md:absolute md:left-0 md:right-0 md:top-[calc(5.5rem+1rem+3.25rem)] md:block md:text-center md:font-mono md:text-meta md:uppercase md:tracking-label md:text-text-primary">
                    {s.label}
                  </span>
                </li>
              );
            })}

            {/* The unit of work: evidence → confirmed → history. Plays once. */}
            {play ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute z-20 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full md:block md:top-[calc(5.5rem+1rem+1.5rem)]"
                style={{ left: "1.5rem" }}
                initial={{ left: "1.5rem", backgroundColor: TOKEN_COLORS[0] }}
                animate={{
                  left: xs.map((x) => `calc(1.5rem + (100% - 3rem) * ${x / 100})`),
                  backgroundColor: TOKEN_COLORS,
                }}
                transition={{ duration: 5.5, ease: "easeInOut", times: xs.map((x) => x / 100) }}
              />
            ) : null}
            {play ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute left-[1.5rem] z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full md:hidden"
                initial={{ top: "1.5rem", backgroundColor: TOKEN_COLORS[0] }}
                animate={{
                  top: xs.map((x) => `calc(1.5rem + (100% - 3rem) * ${x / 100})`),
                  backgroundColor: TOKEN_COLORS,
                }}
                transition={{ duration: 5.5, ease: "easeInOut", times: xs.map((x) => x / 100) }}
              />
            ) : null}
          </ol>
        </div>
      </div>
    </section>
  );
}
