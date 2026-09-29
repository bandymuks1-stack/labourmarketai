"use client";

/**
 * THE PERSON IN THEIR PROFESSIONAL WORLD — the Player Card's scene
 * (owner 2026-09-29 §30–§35, premium addendum, visual correction: "the
 * professional person IS the hero scene", "use space semantically",
 * "camera transformation is the navigation", "no decorative node diagram").
 *
 * THE COMPOSITION — one person, one world, space carries the meaning:
 *   · the PERSON is the hero: their real, consented photo standing in the
 *     scene; without one, a sculpted head-and-shoulders figure — human
 *     presence, never an invented face. Name, profession and where they work
 *     now are editorial type inside the scene, not a card underneath;
 *   · WORK is the place they stand in: the current workplace is the
 *     architecture behind them, its name on the lintel;
 *   · HISTORY recedes BEHIND: earlier workplaces as portals fading back into
 *     the dark, oldest farthest;
 *   · SKILLS rise BESIDE them: one column per capability, height from its
 *     records, material from its evidence — polished metal confirmed by a
 *     manager, frosted glass seen in the journal, a bare outline only said;
 *   · EVIDENCE lies at the foot of each column: the actual records, stacked;
 *   · NEXT opens AHEAD: lit doorways to where the evidence already reaches.
 * Only the person and their current place are always present; each mode
 * brings ONE dimension forward and the camera travels to it.
 *
 * Text is HTML (crisp, translatable, the mode control is real buttons); the
 * canvas is aria-hidden and every fact it shows is stated in the card's
 * sections. Rendered on demand — no frames while still. Reduced motion: the
 * world changes per mode without travel. Phone: centred, closer, fewer rows.
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { PlayerCardMode } from "@/lib/player-card/card-modes";
import type { PlayerCardWorldModel, WorldNode } from "@/lib/player-card/card-world";
import {
  Backdrop,
  Capability,
  EvidenceShard,
  Ground,
  Milestone,
  PathForward,
  Thread,
  Trail,
  WorkPlace,
} from "./player-card-world-objects";

type V3 = readonly [number, number, number];

// ── palette: the product's own tokens (light theme follows) ────────────────
type Palette = { ground: string; body: string; ivory: string; gold: string; cyan: string; muted: string };

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const rgb = (name: string, fallback: string) => {
    const v = css.getPropertyValue(name).trim();
    return v ? `rgb(${v.split(/\s+/).join(",")})` : fallback;
  };
  return {
    ground: rgb("--c-ink-900", "#070706"),
    body: rgb("--c-ink-700", "#1d1d1a"),
    ivory: rgb("--c-text-primary", "#f5f1e8"),
    gold: rgb("--c-brand-blue", "#d4af37"),
    cyan: rgb("--c-brand-cyan", "#00c2ff"),
    muted: rgb("--c-text-muted", "#a39c8d"),
  };
}

// ── the stage plan ──────────────────────────────────────────────────────────
type Layout = { person: V3; mobile: boolean };

type Shot = { pos: V3; look: V3 };
function shotFor(mode: PlayerCardMode, L: Layout): Shot {
  const [px] = L.person;
  const off = L.mobile ? 0 : 1.7; // desktop: the person stands right, the words left
  switch (mode) {
    case "identity":
      // desktop: the person right of centre, the words to their left;
      // phone: the words on top, the person standing below them
      return L.mobile
        ? { pos: [px, 1.3, 6.9], look: [px, 1.62, 0] }
        : { pos: [px - off * 0.45, 1.3, 5.9], look: [px - off * 0.45, 1.1, 0] };
    case "work":
      return { pos: [px + 0.9, 1.75, 6.4], look: [px - 0.6, 1.15, -0.8] };
    case "skills":
      return { pos: [px + 1.1, 1.5, 5.6], look: [px + 0.95, 1.25, 0.3] };
    case "evidence":
      return { pos: [px + 1.3, 1.45, 4.6], look: [px + 1.05, 1.25, 0.3] };
    case "history":
      return { pos: [px + 1.4, 2.9, 5.6], look: [px - 2.0, 0.3, -3.8] };
    case "next":
      return { pos: [px - 1.5, 2.05, -1.1], look: [px + 1.9, 0.45, 3.9] };
  }
}

/** Capabilities stand around the person at hand height — all the same
 *  size; where they stand says nothing about how "good" they are. */
