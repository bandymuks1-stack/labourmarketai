"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { HeroCard, HeroMoment, HeroStory, LivingWorkerHeroData } from "@/lib/marketing/living-worker-hero";
import { cn } from "@/lib/utils";

/**
 * THE LIVING WORKER HERO (owner 2026-09-29, motion + card 2026-09-30). One
 * real-looking person at the centre; their world transforms around them.
 *
 * KEYFRAMES, NOT SLIDES. Every moment is a photograph of the same person, and
 * each photograph knows where that person stands (face + figure, located by
 * the media script). So the motion is built around the person, not the frame:
 *   · a slow camera move whose origin is the face, with the figure on its own
 *     layer moving a little further than the world behind it (depth);
 *   · the next moment is placed so its person starts EXACTLY where the last
 *     person stood, grows out of them through a soft reveal centred on them,
 *     and only then settles into its own framing — the person stays one
 *     continuous subject while tool, clothes, place and country change;
 *   · a warm pass of light carries each change; a new story dips to obsidian.
 *
 * THE PLAYER CARD is part of the story: on the country moment the scene
 * settles and dims, the person's identity gathers around them in fragments,
 * the fragments become the card (their own portrait, name, profession, the
 * road their work has taken, real work facts), and the card folds back into
 * the person before the story moves on. No score, no rating, no "verified".
 *
 * ACCESSIBILITY. Paused on hover and focus, a pause control (WCAG 2.2.2), and
 * under prefers-reduced-motion nothing moves by itself: the photographs change
 * only on the controls and the card is simply shown on its moment.
 *
 * COST. The first photograph is the LCP image; only the next is preloaded,
 * when idle. Motion is transform/opacity/mask on the compositor.
 */
const MOMENT_MS = 7000;
const CARD_MOMENT_MS = 12500;
const TRANSITION_MS = 1900;

type Flat = { story: number; moment: number };
type Box = { w: number; h: number };
type Geo = {
  /** object-position for this photograph in this box */
  pos: string;
  /** the face, in box pixels */
  ax: number;
  ay: number;
  /** the figure, in box pixels */
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
};
type Phase = "none" | "gather" | "card" | "return";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Where a photograph and its person land in a box, object-fit: cover. On a
 *  phone the person is brought to the centre of the narrow frame. */
function place(m: HeroMoment, box: Box, small: boolean): Geo {
  const s = Math.max(box.w / m.width, box.h / m.height);
  const dw = m.width * s;
  const dh = m.height * s;
  const offX = clamp(small ? box.w / 2 - m.face.x * dw : (box.w - dw) / 2, box.w - dw, 0);
  const offY = clamp((box.h - dh) / 2, box.h - dh, 0);
  const px = dw - box.w < 1 ? 50 : (offX / (box.w - dw)) * 100;
  const py = dh - box.h < 1 ? 50 : (offY / (box.h - dh)) * 100;
  return {
    pos: `${px}% ${py}%`,
    ax: offX + m.face.x * dw,
    ay: offY + m.face.y * dh,
    fx0: offX + m.figure.x0 * dw,
    fy0: offY + m.figure.y0 * dh,
    fx1: offX + m.figure.x1 * dw,
    fy1: offY + m.figure.y1 * dh,
  };
}

/** "2 m. darbo patirties" → ["2 m.", "darbo patirties"]; no figure → [null, phrase]. */
function splitFact(fact: string): [string | null, string] {
  const m = /^(\d[\d.,]*(?:\s?\p{L}{1,4}\.)?)\s+(.+)$/u.exec(fact.trim());
  return m ? [m[1]!, m[2]!] : [null, fact];
}

type Arrive = { kind: "continue"; ax: number; ay: number } | { kind: "story" } | null;

