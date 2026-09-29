"use client";

/**
 * THE PERSON'S PROFESSIONAL WORLD — the Player Card's spatial scene
 * (owner 2026-09-29 §30–§35, premium addendum C–G, visual reference: one
 * dominant object, real depth, material, light, meaningful satellites).
 *
 * WHAT IS IN SPACE, AND WHY
 *   · the PERSON — a lit, physical identity object at the centre: the real
 *     consented photo when one exists, otherwise an engraved monogram plate.
 *     Never a synthesised face. Its edge is gold ONLY when a real
 *     confirmation row derives it (P6); otherwise warm ivory;
 *   · five SATELLITES — work, skills, evidence, history, next — each sized by
 *     how many real rows sit behind it; an empty one is a wireframe ghost,
 *     never padded;
 *   · per MODE the world re-forms around the same person: skills gather on
 *     an arc, evidence draws each skill back to where it came from (journal /
 *     confirmation / said), history pulls the camera back onto the working
 *     path behind the person, next opens forward.
 *
 * Text is HTML projected from 3D anchors (crisp, selectable, and the
 * satellites are real buttons); the canvas itself is aria-hidden — every fact
 * it shows is stated in the card's sections below it.
 *
 * COST. Rendered on demand (`frameloop="demand"`): frames run only while the
 * camera or a node is moving, or the pointer moves — a still scene costs no
 * GPU. DPR capped; mobile gets a closer composition with fewer nodes.
 * Reduced motion: the world still changes per mode, without travel.
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { PlayerCardMode } from "@/lib/player-card/card-modes";
import type {
  PlayerCardWorldModel,
  WorldNode,
  WorldNodeTone,
  WorldSatelliteKey,
} from "@/lib/player-card/card-world";

type V3 = readonly [number, number, number];

// ── palette: read from the product's own tokens, so light theme works ──────
type Palette = {
  ground: string;
  body: string;
  ivory: string;
  gold: string;
  cyan: string;
  green: string;
  muted: string;
};

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const rgb = (name: string, fallback: string) => {
    const v = css.getPropertyValue(name).trim();
    return v ? `rgb(${v.split(/\s+/).join(",")})` : fallback;
  };
  return {
    ground: rgb("--c-ink-800", "#151513"),
    body: rgb("--c-ink-700", "#1d1d1a"),
    ivory: rgb("--c-text-primary", "#f5f1e8"),
    gold: rgb("--c-brand-blue", "#d4af37"),
    cyan: rgb("--c-brand-cyan", "#00c2ff"),
    green: rgb("--c-trust-accent", "#34d399"),
    muted: rgb("--c-text-muted", "#a39c8d"),
  };
}

function toneColor(p: Palette, tone: WorldNodeTone): string {
  switch (tone) {
    case "confirmed":
      return p.green;
    case "recorded":
    case "current":
      return p.cyan;
    case "direction":
      return p.gold;
    case "declared":
    case "past":
      return p.ivory;
  }
}

// ── composition ─────────────────────────────────────────────────────────────
// The owner's reference composition: next above-right, history left-behind,
// skills right, work lower-left, evidence below.
const SATELLITE_AT: Record<WorldSatelliteKey, V3> = {
  next: [2.55, 1.6, 0.5],
  history: [-2.85, 1.05, -1.0],
  skills: [2.95, -0.55, 0.2],
  work: [-2.45, -1.1, 0.7],
  evidence: [-0.35, -1.7, 1.05],
};

const FLOOR_Y = -1.35;

type Shot = { pos: V3; look: V3 };
const SHOTS: Record<PlayerCardMode, Shot> = {
  identity: { pos: [0, 0.3, 8.4], look: [0, -0.05, 0] },
  work: { pos: [-2.1, 0.7, 8.9], look: [-1.2, -0.45, 0.4] },
  skills: { pos: [2.5, 0.15, 6.8], look: [2.1, -0.1, 0.2] },
  evidence: { pos: [0.5, 2.0, 9.6], look: [0.4, -0.75, 0.1] },
  history: { pos: [-0.9, 2.0, 10.2], look: [-1.3, 0.55, -1.4] },
  next: { pos: [2.4, 1.1, 8.8], look: [2.0, 0.2, 1.0] },
};

function skillArc(count: number, mobile: boolean): V3[] {
  // a phone has no room for an arc and its words: an even column beside
  // the person, one line of words each
  if (mobile) {
    return Array.from({ length: count }, (_, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      return [1.25, THREE.MathUtils.lerp(1.62, -1.62, t), 0.9] as const;
    });
  }
  const r = 2.45;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = THREE.MathUtils.lerp(1.0, -1.0, t);
    return [0.55 + Math.cos(a) * r, Math.sin(a) * (mobile ? 1.5 : 1.85), 0.9 - Math.abs(Math.sin(a)) * 0.6] as const;
  });
}

/** The working path flows from the left, behind the person, toward them:
 *  the oldest step farthest back, the newest nearest the present. */
