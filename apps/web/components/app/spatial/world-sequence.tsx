"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import {
  DURATION_S,
  EVENTS,
  FRAMES,
  FRAME_ASPECT,
  LANES,
  MAX_LANE_HOURS,
  PERSPECTIVE,
  STATES,
  camAt,
  focusLane,
  frameOpacity,
  laneHoursAt,
  lerp,
  needAlpha,
  needOffset,
  project,
  ramp,
  smooth,
  stateAt,
  type Cam,
  type StateName,
} from "@/lib/spatial/sequence";

import { TELEMETRY, telAlpha } from "./telemetry";

/**
 * THE WORLD — the product as a place the camera moves through.
 *
 *   PERSON → WORK → EVIDENCE → CAPABILITY → NEED → MATCH → PROJECT → NEW EVIDENCE
 *
 * One continuous shot. The photographs are real working moments laid out as a
 * corridor in depth (a person's working life); the camera ENTERS a photograph,
 * watches the system understand the work, sees evidence cut out of the scene
 * and stood on a lane, flies through the history, PULLS BACK to see the whole
 * record, watches a market need appear as a second corridor, bridges form from
 * the capabilities that answer it, the two worlds CONVERGE into one, and the
 * camera ARRIVES inside the shared project — where the work creates the
 * evidence the need was missing.
 *
 * Rendering: CSS 3D for the photographic planes (GPU, perspective-correct);
 * a canvas for vector effects (lanes, bridges, tracking); DOM text for the
 * telemetry, positioned by projecting each anchor with the same math the CSS
 * uses (lib/spatial/sequence.ts `project`). Everything is a pure function of
 * the progress p.
 */

const IVORY = "245,241,232";
const GOLD = "212,175,55";
const GREEN = "52,211,153";

const STATE_MID: Record<StateName, number> = {
  person: 0.03,
  work: 0.17,
  evidence: 0.27,
  capability: 0.55,
  need: 0.66,
  match: 0.77,
  project: 0.91,
};

const STATE_LABEL: Record<StateName, string> = {
  person: "Person",
  work: "Work",
  evidence: "Evidence",
  capability: "Capability",
  need: "Need",
  match: "Match",
  project: "Project",
};

const TILES = {
  1: { frame: "F1", u0: 0.4, v0: 0.66, u1: 0.76, v1: 0.87 },
  2: { frame: "P1", u0: 0.36, v0: 0.3, u1: 0.7, v1: 0.62 },
} as const;

const BEAMS = [
  { lane: 0, laneS: 4400, frame: "N2", u: 0.42, v: 0.5, matched: true, from: 0.64 },
  { lane: 1, laneS: 4400, frame: "N1", u: 0.22, v: 0.7, matched: true, from: 0.66 },
  { lane: 2, laneS: 4400, frame: "N1", u: 0.72, v: 0.34, matched: true, from: 0.68 },
  { lane: 3, laneS: 4400, frame: "N2", u: 0.6, v: 0.22, matched: false, from: 0.7 },
] as const;

type Geo = {
  W: number;
  H: number;
  fw: number;
  fh: number;
  floorY: number;
  laneX: number[];
  size: Record<string, { w: number; h: number }>;
};