function capabilityRing(count: number, L: Layout): V3[] {
  const [px] = L.person;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = THREE.MathUtils.lerp(-0.45, 1.25, t); // right of the person, curving toward the viewer
    const r = L.mobile ? 1.05 : 1.6;
    return [px + Math.cos(a) * r, 0.75 + t * 1.2, Math.sin(a) * r * 0.8 + 0.1] as const;
  });
}

/** Earlier engagements on the trail behind the person, the oldest farthest. */
function milestones(count: number, L: Layout): V3[] {
  const [px] = L.person;
  return Array.from({ length: count }, (_, i) => {
    const back = count - i; // 1 = most recent past step
    return [px - 0.9 * back - 0.3, 0, -1.3 - 1.9 * back] as const;
  });
}

/** Where each direction's path arrives, ahead of the person. */
function destinations(count: number, L: Layout): V3[] {
  const [px] = L.person;
  return Array.from({ length: count }, (_, i) => [px + 1.2 + i * 1.3, 0, 3.0 + i * 0.9] as const);
}

// ── words placed in space ───────────────────────────────────────────────────
type LabelSpec = {
  id: string;
  at: V3;
  modes: readonly PlayerCardMode[];
  title: string;
  detail: string | null;
  align?: "below" | "right";
};

function Projector({ specs, refs, mode }: { specs: readonly LabelSpec[]; refs: MutableRefObject<Map<string, HTMLElement>>; mode: PlayerCardMode }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    // the camera rig moved the camera THIS frame; its matrices update only at
    // render — project against the current pose, or the words land where the
    // camera was a frame ago (and stay there once on-demand frames stop)
    camera.updateMatrixWorld();
    for (const s of specs) {
      const el = refs.current.get(s.id);
      if (!el) continue;
      v.set(s.at[0], s.at[1], s.at[2]).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const visible = s.modes.includes(mode) && v.z < 1;
      el.style.transform =
        s.align === "right"
          ? `translate3d(${(x + 18).toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(0, -50%)`
          : `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, 0)`;
      el.style.opacity = visible ? "1" : "0";
    }
  });
  return null;
}

// ── the person ──────────────────────────────────────────────────────────────
function usePhoto(url: string | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      // soft edges: the photo stands IN the scene, not framed on top of it
      const c = document.createElement("canvas");
      c.width = 768;
      c.height = 1024;
      const ctx = c.getContext("2d")!;
      const s = Math.max(c.width / img.width, c.height / img.height);
      ctx.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
      ctx.globalCompositeOperation = "destination-in";
      const g = ctx.createRadialGradient(c.width / 2, c.height * 0.42, c.width * 0.2, c.width / 2, c.height * 0.5, c.width * 0.72);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      setTex(t);
    };
    img.onerror = () => setTex(null); // a failed photo falls back to the figure, never blank
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/** A tapered limb as one smooth form (radius r1 at the top → r2 at the end). */
function taper(r1: number, r2: number, len: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    // a gentle muscle curve rather than a straight cone
    const r = THREE.MathUtils.lerp(r2, r1, t) * (1 + 0.08 * Math.sin(t * Math.PI));
    pts.push(new THREE.Vector2(r, t * len));
  }
  pts.push(new THREE.Vector2(0, len));
  return new THREE.LatheGeometry(pts, 40);
}

/** A standing figure — human presence and scale without an invented face:
 *  one satin material, continuous tapered forms, proportioned like a person
 *  (≈ 2.1 units tall; the workplace portal is 3.0). */
