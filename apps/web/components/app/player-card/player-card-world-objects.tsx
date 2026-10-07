"use client";

/**
 * The objects of the person's professional world (owner review 2026-09-29:
 * "why does this object exist, what professional fact does it represent, why
 * this shape, material and position?"). Each one answers that:
 *
 *   WorkPlace       — where the work happens now: the environment of the
 *                     person's profession (a restaurant pass for a cook, a
 *                     steel beam for construction …). Art direction for the
 *                     KIND of place, never a claim about a specific site.
 *   Capability      — one capability, the SAME size for every one (no score):
 *                     what differs is the material of its evidence —
 *                     polished gold confirmed by someone else, clear glass
 *                     seen in the journal, a bare outline only said.
 *   EvidenceShard   — one real record behind a capability, held beside it.
 *   PathForward     — a lit path on the floor from the person to a direction
 *                     the evidence already reaches.
 *   Milestone       — a past engagement, a pool of light on the trail behind.
 *   Thread          — a relationship (person ↔ capability ↔ record).
 *   Backdrop        — atmosphere only: light falling off into depth.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { WorldEnvironment } from "@/lib/player-card/card-world";

export type V3 = readonly [number, number, number];
export type Palette = { ground: string; body: string; ivory: string; gold: string; cyan: string; muted: string };

const v = (a: V3) => a as unknown as THREE.Vector3Tuple;

function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn once
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const radial = (inner: string) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

// ── atmosphere ──────────────────────────────────────────────────────────────
export function Backdrop({ p }: { p: Palette }) {
  // a curved cyclorama: light falls off upward and into depth, so the person
  // stands in a space instead of on a void
  const grad = useCanvasTexture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "rgba(255,238,210,0.10)");
    g.addColorStop(0.35, "rgba(255,238,210,0.035)");
    g.addColorStop(1, "rgba(255,238,210,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, 8, 256);
  return (
    <mesh position={[0, 0, 0]} rotation={[0, Math.PI, 0]}>
      <cylinderGeometry args={[11, 11, 9, 96, 1, true, -Math.PI * 0.62, Math.PI * 1.24]} />
      <meshBasicMaterial map={grad} color={p.ivory} transparent side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

export function Ground({ p, at }: { p: Palette; at: V3 }) {
  const pool = useCanvasTexture(radial("rgba(255,242,215,0.30)"), 512, 512);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={p.ground} roughness={0.7} metalness={0.05} envMapIntensity={0.02} />
      </mesh>
      {/* the real contact shadow of the person and the objects near them */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[at[0], 0.004, at[2] + 0.2]}>
        <planeGeometry args={[5.5, 5.5]} />
        <meshBasicMaterial map={pool} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── where the work happens now ──────────────────────────────────────────────
function Steel({ roughness = 0.32 }: { roughness?: number }) {
  return <meshPhysicalMaterial color="#9a9890" metalness={1} roughness={roughness} clearcoat={0.2} envMapIntensity={1} />;
}

function Stone({ p }: { p: Palette }) {
  return <meshPhysicalMaterial color={p.body} metalness={0.1} roughness={0.55} clearcoat={0.35} clearcoatRoughness={0.4} envMapIntensity={0.6} />;
}

/** A line lamp: a real light source, the warm light a working place is lit by. */
function LineLamp({ at, width, p }: { at: V3; width: number; p: Palette }) {
  return (
    <group position={v(at)}>
      <mesh>
        <boxGeometry args={[width, 0.035, 0.07]} />
        <meshStandardMaterial color={p.body} metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[width - 0.06, 0.006, 0.05]} />
        <meshBasicMaterial color="#ffe9c4" toneMapped={false} />
      </mesh>
      <pointLight position={[0, -0.25, 0.1]} intensity={6} distance={4} decay={2} color="#ffdcae" />
    </group>
  );
}

