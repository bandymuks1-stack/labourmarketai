"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { TrackedCta } from "@/components/app/tracked-cta";
import { cn } from "@/lib/utils";

import { PUBLIC_IMAGERY } from "./public-imagery";
import { StateMark } from "./state-mark";

export type TransitionCopy = {
  readonly title: string;
  readonly sub: string;
  readonly stageNav: string;
  readonly replay: string;
  readonly sample: string;
  readonly stages: readonly { readonly label: string; readonly caption: string }[];
  readonly pro: {
    readonly name: string;
    readonly initials: string;
    readonly role: string;
    readonly recordTitle: string;
    readonly recordText: string;
    readonly photoAlt: string;
    readonly historyLabel: string;
    readonly historyTitle: string;
    readonly historyMeta: string;
    readonly nextLabel: string;
    readonly nextMeta: string;
  };
  readonly co: {
    readonly name: string;
    readonly project: string;
    readonly waiting: string;
    readonly done: string;
    readonly nextLabel: string;
    readonly nextNeed: string;
    readonly nextCta: string;
  };
  readonly states: {
    readonly own: string;
    readonly waiting: string;
    readonly confirmed: string;
  };
};

const LAST = 5;
const STEP_MS = 2400;

/**
 * THE SIGNATURE TRANSITION — one shift becomes professional history while the
 * company gains operational context. It teaches the product; it is not
 * decoration.
 *
 * MOTION RULES
 *  - plays ONCE when first scrolled into view, never loops;
 *  - reduced motion (and no-JS / SSR) show the COMPLETE final state, so the
 *    static page is already the whole story;
 *  - every stage is also a real button and the caption is a live region, so
 *    the sequence is operable and readable without watching it;
 *  - ZERO layout shift: every element is always in the layout and only
 *    opacity / transform change; pane heights never depend on the stage.
 */