function Figure({ p, confirmed }: { p: Palette; confirmed: boolean }) {
  const g = useMemo(() => {
    const torso = new THREE.LatheGeometry(
      [
        [0.0, 0.0], [0.155, 0.0], [0.165, 0.06], [0.14, 0.26], [0.16, 0.4], [0.2, 0.53], [0.205, 0.58], [0.17, 0.635], [0.06, 0.67], [0.0, 0.67],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      72,
    );
    return {
      torso,
      leg: taper(0.078, 0.036, 0.8),
      arm: taper(0.046, 0.026, 0.56),
      neck: taper(0.05, 0.046, 0.1),
    };
  }, []);
  useEffect(() => () => Object.values(g).forEach((geo) => geo.dispose()), [g]);
  const mat = (
    <meshPhysicalMaterial
      color={p.body}
      metalness={0.2}
      roughness={0.5}
      clearcoat={0.55}
      clearcoatRoughness={0.4}
      sheen={1}
      sheenColor={confirmed ? p.gold : p.ivory}
      sheenRoughness={0.3}
      envMapIntensity={0.75}
    />
  );
  // a lathe limb grows upward from its origin; flipped, it hangs from a joint
  const hang = (geo: THREE.BufferGeometry, at: V3, rotZ: number, key: string) => (
    <mesh key={key} geometry={geo} position={at as unknown as THREE.Vector3Tuple} rotation={[Math.PI, 0, rotZ]} castShadow>
      {mat}
    </mesh>
  );
  return (
    <group scale={1.2}>
      {hang(g.leg, [-0.075, 0.86, 0], 0.035, "legL")}
      {hang(g.leg, [0.075, 0.86, 0], -0.035, "legR")}
      {/* feet */}
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.035, 0.05]} scale={[0.045, 0.035, 0.11]} castShadow>
          <sphereGeometry args={[1, 24, 16]} />
          {mat}
        </mesh>
      ))}
      <mesh geometry={g.torso} position={[0, 0.84, 0]} scale={[1, 1, 0.6]} castShadow>
        {mat}
      </mesh>
      {hang(g.arm, [-0.225, 1.45, 0], -0.09, "armL")}
      {hang(g.arm, [0.225, 1.45, 0], 0.09, "armR")}
      <mesh geometry={g.neck} position={[0, 1.49, 0]} castShadow>
        {mat}
      </mesh>
      <mesh position={[0, 1.7, 0.01]} scale={[0.85, 1.1, 0.95]} castShadow>
        <sphereGeometry args={[0.108, 48, 36]} />
        {mat}
      </mesh>
    </group>
  );
}

function Person({ model, p, at, mode, reduced }: { model: PlayerCardWorldModel; p: Palette; at: V3; mode: PlayerCardMode; reduced: boolean }) {
  const photo = usePhoto(model.person.avatarUrl);
  const g = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  // the person turns toward what is being looked at — never spins
  const facing: Record<PlayerCardMode, number> = { identity: -0.25, work: 0, skills: 0.5, evidence: 0.55, history: -0.6, next: 0.35 };
  useFrame((_, dt) => {
    const grp = g.current;
    if (!grp) return;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.5);
    grp.rotation.y += (facing[mode] - grp.rotation.y) * k;
    if (Math.abs(facing[mode] - grp.rotation.y) > 0.0005) invalidate();
  });
  return (
    <group ref={g} position={at as unknown as THREE.Vector3Tuple}>
      {photo ? (
        <mesh position={[0, 1.15, 0]} castShadow>
          <planeGeometry args={[1.7, 2.27]} />
          <meshStandardMaterial map={photo} transparent roughness={0.6} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <Figure p={p} confirmed={model.person.confirmedEdge} />
      )}
    </group>
  );
}