export function WorkPlace({ kind, at, p }: { kind: WorldEnvironment; at: V3; p: Palette }) {
  // behind and to the side of the person, never in front of them
  const [x, , z] = at;
  switch (kind) {
    case "kitchen":
      // a restaurant pass: stone counter, brushed steel top, warm line light
      return (
        <group position={[x - 0.1, 0, z - 1.95]} rotation={[0, 0.08, 0]}>
          <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.0, 0.92, 0.72]} />
            <Stone p={p} />
          </mesh>
          <mesh position={[0, 0.935, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.08, 0.04, 0.78]} />
            <Steel roughness={0.38} />
          </mesh>
          <mesh position={[0, 1.55, -0.3]} castShadow>
            <boxGeometry args={[2.9, 0.03, 0.34]} />
            <Steel roughness={0.3} />
          </mesh>
          <LineLamp at={[0, 2.55, 0.05]} width={2.6} p={p} />
        </group>
      );
    case "construction":
      // structure being built: a steel beam overhead and two uprights
      return (
        <group position={[x - 0.6, 0, z - 1.6]}>
          <mesh position={[0, 2.9, 0]} castShadow>
            <boxGeometry args={[4.2, 0.26, 0.16]} />
            <Steel roughness={0.5} />
          </mesh>
          {[-1.8, 1.8].map((dx) => (
            <mesh key={dx} position={[dx, 1.45, 0]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 2.9, 24]} />
              <Steel roughness={0.45} />
            </mesh>
          ))}
          <LineLamp at={[0, 2.7, 0.2]} width={1.6} p={p} />
        </group>
      );
    case "workshop":
      return (
        <group position={[x - 0.9, 0, z - 1.3]} rotation={[0, 0.1, 0]}>
          <mesh position={[0, 0.88, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.6, 0.08, 0.8]} />
            <Steel roughness={0.5} />
          </mesh>
          {[-1.2, 1.2].map((dx) => (
            <mesh key={dx} position={[dx, 0.43, 0]} castShadow>
              <boxGeometry args={[0.06, 0.86, 0.7]} />
              <Stone p={p} />
            </mesh>
          ))}
          <LineLamp at={[0, 2.3, 0]} width={2.2} p={p} />
        </group>
      );
    case "logistics":
      return (
        <group position={[x - 1.0, 0, z - 1.8]}>
          {[-1.4, 1.4].map((dx) => (
            <mesh key={dx} position={[dx, 1.6, 0]} castShadow>
              <boxGeometry args={[0.08, 3.2, 0.08]} />
              <Steel roughness={0.5} />
            </mesh>
          ))}
          {[0.9, 2.0].map((y) => (
            <mesh key={y} position={[0, y, 0]} castShadow>
              <boxGeometry args={[2.9, 0.1, 0.06]} />
              <meshPhysicalMaterial color={p.gold} metalness={0.7} roughness={0.45} />
            </mesh>
          ))}
          <LineLamp at={[0, 3.0, 0.4]} width={2} p={p} />
        </group>
      );
    default:
      // care, office, neutral: a quiet wall panel and the light the work is done in
      return (
        <group position={[x - 0.8, 0, z - 1.6]}>
          <mesh position={[0, 1.4, 0]} receiveShadow>
            <boxGeometry args={[3.2, 2.8, 0.06]} />
            <Stone p={p} />
          </mesh>
          <LineLamp at={[0, 2.6, 0.3]} width={2.4} p={p} />
        </group>
      );
  }
}

// ── relationships ───────────────────────────────────────────────────────────
export function Thread({ from, to, color, opacity, sag = 0.12 }: { from: V3; to: V3; color: string; opacity: number; sag?: number }) {
  const geo = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -sag, 0));
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 32, 0.006, 6, false);
  }, [from, to, sag]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

// ── capability and its evidence ─────────────────────────────────────────────
export type EvidenceState = "confirmed" | "recorded" | "declared";