export function WorldSequence({
  fixedP,
  autoplay = true,
}: {
  /** Freeze the sequence at this progress (for review frames). */
  readonly fixedP?: number;
  readonly autoplay?: boolean;
}) {
  const reduce = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameEls = useRef<Record<string, HTMLDivElement | null>>({});
  const tileEls = useRef<Record<number, HTMLDivElement | null>>({});
  const telEls = useRef<Record<string, HTMLDivElement | null>>({});
  const ribbonEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrubRef = useRef<HTMLInputElement>(null);
  const pRef = useRef(fixedP ?? 0);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [state, setState] = useState<StateName>("person");

  const setP = useCallback((p: number) => {
    pRef.current = Math.min(1, Math.max(0, p));
  }, []);

  useEffect(() => {
    const go = autoplay && fixedP === undefined && !reduce;
    playingRef.current = go;
    setPlaying(go);
  }, [autoplay, fixedP, reduce]);

  useEffect(() => {
    const stage = stageRef.current!;
    const world = worldRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const geo: Geo = { W: 0, H: 0, fw: 0, fh: 0, floorY: 0, laneX: [], size: {} };
    const telCache: Record<string, string> = {};
    let raf = 0;
    let last = performance.now();
    let dpr = 1;
    let lastState: StateName = "person";

    const layout = () => {
      const r = stage.getBoundingClientRect();
      geo.W = r.width;
      geo.H = r.height;
      const cover = Math.max(geo.W, geo.H * FRAME_ASPECT);
      geo.fw = cover;
      geo.fh = cover / FRAME_ASPECT;
      geo.floorY = geo.fh * 0.5 + cover * 0.05;
      geo.laneX = [0, 1, 2, 3].map((i) => (i - 1.5) * cover * 0.15);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(geo.W * dpr);
      canvas.height = Math.round(geo.H * dpr);
      canvas.style.width = `${geo.W}px`;
      canvas.style.height = `${geo.H}px`;

      for (const f of FRAMES) {
        const el = frameEls.current[f.id];
        if (!el) continue;
        const w = Math.max(geo.W, geo.H * f.aspect);
        const h = w / f.aspect;
        geo.size[f.id] = { w, h };
        const c = f.crop ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
        const fullW = w / (c.x1 - c.x0);
        const fullH = h / (c.y1 - c.y0);
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.left = `${-w / 2}px`;
        el.style.top = `${-h / 2}px`;
        el.style.backgroundSize = `${fullW}px ${fullH}px`;
        el.style.backgroundPosition = `${-c.x0 * fullW}px ${-c.y0 * fullH}px`;
      }
      for (const k of [1, 2] as const) {
        const t = TILES[k];
        const el = tileEls.current[k];
        const fz = geo.size[t.frame];
        const def = FRAMES.find((f) => f.id === t.frame)!;
        if (!el || !fz) continue;
        const rw = (t.u1 - t.u0) * fz.w;
        const rh = (t.v1 - t.v0) * fz.h;
        const c = def.crop ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
        const fullW = fz.w / (c.x1 - c.x0);
        const fullH = fz.h / (c.y1 - c.y0);
        el.style.width = `${rw}px`;
        el.style.height = `${rh}px`;
        el.style.left = `${-rw / 2}px`;
        el.style.top = `${-rh / 2}px`;
        el.style.backgroundSize = `${fullW}px ${fullH}px`;
        el.style.backgroundPosition = `${-c.x0 * fullW - t.u0 * fz.w}px ${-c.y0 * fullH - t.v0 * fz.h}px`;
      }
    };

    const ro = new ResizeObserver(layout);
    ro.observe(stage);
    layout();

    // ── geometry helpers ──
    const frameCenter = (id: string, p: number) => {
      const def = FRAMES.find((f) => f.id === id)!;
      return { x: def.kind === "need" ? needOffset(p) : 0, y: 0, z: -def.s };
    };
    const framePoint = (id: string, u: number, v: number, p: number) => {
      const def = FRAMES.find((f) => f.id === id)!;
      const sz = geo.size[id]!;
      const c = frameCenter(id, p);
      return { x: c.x + (u - 0.5) * sz.w, y: c.y + (v - 0.5) * sz.h, z: c.z, def };
    };
    const tileState = (k: 1 | 2, p: number) => {
      const t = TILES[k];
      const sz = geo.size[t.frame]!;
      const base = frameCenter(t.frame, p);
      const cx = base.x + ((t.u0 + t.u1) / 2 - 0.5) * sz.w;
      const cy = base.y + ((t.v0 + t.v1) / 2 - 0.5) * sz.h;
      const lf = k === 1 ? EVENTS.liftFrom : EVENTS.newLiftFrom;
      const lt = k === 1 ? EVENTS.liftTo : EVENTS.newLiftTo;
      const dt = k === 1 ? EVENTS.dockTo : EVENTS.newDockTo;
      const lift = ramp(p, lf, lt);
      const dock = ramp(p, lt, dt);
      const laneIdx = k === 1 ? 0 : 3;
      const tx = geo.laneX[laneIdx]!;
      const ty = geo.floorY - 120;
      const tz = k === 1 ? -(1100 - 380) : -(4400 - 260);
      const x = lerp(cx, tx, dock);
      const y = lerp(cy, ty, dock);
      const z = lerp(base.z + 3 + 250 * lift, tz, dock);
      const sc = lerp(1 + 0.05 * lift, 0.5, dock);
      return { x, y, z, sc, lift, dock, visible: p >= lf - 0.001 };
    };

    const draw = (time: number) => {
      const p = pRef.current;
      const base = camAt(p);
      const calm = reduce ? 0 : 1;
      const dwell = 1 - smooth(base.r / 900);
      const cam: Cam = {
        ...base,
        fx: base.fx + Math.sin(time * 0.0006) * 7 * calm * dwell,
        fy: base.fy + Math.sin(time * 0.00045) * 5 * calm * dwell,
        yaw: base.yaw + Math.sin(time * 0.0003) * 0.22 * calm * dwell,
      };
      world.style.transform = `translateZ(${-cam.r}px) rotateX(${cam.pitch}deg) rotateY(${cam.yaw}deg) translate3d(${-cam.fx}px, ${-cam.fy}px, ${cam.t}px)`;

      // frames
      for (const f of FRAMES) {
        const el = frameEls.current[f.id];
        if (!el) continue;
        const ghost = f.id === "P1" ? 1 : 1 - 0.97 * ramp(p, 0.79, 0.84) * (1 - ramp(p, 0.972, 1.0));
        const o = frameOpacity(f, cam, p) * ghost;
        el.style.opacity = String(o);
        el.style.visibility = o < 0.01 ? "hidden" : "visible";
        const x = f.kind === "need" ? needOffset(p) : 0;
        el.style.transform = `translate3d(${x}px,0,${-f.s}px)`;
      }
      // evidence objects
      for (const k of [1, 2] as const) {
        const el = tileEls.current[k];
        if (!el) continue;
        const ts = tileState(k, p);
        el.style.visibility = ts.visible ? "visible" : "hidden";
        el.style.transform = `translate3d(${ts.x}px,${ts.y}px,${ts.z}px) scale(${ts.sc}) rotateY(${-10 * ts.dock}deg)`;
        const confirmed = k === 1 && p >= EVENTS.confirmAt;
        const flash = k === 1 && p >= EVENTS.confirmAt && p < EVENTS.confirmAt + 0.04;
        el.style.boxShadow = confirmed
          ? `0 0 0 ${flash ? 4 : 2}px rgba(${flash ? GREEN : IVORY},${flash ? 0.95 : 0.7}), 0 0 ${flash ? 60 : 24}px rgba(${flash ? GREEN : GOLD},${flash ? 0.7 : 0.25})`
          : `0 0 0 2px rgba(${IVORY},0.75), 0 0 28px rgba(${GOLD},${0.25 + 0.4 * ts.lift})`;
      }

      // canvas
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, geo.W, geo.H);
      const P = (x: number, y: number, z: number) => project(cam, geo.W, geo.H, x, y, z);

      // lanes: visible only where the frames do not cover the floor
      const personS = FRAMES.filter((f) => f.kind === "person").map((f) => f.s);
      const dmin = Math.min(...personS.map((s) => Math.abs(cam.t - s)));
      const between = smooth((dmin - 460) / 460);
      const exposure = Math.max(smooth(cam.r / 1000), between) * (1 - ramp(p, 0.8, 0.86)) * (1 - ramp(p, 0.99, 1.0) * 0);
      if (exposure > 0.02) {
        const lit = cam.r > 900 ? 7100 : cam.t + 1100;
        const fl = focusLane(p);
        LANES.forEach((lane, i) => {
          const x = geo.laneX[i]!;
          const focus = fl === i;
          let prev: { a: ReturnType<typeof P>; b: ReturnType<typeof P> } | null = null;
          for (let s = -300; s <= 7000; s += 100) {
            const h = laneHoursAt(lane, s);
            const w = h > 0 ? 7 + (h / MAX_LANE_HOURS) * 40 : 2;
            const a = P(x - w / 2, geo.floorY, -s);
            const b = P(x + w / 2, geo.floorY, -s);
            if (prev && prev.a.visible && a.visible && prev.b.visible && b.visible) {
              const isLit = s <= lit;
              const alpha = (isLit ? (h > 0 ? 0.88 : 0.35) : 0.12) * exposure;
              ctx.beginPath();
              ctx.moveTo(prev.a.x, prev.a.y);
              ctx.lineTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.lineTo(prev.b.x, prev.b.y);
              ctx.closePath();
              ctx.fillStyle = focus && isLit && h > 0 ? `rgba(${GOLD},${Math.min(1, 1.1 * exposure)})` : `rgba(${IVORY},${alpha})`;
              ctx.fill();
            }
            prev = { a, b };
          }
        });
      }

      // tracking brackets on the work (the system sees it)
      if (p > EVENTS.trackFrom - 0.01 && p < EVENTS.liftFrom + 0.004) {
        const t = TILES[1];
        const a = framePoint("F1", t.u0, t.v0, p);
        const b = framePoint("F1", t.u1, t.v0, p);
        const c = framePoint("F1", t.u1, t.v1, p);
        const d = framePoint("F1", t.u0, t.v1, p);
        const pa = P(a.x, a.y, a.z);
        const pb = P(b.x, b.y, b.z);
        const pc = P(c.x, c.y, c.z);
        const pd = P(d.x, d.y, d.z);
        if (pa.visible && pc.visible) {
          const appear = ramp(p, EVENTS.trackFrom - 0.008, EVENTS.trackFrom + 0.01);
          const locked = p >= EVENTS.trackTo;
          const flash = locked ? 1 - ramp(p, EVENTS.trackTo, EVENTS.trackTo + 0.012) : 0;
          const grow = 1 + (1 - appear) * 0.35;
          const cxm = (pa.x + pc.x) / 2;
          const cym = (pa.y + pc.y) / 2;
          const sc = (q: { x: number; y: number }) => ({ x: cxm + (q.x - cxm) * grow, y: cym + (q.y - cym) * grow });
          const A = sc(pa), B = sc(pb), C = sc(pc), D = sc(pd);
          const len = 0.16;
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = locked ? `rgba(${GOLD},${0.95 * (1 - ramp(p, EVENTS.liftFrom, EVENTS.liftFrom + 0.004))})` : `rgba(${IVORY},${0.9 * appear})`;
          const corner = (P0: { x: number; y: number }, P1: { x: number; y: number }, P2: { x: number; y: number }) => {
            ctx.beginPath();
            ctx.moveTo(P0.x + (P1.x - P0.x) * len, P0.y + (P1.y - P0.y) * len);
            ctx.lineTo(P0.x, P0.y);
            ctx.lineTo(P0.x + (P2.x - P0.x) * len * 1.6, P0.y + (P2.y - P0.y) * len * 1.6);
            ctx.stroke();
          };
          corner(A, B, D);
          corner(B, A, C);
          corner(C, D, B);
          corner(D, C, A);
          if (!locked) {
            // the scan line: the system reading the work
            const prog = ramp(p, EVENTS.trackFrom, EVENTS.trackTo);
            const k = (prog * 3.2) % 1;
            const y0 = A.y + (D.y - A.y) * (0.5 + 0.5 * Math.sin(k * Math.PI * 2));
            const g = ctx.createLinearGradient(A.x, 0, B.x, 0);
            g.addColorStop(0, `rgba(${GOLD},0)`);
            g.addColorStop(0.5, `rgba(${GOLD},${0.85 * appear})`);
            g.addColorStop(1, `rgba(${GOLD},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(A.x, y0 - 1, B.x - A.x, 2);
            // progress along the top edge
            ctx.fillStyle = `rgba(${IVORY},${0.9 * appear})`;
            ctx.fillRect(A.x, A.y - 7, (B.x - A.x) * prog, 2);
            ctx.fillStyle = `rgba(${IVORY},${0.25 * appear})`;
            ctx.fillRect(A.x + (B.x - A.x) * prog, A.y - 7, (B.x - A.x) * (1 - prog), 2);
          } else if (flash > 0) {
            ctx.fillStyle = `rgba(${GOLD},${0.25 * flash})`;
            ctx.fillRect(A.x, A.y, C.x - A.x, C.y - A.y);
          }
        }
      }

      // bridges from the capabilities to the need
      const beamAlpha = ramp(p, 0.636, 0.656) * (1 - ramp(p, 0.84, 0.87));
      if (beamAlpha > 0.01) {
        for (const bm of BEAMS) {
          const prog = ramp(p, bm.from, bm.from + 0.03);
          if (prog <= 0) continue;
          const lane = LANES[bm.lane]!;
          const lx = geo.laneX[bm.lane]!;
          const a3 = { x: lx, y: geo.floorY - 4, z: -bm.laneS };
          const b3p = framePoint(bm.frame, bm.u, bm.v, p);
          const A = P(a3.x, a3.y, a3.z);
          const B = P(b3p.x, b3p.y, b3p.z);
          if (!A.visible || !B.visible) continue;
          const hrs = laneHoursAt(lane, bm.laneS);
          const w = (3 + (hrs / MAX_LANE_HOURS) * 9) * Math.max(0.6, Math.min(1.6, (A.scale + B.scale) / 2 + 0.3));
          const lift = 90 + Math.abs(B.x - A.x) * 0.12;
          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i <= 48; i++) {
            const u = i / 48;
            const c1 = { x: A.x, y: A.y - lift };
            const c2 = { x: B.x, y: B.y + lift * 0.4 };
            const m = 1 - u;
            pts.push({
              x: m * m * m * A.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u * u * u * B.x,
              y: m * m * m * A.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u * u * u * B.y,
            });
          }
          const upTo = Math.floor(48 * (bm.matched ? prog : prog * 0.7));
          const agreed = p >= EVENTS.stamps.agreed;
          const col = bm.matched ? (agreed ? GREEN : IVORY) : GOLD;
          ctx.lineWidth = bm.matched ? w : 2;
          ctx.lineCap = "round";
          ctx.setLineDash(bm.matched ? [] : [7, 7]);
          ctx.strokeStyle = `rgba(${col},${(bm.matched ? 0.85 : 0.9) * beamAlpha})`;
          ctx.shadowColor = `rgba(${col},${0.6 * beamAlpha})`;
          ctx.shadowBlur = bm.matched ? 14 : 0;
          ctx.beginPath();
          ctx.moveTo(pts[0]!.x, pts[0]!.y);
          for (let i = 1; i <= upTo; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          // energy travelling along a completed bridge
          if (bm.matched && prog >= 1) {
            for (let k = 0; k < 2; k++) {
              const u = ((time * 0.00022 + k * 0.5 + bm.lane * 0.17) % 1);
              const q = pts[Math.min(48, Math.floor(u * 48))]!;
              ctx.fillStyle = `rgba(${GOLD},${0.95 * beamAlpha})`;
              ctx.beginPath();
              ctx.arc(q.x, q.y, 3.2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          // the socket in the need's world
          if (prog > 0.9) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = `rgba(${bm.matched ? (agreed ? GREEN : IVORY) : GOLD},${0.95 * beamAlpha})`;
            ctx.fillStyle = bm.matched ? `rgba(${agreed ? GREEN : IVORY},${0.95 * beamAlpha})` : "rgba(0,0,0,0)";
            ctx.beginPath();
            ctx.arc(B.x, B.y, bm.matched ? 7 : 8, 0, Math.PI * 2);
            if (bm.matched) ctx.fill();
            ctx.stroke();
          }
        }
      }

      // telemetry: product information in the scene
      for (const tel of TELEMETRY) {
        const el = telEls.current[tel.id];
        if (!el) continue;
        const alpha = telAlpha(tel, p);
        if (alpha < 0.01) {
          if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
          continue;
        }
        let ax = 0;
        let ay = 0;
        let ok = true;
        const an = tel.anchor;
        if (an.kind === "screen") {
          ax = an.x * geo.W;
          ay = an.y * geo.H;
        } else {
          let w3: { x: number; y: number; z: number };
          if (an.kind === "frame") {
            w3 = framePoint(an.frame, an.u, an.v, p);
          } else if (an.kind === "lane") {
            w3 = { x: geo.laneX[an.lane]!, y: geo.floorY, z: -an.s };
          } else {
            const ts = tileState(an.tile, p);
            w3 = { x: ts.x, y: ts.y, z: ts.z };
          }
          const q = P(w3.x, w3.y, w3.z);
          ok = q.visible;
          ax = q.x;
          ay = q.y;
        }
        const ui = geo.W < 700 ? 0.78 : 1;
        const dx = tel.dx * ui;
        const dy = tel.dy * ui;
        if (!ok || ax < -80 || ax > geo.W + 80 || ay < -80 || ay > geo.H + 80) {
          el.style.visibility = "hidden";
          continue;
        }
        // keep the label inside the viewport
        const lx = Math.min(geo.W - 24, Math.max(24, ax + dx));
        const ly = Math.min(geo.H - 150, Math.max(70, ay + dy));
        const view = tel.at(p);
        const key = `${view.label}|${view.value}|${view.sub}|${view.tone}`;
        if (telCache[tel.id] !== key) {
          telCache[tel.id] = key;
          const kids = el.children;
          (kids[0] as HTMLElement).textContent = view.label;
          (kids[1] as HTMLElement).textContent = view.value ?? "";
          (kids[2] as HTMLElement).textContent = view.sub ?? "";
          (kids[1] as HTMLElement).style.color =
            view.tone === "focus" ? `rgb(${GOLD})` : view.tone === "event" ? `rgb(${GREEN})` : `rgb(${IVORY})`;
        }
        const tx = tel.dx === 0 ? -50 : tel.dx < 0 ? -100 : 0;
        const ty = tel.dy < 0 ? -100 : tel.dy === 0 ? -50 : 0;
        el.style.visibility = "visible";
        el.style.opacity = String(alpha);
        el.style.textAlign = tel.dx < 0 ? "right" : tel.dx === 0 ? "center" : "left";
        el.style.transform = `translate(${lx}px,${ly}px) translate(${tx}%,${ty}%) scale(${ui})`;
        // the leader from the thing to its meaning
        if (an.kind !== "screen") {
          ctx.strokeStyle = `rgba(${IVORY},${0.55 * alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(lx, ly);
          ctx.stroke();
          ctx.fillStyle = `rgba(${view.tone === "focus" ? GOLD : IVORY},${0.95 * alpha})`;
          ctx.beginPath();
          ctx.arc(ax, ay, 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${IVORY},${0.5 * alpha})`;
          ctx.beginPath();
          ctx.arc(ax, ay, 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ribbon + scrub
      const st = stateAt(p);
      if (st !== lastState) {
        lastState = st;
        setState(st);
      }
      if (scrubRef.current) scrubRef.current.value = String(Math.round(p * 1000));
      stage.dataset.p = p.toFixed(3);
    };

    const tick = (now: number) => {
      // wall-clock time: a slow frame must not slow the film down
      const dt = Math.min(0.35, (now - last) / 1000);
      last = now;
      if (playingRef.current && fixedP === undefined) {
        pRef.current = Math.min(1, pRef.current + dt / DURATION_S);
        if (pRef.current >= 1) {
          playingRef.current = false;
          setPlaying(false);
        }
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fixedP, reduce]);

  const toggle = () => {
    if (pRef.current >= 1) setP(0);
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  };
  const seek = (p: number) => {
    playingRef.current = false;
    setPlaying(false);
    setP(p);
  };

  return (
    <div
      ref={stageRef}
      data-testid="world-sequence"
      className="relative h-[100svh] min-h-[560px] w-full select-none overflow-hidden bg-ink-900 text-text-primary"
      style={{ perspective: PERSPECTIVE, perspectiveOrigin: "50% 50%" }}
    >
      {/* the world: photographic planes in depth */}
      <div ref={worldRef} className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transformStyle: "preserve-3d" }}>
        {FRAMES.map((f) => (
          <div
            key={f.id}
            ref={(el) => {
              frameEls.current[f.id] = el;
            }}
            data-frame={f.id}
            className="absolute bg-no-repeat"
            style={{ backgroundImage: `url(${f.src})`, willChange: "transform, opacity" }}
          />
        ))}
        {([1, 2] as const).map((k) => (
          <div
            key={k}
            ref={(el) => {
              tileEls.current[k] = el;
            }}
            data-evidence={k}
            className="absolute bg-no-repeat"
            style={{
              backgroundImage: `url(${FRAMES.find((f) => f.id === TILES[k].frame)!.src})`,
              visibility: "hidden",
              willChange: "transform",
            }}
          />
        ))}
      </div>

      {/* grade: the world is lit from within, the edges fall away */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_45%,transparent_52%,rgb(var(--c-ink-900)/0.78)_100%)]"
      />

      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" />

      {/* telemetry */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {TELEMETRY.map((t) => (
          <div
            key={t.id}
            ref={(el) => {
              telEls.current[t.id] = el;
            }}
            data-tel={t.id}
            className="absolute left-0 top-0 max-w-[340px]"
            style={{ visibility: "hidden", willChange: "transform, opacity", textShadow: "0 1px 14px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.6)", textWrap: "balance" as never }}
          >
            <div className="sig-stamp text-[0.72rem] text-text-secondary" />
            <div className="mt-1 font-display text-[1.45rem] font-semibold leading-[1.02] tracking-[-0.02em]" />
            <div className="mt-1.5 text-support leading-snug text-text-secondary" />
          </div>
        ))}
      </div>

      {/* chrome: where we are in the product's states; one control */}
      <div className="absolute left-5 top-5 sig-stamp sm:left-8 sm:top-7">Sample person · spatial prototype</div>
      <nav
        aria-label="Product states"
        className="absolute bottom-5 left-5 right-5 flex flex-wrap items-center gap-x-1 gap-y-2 sm:bottom-7 sm:left-8 sm:right-8"
      >
        <div className="flex flex-wrap gap-x-1">
          {STATES.map((s, i) => (
            <button
              key={s}
              type="button"
              ref={(el) => {
                ribbonEls.current[s] = el;
              }}
              onClick={() => seek(STATE_MID[s])}
              aria-current={state === s ? "step" : undefined}
              className={`sig-stamp min-h-9 px-2.5 transition-colors duration-500 hover:text-text-primary ${
                state === s ? "text-brand-blue" : i < STATES.indexOf(state) ? "text-text-secondary" : ""
              }`}
            >
              {STATE_LABEL[s]}
            </button>
          ))}
        </div>
        <input
          ref={scrubRef}
          type="range"
          min={0}
          max={1000}
          defaultValue={0}
          aria-label="Position in the sequence"
          onChange={(e) => seek(Number(e.target.value) / 1000)}
          className="mx-3 h-1 min-w-[120px] flex-1 cursor-pointer accent-[rgb(212,175,55)]"
        />
        <button
          type="button"
          onClick={toggle}
          className="sig-stamp min-h-9 rounded-full border border-text-primary/30 px-4 hover:border-brand-blue hover:text-text-primary"
        >
          {playing ? "Pause" : pRef.current >= 1 ? "Replay" : "Play"}
        </button>
      </nav>
    </div>
  );
}