function Moment({
  m,
  g,
  small,
  top,
  arrive,
  leaving,
  duration,
  motion,
  running,
  drift,
  priority,
}: {
  m: HeroMoment;
  g: Geo | null;
  small: boolean;
  top: boolean;
  arrive: Arrive;
  leaving: boolean;
  duration: number;
  motion: boolean;
  running: boolean;
  drift: number;
  priority: boolean;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLImageElement>(null);
  const anims = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const o = outer.current;
    const c = cam.current;
    const f = front.current;
    if (!motion || !g || !o || !c || !f || typeof o.animate !== "function") return;
    const origin = `${g.ax}px ${g.ay}px`;
    o.style.transformOrigin = origin;
    c.style.transformOrigin = origin;
    f.style.transformOrigin = origin;
    const list: Animation[] = [];
    const ease = "cubic-bezier(0.45, 0, 0.15, 1)";
    if (leaving) {
      list.push(o.animate([{ transform: "scale(1)" }, { transform: "scale(1.045)" }], { duration: TRANSITION_MS, easing: ease, fill: "both" }));
    } else if (arrive?.kind === "continue") {
      const dx = arrive.ax - g.ax;
      const dy = arrive.ay - g.ay;
      list.push(
        o.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1.12)` }, { transform: "translate(0, 0) scale(1)" }], {
          duration: TRANSITION_MS,
          easing: ease,
          fill: "both",
        }),
        o.animate([{ "--lwh-r": "0%" } as Keyframe, { "--lwh-r": "170%" } as Keyframe], {
          duration: TRANSITION_MS * 0.9,
          easing: "cubic-bezier(0.55, 0, 0.35, 1)",
          fill: "both",
        }),
      );
    } else if (arrive?.kind === "story") {
      // another person's story: never a blend of two faces — the last story
      // goes down into obsidian (the dip below) and the next rises out of it
      list.push(
        o.animate(
          [
            { opacity: 0, transform: "scale(1.06)", offset: 0 },
            { opacity: 0, transform: "scale(1.06)", offset: 0.45 },
            { opacity: 1, transform: "scale(1)", offset: 1 },
          ],
          { duration: TRANSITION_MS * 1.3, easing: ease, fill: "both" },
        ),
      );
    }
    // the drift is what the pause control holds; a change of moment the
    // person asked for (‹ ›) always completes, paused or not
    const drifting: Animation[] = [];
    if (!leaving) {
      drifting.push(
        // the camera: a slow move in on the face, drifting a little sideways
        c.animate([{ transform: "translate(0, 0) scale(1)" }, { transform: `translate(${drift * (small ? 6 : 14)}px, 0) scale(1.07)` }], {
          duration: duration + TRANSITION_MS,
          easing: "linear",
          fill: "both",
        }),
        // the person, nearer than their world
        f.animate([{ transform: "scale(1)" }, { transform: "scale(1.022)" }], { duration: duration + TRANSITION_MS, easing: "linear", fill: "both" }),
      );
      if (!running) drifting.forEach((a) => a.pause());
    }
    anims.current = drifting;
    return () => [...list, ...drifting].forEach((a) => a.cancel());
    // the geometry is read once per mount; a resize re-mounts through the key
  }, [motion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    for (const a of anims.current) {
      if (running) a.play();
      else if (a.playState === "running") a.pause();
    }
  }, [running]);

  const src = small ? m.srcSmall : m.src;
  const img = (className: string, style?: React.CSSProperties, ref?: React.Ref<HTMLImageElement>, hidden?: boolean) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      srcSet={`${m.srcSmall} 960w, ${m.src} 1920w`}
      sizes="100vw"
      alt={hidden ? "" : m.alt}
      aria-hidden={hidden ? true : undefined}
      width={m.width}
      height={m.height}
      loading="eager"
      fetchPriority={priority && !hidden ? "high" : "auto"}
      decoding="async"
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
      style={{ objectPosition: g?.pos ?? "50% 50%", ...style }}
    />
  );

  const figW = g ? g.fx1 - g.fx0 : 0;
  const figH = g ? g.fy1 - g.fy0 : 0;
  return (
    <div
      ref={outer}
      className="absolute inset-0"
      style={{
        ...(arrive?.kind === "continue" && g && motion
          ? {
              maskImage: `radial-gradient(circle at ${g.ax}px ${g.ay}px, #000 var(--lwh-r), transparent calc(var(--lwh-r) + 26%))`,
              WebkitMaskImage: `radial-gradient(circle at ${g.ax}px ${g.ay}px, #000 var(--lwh-r), transparent calc(var(--lwh-r) + 26%))`,
            }
          : null),
      }}
    >
      <div ref={cam} className="absolute inset-0">
        {img("", undefined, undefined, !top)}
        {/* the person's own layer: the same photograph, only the figure */}
        {g
          ? img(
              "",
              {
                maskImage: `radial-gradient(ellipse ${figW * 0.78}px ${figH * 0.62}px at ${(g.fx0 + g.fx1) / 2}px ${g.fy0 + figH * 0.45}px, #000 55%, transparent 100%)`,
                WebkitMaskImage: `radial-gradient(ellipse ${figW * 0.78}px ${figH * 0.62}px at ${(g.fx0 + g.fx1) / 2}px ${g.fy0 + figH * 0.45}px, #000 55%, transparent 100%)`,
              },
              front,
              true,
            )
          : null}
      </div>
    </div>
  );
}

