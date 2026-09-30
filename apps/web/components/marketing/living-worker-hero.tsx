"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { HeroCard, HeroMoment, HeroStory, LivingWorkerHeroData } from "@/lib/marketing/living-worker-hero";
import { cn } from "@/lib/utils";

/**
 * THE LIVING WORKER HERO (owner 2026-09-29; motion, reaction and the living
 * Player Card 2026-09-30). One real-looking person at the centre; their world
 * transforms around them.
 *
 * ONE CLOCK, ONE CAMERA. The whole hero is a function of a single story clock.
 * The clock runs by itself (autoplay), eases to a stop when the visitor holds
 * the person or the card, eases back when they leave, pauses while the hero is
 * off screen, and is wound — not jumped — by ‹ ›, so a manual step travels
 * through the same transition the story would.
 *
 * The camera never restarts per photograph. Each photograph knows where its
 * person's face is (located by the media script); the camera is one smooth
 * curve through every photograph's natural face position and face size, and
 * at every instant EVERY visible photograph is placed so its face lands on the
 * camera's face point. So during a change of moment the eyes stay where they
 * are and the face keeps its size; what changes is the clothes, the tool, the
 * world around them — and the world moves more than the person does.
 *
 * THE PLAYER CARD grows out of the person's own work: work signals (what they
 * did, where, the hours in their journal, their skills) gather around them,
 * become their living professional identity — who they are, what they have
 * really done, where, what they can do, how they have grown and where they can
 * go next — and fold back into the person. Its second layer (history and work
 * geography) opens by itself, on hover or focus, or on a tap. A labelled
 * sample: no score, rating, stars, percentage or "verified".
 *
 * ACCESSIBILITY. The pause control (WCAG 2.2.2) holds the clock; under
 * prefers-reduced-motion nothing moves by itself, the pointer does nothing,
 * and ‹ › change the moment instantly.
 */
const HOLD_MS = 4600;
const CARD_HOLD_MS = 11500;
const TR_MS = 2600;
/** An intermediate pose frame is held only for a breath. The pose change into
 *  it is a MOTION CUT, never a dissolve or a wipe: the frame softens as in a
 *  quick movement, warm light blooms from the face, and at the peak the
 *  photograph changes in one instant — at every moment there is ONE body on
 *  screen, and the change of pose reads as the person moving. */
const BRIDGE_HOLD_MS = 350;
const POSE_TR_MS = 820;
/** The instant of the cut, and the few hundredths either side where the two
 *  heavily softened frames meet so the change is not a pop. */
const CUT_AT = 0.5;
const CUT_BLEND = 0.02;
const SEEK_MS = 1700;
/** Card choreography, measured from the start of the card moment. */
const GATHER_AT = 500;
const CARD_AT = 2200;
const MORE_AT = 4300;
const RETURN_BEFORE = 1300;

type Box = { w: number; h: number };
type Flat = { story: number; moment: number };
type Cam = { x: number; y: number; f: number };
type Phase = "none" | "gather" | "card" | "return";
type Layer = { root: HTMLDivElement; bg: HTMLDivElement; fg: HTMLDivElement };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mod = (a: number, n: number) => ((a % n) + n) % n;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

/** The cover scale of a photograph in the stage, and its natural camera:
 *  where its face lands and how tall it is when simply framed. On a phone the
 *  person is brought to the centre of the narrow frame. */
function natural(m: HeroMoment, box: Box, small: boolean): Cam & { sc: number } {
  const sc = Math.max(box.w / m.width, box.h / m.height);
  const dw = m.width * sc;
  const dh = m.height * sc;
  const offX = clamp(small ? box.w / 2 - m.face.x * dw : (box.w - dw) / 2, box.w - dw, 0);
  const offY = (box.h - dh) / 2;
  return { sc, x: offX + m.face.x * dw, y: offY + m.face.y * dh, f: m.face.h * dh };
}

/** Place one photograph so that its face lands on the camera's face point at
 *  the camera's face size — or as close in size as keeping the stage covered
 *  allows (the position is always exact). Returns the element transform. */
function placeOn(m: HeroMoment, box: Box, cam: Cam, zoom: number, sc0: number) {
  const iw = m.width;
  const ih = m.height;
  const fx = clamp(m.face.x, 0.05, 0.95);
  const fy = clamp(m.face.y, 0.05, 0.95);
  // a little of the edge may show (the photographs are feathered there)
  const mx = 0;
  const mt = box.h * 0.07;
  const mb = box.h * 0.03;
  const sMin = Math.max(
    (box.w - 2 * mx) / iw,
    (box.h - mt - mb) / ih,
    (cam.x - mx) / (fx * iw),
    (box.w - mx - cam.x) / ((1 - fx) * iw),
    (cam.y - mt) / (fy * ih),
    (box.h - mb - cam.y) / ((1 - fy) * ih),
  );
  const s = Math.max((cam.f * zoom) / (m.face.h * ih), sMin * Math.max(1, zoom * 0.985));
  return { tx: cam.x - fx * iw * s, ty: cam.y - fy * ih * s, k: s / sc0, s };
}