/** A group that rises from the floor when its dimension is explored. */
function Stage({ show, reduced, children }: { show: boolean; reduced: boolean; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    const grp = g.current;
    if (!grp) return;
    const target = show ? 1 : 0.0001;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 4.5);
    const s = grp.scale.y + (target - grp.scale.y) * k;
    grp.scale.set(1, s, 1);
    grp.visible = s > 0.01;
    if (Math.abs(target - s) > 0.001) invalidate();
  });
  return (
    <group ref={g} scale={[1, 0.0001, 1]}>
      {children}
    </group>
  );
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45; // a studio, not a showroom
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function CameraRig({ mode, reduced, layout, pointer }: { mode: PlayerCardMode; reduced: boolean; layout: Layout; pointer: MutableRefObject<{ x: number; y: number }> }) {
  const { camera, invalidate, size } = useThree();
  const look = useRef<THREE.Vector3 | null>(null);
  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalLook = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => invalidate(), [mode, invalidate]);
  useFrame((_, dt) => {
    const shot = shotFor(mode, layout);
    // a narrow frame steps back so the explored dimension stays in view
    const aspect = size.width / Math.max(1, size.height);
    // the person alone needs little width; a dimension beside them needs more
    const needs = mode === "identity" || mode === "work" ? (layout.mobile ? 0.62 : 0.95) : layout.mobile ? 1.05 : 1.55;
    const fit = Math.max(1, needs / aspect);
    goalLook.set(shot.look[0], shot.look[1], shot.look[2]);
    goalPos.set(
      shot.look[0] + (shot.pos[0] - shot.look[0]) * fit,
      shot.look[1] + (shot.pos[1] - shot.look[1]) * fit,
      shot.look[2] + (shot.pos[2] - shot.look[2]) * fit,
    );
    if (!reduced && !layout.mobile) goalPos.add(new THREE.Vector3(pointer.current.x * 0.3, pointer.current.y * 0.15, 0));
    if (!look.current) {
      look.current = goalLook.clone();
      camera.position.copy(goalPos);
    }
    const k = reduced ? 1 : 1 - Math.exp(-dt * 2.2);
    camera.position.lerp(goalPos, k);
    look.current.lerp(goalLook, k);
    camera.lookAt(look.current);
    if (camera.position.distanceTo(goalPos) > 0.002 || look.current.distanceTo(goalLook) > 0.002) invalidate();
  });
  return null;
}