/** THE PLAYER CARD — the person's own professional identity, portrait first. */
function PlayerCard({
  card,
  story,
  label,
  sampleLabel,
  note,
  width,
  compact,
}: {
  card: HeroCard;
  story: HeroStory;
  label: string;
  sampleLabel: string;
  note: string;
  width: number;
  /** a phone: a shorter portrait so the whole card stands in the scene */
  compact: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-500/70 bg-ink-900/90 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl" style={{ width }}>
      {/* one metallic hairline: the brand, not a badge */}
      <div aria-hidden className="absolute inset-x-6 top-0 z-10 h-px bg-gradient-to-r from-transparent via-brand-blue to-transparent" />
      <p className="flex items-center justify-between gap-2 px-5 pb-2.5 pt-3.5 font-mono text-meta uppercase tracking-label text-text-secondary">
        <span>{label}</span>
        <span className="rounded-sm border border-ink-500 px-1.5 text-text-muted">{sampleLabel}</span>
      </p>
      <div className={cn("relative overflow-hidden", compact ? "aspect-[1/0.7]" : "aspect-[1/0.88]")}>
        {story.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={story.portrait.src}
            srcSet={`${story.portrait.srcSmall} 400w, ${story.portrait.src} 800w`}
            sizes={`${width}px`}
            alt=""
            width={story.portrait.width}
            height={story.portrait.height}
            decoding="async"
            className="lwh-portrait h-full w-full object-cover object-[50%_18%]"
          />
        ) : null}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/10 to-transparent" />
        <div aria-hidden className="lwh-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-3">
          <p className="font-display text-[2rem] font-bold leading-none tracking-tight text-text-primary">{card.name}</p>
          <p className="mt-1.5 font-mono text-meta uppercase tracking-label text-text-secondary">
            {card.profession} · {card.country}
          </p>
        </div>
      </div>
      <div className="space-y-3.5 px-5 pb-5 pt-3">
        {/* the road the work has taken — the record travels with the person */}
        <ol className="flex items-center" aria-label={card.path.join(" → ")}>
          {card.path.map((p, k) => (
            <li key={p} className={cn("flex items-center", k > 0 && "flex-1")}>
              {k > 0 ? <span aria-hidden className="mx-2 h-px flex-1 bg-gradient-to-r from-ink-500 to-text-muted/60" /> : null}
              <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-text-primary">
                <span aria-hidden className={cn("h-1.5 w-1.5 rotate-45", k === card.path.length - 1 ? "bg-brand-blue" : "bg-text-muted")} />
                {p}
              </span>
            </li>
          ))}
        </ol>
        <dl className="grid grid-cols-2 gap-3 border-y border-ink-600/80 py-3">
          {card.facts.map((f) => {
            const [figure, unit] = splitFact(f);
            return (
              <div key={f} className="min-w-0">
                <dt className="sr-only">{unit}</dt>
                <dd className="flex flex-col">
                  {figure ? <span className="font-display text-2xl font-semibold leading-none text-text-primary">{figure}</span> : null}
                  <span className="mt-1 text-meta text-text-muted">{unit}</span>
                </dd>
              </div>
            );
          })}
        </dl>
        <ul className="flex flex-wrap gap-1.5">
          {card.skills.map((s) => (
            <li key={s} className="rounded-full border border-ink-500 bg-ink-800/60 px-2.5 py-1 text-meta text-text-secondary">
              {s}
            </li>
          ))}
        </ul>
        <p className="text-meta leading-snug text-text-muted">{note}</p>
      </div>
    </div>
  );
}

