"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { TrackedCta } from "@/components/app/tracked-cta";
import { PANE_TIER, PaneLabel, PaneMeta, PersonRing } from "@/components/world/world";
import { cn } from "@/lib/utils";

import {
  backdropsNeeded,
  CAMERA_CONSTRUCTION,
  CAMERA_HOSPITALITY,
  CHAPTER_FIRST_SCENE,
  LAYOUT,
  LINES,
  OVERVIEW,
  restingCamera,
  SCENE_CHAPTERS,
  SCENES,
  type BackdropId,
  type Camera,
  type EntityId,
  type Place,
} from "./cinematic-script";
import { PUBLIC_IMAGERY, type PublicImageKey } from "./public-imagery";
import { StateMark } from "./state-mark";

export type CinemaWorld = "construction" | "hospitality";

export type CinemaCopy = {
  readonly title: string;
  readonly sub: string;
  readonly skip: string;
  readonly railLabel: string;
  readonly sample: string;
  readonly privacy: string;
  readonly chapters: readonly string[];
  readonly scenes: readonly { readonly title: string; readonly body: string }[];
  readonly labels: Readonly<Record<"person" | "need" | "company" | "project" | "team" | "instruction" | "work" | "hours" | "photo" | "record" | "manager" | "history" | "next", string>>;
  readonly chain: Readonly<Record<"project" | "people" | "need" | "plan", string>>;
  readonly kinds: readonly string[];
  readonly kindsNote: string;
  readonly translateTag: string;
  readonly states: Readonly<Record<"own" | "waiting" | "confirmed" | "unknown", string>>;
  readonly co: { readonly waiting: string; readonly done: string };
  readonly end: { readonly nextCta: string };
  readonly w: {
    readonly name: string;
    readonly initials: string;
    readonly role: string;
    readonly trade: string;
    readonly org: string;
    readonly orgInitials: string;
    readonly needTitle: string;
    readonly needMeta: string;
    readonly project: string;
    readonly projectMeta: string;
    readonly teamMeta: string;
    readonly managerName: string;
    readonly managerInitials: string;
    readonly managerRole: string;
    readonly msgIn: string;
    readonly instruction: string;
    readonly workTitle: string;
    readonly hours: string;
    readonly photoAlt: string;
    readonly recordMeta: string;
    readonly msgOut: string;
    readonly hNow: readonly [string, string];
    readonly hRecent: readonly [string, string];
    readonly hEarlier: readonly [string, string];
    readonly nextTitle: string;
    readonly nextMeta: string;
    readonly nextNeed: string;
    readonly plan: string;
  };
};

/** Which registered photograph each backdrop id is, per world. */
const BACKDROPS: Record<CinemaWorld, Record<string, PublicImageKey>> = {
  construction: { site: "siteLarge", van: "van", foreman: "foremanLarge", tool: "toolLarge" },
  hospitality: { kitchen: "kitchenLarge", owner: "owner", chef: "chefLarge", car: "carLarge" },
};
const PERSON_PORTRAIT: Record<CinemaWorld, PublicImageKey> = { construction: "tomasPortrait", hospitality: "rasaPortrait" };
const EVIDENCE: Record<CinemaWorld, PublicImageKey> = { construction: "site", hospitality: "kitchen" };
const MANAGER_SRC: Record<CinemaWorld, PublicImageKey> = { construction: "foremanLarge", hospitality: "chefLarge" };
const MANAGER_POS: Record<CinemaWorld, string> = { construction: "46% 26%", hospitality: "50% 24%" };

const fill = (s: string, c: CinemaCopy) =>
  s.replaceAll("{name}", c.w.name).replaceAll("{project}", c.w.project).replaceAll("{org}", c.w.org).replaceAll("{trade}", c.w.trade);

/** A place for an entity in a scene — or, hidden, the nearest place it has, so it never flies in from nowhere. */
function placeFor(id: EntityId, scene: number): { place: Place; on: boolean } {
  const table = LAYOUT[id];
  const exact = table[scene];
  if (exact) return { place: exact, on: true };
  const keys = Object.keys(table).map(Number);
  const nearest = keys.sort((a, b) => Math.abs(a - scene) - Math.abs(b - scene))[0]!;
  return { place: table[nearest]!, on: false };
}