// ── the scene ───────────────────────────────────────────────────────────────
export default function PlayerCardWorldScene({
  model,
  mode,
  reduced,
  controls,
}: {
  model: PlayerCardWorldModel;
  mode: PlayerCardMode;
  reduced: boolean;
  /** The mode control, set inside the scene (real buttons). */
  controls: ReactNode;
}) {
  const [p, setP] = useState<Palette | null>(null);
  const [mobile, setMobile] = useState(false);
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const pointer = useRef({ x: 0, y: 0 });
  const invalidateRef = useRef<() => void>(() => {});

  useEffect(() => {
    setP(readPalette());
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const obs = new MutationObserver(() => setP(readPalette()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", sync);
      obs.disconnect();
    };
  }, []);

  const layout: Layout = useMemo(() => ({ person: [mobile ? 0 : 1.2, 0, 0], mobile }), [mobile]);
  const skills = useMemo(() => model.skills.slice(0, mobile ? 5 : 8), [model.skills, mobile]);
  const past = useMemo(() => model.history.filter((h) => h.tone !== "current").slice(-(mobile ? 3 : 5)), [model.history, mobile]);
  const capAt = useMemo(() => capabilityRing(skills.length, layout), [skills.length, layout]);
  const pastAt = useMemo(() => milestones(past.length, layout), [past.length, layout]);
  const nextAt = useMemo(() => destinations(model.next.length, layout), [model.next.length, layout]);
  const workplace = model.person.currentWork[0] ?? null;
  const [px, , pz] = layout.person;
  const chest: V3 = [px, 1.4, pz + 0.1];
  const shardAt = (i: number, k: number): V3 => {
    const c = capAt[i];
    const a = 2.3 + k * 0.42; // behind-left of the capability, clear of its words
    return [c[0] + Math.cos(a) * 0.24, c[1] + Math.sin(a) * 0.16, c[2] - 0.18];
  };

  const specs: LabelSpec[] = useMemo(() => {
    const tierLabel = (tone: WorldNode["tone"]) =>
      model.evidence.sources.find((s) => (tone === "confirmed" ? s.key === "confirmed" : tone === "recorded" ? s.key === "journal" : s.key === "declared"))?.label ?? null;
    const out: LabelSpec[] = [];
    if (workplace) out.push({ id: "workplace", at: [px - 0.9, 2.95, pz - 1.3], modes: ["work"], title: workplace, detail: model.person.currentWorkLabel });
    skills.forEach((n, i) => {
      out.push({ id: n.id, at: capAt[i], modes: ["skills"], title: n.label, detail: n.detail, align: "right" });
      out.push({ id: `${n.id}:source`, at: capAt[i], modes: ["evidence"], title: n.label, detail: tierLabel(n.tone), align: "right" });
    });
    past.forEach((n, i) => out.push({ id: n.id, at: [pastAt[i][0], 0.35, pastAt[i][2]], modes: ["history"], title: n.label, detail: n.detail }));
    model.next.forEach((n, i) => out.push({ id: n.id, at: [nextAt[i][0], 0.25, nextAt[i][2]], modes: ["next"], title: n.label, detail: n.detail }));
    return out;
  }, [model, workplace, skills, past, capAt, pastAt, nextAt, px, pz]);

  useEffect(() => invalidateRef.current(), [mode, specs]);

  if (!p) return null;

  const emptyShown =
    (mode === "work" && !workplace) ||
    ((mode === "skills" || mode === "evidence") && skills.length === 0) ||
    (mode === "history" && past.length === 0) ||
    (mode === "next" && model.next.length === 0);
  const hero = mode === "identity" || mode === "work";

  return (
    <div
      className="relative h-full w-full"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        pointer.current = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: -((e.clientY - r.top) / r.height - 0.5) * 2 };
        invalidateRef.current();
      }}
      onPointerLeave={() => {
        pointer.current = { x: 0, y: 0 };
        invalidateRef.current();
      }}
    >
      <Canvas
        aria-hidden
        shadows
        frameloop="demand"
        dpr={[1, mobile ? 1.5 : 1.75]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: mobile ? 42 : 32, position: [0, 1.4, 7], near: 0.1, far: 80 }}
        onCreated={({ invalidate, scene }) => {
          invalidateRef.current = invalidate;
          scene.background = new THREE.Color(p.ground);
          scene.fog = new THREE.Fog(p.ground, 9, 24);
        }}
      >
        <Environment />
        <hemisphereLight args={["#fff6e6", p.ground, 0.3]} />
        {/* KEY — warm, from the front-left: the person is read first; the
            only shadow caster, so the contact shadow grounds them */}
        <spotLight
          position={[px - 2.6, 5.2, 4.6]}
          angle={0.42}
          penumbra={0.85}
          intensity={95}
          color="#fff0d8"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0003}
          shadow-radius={6}
          target-position={[px, 1.1, 0]}
        />
        {/* FILL — cool and low from the right, so the dark side keeps its shape */}
        <directionalLight position={[px + 4, 2.2, 3]} intensity={0.55} color="#cfe0ff" />
        {/* RIM — gold from behind: separation from the dark, gold as light */}
        <spotLight position={[px + 1.6, 3.8, -3.2]} angle={0.3} penumbra={1} intensity={60} color={p.gold} target-position={[px, 1.6, 0]} />
        <CameraRig mode={mode} reduced={reduced} layout={layout} pointer={pointer} />
        <Backdrop p={p} />
        <Ground p={p} at={layout.person} />

        {/* WORK — the kind of place this work happens, only with a real current engagement */}
        {workplace ? <WorkPlace kind={model.environment} at={layout.person} p={p} /> : null}

        <Person model={model} p={p} at={layout.person} mode={mode} reduced={reduced} />

        {/* HISTORY — a trail behind the person, earlier engagements as milestones */}
        <Stage show={mode === "history"} reduced={reduced}>
          {past.length > 0 ? <Trail points={[[px - 0.15, 0, pz - 0.35], ...pastAt]} p={p} /> : null}
          {past.map((n, i) => (
            <Milestone key={n.id} at={pastAt[i]} p={p} nearness={(i + 1) / past.length} />
          ))}
        </Stage>

        {/* SKILLS / EVIDENCE — each capability related to the person; in
            EVIDENCE its real records come forward beside it */}
        <Stage show={mode === "skills" || mode === "evidence"} reduced={reduced}>
          {skills.map((n, i) => {
            const state = n.tone === "confirmed" ? "confirmed" : n.tone === "recorded" ? "recorded" : "declared";
            return (
              <group key={n.id}>
                <Thread from={chest} to={capAt[i]} color={state === "confirmed" ? p.gold : p.ivory} opacity={state === "declared" ? 0.12 : 0.32} />
                <Capability at={capAt[i]} state={state} p={p} />
              </group>
            );
          })}
        </Stage>
        <Stage show={mode === "evidence"} reduced={reduced}>
          {skills.map((n, i) =>
            Array.from({ length: Math.min(4, n.count ?? 0) }, (_, k) => (
              <group key={`${n.id}:${k}`}>
                <Thread from={capAt[i]} to={shardAt(i, k)} color={n.tone === "confirmed" ? p.gold : p.ivory} opacity={0.35} sag={0.02} />
                <EvidenceShard at={shardAt(i, k)} confirmed={n.tone === "confirmed"} p={p} tilt={-0.4 + k * 0.2} />
              </group>
            )),
          )}
        </Stage>

        {/* NEXT — lit paths from the person to where the evidence reaches */}
        <Stage show={mode === "next"} reduced={reduced}>
          {model.next.map((n, i) => (
            <PathForward key={n.id} from={[px + 0.15, 0, pz + 0.35]} to={nextAt[i]} p={p} strength={n.weight} />
          ))}
        </Stage>

        <Projector specs={specs} refs={labelRefs} mode={mode} />
      </Canvas>

      {/* THE PERSON, in words — editorial type in the scene, not a card */}
      <div
        className={
          "pointer-events-none absolute transition-all duration-500 " +
          (hero
            ? "left-5 top-6 max-w-[62%] sm:left-10 sm:top-1/2 sm:max-w-[42%] sm:-translate-y-1/2"
            : "left-5 top-5 max-w-[60%] sm:left-8 sm:top-7")
        }
        data-testid="player-card-world-identity"
      >
        <h2
          className={
            "break-words font-display font-bold leading-[0.98] tracking-tightest text-text-primary transition-all duration-500 " +
            (hero ? "text-4xl sm:text-6xl" : "text-xl sm:text-2xl")
          }
        >
          {model.person.name}
        </h2>
        {model.person.professions.length > 0 ? (
          <p className={"mt-2 text-text-secondary " + (hero ? "text-base sm:text-xl" : "text-sm")}>{model.person.professions.join(" · ")}</p>
        ) : null}
        {hero && workplace ? (
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-sm text-text-primary sm:text-base">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">{model.person.currentWorkLabel}</span>
            <span>{model.person.currentWork.join(", ")}</span>
          </p>
        ) : null}
        {hero && model.person.facts.length > 0 ? (
          <dl className="mt-5 hidden flex-wrap gap-x-6 gap-y-2 sm:flex">
            {model.person.facts.map((f) => (
              <div key={f.label} className="flex flex-col">
                <dt className="order-2 text-meta text-text-muted">{f.label}</dt>
                <dd className="font-mono text-lg font-semibold text-text-primary">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {hero ? (
          <p className="mt-4 text-meta text-text-muted">
            <span className="font-mono uppercase tracking-label">{model.person.provenance.label}</span> {model.person.provenance.text}
          </p>
        ) : null}
      </div>

      {/* words of the explored dimension, placed where their objects are */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {specs.map((s) => (
          <div
            key={s.id}
            ref={(el) => {
              if (el) labelRefs.current.set(s.id, el);
              else labelRefs.current.delete(s.id);
            }}
            data-testid="player-card-world-node"
            className={
              (s.align === "right" ? "items-start text-left " : "items-center text-center ") +
              "absolute left-0 top-0 flex max-w-[9rem] flex-col opacity-0 transition-opacity duration-500 will-change-transform sm:max-w-[12rem]"
            }
            style={{ transform: "translate3d(-999px,-999px,0)" }}
          >
            <span className="text-xs font-medium leading-tight text-text-primary sm:text-sm">{s.title}</span>
            {s.detail ? <span className="mt-0.5 text-meta leading-tight text-text-muted">{s.detail}</span> : null}
          </div>
        ))}
      </div>

      {emptyShown ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-16 px-6 text-center text-sm text-text-muted" data-testid="player-card-world-empty">
          {mode === "next" ? model.words.emptyNext : model.words.empty}
        </p>
      ) : null}

      {/* the mode control lives in the scene — quiet, real buttons */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/90 to-transparent px-3 pb-2 pt-8 sm:px-8">{controls}</div>
    </div>
  );
}
