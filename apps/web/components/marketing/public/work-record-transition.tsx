"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { TrackedCta } from "@/components/app/tracked-cta";
import {
  PaneLabel,
  PaneMeta,
  PaneValue,
  PersonRing,
  WorldLines,
  WorldNode,
  WorldPane,
} from "@/components/world/world";
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
const STEP_MS = 2600;

/**
 * THE SIGNATURE TRANSITION, on a photographic stage — one shift becomes
 * professional history while the company gains operational context. The same
 * person stays at the centre of the world; the panes around her appear in the
 * order the work travels (work → proof → review → history → next) and the
 * leader lines show what connects to what. It teaches the product; it is not
 * decoration.
 *
 * MOTION RULES
 *  - plays ONCE when first scrolled into view, never loops;
 *  - reduced motion (and no-JS / SSR) show the COMPLETE final state;
 *  - every stage is a real button and the caption is a live region;
 *  - ZERO layout shift: every pane is always in the layout; only opacity and
 *    transform change. Below `lg` the panes read as a stacked chain, the
 *    stages not reached yet dimmed rather than hidden.
 * The photograph is a labelled sample; it is NEVER the evidence — the evidence
 * is the record's own photo inside its pane.
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
  const stageImg = PUBLIC_IMAGERY.kitchenLarge;
  const evidence = PUBLIC_IMAGERY.kitchen;
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

  /** desktop: hidden until reached; phone: dimmed until reached. */
  const reach = (n: number) =>
    cn(
      "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none",
      stage >= n ? "translate-y-0 opacity-100" : "translate-y-2 opacity-40 lg:opacity-0",
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
              stage === i + 1 ? "bg-brand-blue text-text-on-brand" : "bg-ink-700 text-text-secondary hover:text-text-primary",
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

      <div className="scope-dark relative isolate mt-6 overflow-hidden rounded-3xl bg-ink-900 lg:h-[760px]">
        <Image
          src={stageImg.src}
          alt=""
          width={stageImg.width}
          height={stageImg.height}
          sizes="(min-width:1280px) 1280px, 100vw"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60 lg:opacity-80"
          style={{ objectPosition: "47% 40%" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(var(--c-ink-900)/0.6),rgb(var(--c-ink-900)/0.35)_30%,rgb(var(--c-ink-900)/0.85))]"
        />
        <span className="absolute left-5 top-5 z-20 rounded-full bg-ink-900/60 px-3 py-1 text-basis text-text-secondary backdrop-blur">
          {copy.sample}
        </span>

        <div className="relative px-4 pb-4 pt-16 lg:static lg:p-0">
          <WorldLines
            paths={[
              { d: "M30 21 C 38 22 43 31 47 41", tone: "gold", show: stage >= 1 },
              { d: "M30 62 C 38 60 43 50 47 42", show: stage >= 2 },
              { d: "M73 21 C 64 24 54 33 48.5 40", tone: "success", show: stage >= 3 },
              { d: "M73 49 C 64 47 55 44 49 41.5", show: stage >= 4 },
              { d: "M50 86 C 49 72 48 58 47.6 44", tone: "dashed", show: stage >= 5 },
            ]}
          />
          <WorldNode x="47%" y="41%" show />
          <WorldNode x="48.5%" y="40%" tone="success" show={stage >= 3} />

          <WorldPane pos={{ left: "4%", top: "9%" }} w="clamp(260px,26vw,370px)" tier={stage >= 3 ? "context" : "focus"} className="lg:[animation:none]">
            <div className="flex items-center gap-3">
              <PersonRing src={PUBLIC_IMAGERY.rasaPortrait.src} name={copy.pro.name} initials={copy.pro.initials} size={46} objectPosition="50% 22%" zoom={1.15} focus />
              <div>
                <p className="font-display text-card-title font-semibold text-text-primary">{copy.pro.name}</p>
                <PaneMeta>{copy.pro.role}</PaneMeta>
              </div>
            </div>
            <PaneValue>{copy.pro.recordTitle}</PaneValue>
            <PaneMeta>{copy.pro.recordText}</PaneMeta>
          </WorldPane>

          <WorldPane pos={{ left: "4%", top: "52%" }} w="clamp(260px,26vw,370px)" className={cn("lg:[animation:none]", reach(2))}>
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl">
                <Image src={evidence.src} alt={copy.pro.photoAlt} fill sizes="80px" className="object-cover" />
              </div>
              <StateMark state={proState.state} label={proState.label} />
            </div>
          </WorldPane>

          <WorldPane pos={{ right: "4%", top: "9%" }} w="clamp(240px,23vw,330px)" tier="focus" className={cn("lg:[animation:none]", reach(3))}>
            <StateMark state="confirmed" label={copy.states.confirmed} />
          </WorldPane>

          <WorldPane pos={{ right: "4%", top: "37%" }} w="clamp(240px,23vw,330px)" className={cn("lg:[animation:none]", reach(4))}>
            <PaneLabel>{copy.pro.historyLabel}</PaneLabel>
            <PaneValue>{copy.pro.historyTitle}</PaneValue>
            <PaneMeta>{copy.pro.historyMeta}</PaneMeta>
          </WorldPane>

          <WorldPane pos={{ left: "36%", bottom: "6%" }} w="clamp(250px,25vw,350px)" tier="quiet" className={cn("lg:[animation:none] lg:ring-1 lg:ring-dashed", reach(5))}>
            <PaneLabel>{copy.pro.nextLabel}</PaneLabel>
            <PaneMeta>{copy.pro.nextMeta}</PaneMeta>
          </WorldPane>

          <WorldPane pos={{ right: "4%", bottom: "6%" }} w="clamp(250px,24vw,340px)" className="lg:[animation:none]">
            <PaneValue>{copy.co.name}</PaneValue>
            <PaneMeta>{copy.co.project}</PaneMeta>
            <div className="mt-2">
              <StateMark state={coState.state} label={coState.label} />
            </div>
            <div className={cn("mt-3", reach(5))}>
              <PaneLabel>{copy.co.nextLabel}</PaneLabel>
              <p className="font-display text-card-title font-semibold text-text-primary">{copy.co.nextNeed}</p>
              <TrackedCta
                href="/company-need"
                ctaId="transition_next_need"
                audience="companies"
                tabIndex={stage >= 5 ? 0 : -1}
                className="mt-1 inline-flex min-h-11 items-center text-support font-medium text-brand-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              >
                {copy.co.nextCta} →
              </TrackedCta>
            </div>
          </WorldPane>
        </div>
      </div>
    </section>
  );
}