/** Periodic cubic Hermite through (t_j, v_j) with Catmull-Rom tangents. */
function spline(nodes: readonly { t: number; v: Cam }[], period: number, c: number): Cam {
  const n = nodes.length;
  if (n === 1) return nodes[0]!.v;
  const at = (j: number) => {
    const w = Math.floor(j / n);
    const node = nodes[mod(j, n)]!;
    return { t: node.t + w * period, v: node.v };
  };
  let j = 0;
  for (let i = 0; i < n; i++) if (nodes[i]!.t <= c) j = i;
  if (c < nodes[0]!.t) j = -1;
  const p0 = at(j - 1);
  const p1 = at(j);
  const p2 = at(j + 1);
  const p3 = at(j + 2);
  const dt = p2.t - p1.t;
  const u = clamp((c - p1.t) / dt, 0, 1);
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  const one = (key: keyof Cam) => {
    const m1 = ((p2.v[key] - p0.v[key]) / (p2.t - p0.t)) * dt;
    const m2 = ((p3.v[key] - p1.v[key]) / (p3.t - p1.t)) * dt;
    return h00 * p1.v[key] + h10 * m1 + h01 * p2.v[key] + h11 * m2;
  };
  return { x: one("x"), y: one("y"), f: one("f") };
}

const FEATHER = "linear-gradient(to bottom, transparent, #000 3%, #000 97%, transparent)";

