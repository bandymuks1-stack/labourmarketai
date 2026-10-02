"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  CircleDashed,
  ClipboardList,
  Camera,
  History,
  Search,
  UserRound,
  Users,
  FileText,
  type LucideIcon,
} from "lucide-react";

import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * THE LIVE WORK GRAPH — public example (premium completion mission §11, §19).
 *
 *   PROFESSIONAL → TEAM → PROJECT → WORK → EVIDENCE → CONFIRMATION → HISTORY
 *
 * It answers ONE question: "what happens to the work I do?" Two linked views:
 *
 *   1. THE LIFECYCLE STRIP — an ordered list of buttons; choosing a step moves
 *      along the lifecycle. Each step opens a REAL workspace route.
 *   2. THE RECORD — one record that ACCUMULATES. The same person stays fixed
 *      (persistent portrait); each lifecycle step fills one row of the record.
 *      Rows the lifecycle has not reached yet are shown as a dashed "not yet"
 *      state — never blank, never zero (UNKNOWN is not zero, SEP-7). So the
 *      motion is causal: WORK produces EVIDENCE (cyan), a manager turns it
 *      into CONFIRMATION (green), and that lands in HISTORY (gold). Nothing
 *      glows merely to be animated.
 *
 * ACCESSIBILITY BY CONSTRUCTION. Both views are plain lists (strip = buttons,
 * record = text rows); there is no separate fallback. The first pass plays once
 * and stops at the first interaction; reduced motion = no auto-play and no
 * animation. HONESTY: all content is a labelled EXAMPLE passed in by the
 * caller from i18n; this component invents nothing and carries no figures.
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
  /** Semantic tone: evidence is cyan, confirmation is green, history is gold. */
  readonly tone?: "evidence" | "confirmed" | "history" | "neutral";
}

const TONE_RING: Record<NonNullable<LifecycleStage["tone"]>, string> = {
  evidence: "border-brand-cyan text-brand-cyan",
  confirmed: "border-state-success text-state-success",
  history: "border-brand-blue text-brand-blue",
  neutral: "border-ink-500 text-text-primary",
};

const TONE_TEXT: Record<NonNullable<LifecycleStage["tone"]>, string> = {
  evidence: "text-brand-cyan",
  confirmed: "text-state-success",
  history: "text-brand-blue",
  neutral: "text-text-primary",
};

export function WorkLifecycleGraph({
  title,
  hint,
  exampleNote,
  openLabel,
  listLabel,
  pendingLabel,
  subject,
  stages,
  testId = "work-lifecycle-graph",
}: {
  readonly title: string;
  readonly hint: string;
  readonly exampleNote: string;
  readonly openLabel: string;
  readonly listLabel: string;
  /** "Not yet" — the dashed state of a row the lifecycle has not reached. */
  readonly pendingLabel: string;
  /** The persistent subject of the record: a person (portrait) or a company. */
  readonly subject: { readonly kind: "person" | "company"; readonly name: string; readonly initials: string };
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
    const id = window.setTimeout(() => setActive((a) => a + 1), 1300);
    return () => window.clearTimeout(id);
  }, [auto, reduce, active, last]);

  // With reduced motion there is no auto-play: show the whole record at once.
  const shown = reduce && auto ? last : active;
  const choose = (i: number) => {
    setAuto(false);
    setActive(i);
  };
  const progress = last > 0 ? shown / last : 0;
  const current = stages[shown];

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
          <p className="font-mono text-meta uppercase tracking-label text-text-secondary">{exampleNote}</p>
        </div>

        {/* ── 1. THE LIFECYCLE STRIP ─────────────────────────────────────── */}
        <ol
          aria-label={listLabel}
          className="relative mt-8 grid gap-2 md:grid-flow-col md:auto-cols-fr"
          data-testid={`${testId}-stages`}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-6 left-[1.625rem] top-6 w-px bg-ink-600 md:inset-x-6 md:bottom-auto md:left-6 md:right-6 md:top-[1.625rem] md:h-px md:w-auto"
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute bottom-6 left-[1.56rem] top-6 w-0.5 origin-top bg-brand-blue md:hidden"
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
            const reached = i <= shown;
            const selected = i === shown;
            return (
              <li key={s.key} className="relative">
                <button
                  type="button"
                  onClick={() => choose(i)}
                  aria-pressed={selected}
                  data-testid={`${testId}-stage-${s.key}`}
                  className="group flex min-h-11 w-full items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue md:flex-col md:items-start md:gap-2"
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
                  <span
                    className={cn(
                      "font-mono text-meta uppercase tracking-label",
                      selected ? "text-text-primary" : "text-text-secondary",
                    )}
                  >
                    <span className="sr-only">{`${i + 1}. `}</span>
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* ── 2. THE RECORD — one record that accumulates ───────────────── */}
        <div
          className="mt-8 grid gap-6 rounded-xl border border-ink-600 bg-ink-800/50 p-4 sm:p-6 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
          data-testid={`${testId}-record`}
          aria-live="polite"
        >
          {/* The persistent subject: same portrait/mark at every step. */}
          <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-3">
            {subject.kind === "person" ? (
              <PersonPortrait
                name={subject.name}
                avatarUrl={null}
                initials={subject.initials}
                width="clamp(72px, 22vw, 112px)"
              />
            ) : (
              <span
                className="flex items-center justify-center rounded-xl border border-ink-500 bg-ink-700 text-text-primary"
                style={{ width: "clamp(72px, 22vw, 112px)", aspectRatio: "4 / 5" }}
              >
                <Building2 className="h-1/3 w-1/3" strokeWidth={1.5} aria-hidden />
              </span>
            )}
            <p className="font-display text-xl font-bold tracking-tightest text-text-primary">{subject.name}</p>
          </div>

          <ul className="flex min-w-0 flex-col gap-1.5">
            {stages.map((s, i) => {
              const filled = i <= shown;
              const isCurrent = i === shown;
              const Icon = ICONS[s.icon];
              return (
                <li
                  key={s.key}
                  className={cn(
                    "rounded-lg border px-3 py-2 transition-colors",
                    isCurrent ? "border-brand-blue/60 bg-ink-700/60" : "border-transparent",
                  )}
                  data-state={filled ? "filled" : "pending"}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={cn("h-4 w-4 shrink-0", filled ? TONE_TEXT[s.tone ?? "neutral"] : "text-text-muted")}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="w-24 shrink-0 font-mono text-meta uppercase tracking-label text-text-secondary sm:w-28">
                      {s.label}
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                      {filled ? (
                        <motion.span
                          key="fact"
                          initial={reduce ? false : { opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
                          className={cn(
                            "min-w-0 text-sm [overflow-wrap:anywhere]",
                            isCurrent ? "font-semibold text-text-primary" : "text-text-secondary",
                          )}
                        >
                          {s.fact}
                        </motion.span>
                      ) : (
                        <motion.span
                          key="pending"
                          initial={false}
                          animate={{ opacity: 1 }}
                          className="inline-flex min-h-6 items-center gap-1.5 rounded-md border border-dashed border-ink-500 px-2 font-mono text-meta uppercase tracking-label text-text-secondary"
                        >
                          <CircleDashed className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                          {pendingLabel}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  {isCurrent ? (
                    <div className="mt-2 flex flex-col gap-2 pl-7 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-text-secondary">{current.detail}</p>
                      <Link
                        href={current.href}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-brand-blue px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                      >
                        {openLabel} →
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-3 text-meta text-text-secondary">{hint}</p>
      </div>
    </section>
  );
}