/** One capability. Same size for every capability — the state is material. */
export function Capability({ at, state, p }: { at: V3; state: EvidenceState; p: Palette }) {
  return (
    <group position={v(at)}>
      {state === "confirmed" ? (
        <mesh scale={[1, 1, 0.42]} castShadow>
          <sphereGeometry args={[0.11, 48, 32]} />
          <meshPhysicalMaterial color={p.gold} metalness={1} roughness={0.18} clearcoat={1} clearcoatRoughness={0.1} envMapIntensity={1.4} />
        </mesh>
      ) : state === "recorded" ? (
        <>
          <mesh scale={[1, 1, 0.42]}>
            <sphereGeometry args={[0.11, 48, 32]} />
            <meshPhysicalMaterial color="#ffffff" transmission={1} thickness={0.25} roughness={0.08} ior={1.5} metalness={0} envMapIntensity={1.2} />
          </mesh>
          {/* the light inside: work that has been recorded */}
          <mesh>
            <sphereGeometry args={[0.028, 16, 12]} />
            <meshBasicMaterial color="#ffe6bd" toneMapped={false} />
          </mesh>
        </>
      ) : (
        // only said: the outline of a capability, no substance yet
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.1, 0.004, 8, 64]} />
          <meshBasicMaterial color={p.muted} transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

/** One real record held beside its capability. */
export function EvidenceShard({ at, confirmed, p, tilt }: { at: V3; confirmed: boolean; p: Palette; tilt: number }) {
  return (
    <group position={v(at)} rotation={[0.1, tilt, 0.05]}>
      <mesh castShadow>
        <boxGeometry args={[0.1, 0.13, 0.006]} />
        <meshPhysicalMaterial color="#fffaf0" transmission={0.6} roughness={0.35} thickness={0.05} metalness={0} envMapIntensity={0.9} />
      </mesh>
      {confirmed ? (
        // the edge of a confirmed record catches gold light
        <mesh position={[0, 0.067, 0]}>
          <boxGeometry args={[0.1, 0.006, 0.008]} />
          <meshPhysicalMaterial color={p.gold} metalness={1} roughness={0.2} />
        </mesh>
      ) : null}
    </group>
  );
}

// ── forward and behind ──────────────────────────────────────────────────────
function floorRibbon(points: V3[], width: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)));
  const n = 80;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const pt = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(width / 2);
    pos.push(pt.x + side.x, 0.006, pt.z + side.z, pt.x - side.x, 0.006, pt.z - side.z);
    uv.push(0, t, 1, t);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A lit path on the floor toward a direction; brighter where it arrives. */
export function PathForward({ from, to, p, strength }: { from: V3; to: V3; p: Palette; strength: number }) {
  const fade = useCanvasTexture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,226,170,0.05)");
    g.addColorStop(1, "rgba(255,226,170,0.9)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, 4, 128);
  const pool = useCanvasTexture(radial("rgba(255,226,170,0.8)"), 128, 128);
  const geo = useMemo(() => {
    const mid: V3 = [(from[0] + to[0]) / 2 + 0.4, 0, (from[2] + to[2]) / 2 - 0.2];
    return floorRibbon([from, mid, to], 0.12);
  }, [from, to]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo}>
        <meshBasicMaterial map={fade} color={p.gold} transparent opacity={0.35 + strength * 0.45} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* where the path arrives: a pool of light on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[to[0], 0.008, to[2]]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial map={pool} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A past engagement: a pool of light on the trail behind the person. */
export function Milestone({ at, p, nearness }: { at: V3; p: Palette; nearness: number }) {
  const pool = useCanvasTexture(radial("rgba(245,241,232,0.7)"), 128, 128);
  return (
    <group position={v(at)}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <planeGeometry args={[1.0, 1.0]} />
        <meshBasicMaterial map={pool} color={p.ivory} transparent opacity={0.3 + 0.6 * nearness} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.06, 48]} />
        <meshPhysicalMaterial color={p.body} metalness={0.8} roughness={0.3} clearcoat={0.6} />
      </mesh>
    </group>
  );
}

export function Trail({ points, p }: { points: V3[]; p: Palette }) {
  const fade = useCanvasTexture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(245,241,232,0)");
    g.addColorStop(1, "rgba(245,241,232,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, 4, 128);
  const geo = useMemo(() => floorRibbon(points, 0.06), [points]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial map={fade} color={p.ivory} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