function historyPath(count: number, mobile: boolean): V3[] {
  const from = mobile ? -3.0 : -4.3;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 1 : i / (count - 1);
    return [
      THREE.MathUtils.lerp(from, -1.45, t),
      0.85 + Math.sin(t * Math.PI) * 0.35,
      THREE.MathUtils.lerp(-3.3, -0.9, t),
    ] as const;
  });
}

/** NEXT opens ahead and to the right of the person — the way the work
 *  could go, one step apart each. */
function forwardFan(count: number): V3[] {
  return Array.from({ length: count }, (_, i) => [2.0 + i * 0.35, 1.45 - i * 0.95, 1.4 + i * 0.25] as const);
}

/** The evidence sources stand ON the floor in front of the person. */
function sourceRow(count: number, mobile: boolean): V3[] {
  const gap = mobile ? 1.7 : 2.4;
  return Array.from({ length: count }, (_, i) => [(i - (count - 1) / 2) * gap - 0.4, FLOOR_Y + 0.08, 1.5] as const);
}

/** Records per month: an ordered row along the back of the floor, oldest
 *  left — time reads the way the calendar reads it. Base points. */
function monthRow(count: number, mobile: boolean): V3[] {
  const span = mobile ? 4.4 : 6.4;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    return [(t - 0.5) * span, FLOOR_Y, -1.9] as const;
  });
}

function workCluster(count: number): V3[] {
  return Array.from({ length: count }, (_, i) => [-1.75 - (i % 2) * 1.05, -0.8 + Math.floor(i / 2) * 0.75, 1.35 + (i % 2) * 0.3] as const);
}

// ── labels: DOM elements positioned from 3D anchors every frame ─────────────
type LabelSpec = {
  id: string;
  at: V3;
  modes: readonly PlayerCardMode[];
  title: string;
  detail: string | null;
  tone: WorldNodeTone | "satellite" | "source";
  satellite?: WorldSatelliteKey;
  empty?: boolean;
  /** Where the words sit relative to their object. */
  align?: "below" | "right";
};

function Projector({
  specs,
  refs,
  mode,
}: {
  specs: readonly LabelSpec[];
  refs: MutableRefObject<Map<string, HTMLElement>>;
  mode: PlayerCardMode;
}) {
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
          ? `translate3d(${(x + 30).toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(0, -50%)`
          : `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, 0)`;
      // while one satellite is open, the others stay reachable but quiet
      el.style.opacity = !visible ? "0" : s.satellite && mode !== "identity" ? "0.45" : "1";
      el.style.pointerEvents = visible && s.satellite ? "auto" : "none";
      el.tabIndex = visible && s.satellite ? 0 : -1;
    }
  });
  return null;
}