export function WorkRecordTransition({
  copy,
  embedded = false,
}: {
  copy: TransitionCopy;
  /** Inside a page that already supplies the container (the homepage). */
  embedded?: boolean;
}) {
  const [stage, setStage] = useState(LAST);
  const rootRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const played = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const play = useCallback(() => {
    clear();
    setStage(1);
    const tick = (n: number) => {
      timer.current = setTimeout(() => {
        setStage(n);
        if (n < LAST) tick(n + 1);
      }, STEP_MS);
    };
    tick(2);
  }, [clear]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !played.current) {
          played.current = true;
          play();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -25% 0px", threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, [play, clear]);

  const choose = (n: number) => {
    played.current = true;
    clear();
    setStage(n);
  };

  const s = copy.stages;
  const caption = s[stage - 1]?.caption ?? "";
  const kitchen = PUBLIC_IMAGERY.kitchen;
  const proState =
    stage >= 3
      ? ({ state: "confirmed", label: copy.states.confirmed } as const)
      : stage === 2
        ? ({ state: "waiting", label: copy.states.waiting } as const)
        : ({ state: "own", label: copy.states.own } as const);
  const coState =
    stage >= 3
      ? ({ state: "confirmed", label: copy.co.done } as const)
      : ({ state: "waiting", label: copy.co.waiting } as const);

  const fade = (on: boolean) =>
    cn(
      "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none",
      on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
    );

  return (
    <section
      ref={rootRef}
      className={embedded ? "py-12 lg:py-16" : "mx-auto max-w-container px-6 py-16 sm:px-12 lg:py-24"}
      aria-labelledby="transition-title"
      data-testid="work-record-transition"
      data-stage={stage}
    >
      <h2
        id="transition-title"
        className="max-w-3xl font-display text-3xl font-bold leading-[1.08] tracking-tightest text-text-primary sm:text-5xl"
      >
        {copy.title}
      </h2>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">{copy.sub}</p>

      <div role="group" aria-label={copy.stageNav} className="mt-8 flex flex-wrap items-center gap-2">
        {s.map((st, i) => (
          <button
            key={st.label}
            type="button"
            aria-pressed={stage === i + 1}
            onClick={() => choose(i + 1)}
            className={cn(
              "min-h-11 rounded-full px-4 text-support font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              stage === i + 1
                ? "bg-brand-blue text-text-on-brand"
                : "bg-ink-700 text-text-secondary hover:text-text-primary",
            )}
          >
            <span aria-hidden className="mr-1.5 opacity-70">
              {i + 1}
            </span>
            {st.label}
          </button>
        ))}
        <button
          type="button"
          onClick={play}
          className="min-h-11 rounded-full px-3 text-support text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:hidden"
        >
          ↺ {copy.replay}
        </button>
      </div>

      <p
        aria-live="polite"
        className="mt-6 min-h-[4.2rem] font-display text-2xl font-semibold leading-tight text-text-primary sm:min-h-[2.2rem]"
      >
        {caption}
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* the professional */}
        <div className="relative min-h-[27rem] overflow-hidden rounded-3xl bg-ink-800 p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                role="img"
                aria-label={copy.pro.name}
                className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-700 font-display text-base font-semibold text-brand-blue"
              >
                {copy.pro.initials}
              </span>
              <div>
                <p className="font-display text-card-title font-semibold text-text-primary">{copy.pro.name}</p>
                <p className="text-support text-text-secondary">{copy.pro.role}</p>
              </div>
            </div>
            <span className="rounded-full bg-ink-900/60 px-3 py-1 text-basis text-text-muted">{copy.sample}</span>
          </div>

          <div
            className={cn(
              "mt-6 rounded-2xl bg-ink-700 p-5 transition-[box-shadow,opacity] duration-700 motion-reduce:transition-none",
              stage >= 3 && "shadow-[inset_0_0_0_1.5px_rgb(var(--c-brand-blue)/0.5)]",
              stage >= 4 && "opacity-70",
            )}
          >
            <p className="font-display text-card-title font-semibold text-text-primary">{copy.pro.recordTitle}</p>
            <p className="mt-1 text-body text-text-secondary">{copy.pro.recordText}</p>
            <div className={cn("mt-4 overflow-hidden rounded-xl", fade(stage >= 2))}>
              <Image
                src={kitchen.src}
                alt={copy.pro.photoAlt}
                width={kitchen.width}
                height={kitchen.height}
                sizes="(min-width:1024px) 420px, 90vw"
                className="h-28 w-full object-cover sm:h-32"
              />
            </div>
            <div className="mt-4">
              <StateMark state={proState.state} label={proState.label} />
            </div>
          </div>

          <div className={cn("mt-5 border-l-2 border-brand-blue/60 pl-4", fade(stage >= 4))}>
            <p className="text-support text-text-muted">{copy.pro.historyLabel}</p>
            <p className="font-display text-card-title font-semibold text-text-primary">{copy.pro.historyTitle}</p>
            <p className="text-support text-text-secondary">{copy.pro.historyMeta}</p>
          </div>

          <div className={cn("mt-4 border-l-2 border-dashed border-ink-500 pl-4", fade(stage >= 5))}>
            <p className="text-support text-text-muted">{copy.pro.nextLabel}</p>
            <p className="text-support text-text-secondary">{copy.pro.nextMeta}</p>
          </div>
        </div>

        {/* the company */}
        <div className="relative min-h-[18rem] rounded-3xl bg-ink-800 p-6 sm:p-8 lg:min-h-[27rem]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-card-title font-semibold text-text-primary">{copy.co.name}</p>
            <span className="rounded-full bg-ink-900/60 px-3 py-1 text-basis text-text-muted">{copy.sample}</span>
          </div>
          <p className="mt-1 text-support text-text-secondary">{copy.co.project}</p>
          <div className="mt-6 rounded-2xl bg-ink-700 p-5">
            <StateMark state={coState.state} label={coState.label} />
          </div>
          <div className={cn("mt-6", fade(stage >= 5))}>
            <p className="text-support text-text-muted">{copy.co.nextLabel}</p>
            <p className="font-display text-card-title font-semibold text-text-primary">{copy.co.nextNeed}</p>
            <TrackedCta
              href="/company-need"
              ctaId="transition_next_need"
              audience="companies"
              tabIndex={stage >= 5 ? 0 : -1}
              className="mt-3 inline-flex min-h-11 items-center text-support font-medium text-brand-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              {copy.co.nextCta} →
            </TrackedCta>
          </div>
        </div>
      </div>
    </section>
  );
}