export function LivingWorkerHero({ data, children }: { data: LivingWorkerHeroData; children: ReactNode }) {
  const sequence: Flat[] = useMemo(
    () => data.stories.flatMap((s, story) => s.moments.map((_, moment) => ({ story, moment }))),
    [data.stories],
  );
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [motion, setMotion] = useState(false);
  const [held, setHeld] = useState(false);
  const [small, setSmall] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [phase, setPhase] = useState<Phase>("none");
  const stage = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardBody = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);
  const indexRef = useRef(0);
  const loaded = useRef(new Set<string>());

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!reduce.matches);
    setMotion(!reduce.matches);
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setSmall(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const at = useCallback(
    (i: number) => {
      const f = sequence[(i + sequence.length) % sequence.length]!;
      return { flat: f, story: data.stories[f.story]!, m: data.stories[f.story]!.moments[f.moment]! };
    },
    [sequence, data.stories],
  );

  const go = useCallback(
    (to: number) => {
      const next = (to + sequence.length) % sequence.length;
      if (next === indexRef.current) return;
      setPrev(indexRef.current);
      indexRef.current = next;
      setIndex(next);
      setPhase("none");
    },
    [sequence.length],
  );

  // the leaving photograph stays under the arriving one until it is covered
  useEffect(() => {
    if (prev === null) return;
    const id = setTimeout(() => setPrev(null), TRANSITION_MS + 120);
    return () => clearTimeout(id);
  }, [prev, index]);

  // preload only the next photograph (and the next card portrait), when idle
  useEffect(() => {
    const n = at(index + 1);
    const want = [small ? n.m.srcSmall : n.m.src];
    if (n.m.card && n.story.portrait) want.push(small ? n.story.portrait.srcSmall : n.story.portrait.src);
    const go2 = () =>
      want.forEach((src) => {
        if (loaded.current.has(src)) return;
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        loaded.current.add(src);
      });
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go2);
    else setTimeout(go2, 400);
  }, [index, small, at]);

  const current = at(index);
  const hasCard = current.m.card !== null;
  const duration = hasCard ? CARD_MOMENT_MS : MOMENT_MS;

  // the story advances by itself only while playing and not held
  useEffect(() => {
    if (!playing || held || sequence.length < 2) return;
    const id = setTimeout(() => go(indexRef.current + 1), duration);
    return () => clearTimeout(id);
  }, [playing, held, index, duration, sequence.length, go]);

  // the Player Card choreography on its moment
  useEffect(() => {
    if (!hasCard) {
      setPhase("none");
      return;
    }
    if (!playing) {
      setPhase("card");
      return;
    }
    const t = [
      setTimeout(() => setPhase("gather"), TRANSITION_MS + 500),
      setTimeout(() => setPhase("card"), TRANSITION_MS + 2100),
      setTimeout(() => setPhase("return"), duration - 1300),
    ];
    return () => t.forEach(clearTimeout);
  }, [index, hasCard, playing, duration]);

  const geo = useCallback((i: number) => (box ? place(at(i).m, box, small) : null), [box, small, at]);
  const g = geo(index);
  const gPrev = prev !== null ? geo(prev) : null;
  const storyChanged = prev !== null && at(prev).flat.story !== current.flat.story;
  const arrive: Arrive =
    prev === null ? null : storyChanged ? { kind: "story" } : gPrev ? { kind: "continue", ax: gPrev.ax, ay: gPrev.ay } : null;

  // card geometry: beside the person on a wide screen, over them on a phone
  const cardW = box ? (small ? Math.min(336, box.w * 0.88) : 320) : 320;
  const cardX = box ? (small ? (box.w - cardW) / 2 : box.w - cardW - 32) : 0;
  const cardCx = cardX + cardW / 2;
  // centred, but always whole: below the sample label, above the caption
  const cardCy = box ? clamp(box.h * (small ? 0.46 : 0.5), cardH / 2 + 52, Math.max(cardH / 2 + 52, box.h - cardH / 2 - 72)) : 0;

  // the card is laid out (invisible) from the start of its moment: measure it
  useLayoutEffect(() => {
    const el = cardBody.current;
    if (el && el.offsetHeight !== cardH) setCardH(el.offsetHeight);
  }, [index, cardW, small, cardH]);

  // the card grows out of the person and folds back into them
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || !g || typeof el.animate !== "function") return;
    const from = `translate(${g.ax - cardCx}px, ${g.ay - cardCy}px) scale(0.12)`;
    if (phase === "card" && motion) {
      const a = el.animate(
        [
          { transform: from, opacity: 0, filter: "blur(8px)" },
          { transform: "translate(0, 0) scale(1)", opacity: 1, filter: "blur(0)" },
        ],
        { duration: 1000, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" },
      );
      return () => a.cancel();
    }
    if (phase === "return" && motion) {
      const a = el.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1, filter: "blur(0)" },
          { transform: from, opacity: 0, filter: "blur(6px)" },
        ],
        { duration: 900, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)", fill: "both" },
      );
      return () => a.cancel();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = current.m.card;
  const showCard = card !== null && (phase === "card" || phase === "return");
  const dim = phase === "gather" || phase === "card";

  // identity fragments that gather around the person before the card forms
  const fragments = card && g && box
    ? [card.name, `${card.profession} · ${card.country}`, card.path.join(" → "), ...card.skills.slice(0, small ? 2 : 3)].map((text, k) => {
        const right = small ? k % 2 === 0 : true;
        const y = clamp(g.fy0 + (small ? 40 + Math.floor(k / 2) * 58 + (k % 2) * 24 : 20 + k * 46), 56, box.h - 120);
        const x = right ? clamp(g.fx1 + 12, 12, box.w - (small ? 132 : 250)) : null;
        const rx = right ? null : clamp(box.w - g.fx0 + 12, 12, box.w - 146);
        return { text, k, x, rx, y };
      })
    : [];

  return (
    <section
      className="relative isolate -mx-6 overflow-hidden bg-ink-900 sm:-mx-12"
      aria-roledescription="carousel"
      aria-label={current.story.name}
      data-testid="living-worker-hero"
      data-story={current.story.id}
      data-moment={current.flat.moment}
      data-phase={phase}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="relative h-[78svh] min-h-[30rem] w-full md:h-[min(86vh,56rem)]">
        {/* on a wide screen the world starts right of the words, so the person
            never stands under the headline; on a phone it is full-bleed */}
        <div ref={stage} className="absolute inset-0 overflow-hidden md:left-[18%]">
          {prev !== null ? (
            <Moment
              key={`k${prev}-${box?.w}x${box?.h}-${small}`}
              m={at(prev).m}
              g={gPrev}
              small={small}
              top={false}
              arrive={null}
              leaving
              duration={MOMENT_MS}
              motion={motion}
              running
              drift={prev % 2 === 0 ? 1 : -1}
              priority={false}
            />
          ) : null}
          {/* between two people's stories: a dip to obsidian over the last one */}
          {prev !== null && storyChanged && motion ? (
            <div key={`d${index}`} aria-hidden className="lwh-dip pointer-events-none absolute inset-0 bg-ink-900" />
          ) : null}
          <Moment
            key={`k${index}-${box?.w}x${box?.h}-${small}`}
            m={current.m}
            g={g}
            small={small}
            top
            arrive={arrive}
            leaving={false}
            duration={duration}
            motion={motion}
            running={playing}
            drift={index % 2 === 0 ? 1 : -1}
            priority={index === 0}
          />
          {/* a warm pass of light carries the change */}
          {prev !== null && motion ? (
            <div key={`s${index}`} aria-hidden className="lwh-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[rgb(255_236_205/0.16)] to-transparent mix-blend-screen" />
          ) : null}
          {/* light falls off to the words: bottom and left, never across the face */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/10 via-35% to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[28%] bg-gradient-to-r from-ink-900 via-ink-900/60 to-transparent md:block" />
          {/* the scene settles and dims while the identity forms */}
          <div
            aria-hidden
            className={cn("pointer-events-none absolute inset-0 bg-ink-900 transition-opacity duration-1000", dim ? (small ? "opacity-60" : "opacity-45") : "opacity-0")}
          />

          {/* the identity gathers around the person … */}
          {phase === "gather" || phase === "card" ? (
            <ul aria-hidden className="pointer-events-none absolute inset-0">
              {fragments.map((f) => (
                <li
                  key={f.text}
                  className={cn(
                    "absolute max-w-[15rem] rounded-full border border-ink-500/80 bg-ink-900/70 px-3 py-1 text-xs text-text-primary backdrop-blur-md transition-all duration-700 ease-in sm:text-sm",
                    small && "max-w-[8.5rem] rounded-xl text-meta leading-tight",
                    phase === "gather" ? "lwh-frag" : "opacity-0",
                  )}
                  style={{
                    left: f.x ?? undefined,
                    right: f.rx ?? undefined,
                    top: f.y,
                    animationDelay: `${f.k * 140}ms`,
                    // … and becomes the card
                    transform:
                      phase === "card" && f.x !== null
                        ? `translate(${cardCx - f.x}px, ${cardCy - f.y}px) scale(0.6)`
                        : phase === "card" && f.rx !== null && box
                          ? `translate(${cardCx - (box.w - f.rx)}px, ${cardCy - f.y}px) scale(0.6)`
                          : undefined,
                  }}
                >
                  {f.text}
                </li>
              ))}
            </ul>
          ) : null}

          {/* THE PLAYER CARD */}
          <div
            ref={cardRef}
            className={cn("absolute", showCard ? "visible" : "invisible pointer-events-none")}
            style={{ left: cardX, top: cardCy, transformOrigin: "50% 0" }}
            aria-hidden={showCard ? undefined : true}
            data-testid="living-worker-hero-card"
          >
            {card ? (
              <div ref={cardBody} className="-translate-y-1/2">
                <PlayerCard card={card} story={current.story} label={data.cardLabel} sampleLabel={data.sampleLabel} note={data.cardNote} width={cardW} compact={small} />
              </div>
            ) : null}
          </div>

          {/* THE OWNER: the people and the work they now run, around them */}
          {current.m.team && g && box ? (
            <ul className="pointer-events-none absolute inset-0" data-testid="living-worker-hero-team">
              {current.m.team.map((item, k) => (
                <li
                  key={item}
                  className="living-hero-rise absolute whitespace-nowrap rounded-md border border-ink-500/80 bg-ink-900/70 px-3 py-1.5 text-sm text-text-primary backdrop-blur-md"
                  style={{
                    animationDelay: `${TRANSITION_MS * 0.6 + k * 380}ms`,
                    ...(small
                      ? { right: 16, top: 56 + k * 44 }
                      : { left: clamp(g.fx1 + 24, 16, box.w - 240), top: clamp(g.fy0 + box.h * 0.08 + k * 52, 24, box.h - 140) }),
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>


        <span className="absolute left-4 top-4 rounded-sm border border-ink-500 bg-ink-900/60 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary backdrop-blur-sm sm:left-8 sm:top-6">
          {data.sampleLabel}
        </span>

        {/* the moment in words, and quiet controls */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pr-40 sm:px-8 sm:pb-6 md:pr-8">
          <p key={index} className="living-hero-rise max-w-[70%] text-sm text-text-primary sm:text-base" aria-live="polite" style={{ animationDelay: motion ? `${TRANSITION_MS * 0.45}ms` : undefined }}>
            {current.m.caption}
          </p>
        </div>
        {/* bottom right on a phone; top right on a wide screen, clear of the
            landing's own corner switcher */}
        <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-6 md:bottom-auto md:top-4">
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => go(indexRef.current - 1)} className="min-h-11 min-w-11 rounded-full text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" aria-label={data.controls.previous}>
              ‹
            </button>
            <button type="button" onClick={() => setPlaying((v) => !v)} className="min-h-11 rounded-full px-3 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" data-testid="living-worker-hero-toggle">
              {playing ? data.controls.pause : data.controls.play}
            </button>
            <button type="button" onClick={() => go(indexRef.current + 1)} className="min-h-11 min-w-11 rounded-full text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" aria-label={data.controls.next}>
              ›
            </button>
          </div>
        </div>
        {/* where in the working life we are: one thin line per moment of THIS story */}
        <div aria-hidden className="absolute inset-x-4 bottom-0 flex gap-1 sm:inset-x-8">
          {current.story.moments.map((_, k) => (
            <span key={k} className={cn("h-0.5 flex-1 rounded-full transition-colors duration-700", k <= current.flat.moment ? "bg-brand-blue" : "bg-ink-600")} />
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
