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
      return { pos: [px - 0.4, 1.9, 8.6], look: [px, 1.35, -1.4] };
    case "skills":
      return { pos: [px + 1.4, 1.7, 6.6], look: [px + 1.9, 0.9, 0.1] };
    case "evidence":
      return { pos: [px + 1.9, 1.3, 4.4], look: [px + 2.1, 0.25, 0.2] };
    case "history":
      return { pos: [px + 0.6, 2.6, 8.8], look: [px - 2.6, 1.1, -5.0] };
    case "next":
      return { pos: [px - 1.0, 2.2, -3.6], look: [px + 1.4, 1.0, 3.6] };
  }
}

function skillColumns(count: number, L: Layout): V3[] {
  const [px] = L.person;
  const step = L.mobile ? 0.5 : 0.62;
  // two staggered rows beside the person: the front row nearer the viewer,
  // so no column hides another and every capability keeps its own words
  return Array.from({ length: count }, (_, i) => [px + (L.mobile ? 0.8 : 1.15) + i * step, 0, i % 2 === 0 ? 0.75 : -0.45] as const);
}

function pastPortals(count: number, L: Layout): V3[] {
  const [px] = L.person;
  // index 0 = oldest; the newest past step stands nearest behind the person
  return Array.from({ length: count }, (_, i) => {
    const back = count - i; // 1 = nearest
    return [px - 1.35 * back, 0, -1.9 - 2.1 * back] as const;
  });
}

function nextDoors(count: number, L: Layout): V3[] {
  const [px] = L.person;
  return Array.from({ length: count }, (_, i) => [px + 0.9 + i * 1.45, 0, 3.4 + i * 1.1] as const);
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

// ── the world around the person ─────────────────────────────────────────────
function Portal({ at, w, h, p, lit, opacity = 1 }: { at: V3; w: number; h: number; p: Palette; lit: boolean; opacity?: number }) {
  const t = 0.16;
  const mat = (
    <meshPhysicalMaterial color={p.body} metalness={0.7} roughness={0.35} clearcoat={0.5} transparent={opacity < 1} opacity={opacity} envMapIntensity={0.8} />
  );
  return (
    <group position={at as unknown as THREE.Vector3Tuple}>
      <mesh position={[-w / 2, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, h, t * 1.6]} />
        {mat}
      </mesh>
      <mesh position={[w / 2, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, h, t * 1.6]} />
        {mat}
      </mesh>
      <mesh position={[0, h + t / 2, 0]} castShadow>
        <boxGeometry args={[w + t, t, t * 1.6]} />
        {mat}
      </mesh>
      {lit ? (
        // warm light along the underside of the lintel — the place is in use
        <mesh position={[0, h - 0.02, t * 0.81]}>
          <boxGeometry args={[w - t, 0.025, 0.02]} />
          <meshBasicMaterial color={p.gold} toneMapped={false} transparent opacity={0.9 * opacity} />
        </mesh>
      ) : null}
    </group>
  );
}

function Column({ at, node, p }: { at: V3; node: WorldNode; p: Palette }) {
  const h = 0.3 + node.weight * 1.7;
  const r = 0.12;
  return (
    <group position={at as unknown as THREE.Vector3Tuple}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[r, r, h, 48]} />
        {node.tone === "confirmed" ? (
          // confirmed by someone else: solid, polished — gold as material
          <meshPhysicalMaterial color={p.gold} metalness={1} roughness={0.22} clearcoat={1} envMapIntensity={1.3} />
        ) : node.tone === "recorded" ? (
          // seen in the journal: frosted glass carrying light
          <meshPhysicalMaterial color={p.ivory} transmission={0.85} thickness={0.5} roughness={0.3} ior={1.45} metalness={0} attenuationColor={p.cyan} attenuationDistance={0.9} />
        ) : (
          // only said: the shape without the substance
          <meshBasicMaterial color={p.muted} wireframe transparent opacity={0.35} />
        )}
      </mesh>
    </group>
  );
}

/** The records behind a capability, stacked at its foot (at most eight). */
function RecordStack({ at, entries, confirmed, p }: { at: V3; entries: number; confirmed: boolean; p: Palette }) {
  const n = Math.min(8, entries);
  return (
    <group position={[at[0] + 0.3, 0, at[2] + 0.18]}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[Math.sin(i * 1.7) * 0.03, 0.018 + i * 0.036, Math.cos(i * 2.3) * 0.03]} rotation={[0, i * 0.23, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.3, 0.026, 0.21]} />
          <meshStandardMaterial color={p.ivory} roughness={0.85} metalness={0} />
        </mesh>
      ))}
      {confirmed && n > 0 ? (
        // a seal on the top record: someone else confirmed this work
        <mesh position={[0.07, 0.036 * n + 0.012, 0.04]}>
          <cylinderGeometry args={[0.045, 0.045, 0.014, 32]} />
          <meshPhysicalMaterial color={p.gold} metalness={1} roughness={0.25} />
        </mesh>
      ) : null}
    </group>
  );
}

