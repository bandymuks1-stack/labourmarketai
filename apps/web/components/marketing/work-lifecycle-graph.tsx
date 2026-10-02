"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  Briefcase,
  ClipboardList,
  Camera,
  History,
  Search,
  UserRound,
  Users,
  FileText,
  type LucideIcon,
} from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * THE LIVE WORK GRAPH — first prototype (premium completion mission §11).
 *
 * One real relationship, shown instead of explained:
 *   PROFESSIONAL → TEAM → PROJECT → WORK → EVIDENCE → CONFIRMATION → HISTORY
 *
 * It answers ONE question: "what happens to the work I do?" Each stage is a
 * real product context (a route), not decoration: selecting a stage shows what
 * it adds and opens the real place in the workspace.
 *
 * ACCESSIBILITY BY CONSTRUCTION. The graph IS an ordered list of buttons —
 * there is no separate "fallback". Keyboard: Tab/Enter like any list; the rail
 * is decorative (aria-hidden). Reduced motion: no auto-advance, no animation.
 * The first pass auto-plays once to show the direction of travel and stops at
 * the first interaction.
 *
 * HONESTY. The data is a labelled EXAMPLE passed in by the caller from i18n;
 * this component invents nothing and carries no figures of its own.
 */

export type LifecycleIcon =
  | "person"
  | "team"
  | "project"
  | "work"
  | "evidence"
  | "confirmation"
  | "history"
  | "need"
  | "people"
  | "report";

const ICONS: Record<LifecycleIcon, LucideIcon> = {
  person: UserRound,
  team: Users,
  project: Briefcase,
  work: ClipboardList,
  evidence: Camera,
  confirmation: BadgeCheck,
  history: History,
  need: Search,
  people: UserRound,
  report: FileText,
};

export interface LifecycleStage {
  readonly key: string;
  readonly icon: LifecycleIcon;
  /** Short noun: "Team". */
  readonly label: string;
  /** The example fact at this stage: "Kitchen team". */
  readonly fact: string;
  /** One sentence: what this stage adds. */
  readonly detail: string;
  /** Real product route this stage opens (locale-aware Link). */
  readonly href: string;
  /** Semantic tone: evidence is cyan, confirmation is green, the rest neutral. */
  readonly tone?: "evidence" | "confirmed" | "neutral";
}

const TONE_RING: Record<NonNullable<LifecycleStage["tone"]>, string> = {
  evidence: "border-brand-cyan text-brand-cyan",
  confirmed: "border-state-success text-state-success",
  neutral: "border-ink-500 text-text-primary",
};

export function WorkLifecycleGraph({
  title,
  hint,
  exampleNote,
  openLabel,
  listLabel,
  stages,
  testId = "work-lifecycle-graph",
}: {
  readonly title: string;
  readonly hint: string;
  readonly exampleNote: string;
  readonly openLabel: string;
  readonly listLabel: string;
  readonly stages: readonly LifecycleStage[];
  readonly testId?: string;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const last = stages.length - 1;

  useEffect(() => {
    if (!auto || reduce) return;
    if (active >= last) {
      setAuto(false);
      return;
    }
    const id = window.setTimeout(() => setActive((a) => a + 1), 1100);
    return () => window.clearTimeout(id);
  }, [auto, reduce, active, last]);

  const choose = (i: number) => {
    setAuto(false);
    setActive(i);
  };
  const progress = last > 0 ? active / last : 0;
  const current = stages[active];

  return (
    <section
      className="relative mx-auto max-w-container px-6 pt-10 sm:px-12"
      data-testid={testId}
      aria-label={title}
    >
      <div className="rounded-2xl border border-ink-600 bg-surface-1/60 p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
            {title}
          </h2>
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">{exampleNote}</p>
        </div>

        <ol
          aria-label={listLabel}
          className="relative mt-8 grid gap-3 md:grid-flow-col md:auto-cols-fr md:gap-2"
          data-testid={`${testId}-stages`}
        >
          {/* The rail: decorative; the list itself carries the meaning. */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-6 left-[1.625rem] top-6 w-px bg-ink-600 md:inset-x-6 md:bottom-auto md:left-6 md:right-6 md:top-[1.625rem] md:h-px md:w-auto"
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute bottom-6 left-[1.625rem] top-6 w-0.5 origin-top bg-brand-blue md:hidden"
            initial={false}
            animate={{ scaleY: progress }}
            transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-6 right-6 top-[1.56rem] hidden h-0.5 origin-left bg-brand-blue md:block"
            initial={false}
            animate={{ scaleX: progress }}
            transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
          {stages.map((s, i) => {
            const Icon = ICONS[s.icon];
            const reached = i <= active;
            const selected = i === active;
            return (
              <li key={s.key} className="relative">
                <button
                  type="button"
                  onClick={() => choose(i)}
                  aria-pressed={selected}
                  data-testid={`${testId}-stage-${s.key}`}
                  className={cn(
                    "group flex min-h-11 w-full items-center gap-3 rounded-xl p-0 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue md:flex-col md:items-start md:gap-3",
                  )}
                >
                  <span
                    className={cn(
                      "relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-ink-900 transition-colors",
                      reached ? TONE_RING[s.tone ?? "neutral"] : "border-ink-600 text-text-muted",
                      selected && "ring-4 ring-brand-blue/20",
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        "font-mono text-meta uppercase tracking-label",
                        selected ? "text-text-primary" : "text-text-muted",
                      )}
                    >
                      <span className="sr-only">{`${i + 1}. `}</span>
                      {s.label}
                    </span>
                    <span
                      className={cn(
                        "text-sm [overflow-wrap:anywhere]",
                        selected ? "font-semibold text-text-primary" : "text-text-secondary",
                      )}
                    >
                      {s.fact}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div
          className="mt-8 flex flex-col gap-3 rounded-xl border border-ink-600 bg-ink-800/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
          aria-live="polite"
          data-testid={`${testId}-detail`}
        >
          <div className="min-w-0">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">{current.label}</p>
            <p className="mt-1 text-base text-text-primary">{current.detail}</p>
          </div>
          <Link
            href={current.href}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-brand-blue px-5 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            {openLabel} →
          </Link>
        </div>
        <p className="mt-3 text-meta text-text-muted">{hint}</p>
      </div>
    </section>
  );
}