/** True `ms` after `active` became true (resets when it goes false): the state flip the story waits to show. */
function useAfter(active: boolean, ms: number) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) {
      setDone(false);
      return;
    }
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return done;
}

function Ent({
  id,
  scene,
  wd,
  wm,
  children,
}: {
  id: EntityId;
  scene: number;
  wd?: string;
  wm?: string;
  children: ReactNode;
}) {
  const { place, on } = placeFor(id, scene);
  const style = {
    "--dx": place.d[0],
    "--dy": place.d[1],
    "--mx": place.m[0],
    "--my": place.m[1],
    "--wd": wd,
    "--wm": wm,
  } as CSSProperties;
  return (
    <div
      className={cn("cine-ent rounded-[1.5rem] px-4 py-3 lg:rounded-[1.75rem] lg:px-5 lg:py-4", PANE_TIER[place.tier ?? "context"])}
      data-ent={id}
      data-on={on}
      data-mhide={place.mHide || undefined}
      style={style}
    >
      {/* remounted when the entity enters, so its inner reveals (rise, wipe) play on arrival, not at page load */}
      <div key={on ? "on" : "off"} className="contents">
        {children}
      </div>
    </div>
  );
}

export function CinematicStory({
  copy,
  world,
  audience,
}: {
  copy: CinemaCopy;
  world: CinemaWorld;
  audience: "home" | "workers" | "companies";
}) {
  const [scene, setScene] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // transitions are off until the client has measured the viewport: no camera swoosh at hydration
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState<ReadonlySet<BackdropId>>(() => new Set());
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLLIElement | null)[]>([]);

  const camera = world === "construction" ? CAMERA_CONSTRUCTION : CAMERA_HOSPITALITY;
  const active = reduced ? OVERVIEW : scene;

  // reduced motion + breakpoint
  useEffect(() => {
    const mr = window.matchMedia("(prefers-reduced-motion: reduce)");
    const md = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setReduced(mr.matches);
      setDesktop(md.matches);
    };
    sync();
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    mr.addEventListener("change", sync);
    md.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(raf);
      mr.removeEventListener("change", sync);
      md.removeEventListener("change", sync);
    };
  }, []);

  // which scene is in the middle of the viewport (no scroll handler: IntersectionObserver)
  useEffect(() => {
    if (reduced) return;
    const els = beatRefs.current.filter((e): e is HTMLLIElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setScene(Number((e.target as HTMLElement).dataset.beat));
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reduced]);

  // continuous depth: one passive scroll listener, only while the story is on screen, writing one CSS variable
  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;
    let raf = 0;
    let onScreen = false;
    const update = () => {
      raf = 0;
      const r = root.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      stage.style.setProperty("--p", p.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        onScreen = !!e?.isIntersecting;
        if (onScreen) {
          window.addEventListener("scroll", onScroll, { passive: true });
          update();
        } else {
          window.removeEventListener("scroll", onScroll);
        }
      },
      { rootMargin: "100px 0px" },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // stage size, for the relationship lines (drawn in real pixels so dashes and strokes stay true)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      setSize((s) => (s && Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // photographs are mounted only when the story is about to need them
  useEffect(() => {
    const need = backdropsNeeded(camera, active);
    setSeen((prev) => (need.every((n) => prev.has(n)) ? prev : new Set([...prev, ...need])));
  }, [active, camera]);

  const go = useCallback(
    (chapter: number) => {
      const el = beatRefs.current[CHAPTER_FIRST_SCENE[chapter]!];
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [],
  );

  const cam = camera[active] ?? camera[0]!;
  const lit = SCENE_CHAPTERS[active] ?? [];
  const sceneCopy = copy.scenes[Math.min(active, SCENES - 1)]!;
  const portrait = PUBLIC_IMAGERY[PERSON_PORTRAIT[world]];
  const managerImg = PUBLIC_IMAGERY[MANAGER_SRC[world]];
  const evidence = PUBLIC_IMAGERY[EVIDENCE[world]];

  // scene 6 plays the review: first waiting for the manager, then confirmed
  const confirmedLate = useAfter(active === 6, 2400);
  const confirmedNow = active >= 7 || confirmedLate;
  const recordState = active <= 5 ? "own" : confirmedNow ? "confirmed" : "waiting";

  const lines = useMemo(() => {
    if (!size) return [];
    const at = (id: EntityId) => {
      const p = placeFor(id, active).place;
      const [x, y] = desktop ? p.d : p.m;
      return [(x / 100) * size.w, (y / 100) * size.h] as const;
    };
    return (LINES[active] ?? []).map((l) => {
      const [ax, ay] = at(l.from);
      const [bx, by] = at(l.to);
      const mx = (ax + bx) / 2;
      const d = desktop
        ? `M${ax} ${ay} C ${mx} ${ay} ${mx} ${by} ${bx} ${by}`
        : `M${ax} ${ay} C ${ax} ${(ay + by) / 2} ${bx} ${(ay + by) / 2} ${bx} ${by}`;
      return { key: `${active}-${l.from}-${l.to}`, d, tone: l.tone ?? "line" };
    });
  }, [active, size, desktop]);

  const w = copy.w;
  const personEnt = (
    <Ent id="person" scene={active} wd="clamp(240px,21cqw,300px)" wm="min(62cqw,250px)">
      <div className="flex items-center gap-3">
        <PersonRing src={portrait.src} name={w.name} initials={w.initials} size={desktop ? 52 : 44} objectPosition="50% 22%" zoom={1.15} focus />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight tracking-tightest text-text-primary lg:text-xl">{w.name}</p>
          <PaneMeta>{w.role}</PaneMeta>
        </div>
      </div>
      {active === 0 ? <p className="cine-rise mt-2 text-support text-text-muted">{copy.privacy}</p> : null}
    </Ent>
  );

  const orgMode = active === 1 ? "need" : active === 2 ? "company" : active === 6 ? "review" : active === 8 ? "next" : "project";
  const orgEnt = (
    <Ent id="org" scene={active} wd="clamp(250px,24cqw,340px)" wm="min(68cqw,270px)">
      <div key={orgMode} className="cine-swap">
        {orgMode === "need" ? (
          <>
            <PaneLabel>{copy.labels.need}</PaneLabel>
            <p className="mt-1 font-display text-lg font-bold leading-tight tracking-tightest text-text-primary lg:text-xl">{w.needTitle}</p>
            <PaneMeta>{w.needMeta}</PaneMeta>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-hidden>
              {copy.kinds.map((k, i) => (
                <li
                  key={k}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-basis",
                    i === 0 ? "bg-brand-blue text-text-on-brand" : "bg-white/10 text-text-secondary",
                  )}
                >
                  {k}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 hidden text-support text-text-muted lg:block">{copy.kindsNote}</p>
          </>
        ) : orgMode === "company" ? (
          <div className="flex items-center gap-3">
            <PersonRing name="" initials={w.orgInitials} size={desktop ? 44 : 38} />
            <div>
              <p className="font-display text-lg font-bold leading-tight tracking-tightest text-text-primary">{w.org}</p>
              <PaneMeta>{w.project}</PaneMeta>
            </div>
          </div>
        ) : orgMode === "next" ? (
          <>
            <PaneLabel>{w.org}</PaneLabel>
            <ol className="mt-2 grid gap-1.5">
              {(
                [
                  [copy.chain.project, w.project],
                  [copy.chain.people, w.teamMeta],
                  [copy.chain.need, w.nextNeed],
                  [copy.chain.plan, w.plan],
                ] as const
              ).map(([k, v], i) => (
                <li key={k} className="cine-rise flex items-baseline gap-2" style={{ "--i": i } as CSSProperties}>
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                  <span className="text-support text-text-secondary">
                    <span className="text-text-muted">{k}: </span>
                    {v}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <PaneLabel>{copy.labels.project}</PaneLabel>
            <p className="mt-1 font-display text-lg font-bold leading-tight tracking-tightest text-text-primary lg:text-xl">{w.project}</p>
            <PaneMeta>{w.projectMeta}</PaneMeta>
            {orgMode === "review" ? (
              <div className="mt-2">
                <StateMark
                  state={confirmedNow ? "confirmed" : "waiting"}
                  label={confirmedNow ? copy.co.done : copy.co.waiting}
                />
              </div>
            ) : active === OVERVIEW ? (
              <div className="mt-2">
                <StateMark state="confirmed" label={copy.co.done} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </Ent>
  );

  const chatEnt = (
    <Ent id="chat" scene={active} wd="clamp(260px,24cqw,350px)" wm="min(80cqw,310px)">
      <div className="grid gap-2">
        <p className="cine-rise max-w-[92%] rounded-2xl rounded-bl-md bg-white/10 px-3 py-2 text-support text-text-primary" style={{ "--i": 0 } as CSSProperties}>
          {w.msgIn}
        </p>
        <p className="cine-rise ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-brand-blue px-3 py-2 text-support font-medium text-text-on-brand" style={{ "--i": 1.6 } as CSSProperties}>
          {w.msgOut}
        </p>
        <p className="cine-rise text-basis text-text-muted" style={{ "--i": 1 } as CSSProperties}>
          {copy.translateTag}
        </p>
      </div>
    </Ent>
  );

  const teamEnt = (
    <Ent id="team" scene={active} wd="clamp(230px,20cqw,290px)" wm="min(62cqw,240px)">
      <PaneLabel>{copy.labels.team}</PaneLabel>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex -space-x-2">
          <PersonRing src={portrait.src} name="" initials={w.initials} size={40} objectPosition="50% 22%" zoom={1.15} />
          <PersonRing name="" initials="RK" size={40} />
          <PersonRing name="" initials="AJ" size={40} />
        </span>
        <PaneMeta>{w.teamMeta}</PaneMeta>
      </div>
    </Ent>
  );

  const compact = active !== 4;
  const workEnt = (
    <Ent id="work" scene={active} wd="clamp(260px,23cqw,330px)" wm="min(76cqw,300px)">
      {!compact ? (
        <ol className="grid gap-2.5">
          <li className="cine-rise" style={{ "--i": 0 } as CSSProperties}>
            <PaneLabel>{copy.labels.instruction}</PaneLabel>
            <p className="mt-0.5 text-support leading-snug text-text-primary">{w.instruction}</p>
          </li>
          <li className="cine-rise" style={{ "--i": 1 } as CSSProperties}>
            <PaneLabel>{copy.labels.work}</PaneLabel>
            <p className="mt-0.5 font-display text-lg font-bold leading-tight tracking-tightest text-text-primary">{w.workTitle}</p>
          </li>
          <li className="cine-rise flex items-center gap-4" style={{ "--i": 2 } as CSSProperties}>
            <div>
              <PaneLabel>{copy.labels.hours}</PaneLabel>
              <p className="mt-0.5 font-display text-lg font-bold leading-tight text-text-primary">{w.hours}</p>
            </div>
            <div className="cine-rise" style={{ "--i": 3 } as CSSProperties}>
              <PaneLabel>{copy.labels.photo}</PaneLabel>
              <span className="cine-wipe relative mt-1 block h-12 w-[4.5rem] overflow-hidden rounded-lg" style={{ "--i": 3 } as CSSProperties}>
                <Image src={evidence.src} alt={w.photoAlt} fill sizes="72px" className="object-cover" style={{ objectPosition: world === "construction" ? "50% 55%" : "50% 60%" }} />
              </span>
            </div>
          </li>
        </ol>
      ) : (
        <div key={recordState}>
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 block h-12 w-[4.5rem] shrink-0 overflow-hidden rounded-lg">
              <Image src={evidence.src} alt={w.photoAlt} fill sizes="72px" className="object-cover" style={{ objectPosition: world === "construction" ? "50% 55%" : "50% 60%" }} />
            </span>
            <div className="min-w-0">
              <PaneLabel>{copy.labels.record}</PaneLabel>
              <p className="font-display text-lg font-bold leading-tight tracking-tightest text-text-primary">{w.workTitle}</p>
              <PaneMeta>{w.recordMeta}</PaneMeta>
            </div>
          </div>
          <div className="mt-2">
            <StateMark state={recordState} label={copy.states[recordState]} />
          </div>
        </div>
      )}
    </Ent>
  );

  const managerEnt = (
    <Ent id="manager" scene={active} wd="clamp(220px,19cqw,270px)" wm="min(58cqw,230px)">
      <div className="flex items-center gap-3">
        <PersonRing src={managerImg.src} name={w.managerName} initials={w.managerInitials} size={desktop ? 48 : 40} objectPosition={MANAGER_POS[world]} zoom={2.6} />
        <div className="min-w-0">
          <p className="font-display text-base font-bold leading-tight tracking-tightest text-text-primary">{w.managerName}</p>
          <PaneMeta>{w.managerRole}</PaneMeta>
        </div>
      </div>
    </Ent>
  );

  const historyEnt = (
    <Ent id="history" scene={active} wd="clamp(260px,23cqw,330px)" wm="min(80cqw,310px)">
      <PaneLabel>{copy.labels.history}</PaneLabel>
      <ul className="mt-2 grid gap-2.5">
        {(
          [
            [w.hNow, "confirmed", copy.states.confirmed],
            [w.hRecent, "own", copy.states.own],
            [w.hEarlier, "unknown", copy.states.unknown],
          ] as const
        ).map(([[t, m], st, label], i) => (
          <li key={t} className="cine-rise" style={{ "--i": i * 0.8 } as CSSProperties}>
            <p className="text-support font-semibold text-text-primary">{t}</p>
            <p className="text-basis text-text-muted">{m}</p>
            <StateMark state={st} label={label} className="text-basis" />
          </li>
        ))}
      </ul>
    </Ent>
  );

  const nextEnt = (
    <Ent id="next" scene={active} wd="clamp(240px,21cqw,300px)" wm="min(66cqw,260px)">
      <PaneLabel>{copy.labels.next}</PaneLabel>
      <p className="mt-1 font-display text-lg font-bold leading-tight tracking-tightest text-text-primary">{w.nextTitle}</p>
      <PaneMeta>{w.nextMeta}</PaneMeta>
    </Ent>
  );

  return (
    <section
      ref={rootRef}
      className="cine-track scope-dark relative bg-ink-900 text-text-primary"
      aria-labelledby="cine-title"
      data-testid="cinematic-story"
      data-scene={active}
      data-world={world}
      data-audience={audience}
      data-reduced={reduced}
    >
      <div className="mx-auto max-w-container px-6 pb-8 pt-14 sm:px-12 lg:pb-10 lg:pt-20">
        <h2 id="cine-title" className="max-w-3xl font-display text-3xl font-bold leading-[1.08] tracking-tightest text-text-primary sm:text-5xl">
          {copy.title}
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">{copy.sub}</p>
        <a
          href="#cine-end"
          className="mt-4 inline-flex min-h-11 items-center text-support text-text-muted underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:hidden"
        >
          {copy.skip}
        </a>
      </div>

      <div ref={pinRef} className="cine-pin">
        <div ref={stageRef} className="cine-stage" data-scene={active} data-ready={ready || undefined} aria-hidden>
          {/* the photographic world: one layer per photograph, the camera moves over it */}
          <div className="cine-par absolute inset-0">
            {(Object.keys(BACKDROPS[world]) as BackdropId[]).map((bg) => {
              if (!seen.has(bg) && !backdropsNeeded(camera, active).includes(bg)) return null;
              const on = cam.bg === bg;
              const c: Camera = on ? cam : restingCamera(camera, bg, active);
              const v = desktop ? c : { ...c, ...(c.m ?? {}) };
              const img = PUBLIC_IMAGERY[BACKDROPS[world][bg]!];
              return (
                <div
                  key={bg}
                  className="cine-bd absolute inset-0"
                  data-on={on}
                  style={{ transform: `translate3d(${v.x}%, ${v.y}%, 0) scale(${v.s})`, transformOrigin: v.o }}
                >
                  <Image
                    src={img.src}
                    alt=""
                    width={img.width}
                    height={img.height}
                    sizes="(min-width: 1024px) 100vw, 170vw"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: `${img.focusX}% 40%` }}
                  />
                </div>
              );
            })}
          </div>
          <div aria-hidden className="cine-shade absolute inset-0" />
          <span className="absolute right-4 top-[3.9rem] z-20 rounded-full bg-ink-900/60 px-3 py-1 text-basis text-text-secondary backdrop-blur lg:right-8 lg:top-6">
            {copy.sample}
          </span>

          {size ? (
            <svg aria-hidden className="pointer-events-none absolute inset-0 z-[5]" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
              {lines.map((l) => (
                <path
                  key={l.key}
                  d={l.d}
                  fill="none"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  pathLength={l.tone === "dashed" ? undefined : 1}
                  strokeDasharray={l.tone === "dashed" ? "4 6" : 1}
                  className={cn(
                    l.tone === "dashed" ? "cine-fade" : "cine-draw",
                    l.tone === "gold" && "stroke-brand-blue",
                    l.tone === "success" && "stroke-state-success",
                    (l.tone === "line" || l.tone === "dashed") && "stroke-text-secondary/70",
                  )}
                />
              ))}
            </svg>
          ) : null}

          <div className="cine-ents absolute inset-0 z-10">
            {personEnt}
            {orgEnt}
            {chatEnt}
            {teamEnt}
            {workEnt}
            {managerEnt}
            {historyEnt}
            {nextEnt}
          </div>

          {/* the information layer: what this scene says (the same words are in the list below, for everyone) */}
          {active !== OVERVIEW ? (
            <div key={active} className="cine-cap absolute inset-x-5 bottom-5 z-20 lg:bottom-[9%] lg:left-[4.9%] lg:right-auto lg:w-[min(34rem,36%)]">
              <p className="text-support font-medium text-brand-blue">
                {lit.map((i) => copy.chapters[i]).join(" · ")}
              </p>
              <p className="mt-1.5 font-display text-[1.7rem] font-extrabold leading-[1.02] tracking-tightest text-text-primary lg:text-[clamp(2rem,3.3vw,3.3rem)]">
                {fill(sceneCopy.title, copy)}
              </p>
              <p className="mt-2 max-w-[44ch] text-base leading-snug text-text-secondary lg:text-lg">{fill(sceneCopy.body, copy)}</p>
            </div>
          ) : null}
        </div>

        {/* chapter rail: the five things the page explains; the active ones are lit; each one scrolls the story there */}
        <nav aria-label={copy.railLabel} className="cine-rail absolute inset-x-0 top-3 z-30 px-3 motion-reduce:hidden lg:left-[4.9%] lg:right-auto lg:top-6 lg:px-0">
          <ol className="flex items-stretch gap-1 lg:gap-2">
            {copy.chapters.map((c, i) => (
              <li key={c} className="min-w-0 flex-1 lg:flex-none">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={lit.includes(i) ? "step" : undefined}
                  aria-label={c}
                  className="group flex min-h-11 w-full flex-col justify-center gap-1.5 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue lg:min-w-[6.5rem] lg:px-2"
                >
                  <span
                    aria-hidden
                    className={cn("h-[3px] w-full rounded-full transition-colors duration-700", lit.includes(i) ? "bg-brand-blue" : "bg-white/25 group-hover:bg-white/45")}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "truncate text-basis transition-colors duration-700 lg:text-support",
                      "hidden lg:block",
                      lit.includes(i) ? "font-medium text-text-primary" : "text-text-muted",
                    )}
                  >
                    {c}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* The scroll length of the story AND its complete text. One entry per scene; each is a beat of
          the camera. Reduced motion: no pinning, the static composition above + this list in the open. */}
      <ol className="cine-beats">
        {copy.scenes.map((s, i) => (
          <li
            key={s.title}
            ref={(el) => {
              beatRefs.current[i] = el;
            }}
            data-beat={i}
            className="cine-beat"
          >
            <div className="sr-only motion-reduce:not-sr-only motion-reduce:mx-auto motion-reduce:max-w-container motion-reduce:px-6 motion-reduce:py-5 sm:motion-reduce:px-12">
              <h3 className="font-display text-xl font-bold tracking-tightest text-text-primary">
                <span aria-hidden className="mr-2 text-brand-blue">
                  {i + 1}
                </span>
                {fill(s.title, copy)}
              </h3>
              <p className="mt-1 max-w-2xl text-body text-text-secondary">{fill(s.body, copy)}</p>
            </div>
          </li>
        ))}
      </ol>
      <div id="cine-end" className="mx-auto max-w-container scroll-mt-8 px-6 pb-4 sm:px-12">
        {audience === "workers" ? null : (
        <TrackedCta
          href="/company-need"
          ctaId="cinema_end_next_need"
          audience="companies"
          className="inline-flex min-h-11 items-center text-support font-medium text-brand-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          {copy.end.nextCta} →
        </TrackedCta>
        )}
      </div>
    </section>
  );
}