/** One photograph: its world, and the person on their own nearer layer. */
const Frame = memo(function Frame({
  j,
  m,
  small,
  base,
  first,
  register,
}: {
  j: number;
  m: HeroMoment;
  small: boolean;
  base: { w: number; h: number } | null;
  first: boolean;
  register: (j: number, layer: Layer | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const bg = useRef<HTMLDivElement>(null);
  const fg = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (root.current && bg.current && fg.current) register(j, { root: root.current, bg: bg.current, fg: fg.current });
    return () => register(j, null);
  }, [j, register, base]);
  const src = small ? m.srcSmall : m.src;
  const cx = ((m.figure.x0 + m.figure.x1) / 2) * 100;
  const cy = (m.figure.y0 + (m.figure.y1 - m.figure.y0) * 0.45) * 100;
  const rx = (m.figure.x1 - m.figure.x0) * 78;
  const ry = (m.figure.y1 - m.figure.y0) * 62;
  const person = `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, #000 55%, transparent 100%)`;
  const img = (hidden: boolean, mask: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={`${m.srcSmall} 960w, ${m.src} 1920w`}
      sizes="100vw"
      alt={hidden ? "" : m.alt}
      aria-hidden={hidden ? true : undefined}
      width={m.width}
      height={m.height}
      loading="eager"
      fetchPriority={first && !hidden ? "high" : "auto"}
      decoding="async"
      draggable={false}
      className={cn("block h-full w-full select-none", !base && "object-cover")}
      style={base ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    />
  );
  // before the stage is measured (server render, first paint) the first
  // photograph simply covers the stage; the camera takes over once measured
  const layerClass = base ? "absolute left-0 top-0 origin-top-left will-change-transform" : "absolute inset-0";
  const size = base ? { width: base.w, height: base.h } : undefined;
  return (
    <div ref={root} className="absolute inset-0" style={{ opacity: first ? 1 : 0 }} data-frame={j}>
      <div ref={bg} className={layerClass} style={size}>
        {img(false, FEATHER)}
      </div>
      <div ref={fg} className={cn(layerClass, !base && "hidden")} style={size}>
        {img(true, person)}
      </div>
    </div>
  );
});

/** The step of a story moment among the story's moments (bridges not counted). */
function stepOf(x: { story: HeroStory; flat: Flat }): number {
  return x.story.moments.slice(0, x.flat.moment + 1).filter((m) => !m.bridge).length - 1;
}

/** THE PLAYER CARD — the person's Living Professional Identity.
 *
 *  ONE OBJECT, TWO STATES. Closed, it is the person: their portrait fills the
 *  card, their name and profession stand on it, and one line says what their
 *  real work adds up to. Open, the portrait settles into the card's crown —
 *  the name stays — and the identity unfolds beneath it in order: real work,
 *  what the work has made them able to do, the path they are on, what they
 *  did where, and where they can go next. Nothing competes at once.
 *
 *  RECOGNISABLE WITHOUT A LOGO: the product's own identity grammar — the
 *  person first and lit, the gold provenance edge beside them (the same rule
 *  the in-product identity stage carries), the work spine of diamond nodes
 *  for the path and the history, figures with their own units. */
function PlayerCard({
  card,
  story,
  data,
  width,
  compact,
  more,
}: {
  card: HeroCard;
  story: HeroStory;
  data: LivingWorkerHeroData;
  width: number;
  compact: boolean;
  more: boolean;
}) {
  const id = card.identity;
  const s = data.cardSections;
  const crown = compact ? (more ? 134 : 278) : more ? 148 : 336;
  const label = (text: string) => <p className="font-mono text-meta uppercase tracking-label text-text-muted">{text}</p>;
  // the open layer arrives in order, never all at once
  const unfold = (i: number) => ({
    className: cn("transition-[opacity,transform] duration-500 ease-out", more ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"),
    style: { transitionDelay: more ? `${280 + i * 120}ms` : "0ms" },
  });

  const spine = (
    <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${id.progression.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[5px] h-px bg-gradient-to-r from-text-muted/70 via-ink-500 to-ink-600" />
      {id.progression.map((step, k) => {
        const now = k === id.current;
        const next = k === id.current + 1;
        return (
          <li key={step} className="relative flex min-w-0 flex-col items-center gap-1 text-center" aria-current={now ? "step" : undefined}>
            <span
              aria-hidden
              className={cn(
                "h-[11px] w-[11px] rotate-45 border",
                now ? "border-brand-blue bg-brand-blue shadow-[0_0_12px_rgb(212_175_55/0.5)]" : k < id.current ? "border-text-secondary bg-text-secondary" : "border-ink-500 bg-ink-900",
              )}
            />
            <span className={cn("text-meta leading-tight", now ? "text-text-primary" : "text-text-muted", compact && !now && !next && "sr-only")}>{step}</span>
            {now || next ? <span className={cn("font-mono text-meta uppercase tracking-label", now ? "text-brand-blue" : "text-text-muted")}>{now ? s.now : s.next}</span> : null}
          </li>
        );
      })}
    </ol>
  );

  return (
    <div
      className="relative overflow-hidden rounded-[1.375rem] border border-ink-500/60 bg-ink-900/90 shadow-[0_50px_110px_-40px_rgb(0_0_0/0.95)] backdrop-blur-xl"
      style={{ width }}
    >
      {/* the provenance edge: gold, beside the person — the product's identity mark */}
      <span aria-hidden className="absolute inset-y-8 left-0 z-10 w-[2px] bg-gradient-to-b from-transparent via-brand-blue to-transparent" />

      {/* THE PERSON — the card's crown */}
      <div className="relative overflow-hidden transition-[height] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{ height: crown }}>
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
            className="lwh-portrait absolute inset-0 h-full w-full object-cover transition-[object-position] duration-700"
            style={{ objectPosition: more ? "50% 24%" : "50% 30%" }}
          />
        ) : null}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/35 via-40% to-transparent" />
        <div aria-hidden className="lwh-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/12 to-transparent" />
        <p className="absolute inset-x-5 top-4 flex items-center justify-between font-mono text-meta uppercase tracking-label text-text-secondary">
          <span className={cn("transition-opacity duration-300", compact && more && "opacity-0")}>{data.cardLabel}</span>
          <span className="rounded-sm border border-ink-500/80 bg-ink-900/40 px-1.5 text-text-muted backdrop-blur-sm">{data.sampleLabel}</span>
        </p>
        <div className="absolute inset-x-5 bottom-4">
          <p
            className="origin-bottom-left font-display text-[2.5rem] font-bold leading-[0.95] tracking-tight text-text-primary transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ transform: more ? "scale(0.66)" : "none" }}
          >
            {card.name}
          </p>
          <p className="mt-2 font-mono text-support uppercase tracking-label text-text-primary">{card.profession}</p>
          <p className="mt-1 flex items-center gap-1.5 text-support text-text-secondary">
            <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-brand-blue" />
            {id.place}
          </p>
        </div>
      </div>

      <div className={cn("relative", compact ? (more ? "px-4 pb-3 pt-2" : "px-5 pb-4 pt-3") : more ? "px-5 pb-4 pt-2.5" : "px-5 pb-5 pt-3.5")}>
        {/* closed: what the real work adds up to, in one line */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-500 ease-out",
            more ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
          )}
          aria-hidden={more}
        >
          <div className="min-h-0 overflow-hidden">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {id.stats.map((x, i) => (
                <span key={x.unit} className="flex items-baseline gap-1.5">
                  {i > 0 ? <span aria-hidden className="mr-1.5 h-1 w-1 rotate-45 self-center bg-text-muted/70" /> : null}
                  <span className="font-display text-card-title font-semibold text-text-primary">{x.figure}</span>
                  <span className="text-meta text-text-muted">{x.unit}</span>
                </span>
              ))}
            </p>
            <p className="mt-3 flex items-center justify-between gap-3 border-t border-ink-600/70 pt-3 text-meta text-text-muted">
              <span>{data.cardNote}</span>
              <span aria-hidden className="shrink-0 font-mono uppercase tracking-label text-text-secondary">{s.more} ›</span>
            </p>
          </div>
        </div>

        {/* open: the identity unfolds beneath the person, in order */}
        <div
          className={cn("grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]", more ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
          aria-hidden={!more}
        >
          <div className={cn("min-h-0 overflow-hidden", compact && "overflow-y-auto")}>
            <div className={cn(compact ? "space-y-2" : "space-y-2.5")}>
              <div {...unfold(0)}>
                {label(s.work)}
                <dl className="mt-1.5 grid grid-cols-3 gap-3">
                  {id.stats.map((x) => (
                    <div key={x.unit} className="min-w-0">
                      <dt className="sr-only">{x.unit}</dt>
                      <dd className="flex flex-col">
                        <span className="font-display text-card-title font-semibold leading-none text-text-primary">{x.figure}</span>
                        <span className="mt-1 text-meta leading-tight text-text-muted">{x.unit}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div {...unfold(1)}>
                {label(s.capability)}
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {card.skills.map((k) => (
                    <li key={k} className="rounded-full border border-ink-500 bg-ink-800/60 px-2.5 py-0.5 text-meta text-text-secondary">
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
              <div {...unfold(2)}>
                {label(s.path)}
                <div className="mt-2">{spine}</div>
              </div>
              <div {...unfold(3)}>
                {label(s.history)}
                <ol className="relative mt-1 space-y-0.5 pl-4">
                  <span aria-hidden className="absolute bottom-1 left-[3px] top-1 w-px bg-ink-500" />
                  {id.history.map((h, k) => (
                    <li key={`${h.when}-${h.what}`} className="relative flex min-w-0 gap-3 text-support">
                      <span aria-hidden className={cn("absolute -left-4 top-[0.45rem] h-[7px] w-[7px] rotate-45", k === id.history.length - 1 ? "bg-brand-blue" : "bg-text-muted")} />
                      <span className="w-10 shrink-0 font-mono text-meta text-text-muted">{h.when}</span>
                      <span className="min-w-0 truncate text-text-secondary" title={`${h.where} · ${h.what}`}>
                        <span className="text-text-primary">{h.where}</span> · {h.what}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div {...unfold(4)}>
                {label(s.mobility)}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-support text-text-primary">
                  {card.path.map((p, k) => (
                    <span key={p} className="flex items-center gap-2">
                      {k > 0 ? <span aria-hidden className="h-px w-5 bg-text-muted/70" /> : null}
                      {p}
                    </span>
                  ))}
                  <span className="text-text-secondary">· {id.next}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LivingWorkerHero({ data, children }: { data: LivingWorkerHeroData; children: ReactNode }) {
  const sequence: Flat[] = useMemo(
    () => data.stories.flatMap((s, story) => s.moments.map((_, moment) => ({ story, moment }))),
    [data.stories],
  );
  const N = sequence.length;
  const momentOf = useCallback(
    (i: number) => {
      const f = sequence[mod(i, N)]!;
      return { flat: f, story: data.stories[f.story]!, m: data.stories[f.story]!.moments[f.moment]! };
    },
    [sequence, N, data.stories],
  );

  // the timeline: moment j occupies [S_j, S_j + D_j); its last TR_j carry the change to j + 1
  const timeline = useMemo(() => {
    const TR = sequence.map((_, j) => (momentOf(j + 1).m.bridge ? POSE_TR_MS : TR_MS));
    const D = sequence.map((_, j) => {
      const m = momentOf(j).m;
      return (m.card ? CARD_HOLD_MS : m.bridge ? BRIDGE_HOLD_MS : HOLD_MS) + TR[j]!;
    });
    const S: number[] = [];
    let acc = 0;
    for (const d of D) {
      S.push(acc);
      acc += d;
    }
    return { S, D, TR, T: acc };
  }, [sequence, momentOf]);

  /** The story moment a frame belongs to: a bridge speaks for the one before it. */
  const shownOf = useCallback(
    (i: number) => {
      let x = mod(i, N);
      for (let n = 0; n < N && momentOf(x).m.bridge; n++) x = mod(x - 1, N);
      return x;
    },
    [N, momentOf],
  );

  const [k, setK] = useState(0);
  const [cap, setCap] = useState(0);
  const [phase, setPhase] = useState<Phase>("none");
  const [more, setMore] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [motion, setMotion] = useState(false);
  const [small, setSmall] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  // the card is held by a mouse over it, a keyboard focus on it, or a tap
  // that pins it open (a tap elsewhere, or the next moment, lets it go)
  const [cardHover, setCardHover] = useState(false);
  const [cardFocus, setCardFocus] = useState(false);
  const [cardPinned, setCardPinned] = useState(false);
  const holdCard = cardHover || cardFocus || cardPinned;
  const [holdPerson, setHoldPerson] = useState(false);
  const [cardH, setCardH] = useState(0);

  const stage = useRef<HTMLDivElement>(null);
  const sweep = useRef<HTMLDivElement>(null);
  const poseLight = useRef<HTMLDivElement>(null);
  const vignette = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardBody = useRef<HTMLDivElement>(null);
  const layers = useRef(new Map<number, Layer>());
  const clock = useRef({
    c: 0,
    rate: 0,
    seek: null as null | { from: number; to: number; t0: number; dur: number },
    pt: { x: 0, y: 0 },
    pn: { x: 0, y: 0 },
    focus: 0,
    visible: true,
  });
  const flags = useRef({ playing: false, holdCard: false, holdPerson: false, motion: false });
  const camNow = useRef<Cam>({ x: 0, y: 0, f: 0 });
  const figNow = useRef({ x0: 0, y0: 0, x1: 0, y1: 0 });
  const kRef = useRef(0);
  const capRef = useRef(0);
  const phaseRef = useRef<Phase>("none");
  const moreAuto = useRef(false);

  useEffect(() => {
    flags.current = { playing, holdCard, holdPerson, motion };
  }, [playing, holdCard, holdPerson, motion]);

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
    const measure = () =>
      setBox((b) => (b && b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // the story rests while the hero is out of view
    const io = new IntersectionObserver(
      ([e]) => {
        clock.current.visible = (e?.intersectionRatio ?? 1) > 0.25;
      },
      { threshold: [0, 0.25, 0.5] },
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const register = useCallback((j: number, layer: Layer | null) => {
    if (layer) layers.current.set(j, layer);
    else layers.current.delete(j);
  }, []);

  // every photograph's natural camera, and the camera's path through them
  const cams = useMemo(() => (box ? sequence.map((_, j) => natural(momentOf(j).m, box, small)) : null), [box, small, sequence, momentOf]);
  const nodes = useMemo(
    () => (cams ? cams.map((v, j) => ({ t: timeline.S[j]! + (timeline.D[j]! - timeline.TR[j]!) / 2, v: { x: v.x, y: v.y, f: v.f } })) : null),
    [cams, timeline],
  );

  /** Where the story is at clock c. */
  const locate = useCallback(
    (c: number) => {
      let j = 0;
      for (let i = 0; i < N; i++) if (timeline.S[i]! <= c) j = i;
      const u = c - timeline.S[j]!;
      const tr = timeline.TR[j]!;
      const hold = timeline.D[j]! - tr;
      const p = u > hold ? (u - hold) / tr : 0;
      return { j, u, hold, p, next: mod(j + 1, N) };
    },
    [N, timeline],
  );

  /** Render the scene at the clock's current value. */
  const apply = useCallback(() => {
    if (!box || !cams || !nodes) return;
    const st = clock.current;
    const { j, u, hold, p, next } = locate(st.c);
    if (j !== kRef.current) {
      kRef.current = j;
      setK(j);
    }
    const capIdx = shownOf(p > 0.5 ? next : j);
    if (capIdx !== capRef.current) {
      capRef.current = capIdx;
      setCap(capIdx);
    }
    // the card choreography, from the clock
    const here = momentOf(j);
    let ph: Phase = "none";
    if (here.m.card && p === 0) {
      if (!flags.current.motion) ph = "card";
      else if (u >= hold - RETURN_BEFORE) ph = "return";
      else if (u >= CARD_AT) ph = "card";
      else if (u >= GATHER_AT) ph = "gather";
    }
    if (ph !== phaseRef.current) {
      phaseRef.current = ph;
      setPhase(ph);
    }
    // closed → open → closed, then it folds back into the person
    const autoMore = ph === "card" && flags.current.motion && u >= MORE_AT && u < hold - RETURN_BEFORE - 1600;
    if (autoMore !== moreAuto.current) {
      moreAuto.current = autoMore;
      setMore(autoMore);
    }

    // the camera
    const cam0 = spline(nodes, timeline.T, st.c);
    const cam: Cam = { ...cam0, f: cam0.f * (1 + 0.05 * st.focus) };
    camNow.current = cam;
    // a subtle orbit around the person: the world shifts a little more than
    // they do, never so much that their outline doubles at the layer edge
    const par = { x: -st.pn.x * 10, y: -st.pn.y * 6 };
    const parFg = { x: -st.pn.x * 8.5, y: -st.pn.y * 5 };
    const storyChange = momentOf(j).flat.story !== momentOf(next).flat.story;
    const poseChange = momentOf(next).m.bridge;
    const e = easeSine(clamp(p, 0, 1));

    const put = (i: number, zoomBg: number, zoomFg: number) => {
      const layer = layers.current.get(i);
      if (!layer) return null;
      const m = momentOf(i).m;
      const sc0 = cams[i]!.sc;
      const b = placeOn(m, box, cam, zoomBg, sc0);
      const f = placeOn(m, box, cam, zoomFg, sc0);
      layer.bg.style.transform = `translate3d(${b.tx + par.x}px, ${b.ty + par.y}px, 0) scale(${b.k})`;
      layer.fg.style.transform = `translate3d(${f.tx + parFg.x}px, ${f.ty + parFg.y}px, 0) scale(${f.k})`;
      return { layer, f, m };
    };

    for (const [i, layer] of layers.current) {
      if (i !== j && !(i === next && p > 0)) layer.root.style.opacity = "0";
      if (!(poseChange && p > 0 && (i === j || i === next))) layer.root.style.filter = "";
    }
    // a pose change happens in one place: neither photograph moves, so the
    // scene stays continuous across the seam
    const cur = poseChange ? put(j, 1, 1) : put(j, 1 + 0.03 * e, 1 + 0.022 * e);
    if (cur) {
      cur.layer.root.style.opacity = storyChange ? String(1 - smooth(0, 0.45, p)) : "1";
      cur.layer.root.style.maskImage = "";
      cur.layer.root.style.webkitMaskImage = "";
      const fw = cur.m.width * cur.f.s;
      const fh = cur.m.height * cur.f.s;
      figNow.current = {
        x0: cur.f.tx + cur.m.figure.x0 * fw,
        y0: cur.f.ty + cur.m.figure.y0 * fh,
        x1: cur.f.tx + cur.m.figure.x1 * fw,
        y1: cur.f.ty + cur.m.figure.y1 * fh,
      };
    }
    if (p > 0) {
      const nx = poseChange ? put(next, 1, 1) : put(next, 1 + 0.05 * (1 - e), 1 + 0.04 * (1 - e));
      if (nx) {
        if (poseChange) {
          // the same place, the next pose: one body at a time
          const blur = `blur(${(6 * Math.sin(Math.PI * clamp(p, 0, 1))).toFixed(2)}px)`;
          const inNext = smooth(CUT_AT - CUT_BLEND, CUT_AT + CUT_BLEND, p);
          nx.layer.root.style.opacity = String(inNext);
          nx.layer.root.style.maskImage = "";
          nx.layer.root.style.webkitMaskImage = "";
          nx.layer.root.style.filter = blur;
          if (cur) {
            cur.layer.root.style.opacity = String(1 - inNext);
            cur.layer.root.style.filter = blur;
          }
        } else if (storyChange) {
          nx.layer.root.style.opacity = String(smooth(0.55, 1, p));
          nx.layer.root.style.maskImage = "";
          nx.layer.root.style.webkitMaskImage = "";
        } else {
          // the next moment grows out of the person: the face first, then their world
          const r = -35 + 215 * e;
          const mask = `radial-gradient(circle at ${cam.x}px ${cam.y}px, #000 ${r}%, transparent ${r + 38}%)`;
          nx.layer.root.style.opacity = "1";
          nx.layer.root.style.maskImage = mask;
          nx.layer.root.style.webkitMaskImage = mask;
        }
      }
    }
    if (poseLight.current) {
      // the band of light that carries the seam
      const edge = -8 + 116 * e;
      const on = p > 0 && poseChange;
      void edge;
      poseLight.current.style.opacity = on ? String(Math.sin(Math.PI * clamp(p, 0, 1))) : "0";
      poseLight.current.style.background = `radial-gradient(circle at ${cam.x}px ${cam.y}px, rgb(255 236 205 / 0.3), transparent 62%)`;
    }
    if (sweep.current) {
      const on = p > 0 && !storyChange && !poseChange;
      sweep.current.style.opacity = on ? String(Math.sin(Math.PI * e) * 0.9) : "0";
      sweep.current.style.transform = `translate3d(${-60 + 280 * e}%, 0, 0) skewX(-14deg)`;
    }
    if (vignette.current) {
      vignette.current.style.opacity = String(0.55 * st.focus);
      vignette.current.style.background = `radial-gradient(ellipse 34% 60% at ${cam.x}px ${cam.y + cam.f * 2.2}px, transparent 45%, rgb(var(--c-ink-900) / 0.85) 100%)`;
    }
  }, [box, cams, nodes, locate, momentOf, shownOf, timeline.T]);

  // the clock
  useEffect(() => {
    if (!box || !cams) return;
    if (!motion) {
      apply();
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const st = clock.current;
      const dt = Math.min(64, now - last);
      last = now;
      const f = flags.current;
      const want = f.playing && !f.holdCard && !f.holdPerson && st.visible ? 1 : 0;
      st.rate += (want - st.rate) * Math.min(1, dt / 450);
      if (st.seek) {
        const q = clamp((now - st.seek.t0) / st.seek.dur, 0, 1);
        st.c = mod(st.seek.from + (st.seek.to - st.seek.from) * easeInOut(q), timeline.T);
        if (q >= 1) st.seek = null;
      } else {
        st.c = mod(st.c + dt * st.rate, timeline.T);
      }
      st.pn.x += (st.pt.x - st.pn.x) * Math.min(1, dt / 320);
      st.pn.y += (st.pt.y - st.pn.y) * Math.min(1, dt / 320);
      st.focus += ((f.holdPerson ? 1 : 0) - st.focus) * Math.min(1, dt / 420);
      apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [box, cams, motion, apply, timeline.T]);

  // development only: scrub the clock for visual review (never in production)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as Window & { __lwh?: unknown };
    w.__lwh = {
      T: timeline.T,
      TR: timeline.TR,
      S: timeline.S,
      set: (c: number) => {
        clock.current.seek = null;
        clock.current.c = mod(c, timeline.T);
        apply();
      },
      clock: () => clock.current.c,
      /** where the person's face is on the page right now */
      face: () => {
        const r = stage.current?.getBoundingClientRect();
        return r ? { x: r.left + camNow.current.x, y: r.top + camNow.current.y } : null;
      },
    };
    return () => {
      delete w.__lwh;
    };
  }, [apply, timeline]);

  /** ‹ › wind the clock through the change, never jump (reduced motion: instant). */
  const go = useCallback(
    (dir: 1 | -1) => {
      const st = clock.current;
      let target = mod(capRef.current + dir, N);
      for (let n = 0; n < N && momentOf(target).m.bridge; n++) target = mod(target + dir, N);
      let to = timeline.S[target]! + 250;
      const from = st.c;
      if (dir === 1 && to <= from) to += timeline.T;
      if (dir === -1 && to >= from) to -= timeline.T;
      if (!flags.current.motion) {
        st.c = mod(to, timeline.T);
        apply();
        return;
      }
      st.seek = { from, to, t0: performance.now(), dur: SEEK_MS };
    },
    [N, timeline, apply, momentOf],
  );

  const cur = momentOf(k);
  const capM = momentOf(cap);
  const card = cur.m.card;
  const cardW = box ? (small ? Math.min(360, box.w - 24) : 400) : 400;
  const cardX = box ? (small ? (box.w - cardW) / 2 : box.w - cardW - 28) : 0;
  // on a phone the card carries the sample label itself, so while it stands the
  // hero's own label steps aside and the whole card fits above the controls
  const cardShown = card !== null && (phase === "card" || phase === "return");
  const cardTop = small ? (cardShown ? 12 : 52) : 64;
  const cardBottom = small ? 72 : 100;
  const cardCy = box ? Math.max(cardH / 2 + cardTop, Math.min(box.h * (small ? 0.47 : 0.5), box.h - cardH / 2 - cardBottom)) : 0;
  const open = more || holdCard;

  useEffect(() => {
    setCardPinned(false);
  }, [k]);

  // the card is laid out (invisible) from the start of its moment: measure it
  // (its second layer unfolds, so its height is followed, not read once)
  useLayoutEffect(() => {
    const el = cardBody.current;
    if (!el) return;
    setCardH(el.offsetHeight);
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [k, cardW, small]);

  // the card grows out of the person and folds back into them
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || typeof el.animate !== "function" || !motion) return;
    const face = camNow.current;
    const from = `translate(${face.x - (cardX + cardW / 2)}px, ${face.y - cardCy}px) scale(0.1)`;
    if (phase === "card") {
      const a = el.animate(
        [
          { transform: from, opacity: 0, filter: "blur(10px)" },
          { transform: "translate(0, 0) scale(1)", opacity: 1, filter: "blur(0)" },
        ],
        { duration: 1100, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" },
      );
      return () => a.cancel();
    }
    if (phase === "return") {
      const a = el.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1, filter: "blur(0)" },
          { transform: from, opacity: 0, filter: "blur(8px)" },
        ],
        { duration: 1000, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)", fill: "both" },
      );
      return () => a.cancel();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const showCard = card !== null && (phase === "card" || phase === "return");
  const dim = phase === "gather" || phase === "card";

  // the person's work signals gather around them before they become the card
  const signals = useMemo(() => {
    if (!card) return [];
    const id = card.identity;
    const journal = id.stats[id.stats.length - 1];
    return [...id.history.map((h) => `${h.where} · ${h.what}`), ...(journal ? [`${journal.figure} ${journal.unit}`] : []), ...card.skills.slice(0, 2)];
  }, [card]);
  const fig = figNow.current;
  const cardCx = cardX + cardW / 2;
  const frags = box
    ? signals.map((text, i) => {
        const right = small ? i % 2 === 0 : true;
        const y = clamp(fig.y0 + (small ? 30 + Math.floor(i / 2) * 54 + (i % 2) * 24 : 10 + i * 44), 56, box.h - 120);
        const x = right ? clamp(fig.x1 + 14, 12, box.w - (small ? 150 : 300)) : clamp(fig.x0 - 14 - 140, 8, box.w - 150);
        return { text, i, x, y };
      })
    : [];

  // pointer: a subtle orbit around the person; holding the person or the card holds the story
  const onPointerMove = (e: React.PointerEvent) => {
    // a finger does not hover: touch neither orbits nor holds the person
    if (!motion || !stage.current || e.pointerType === "touch") return;
    const r = stage.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    clock.current.pt = { x: clamp((x / r.width) * 2 - 1, -1, 1), y: clamp((y / r.height) * 2 - 1, -1, 1) };
    const f = figNow.current;
    // over a control (‹ ›, pause, the doors) the visitor is using the page,
    // not looking at the person
    const onControl = (e.target as Element | null)?.closest?.("button, a") !== null;
    const inStage = !onControl && x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    const onPerson = inStage && x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1 && phaseRef.current === "none";
    if (onPerson !== flags.current.holdPerson) setHoldPerson(onPerson);
  };
  const onPointerLeave = () => {
    clock.current.pt = { x: 0, y: 0 };
    setHoldPerson(false);
    setCardHover(false);
  };

  return (
    <section
      className="relative isolate -mx-6 overflow-hidden bg-ink-900 sm:-mx-12"
      aria-roledescription="carousel"
      aria-label={capM.story.name}
      data-testid="living-worker-hero"
      data-story={capM.story.id}
      data-moment={stepOf(capM)}
      data-phase={phase}
      data-held={holdCard || holdPerson ? "true" : undefined}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={(e) => {
        if (cardPinned && !cardRef.current?.contains(e.target as Node)) setCardPinned(false);
      }}
    >
      <div className="relative h-[78svh] min-h-[30rem] w-full md:h-[min(86vh,56rem)]">
        {/* on a wide screen the world starts right of the words, so the person
            never stands under the headline; on a phone it is full-bleed */}
        <div ref={stage} className="absolute inset-0 overflow-hidden md:left-[18%]">
          {/* the current photograph and the next two (› may skip a bridge) */}
          {[k, mod(k + 1, N), mod(k + 2, N)].map((i) => {
            const c0 = cams?.[i];
            const m = momentOf(i).m;
            return (
              <Frame
                key={`f${i}-${box?.w}x${box?.h}-${small}`}
                j={i}
                m={m}
                small={small}
                base={c0 ? { w: m.width * c0.sc, h: m.height * c0.sc } : null}
                first={i === k}
                register={register}
              />
            );
          })}
          {/* a warm pass of light carries each change (driven by the clock) */}
          <div
            ref={sweep}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[rgb(255_236_205/0.14)] to-transparent opacity-0 mix-blend-screen"
          />
          <div ref={poseLight} aria-hidden className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen" />
          {/* light falls off to the words: bottom and left, never across the face */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/10 via-35% to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[28%] bg-gradient-to-r from-ink-900 via-ink-900/60 to-transparent md:block" />
          {/* holding the person: the world quietly steps back */}
          <div ref={vignette} aria-hidden className="pointer-events-none absolute inset-0 opacity-0" />
          {/* the scene settles and dims while the identity forms */}
          <div aria-hidden className={cn("pointer-events-none absolute inset-0 bg-ink-900 transition-opacity duration-1000", dim ? (small ? "opacity-60" : "opacity-45") : "opacity-0")} />

          {/* the person's work signals … */}
          {phase === "gather" || phase === "card" ? (
            <ul aria-hidden className="pointer-events-none absolute inset-0">
              {frags.map((f) => (
                <li
                  key={f.text}
                  className={cn(
                    "absolute max-w-[18rem] rounded-full border border-ink-500/80 bg-ink-900/75 px-3 py-1 text-meta text-text-primary backdrop-blur-md transition-all duration-700 ease-in sm:text-support",
                    small && "max-w-[9rem] rounded-xl leading-tight",
                    phase === "gather" ? "lwh-frag" : "opacity-0",
                  )}
                  style={{
                    left: f.x,
                    top: f.y,
                    animationDelay: `${f.i * 150}ms`,
                    // … become the card
                    transform: phase === "card" ? `translate(${cardCx - f.x - 60}px, ${cardCy - f.y}px) scale(0.55)` : undefined,
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
            className={cn("absolute", showCard ? "visible" : "pointer-events-none invisible")}
            style={{ left: cardX, top: cardCy, transformOrigin: "50% 0" }}
            aria-hidden={showCard ? undefined : true}
            data-testid="living-worker-hero-card"
            data-open={open ? "true" : undefined}
            onPointerEnter={(e) => showCard && e.pointerType !== "touch" && setCardHover(true)}
            onPointerLeave={() => setCardHover(false)}
            onFocus={(e) => setCardFocus(e.target.matches(":focus-visible"))}
            onBlur={() => setCardFocus(false)}
          >
            {card ? (
              <div ref={cardBody} className="-translate-y-1/2">
                <button
                  type="button"
                  className="block cursor-default rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  aria-expanded={open}
                  aria-label={`${card.name} · ${data.cardSections.more}`}
                  tabIndex={showCard ? 0 : -1}
                  onClick={() => setCardPinned((v) => !v)}
                >
                  <PlayerCard card={card} story={cur.story} data={data} width={cardW} compact={small} more={open} />
                </button>
              </div>
            ) : null}
          </div>

          {/* THE OWNER: the people and the work they now run, around them */}
          {capM.m.team && box && cap === k ? (
            <ul className="pointer-events-none absolute inset-0" data-testid="living-worker-hero-team">
              {capM.m.team.map((item, i) => (
                <li
                  key={item}
                  className="living-hero-rise absolute whitespace-nowrap rounded-md border border-ink-500/80 bg-ink-900/70 px-3 py-1.5 text-support text-text-primary backdrop-blur-md"
                  style={{
                    animationDelay: `${300 + i * 380}ms`,
                    ...(small
                      ? { right: 16, top: 56 + i * 44 }
                      : { left: clamp(fig.x1 + 24, 16, box.w - 240), top: clamp(fig.y0 + box.h * 0.08 + i * 52, 24, box.h - 140) }),
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <span className={cn("absolute left-4 top-4 rounded-sm border border-ink-500 bg-ink-900/60 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary backdrop-blur-sm transition-opacity duration-500 sm:left-8 sm:top-6", small && cardShown && "opacity-0")}>
          {data.sampleLabel}
        </span>

        {/* the moment in words */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4 pr-40 sm:px-8 sm:pb-6 md:pr-8">
          <p key={cap} className="living-hero-rise max-w-[70%] text-sm text-text-primary sm:text-base" aria-live="polite">
            {capM.m.caption}
          </p>
        </div>
        {/* quiet controls: bottom right on a phone; top right on a wide screen,
            clear of the landing's own corner switcher */}
        <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-6 md:bottom-auto md:top-4">
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => go(-1)} className="min-h-11 min-w-11 rounded-full text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" aria-label={data.controls.previous}>
              ‹
            </button>
            <button type="button" onClick={() => setPlaying((v) => !v)} className="min-h-11 rounded-full px-3 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" data-testid="living-worker-hero-toggle">
              {playing ? data.controls.pause : data.controls.play}
            </button>
            <button type="button" onClick={() => go(1)} className="min-h-11 min-w-11 rounded-full text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue" aria-label={data.controls.next}>
              ›
            </button>
          </div>
        </div>
        {/* where in the working life we are: one thin line per moment of THIS story */}
        <div aria-hidden className="absolute inset-x-4 bottom-0 flex gap-1 sm:inset-x-8">
          {capM.story.moments
            .filter((x) => !x.bridge)
            .map((_, i) => (
              <span key={i} className={cn("h-0.5 flex-1 rounded-full transition-colors duration-700", i <= stepOf(capM) ? "bg-brand-blue" : "bg-ink-600")} />
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