function Door({ at, weight, p }: { at: V3; weight: number; p: Palette }) {
  const light = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, "rgba(255,236,190,0.95)");
    g.addColorStop(1, "rgba(255,236,190,0.05)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => light.dispose(), [light]);
  return (
    <group position={at as unknown as THREE.Vector3Tuple} rotation={[0, Math.PI - 0.35, 0]}>
      <Portal at={[0, 0, 0]} w={0.95} h={1.75} p={p} lit={false} />
      <mesh position={[0, 0.875, -0.02]}>
        <planeGeometry args={[0.8, 1.72]} />
        <meshBasicMaterial map={light} transparent opacity={0.35 + weight * 0.45} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
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

function Floor({ p, at }: { p: Palette; at: V3 }) {
  const pool = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    g.addColorStop(0, "rgba(255,244,220,0.22)");
    g.addColorStop(0.3, "rgba(255,244,220,0.1)");
    g.addColorStop(1, "rgba(255,244,220,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => pool.dispose(), [pool]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={p.ground} roughness={0.62} metalness={0.2} envMapIntensity={0.08} />
      </mesh>
      {/* the light the person stands in */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[at[0], 0.003, at[2] + 0.3]}>
        <planeGeometry args={[6, 6]} />
        <meshBasicMaterial map={pool} transparent depthWrite={false} />
      </mesh>
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
  const skillAt = useMemo(() => skillColumns(skills.length, layout), [skills.length, layout]);
  const pastAt = useMemo(() => pastPortals(past.length, layout), [past.length, layout]);
  const nextAt = useMemo(() => nextDoors(model.next.length, layout), [model.next.length, layout]);
  const workplace = model.person.currentWork[0] ?? null;
  const [px, , pz] = layout.person;

  const specs: LabelSpec[] = useMemo(() => {
    const tierLabel = (tone: WorldNode["tone"]) =>
      model.evidence.sources.find((s) => (tone === "confirmed" ? s.key === "confirmed" : tone === "recorded" ? s.key === "journal" : s.key === "declared"))?.label ?? null;
    const out: LabelSpec[] = [];
    if (workplace) out.push({ id: "workplace", at: [px, 3.35, pz - 1.5], modes: ["work"], title: workplace, detail: model.person.currentWorkLabel });
    skills.forEach((n, i) => {
      const h = 0.3 + n.weight * 1.7;
      out.push({ id: n.id, at: [skillAt[i][0], h + 0.42, skillAt[i][2]], modes: ["skills"], title: n.label, detail: n.detail });
      out.push({ id: `${n.id}:source`, at: [skillAt[i][0] + 0.3, 0.02, skillAt[i][2] + 0.35], modes: ["evidence"], title: n.label, detail: tierLabel(n.tone) });
    });
    past.forEach((n, i) => out.push({ id: n.id, at: [pastAt[i][0], 2.25, pastAt[i][2]], modes: ["history"], title: n.label, detail: n.detail }));
    model.next.forEach((n, i) => out.push({ id: n.id, at: [nextAt[i][0], 2.05, nextAt[i][2]], modes: ["next"], title: n.label, detail: n.detail }));
    return out;
  }, [model, workplace, skills, past, skillAt, pastAt, nextAt, px, pz]);

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
          scene.fog = new THREE.Fog(p.ground, 8, 20);
        }}
      >
        <Environment />
        <hemisphereLight args={["#fff6e6", p.ground, 0.25]} />
        {/* key: a warm spot from the front-left, the only shadow caster */}
        <spotLight
          position={[px - 3.2, 5.6, 4.2]}
          angle={0.5}
          penumbra={0.9}
          intensity={70}
          color="#fff1dc"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
          target-position={[px, 1, 0]}
        />
        {/* rim: gold light from behind carves the silhouette out of the dark */}
        <spotLight position={[px + 2.0, 3.6, -3.4]} angle={0.28} penumbra={1} intensity={40} color={p.gold} target-position={[px, 1.9, 0]} />
        <CameraRig mode={mode} reduced={reduced} layout={layout} pointer={pointer} />
        <Floor p={p} at={layout.person} />

        {/* WORK — the place they stand in now (only when a real one exists) */}
        {workplace ? <Portal at={[px, 0, pz - 1.5]} w={3.2} h={3.0} p={p} lit /> : null}

        <Person model={model} p={p} at={layout.person} mode={mode} reduced={reduced} />

        {/* HISTORY — earlier workplaces recede behind the person */}
        <Stage show={mode === "history"} reduced={reduced}>
          {past.map((n, i) => (
            <Portal key={n.id} at={pastAt[i]} w={2.2} h={2.0} p={p} lit={false} opacity={0.55 + 0.45 * ((i + 1) / past.length)} />
          ))}
        </Stage>

        {/* SKILLS / EVIDENCE — capability beside them, records at its foot */}
        <Stage show={mode === "skills" || mode === "evidence"} reduced={reduced}>
          {skills.map((n, i) => (
            <group key={n.id}>
              <Column at={skillAt[i]} node={n} p={p} />
              <RecordStack at={skillAt[i]} entries={n.count ?? 0} confirmed={n.tone === "confirmed"} p={p} />
            </group>
          ))}
        </Stage>

        {/* NEXT — the world opens ahead */}
        <Stage show={mode === "next"} reduced={reduced}>
          {model.next.map((n, i) => (
            <Door key={n.id} at={nextAt[i]} weight={n.weight} p={p} />
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
