"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { LivingWorkerHeroData } from "@/lib/marketing/living-worker-hero";
import { cn } from "@/lib/utils";

/**
 * THE LIVING WORKER HERO (owner 2026-09-29). One real-looking person at the
 * centre; the tool, workwear, place, country and responsibility change around
 * them; their Player Card opens from them and folds back; at the end they run
 * a team. Two sample people alternate — their stories never mix.
 *
 * MOTION. Every moment is a photograph of the same person in the same
 * framing, so a slow crossfade reads as the person changing, not as a new
 * slide; each moment carries a slow push-in. Seven seconds a moment, paused
 * on hover, focus or the pause control (WCAG 2.2.2), and never automatic
 * under prefers-reduced-motion — the first photograph and manual steps.
 *
 * COST. The first photograph is the LCP image (eager, high priority, the
 * 960 w variant on phones); only the NEXT photograph is preloaded, when the
 * browser is idle. Nothing else is fetched until it is about to be shown.
 */
const MOMENT_MS = 7000;
const FADE_MS = 1600;

type Flat = { story: number; moment: number };

export function LivingWorkerHero({ data, children }: { data: LivingWorkerHeroData; children: ReactNode }) {
  const sequence: Flat[] = useMemo(
    () => data.stories.flatMap((s, story) => s.moments.map((_, moment) => ({ story, moment }))),
    [data.stories],
  );
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState(false);
  const [small, setSmall] = useState(false);
  const loaded = useRef(new Set<string>());

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!reduce.matches);
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setSmall(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const at = (i: number) => {
    const f = sequence[(i + sequence.length) % sequence.length];
    return data.stories[f.story].moments[f.moment];
  };
  const srcOf = useCallback((i: number) => (small ? at(i).srcSmall : at(i).src), [small, sequence]); // eslint-disable-line react-hooks/exhaustive-deps

  // preload only the next photograph, when idle
  useEffect(() => {
    const next = srcOf(index + 1);
    if (loaded.current.has(next)) return;
    const go = () => {
      const img = new Image();
      img.decoding = "async";
      img.src = next;
      loaded.current.add(next);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go);
    else setTimeout(go, 400);
  }, [index, srcOf]);

  useEffect(() => {
    if (!playing || held || sequence.length < 2) return;
    const id = setTimeout(() => setIndex((i) => (i + 1) % sequence.length), MOMENT_MS);
    return () => clearTimeout(id);
  }, [playing, held, index, sequence.length]);

  // two stacked layers: the current photograph fades in over the previous
  const [layers, setLayers] = useState<{ a: number; b: number | null }>({ a: 0, b: null });
  useEffect(() => {
    setLayers((l) => (l.a === index ? l : { a: index, b: l.a }));
    const id = setTimeout(() => setLayers((l) => ({ a: l.a, b: null })), FADE_MS + 50);
    return () => clearTimeout(id);
  }, [index]);

  const flat = sequence[index];
  const story = data.stories[flat.story];
  const moment = story.moments[flat.moment];

  const layer = (i: number, top: boolean) => {
    const m = at(i);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`${i}-${top ? "top" : "under"}`}
        src={srcOf(i)}
        srcSet={`${m.srcSmall} 960w, ${m.src} 1920w`}
        sizes="100vw"
        alt={top ? m.alt : ""}
        aria-hidden={top ? undefined : true}
        width={m.width}
        height={m.height}
        loading="eager"
        fetchPriority={i === 0 ? "high" : "auto"}
        decoding="async"
        className={cn("absolute inset-0 h-full w-full object-cover object-center", top && "living-hero-in")}
        style={top ? { animationDuration: `${FADE_MS}ms` } : undefined}
      />
    );
  };

  return (
    <section
      className="relative isolate -mx-6 overflow-hidden bg-ink-900 sm:-mx-12"
      aria-roledescription="carousel"
      aria-label={story.name}
      data-testid="living-worker-hero"
      data-story={story.id}
      data-moment={flat.moment}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {/* the person: full-bleed photograph, always centred */}
      <div className="relative h-[78svh] min-h-[30rem] w-full md:h-[min(86vh,56rem)]">
        {/* a slow push-in, restarted with every moment */}
        <div
          key={index}
          className={cn("absolute inset-0", playing && !held && "living-hero-push")}
          style={{ animationDuration: `${MOMENT_MS + FADE_MS}ms` }}
        >
          {layers.b !== null ? layer(layers.b, false) : null}
          {layer(layers.a, true)}
        </div>
        {/* light falls off to the words: bottom and left, never across the face */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/25 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-2/5 bg-gradient-to-r from-ink-900/85 to-transparent md:block" />

        <span className="absolute left-4 top-4 rounded-sm border border-ink-500 bg-ink-900/60 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary backdrop-blur-sm sm:left-8 sm:top-6">
          {data.sampleLabel}
        </span>

        {/* THE PLAYER CARD opens from the person and folds back */}
        <div
          className={cn(
            "absolute z-10 w-[min(21rem,calc(100%-2rem))] origin-left rounded-xl border border-ink-600 bg-ink-800/85 p-4 shadow-2xl backdrop-blur-md transition-all duration-700 ease-out",
            "bottom-28 left-1/2 -translate-x-1/2 md:bottom-auto md:left-[58%] md:top-1/2 md:-translate-y-1/2 md:translate-x-0",
            moment.card ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0",
          )}
          aria-hidden={moment.card ? undefined : true}
          data-testid="living-worker-hero-card"
        >
          {moment.card ? (
            <>
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">{data.cardLabel}</p>
              <p className="mt-1 font-display text-2xl font-bold leading-tight text-text-primary">{moment.card.name}</p>
              <p className="text-sm text-text-secondary">
                {moment.card.profession} · {moment.card.country}
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {moment.card.facts.map((f) => (
                  <li key={f} className="text-sm font-medium text-text-primary">
                    {f}
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex flex-wrap gap-1.5">
                {moment.card.skills.map((s) => (
                  <span key={s} className="rounded-full border border-ink-500 px-2 py-0.5 text-meta text-text-secondary">
                    {s}
                  </span>
                ))}
              </p>
              <p className="mt-3 border-t border-ink-600 pt-2 text-meta text-text-muted">{moment.card.path}</p>
            </>
          ) : null}
        </div>

        {/* THE OWNER: the people and work they now run appear around them */}
        {moment.team ? (
          <ul className="absolute right-4 top-16 z-10 flex flex-col items-end gap-2 sm:right-8 md:top-1/4" data-testid="living-worker-hero-team">
            {moment.team.map((item, k) => (
              <li
                key={item}
                className="living-hero-rise rounded-md border border-ink-600 bg-ink-800/80 px-3 py-1.5 text-sm text-text-primary backdrop-blur-md"
                style={{ animationDelay: `${300 + k * 220}ms` }}
              >
                {item}
              </li>
            ))}
          </ul>
        ) : null}

        {/* the moment in words, and quiet controls */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 px-4 pb-4 sm:px-8 sm:pb-6">
          <p key={index} className="living-hero-rise max-w-[70%] text-sm text-text-primary sm:text-base" aria-live="polite">
            {moment.caption}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setIndex((i) => (i - 1 + sequence.length) % sequence.length)} className="min-h-11 min-w-11 rounded-full text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" aria-label={data.controls.previous}>
              ‹
            </button>
            <button type="button" onClick={() => setPlaying((v) => !v)} className="min-h-11 rounded-full px-3 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" data-testid="living-worker-hero-toggle">
              {playing ? data.controls.pause : data.controls.play}
            </button>
            <button type="button" onClick={() => setIndex((i) => (i + 1) % sequence.length)} className="min-h-11 min-w-11 rounded-full text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" aria-label={data.controls.next}>
              ›
            </button>
          </div>
        </div>
        {/* where in the working life we are: one thin line per moment of THIS story */}
        <div aria-hidden className="absolute inset-x-4 bottom-0 z-10 flex gap-1 sm:inset-x-8">
          {story.moments.map((_, k) => (
            <span key={k} className={cn("h-0.5 flex-1 rounded-full transition-colors duration-700", k <= flat.moment ? "bg-brand-blue" : "bg-ink-600")} />
          ))}
        </div>
      </div>

      {/* the promise and the doors: over the photograph on desktop, below it on a phone */}
      <div className="relative z-10 px-6 pb-2 pt-6 sm:px-12 md:pointer-events-none md:absolute md:left-0 md:top-1/2 md:w-[40%] md:-translate-y-1/2 md:p-0 md:pl-12 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        {children}
      </div>
    </section>
  );
}