// ── the person ──────────────────────────────────────────────────────────────
function useIdentityTexture(model: PlayerCardWorldModel, p: Palette): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let disposed = false;
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 1056;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const probe = document.createElement("span");
    probe.className = "font-display";
    document.body.appendChild(probe);
    const display = getComputedStyle(probe).fontFamily || "serif";
    probe.remove();

    const draw = (photo: HTMLImageElement | null) => {
      const w = canvas.width;
      const h = canvas.height;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1b1b18");
      g.addColorStop(1, "#0c0c0b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (photo) {
        // a real, consented photo: cover-fit into the upper plate
        const pw = w;
        const ph = h * 0.72;
        const s = Math.max(pw / photo.width, ph / photo.height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, pw, ph);
        ctx.clip();
        ctx.drawImage(photo, (pw - photo.width * s) / 2, (ph - photo.height * s) / 2, photo.width * s, photo.height * s);
        const fade = ctx.createLinearGradient(0, ph * 0.55, 0, ph);
        fade.addColorStop(0, "rgba(12,12,11,0)");
        fade.addColorStop(1, "rgba(12,12,11,1)");
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, pw, ph);
        ctx.restore();
      } else {
        // the engraved monogram — a designed identity mark, not a face
        ctx.fillStyle = p.ivory;
        ctx.globalAlpha = 0.92;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `700 ${model.person.initials.length > 2 ? 250 : 330}px ${display}`;
        ctx.fillText(model.person.initials, w / 2, h * 0.4);
        ctx.globalAlpha = 1;
      }
      // a hairline — gold only for a real confirmation (P6)
      ctx.fillStyle = model.person.confirmedEdge ? p.gold : p.muted;
      ctx.fillRect(w * 0.12, h * 0.76, w * 0.76, 3);
      ctx.fillStyle = p.ivory;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 64px ${display}`;
      ctx.fillText(model.person.name, w / 2, h * 0.85, w * 0.86);
      if (model.person.professions.length > 0) {
        ctx.fillStyle = p.muted;
        ctx.font = `500 34px ${display}`;
        ctx.fillText(model.person.professions.slice(0, 3).join(" · "), w / 2, h * 0.92, w * 0.86);
      }
      if (disposed) return;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      setTexture(tex);
    };

    const go = () => {
      if (model.person.avatarUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => draw(img);
        img.onerror = () => draw(null); // a failed photo is the monogram, never blank
        img.src = model.person.avatarUrl;
      } else draw(null);
    };
    if (document.fonts?.ready) document.fonts.ready.then(go, go);
    else go();
    return () => {
      disposed = true;
    };
  }, [model.person, p]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function Person({ model, p, mode, reduced }: { model: PlayerCardWorldModel; p: Palette; mode: PlayerCardMode; reduced: boolean }) {
  const texture = useIdentityTexture(model, p);
  const body = useMemo(() => new RoundedBoxGeometry(1.62, 2.24, 0.2, 6, 0.1), []);
  const rim = useMemo(() => new RoundedBoxGeometry(1.7, 2.32, 0.16, 6, 0.12), []);
  const group = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  // the person turns slightly toward what is being looked at — never spins
  const facing: Record<PlayerCardMode, number> = { identity: 0, work: -0.28, skills: 0.3, evidence: 0.05, history: 0, next: 0.34 };
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = facing[mode];
    const k = reduced ? 1 : 1 - Math.exp(-dt * 4);
    g.rotation.y += (target - g.rotation.y) * k;
    if (Math.abs(target - g.rotation.y) > 0.0005) invalidate();
  });
  return (
    <group ref={group} position={[0, 0.1, 0]} scale={1.18}>
      {/* edge light — gold ONLY for a real confirmation (P6) */}
      <mesh geometry={rim} position={[0, 0, -0.03]}>
        <meshBasicMaterial color={model.person.confirmedEdge ? p.gold : p.muted} transparent opacity={model.person.confirmedEdge ? 0.55 : 0.18} toneMapped={false} />
      </mesh>
      <mesh geometry={body} castShadow>
        <meshPhysicalMaterial color={p.body} metalness={0.6} roughness={0.28} clearcoat={1} clearcoatRoughness={0.1} envMapIntensity={1.15} />
      </mesh>
      {texture ? (
        <mesh position={[0, 0, 0.101]}>
          <planeGeometry args={[1.48, 2.1]} />
          <meshPhysicalMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.16} roughness={0.35} metalness={0.1} clearcoat={0.8} clearcoatRoughness={0.2} />
        </mesh>
      ) : null}
    </group>
  );
}

// ── satellites and the rows behind them ─────────────────────────────────────
function satelliteGeometry(key: WorldSatelliteKey): THREE.BufferGeometry {
  switch (key) {
    case "work":
      return new RoundedBoxGeometry(0.62, 0.46, 0.46, 4, 0.06);
    case "skills":
      return new THREE.IcosahedronGeometry(0.36, 0);
    case "evidence":
      return new THREE.CylinderGeometry(0.36, 0.36, 0.16, 40);
    case "history":
      return new THREE.TorusGeometry(0.3, 0.09, 20, 60);
    case "next":
      return new THREE.OctahedronGeometry(0.34, 0);
  }
}

function Satellite({
  k,
  at,
  weight,
  empty,
  active,
  color,
  body,
  receded,
  onChoose,
  reduced,
}: {
  k: WorldSatelliteKey;
  at: V3;
  weight: number;
  empty: boolean;
  active: boolean;
  color: string;
  body: string;
  /** Another state is open: this satellite stays reachable, smaller. */
  receded: boolean;
  onChoose: (k: WorldSatelliteKey) => void;
  reduced: boolean;
}) {
  const geometry = useMemo(() => satelliteGeometry(k), [k]);
  const mesh = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const { invalidate } = useThree();
  const base = empty ? 0.62 : 0.75 + weight * 0.5;
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    // the chosen satellite OPENS into its rows — it folds away while they
    // stand in its place, and returns when the person is seen whole again
    const target = active ? 0.0001 : base * (hover ? 1.1 : 1) * (receded ? 0.62 : 1);
    const kf = reduced ? 1 : 1 - Math.exp(-dt * 6);
    const s = m.scale.x + (target - m.scale.x) * kf;
    m.scale.setScalar(s);
    m.visible = s > 0.01;
    if (Math.abs(target - s) > 0.001) invalidate();
  });
  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      position={at as unknown as THREE.Vector3Tuple}
      rotation={k === "history" ? [0.35, 0.5, 0] : k === "evidence" ? [0.5, 0, 0] : [0.3, 0.4, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onChoose(k);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
        invalidate();
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
        invalidate();
      }}
    >
      {empty ? (
        <meshBasicMaterial color={color} wireframe transparent opacity={0.28} />
      ) : (
        <meshPhysicalMaterial
          color={body}
          metalness={0.85}
          roughness={0.22}
          clearcoat={1}
          clearcoatRoughness={0.06}
          emissive={color}
          emissiveIntensity={hover ? 0.55 : 0.3}
          envMapIntensity={1.4}
        />
      )}
    </mesh>
  );
}

function Link3D({ from, to, color, opacity, lift = 0.6 }: { from: V3; to: V3; color: string; opacity: number; lift?: number }) {
  const line = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, lift, 0.4));
    const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(40);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false });
    return new THREE.Line(geo, mat);
  }, [from, to, color, opacity, lift]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);
  return <primitive object={line} />;
}

/** A node group grows in when its mode arrives and folds away when it leaves. */
function Stage({ show, reduced, children }: { show: boolean; reduced: boolean; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    const grp = g.current;
    if (!grp) return;
    const target = show ? 1 : 0.0001;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    const s = grp.scale.x + (target - grp.scale.x) * k;
    grp.scale.setScalar(s);
    grp.visible = s > 0.01;
    if (Math.abs(target - s) > 0.001) invalidate();
  });
  return (
    <group ref={g} scale={0.0001}>
      {children}
    </group>
  );
}

function Orb({ at, node, p, size = 0.2 }: { at: V3; node: WorldNode; p: Palette; size?: number }) {
  const color = toneColor(p, node.tone);
  const r = size * (0.55 + node.weight * 0.75);
  const hollow = node.tone === "declared";
  return (
    <mesh position={at as unknown as THREE.Vector3Tuple}>
      <sphereGeometry args={[r, 32, 24]} />
      {hollow ? (
        <meshBasicMaterial color={color} wireframe transparent opacity={0.45} />
      ) : (
        <meshPhysicalMaterial color={p.body} emissive={color} emissiveIntensity={0.12 + node.weight * 0.26} metalness={0.9} roughness={0.18} clearcoat={1} envMapIntensity={0.9} />
      )}
    </mesh>
  );
}

// ── camera ──────────────────────────────────────────────────────────────────
function CameraRig({ mode, reduced, mobile, pointer }: { mode: PlayerCardMode; reduced: boolean; mobile: boolean; pointer: MutableRefObject<{ x: number; y: number }> }) {
  const { camera, invalidate, size } = useThree();
  const look = useRef(new THREE.Vector3(...SHOTS.identity.look));
  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalLook = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => invalidate(), [mode, invalidate]);
  useFrame((_, dt) => {
    const shot = SHOTS[mode];
    // FIT: the composition (satellites + their words) is ~4.1 units to each
    // side and ~2.7 up/down of the person; the camera stands as far back as
    // this canvas's aspect needs to keep all of it in frame — a narrow column
    // pulls back, a wide hero does not.
    const persp = camera as THREE.PerspectiveCamera;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
    const aspect = size.width / Math.max(1, size.height);
    const halfW = (mobile ? 3.2 : 4.1) + (mode === "skills" || mode === "evidence" || mode === "next" ? 0.9 : 0);
    const need = Math.max(2.7 / tanHalf, halfW / (tanHalf * aspect));
    const fit = Math.max(1, need / 8.4);
    goalPos.set(
      shot.look[0] + (shot.pos[0] * (mobile ? 0.7 : 1) - shot.look[0]) * fit,
      shot.look[1] + (shot.pos[1] - shot.look[1]) * fit,
      shot.look[2] + (shot.pos[2] - shot.look[2]) * fit,
    );
    // the scene answers the pointer — a small parallax, never a drift
    if (!reduced && !mobile) goalPos.add(new THREE.Vector3(pointer.current.x * 0.35, pointer.current.y * 0.22, 0));
    goalLook.set(shot.look[0] * (mobile ? 0.7 : 1), shot.look[1], shot.look[2]);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 2.6);
    camera.position.lerp(goalPos, k);
    look.current.lerp(goalLook, k);
    camera.lookAt(look.current);
    if (camera.position.distanceTo(goalPos) > 0.002 || look.current.distanceTo(goalLook) > 0.002) invalidate();
  });
  return null;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    // a studio, not a showroom: reflections that shape the metal without
    // washing it out
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Ground({ p }: { p: Palette }) {
  // a soft pool of light under the person and the orbits the satellites ride
  const glow = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,0.22)");
    g.addColorStop(0.35, "rgba(255,255,255,0.07)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const shadow = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.75)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => {
    glow.dispose();
    shadow.dispose();
  }, [glow, shadow]);
  return (
    <group position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[7, 64]} />
        <meshBasicMaterial map={glow} color={p.ivory} transparent depthWrite={false} opacity={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[2.6, 1.2]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      {[2.7, 3.5].map((r) => (
        <mesh key={r} position={[0, 0, 0.005]}>
          <ringGeometry args={[r, r + 0.008, 128]} />
          <meshBasicMaterial color={p.muted} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ── the scene ───────────────────────────────────────────────────────────────
export default function PlayerCardWorldScene({
  model,
  mode,
  onChoose,
  reduced,
}: {
  model: PlayerCardWorldModel;
  mode: PlayerCardMode;
  onChoose: (mode: PlayerCardMode) => void;
  reduced: boolean;
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
    // the theme can change under the scene
    const obs = new MutationObserver(() => setP(readPalette()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", sync);
      obs.disconnect();
    };
  }, []);

  const lim = mobile ? { skills: 5, history: 4, months: 6 } : { skills: 8, history: 7, months: 12 };
  const skills = model.skills.slice(0, lim.skills);
  const history = model.history.slice(-lim.history);
  const months = model.evidence.months.slice(-lim.months);
  const skillAt = useMemo(() => skillArc(skills.length, mobile), [skills.length, mobile]);
  const historyAt = useMemo(() => historyPath(history.length, mobile), [history.length, mobile]);
  const nextAt = useMemo(() => forwardFan(model.next.length), [model.next.length]);
  const sourceAt = useMemo(() => sourceRow(model.evidence.sources.length, mobile), [model.evidence.sources.length, mobile]);
  const monthAt = useMemo(() => monthRow(months.length, mobile), [months.length, mobile]);
  const workAt = useMemo(() => workCluster(model.work.length), [model.work.length]);
  const workGeometry = useMemo(() => new RoundedBoxGeometry(0.7, 0.5, 0.5, 4, 0.06), []);
  useEffect(() => () => workGeometry.dispose(), [workGeometry]);
  const satAt = (k: WorldSatelliteKey): V3 => {
    const a = SATELLITE_AT[k];
    return mobile ? ([a[0] * 0.74, a[1], a[2]] as const) : a;
  };

  const specs: LabelSpec[] = useMemo(() => {
    const out: LabelSpec[] = [];
    for (const s of model.satellites) {
      const at = satAt(s.key);
      out.push({
        id: `sat:${s.key}`,
        at: [at[0], at[1] - 0.62, at[2]],
        modes: (["identity", "work", "skills", "evidence", "history", "next"] as PlayerCardMode[]).filter(
          (m) => m !== s.key && !(s.key === "skills" && m === "evidence"),
        ),
        title: s.label,
        detail: s.count > 0 ? String(s.count) : null,
        tone: "satellite",
        satellite: s.key,
        empty: s.count === 0,
      });
    }
    skills.forEach((n, i) => out.push({ id: n.id, at: skillAt[i], modes: ["skills", "evidence"], title: n.label, detail: mode === "skills" ? n.detail : null, tone: n.tone, align: "right" }));
    model.evidence.sources.forEach((s, i) => out.push({ id: `src:${s.key}`, at: [sourceAt[i][0], sourceAt[i][1] - 0.2, sourceAt[i][2] + 0.4], modes: ["evidence"], title: s.label, detail: String(s.skillIds.length), tone: "source" }));
    months.forEach((m, i) => {
      // only the first, the last and the busiest month are named — a row of
      // twelve labels is noise; the rest is stated in the chart below
      const busiest = months.reduce((b, x) => (x.weight > b.weight ? x : b), months[0]);
      if (i === 0 || i === months.length - 1 || m.id === busiest.id)
        out.push({ id: `mlabel:${m.id}`, at: [monthAt[i][0], monthAt[i][1] - 0.1, monthAt[i][2]], modes: ["evidence"], title: m.label, detail: m.detail, tone: "recorded" });
    });
    history.forEach((n, i) => out.push({ id: n.id, at: [historyAt[i][0], historyAt[i][1] - 0.45, historyAt[i][2]], modes: ["history"], title: n.label, detail: n.detail, tone: n.tone }));
    model.next.forEach((n, i) => out.push({ id: n.id, at: nextAt[i], modes: ["next"], title: n.label, detail: n.detail, tone: n.tone, align: "right" }));
    model.work.forEach((n, i) => out.push({ id: n.id, at: [workAt[i][0], workAt[i][1] - 0.3, workAt[i][2]], modes: ["work"], title: n.label, detail: n.detail, tone: n.tone }));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- satAt is derived from `mobile`
  }, [model, mobile, mode, skills, history, skillAt, sourceAt, historyAt, nextAt, workAt]);

  useEffect(() => invalidateRef.current(), [mode, specs]);

  if (!p) return null;

  const activeKey = mode === "identity" ? null : mode;
  const emptyShown =
    (mode === "work" && model.work.length === 0) ||
    (mode === "skills" && skills.length === 0) ||
    (mode === "evidence" && model.evidence.sources.length === 0 && months.every((m) => m.weight === 0)) ||
    (mode === "history" && history.length === 0) ||
    (mode === "next" && model.next.length === 0);

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
        frameloop="demand"
        dpr={[1, mobile ? 1.5 : 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: mobile ? 44 : 36, position: [0, 0.3, 8.4], near: 0.1, far: 60 }}
        onCreated={({ invalidate, scene }) => {
          invalidateRef.current = invalidate;
          scene.fog = new THREE.Fog(p.ground, 9, 22);
        }}
      >
        <Environment />
        <ambientLight intensity={0.18} />
        <directionalLight position={[3.5, 5, 4.5]} intensity={2.1} color="#fff4e2" />
        <directionalLight position={[-4.5, 2.5, -5]} intensity={1.4} color={p.cyan} />
        <spotLight position={[0, 4.5, 5.5]} angle={0.42} penumbra={0.8} intensity={24} color="#ffffff" />
        <CameraRig mode={mode} reduced={reduced} mobile={mobile} pointer={pointer} />
        <Ground p={p} />
        <Person model={model} p={p} mode={mode} reduced={reduced} />

        {model.satellites.map((s) => (
          <group key={s.key}>
            <Link3D
              from={[0, 0, 0.05]}
              to={satAt(s.key)}
              color={s.count > 0 ? p.ivory : p.muted}
              opacity={activeKey === s.key ? 0.75 : s.count > 0 ? 0.2 : 0.08}
              lift={0.35}
            />
            <Satellite
              k={s.key}
              at={satAt(s.key)}
              weight={s.weight}
              empty={s.count === 0}
              // a satellite whose rows are on stage folds into them
              active={activeKey === s.key || (s.key === "skills" && mode === "evidence")}
              receded={mode !== "identity"}
              color={s.key === "next" ? p.gold : s.key === "evidence" ? p.green : s.key === "skills" ? p.cyan : p.ivory}
              body={p.body}
              onChoose={(k) => onChoose(k === activeKey ? "identity" : k)}
              reduced={reduced}
            />
          </group>
        ))}

        {/* SKILLS / EVIDENCE — the capabilities gather around the person */}
        <Stage show={mode === "skills" || mode === "evidence"} reduced={reduced}>
          {skills.map((n, i) => (
            <group key={n.id}>
              <Orb at={skillAt[i]} node={n} p={p} size={0.22} />
              {mode === "skills" ? <Link3D from={[0.8, 0, 0.1]} to={skillAt[i]} color={toneColor(p, n.tone)} opacity={0.3} lift={0.1} /> : null}
            </group>
          ))}
        </Stage>

        {/* EVIDENCE — each capability drawn back to where it came from */}
        <Stage show={mode === "evidence"} reduced={reduced}>
          {model.evidence.sources.map((src, i) => {
            const color = src.key === "confirmed" ? p.green : src.key === "journal" ? p.cyan : p.ivory;
            return (
              <group key={src.key}>
                <mesh position={sourceAt[i] as unknown as THREE.Vector3Tuple}>
                  <cylinderGeometry args={[0.46, 0.5, 0.16, 48]} />
                  {src.key === "declared" ? (
                    <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
                  ) : (
                    <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.4} roughness={0.25} clearcoat={1} />
                  )}
                </mesh>
                {src.skillIds.map((id) => {
                  const idx = skills.findIndex((s) => s.id === id);
                  return idx >= 0 ? <Link3D key={id} from={skillAt[idx]} to={[sourceAt[i][0], sourceAt[i][1] + 0.1, sourceAt[i][2]]} color={color} opacity={src.key === "declared" ? 0.25 : 0.6} lift={0.2} /> : null;
                })}
              </group>
            );
          })}
          {/* records over time: one column per month, height = real entries */}
          {months.map((m, i) => (
            <mesh key={m.id} position={[monthAt[i][0], monthAt[i][1] + (0.04 + m.weight * 1.1) / 2, monthAt[i][2]]}>
              <boxGeometry args={[0.16, 0.04 + m.weight * 1.1, 0.16]} />
              <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={m.weight > 0 ? 0.4 : 0} transparent opacity={m.weight > 0 ? 0.9 : 0.25} />
            </mesh>
          ))}
        </Stage>

        {/* HISTORY — the working path behind the person, oldest to newest */}
        <Stage show={mode === "history"} reduced={reduced}>
          {history.length > 1 ? <HistoryTube points={historyAt} color={p.ivory} /> : null}
          {history.map((n, i) => (
            <group key={n.id}>
              {/* each engagement is a ring on the path — the History
                  satellite's own shape; the current one carries light */}
              <mesh position={historyAt[i] as unknown as THREE.Vector3Tuple} rotation={[0.25, 0.35, 0]}>
                <torusGeometry args={[0.2 + n.weight * 0.1, 0.055, 20, 64]} />
                <meshPhysicalMaterial color={p.body} emissive={toneColor(p, n.tone)} emissiveIntensity={n.tone === "current" ? 0.9 : 0.25} metalness={0.85} roughness={0.2} clearcoat={1} />
              </mesh>
              {n.tone === "current" ? <Link3D from={[0, 0.2, 0]} to={historyAt[i]} color={p.cyan} opacity={0.5} lift={0.5} /> : null}
            </group>
          ))}
        </Stage>

        {/* NEXT — the world opens forward */}
        <Stage show={mode === "next"} reduced={reduced}>
          {model.next.map((n, i) => (
            <group key={n.id}>
              <mesh position={nextAt[i] as unknown as THREE.Vector3Tuple} rotation={[0.3, 0.5, 0]}>
                <octahedronGeometry args={[0.2 + n.weight * 0.14, 0]} />
                <meshPhysicalMaterial color={p.gold} emissive={p.gold} emissiveIntensity={0.28} metalness={0.8} roughness={0.2} clearcoat={1} />
              </mesh>
              <Link3D from={[0.6, 0.6, 0.2]} to={nextAt[i]} color={p.gold} opacity={0.4} lift={0.3} />
            </group>
          ))}
        </Stage>

        {/* WORK — where the person works now comes into the scene */}
        <Stage show={mode === "work"} reduced={reduced}>
          {model.work.map((n, i) => (
            <group key={n.id}>
            <Link3D from={[-0.5, -0.4, 0.2]} to={workAt[i]} color={p.cyan} opacity={0.5} lift={0.15} />
            <mesh geometry={workGeometry} position={workAt[i] as unknown as THREE.Vector3Tuple}>
              <meshPhysicalMaterial color={p.body} metalness={0.5} roughness={0.3} clearcoat={1} emissive={p.cyan} emissiveIntensity={0.08} />
            </mesh>
            </group>
          ))}
        </Stage>

        <Projector specs={specs} refs={labelRefs} mode={mode} />
      </Canvas>

      {/* the words, in HTML, placed where their objects are */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {specs.map((s) => {
          const Tag = s.satellite ? "button" : "div";
          return (
            <Tag
              key={s.id}
              ref={(el: HTMLElement | null) => {
                if (el) labelRefs.current.set(s.id, el);
                else labelRefs.current.delete(s.id);
              }}
              {...(s.satellite
                ? {
                    type: "button" as const,
                    onClick: () => onChoose(s.satellite as PlayerCardMode),
                    "data-testid": `player-card-world-satellite-${s.satellite}`,
                    "aria-label": s.detail ? `${s.title} · ${s.detail}` : s.title,
                  }
                : { "data-testid": `player-card-world-node` })}
              className={
                (s.align === "right" ? "items-start text-left " : "items-center text-center ") +
                "absolute left-0 top-0 flex max-w-[8.5rem] flex-col opacity-0 sm:max-w-[11rem] transition-opacity duration-300 will-change-transform " +
                (s.satellite
                  ? "min-h-11 rounded-full px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  : "")
              }
              style={{ transform: "translate3d(-999px,-999px,0)" }}
            >
              <span
                className={
                  s.satellite
                    ? `font-mono text-meta uppercase tracking-label ${s.empty ? "text-text-muted" : "text-text-primary"}`
                    : "text-xs font-medium leading-tight text-text-primary sm:text-sm"
                }
              >
                {s.title}
              </span>
              {s.detail ? <span className="mt-0.5 text-meta leading-tight text-text-muted">{s.detail}</span> : null}
            </Tag>
          );
        })}
        {emptyShown ? (
          <p className="absolute inset-x-0 bottom-3 text-center text-meta text-text-muted" data-testid="player-card-world-empty">
            {mode === "next" ? model.words.emptyNext : model.words.empty}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function HistoryTube({ points, color }: { points: readonly V3[]; color: string }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)));
    return new THREE.TubeGeometry(curve, 120, 0.025, 10, false);
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} transparent opacity={0.35} toneMapped={false} />
    </mesh>
  );
}
