"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useThreeStage, type Stage } from "../use-three-stage";
import { createPost, type Post } from "../r2/post";
import { makeTextPlane, type TextPlane } from "../r2/text-plane";
import { easeInOut, span } from "../r2/story";
import type { Budget } from "../r2/quality";
import { NEED_SEEDS } from "./weather-needs";

/**
 * C2 — "THE WEATHER".
 *
 * The market is not a map and not a graph: it is a volume with currents in it.
 * Every strand is a participant moving through a flow field; every need is a
 * low-pressure centre that bends the current around it. Matching is not drawn
 * as a line between two dots — it is what you SEE happen when a current meets
 * a need and turns.
 *
 * The camera flies through the volume rather than looking at it, so the story
 * is a descent from weather-system scale to the scale of one braid of people.
 */

type Attractor = {
  readonly pos: THREE.Vector3;
  strength: number;
  target: number;
  readonly radius: number;
  readonly label: TextPlane | null;
};

const SEG_MIN = 4;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** A cheap divergence-light flow field. Not true curl noise — three coupled
 *  sine fields, which for a visual current is indistinguishable and about
 *  fifteen times cheaper on the CPU. */
function flowAt(x: number, y: number, z: number, t: number, out: THREE.Vector3) {
  const a = Math.sin(x * 0.055 + t * 0.07) + Math.cos(z * 0.042 - t * 0.05);
  const b = Math.sin(y * 0.07 - t * 0.055) + Math.cos(x * 0.038 + t * 0.04);
  const c = Math.sin(z * 0.048 + t * 0.06) + Math.cos(y * 0.044 - t * 0.045);
  out.set(b * 1.05 - c * 0.3, c * 0.62 - a * 0.32, (a * 0.22 + b * 0.08) * 0.45);
  return out;
}

export function WeatherCanvas({
  budget,
  reduced,
  storyT,
  placedRef,
  mode,
}: {
  readonly budget: Budget;
  readonly reduced: boolean;
  readonly storyT: { current: number };
  readonly placedRef: { current: { x: number; y: number; z: number } | null };
  readonly mode: "person" | "organisation";
}) {
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const budgetRef = useRef(budget);
  budgetRef.current = budget;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const stateRef = useRef<{
    positions: Float32Array;
    strands: number;
    len: number;
    heads: Float32Array;
    lines: THREE.LineSegments;
    attractors: Attractor[];
    userAttractor: Attractor;
  } | null>(null);
  const postRef = useRef<Post | null>(null);
  const headlineRef = useRef<TextPlane | null>(null);

  const hostRef = useThreeStage(
    {
      setup(stage: Stage) {
        const { scene, renderer, camera } = stage;
        const b = budgetRef.current;

        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;

        const sky = new THREE.Mesh(
          new THREE.SphereGeometry(160, 32, 24),
          new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
              uHi: { value: new THREE.Color(0x0d1420) },
              uLo: { value: new THREE.Color(0x04060a) },
            },
            vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `
              uniform vec3 uHi; uniform vec3 uLo; varying vec3 vP;
              void main(){
                float y = normalize(vP).y;
                gl_FragColor = vec4(mix(uLo, uHi, smoothstep(-0.8, 0.6, y)), 1.0);
              }`,
          }),
        );
        sky.renderOrder = -2;
        scene.add(sky);

        // ── market strata: three vast, almost invisible membranes ─────────
        const membraneMat = (tint: number, alpha: number) =>
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            uniforms: {
              uTint: { value: new THREE.Color(tint) },
              uAlpha: { value: alpha },
              uTime: { value: 0 },
            },
            vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `
              uniform vec3 uTint; uniform float uAlpha; uniform float uTime;
              varying vec2 vUv;
              void main(){
                vec2 q = (vUv - 0.5) * 2.0;
                float r = 1.0 - smoothstep(0.2, 1.0, length(q));
                float bands = 0.5 + 0.5 * sin(vUv.y * 26.0 + uTime * 0.25 + vUv.x * 3.0);
                gl_FragColor = vec4(uTint, r * uAlpha * (0.35 + bands * 0.65));
              }`,
          });
        [
          { z: -22, s: 90, tint: 0x2b4664, a: 0.05 },
          { z: -58, s: 130, tint: 0x203a58, a: 0.045 },
          { z: -96, s: 180, tint: 0x18304c, a: 0.04 },
        ].forEach((m) => {
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(m.s, m.s * 0.62),
            membraneMat(m.tint, m.a),
          );
          mesh.position.set(0, 0, m.z);
          mesh.renderOrder = -1;
          scene.add(mesh);
        });

        // ── the currents ──────────────────────────────────────────────────
        const strands = b.strands;
        const len = Math.max(SEG_MIN, b.strandLength);
        const positions = new Float32Array(strands * len * 3);
        const heads = new Float32Array(strands * 3);

        let s = 24601;
        const rand = () => {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 4294967296;
        };

        for (let i = 0; i < strands; i += 1) {
          const x = (rand() - 0.5) * 44;
          const y = (rand() - 0.5) * 24;
          const z = 18 - rand() * 112;
          heads[i * 3] = x;
          heads[i * 3 + 1] = y;
          heads[i * 3 + 2] = z;
          for (let m = 0; m < len; m += 1) {
            positions[(i * len + m) * 3] = x;
            positions[(i * len + m) * 3 + 1] = y;
            positions[(i * len + m) * 3 + 2] = z;
          }
        }

        const segs = strands * (len - 1);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(segs * 6), 3),
        );
        lineGeo.setAttribute(
          "color",
          new THREE.BufferAttribute(new Float32Array(segs * 6), 3),
        );
        const lines = new THREE.LineSegments(
          lineGeo,
          new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        lines.frustumCulled = false;
        scene.add(lines);

        // ── the needs already in the market ───────────────────────────────
        const attractors: Attractor[] = NEED_SEEDS.map((n) => {
          const label = makeTextPlane(n.label, 0.62, {
            font: `500 34px "JetBrains Mono", ui-monospace, monospace`,
            color: "#FFE0BC",
            letterSpacing: 1.8,
            uppercase: true,
            rule: true,
            align: "center",
          });
          label.material.opacity = 0;
          label.mesh.position.set(n.x, n.y + 2.6, n.z);
          scene.add(label.mesh);
          return {
            pos: new THREE.Vector3(n.x, n.y, n.z),
            strength: 0,
            target: n.strength,
            radius: n.radius,
            label,
          };
        });

        const userAttractor: Attractor = {
          pos: new THREE.Vector3(0, 0, 0),
          strength: 0,
          target: 0,
          radius: 15,
          label: null,
        };

        const headline = makeTextPlane(
          "The market is weather.\nYou are already in it.",
          1.15,
          {
            font: `600 60px Manrope, system-ui, sans-serif`,
            color: "#EAF1FA",
            letterSpacing: -1.5,
            align: "center",
          },
        );
        headline.mesh.position.set(0, 1.2, -6);
        headline.material.opacity = 0;
        headlineRef.current = headline;
        scene.add(headline.mesh);

        stateRef.current = {
          positions,
          strands,
          len,
          heads,
          lines,
          attractors,
          userAttractor,
        };

        camera.position.set(0, 1.5, 30);
        camera.lookAt(0, 0, -20);

        postRef.current = createPost(renderer, scene, camera, {
          bloom: b.bloom,
          bloomStrength: 0.32,
          bloomRadius: 0.42,
          bloomThreshold: 0.9,
          vignette: 1.2,
          grain: 0.05,
          lift: new THREE.Color(0x070c14),
          saturation: 1.06,
        });

        return () => {
          lineGeo.dispose();
          headline.dispose();
          attractors.forEach((a) => a.label?.dispose());
          postRef.current?.dispose();
        };
      },

      resize(stage) {
        postRef.current?.setSize(stage.size.w, stage.size.h, stage.size.dpr);
        const portrait = stage.size.w < stage.size.h;
        stage.camera.fov = portrait ? 62 : 46;
        stage.camera.far = 260;
        stage.camera.updateProjectionMatrix();
      },

      frame(stage, dt, elapsed) {
        const st = stateRef.current;
        if (!st) return;
        const red = reducedRef.current;
        const t = storyT.current;
        const step = Math.min(dt, 1 / 30);

        // ── a need the visitor placed ─────────────────────────────────────
        const placed = placedRef.current;
        if (placed) {
          st.userAttractor.pos.set(placed.x, placed.y, placed.z);
          st.userAttractor.target = modeRef.current === "organisation" ? 5.5 : 3.4;
        } else {
          st.userAttractor.target = 0;
        }

        const all = [...st.attractors, st.userAttractor];
        for (const a of all) {
          a.strength = lerp(a.strength, a.target, Math.min(1, step * 1.6));
        }

        // ── advect ────────────────────────────────────────────────────────
        const { positions, heads, strands, len } = st;
        const v = new THREE.Vector3();
        const d = new THREE.Vector3();
        const tangent = new THREE.Vector3();
        const speed = red ? 0 : 5.2;

        for (let i = 0; i < strands; i += 1) {
          const hx = heads[i * 3];
          const hy = heads[i * 3 + 1];
          const hz = heads[i * 3 + 2];

          flowAt(hx, hy, hz, elapsed, v).multiplyScalar(speed);

          for (const a of all) {
            if (a.strength <= 0.01) continue;
            d.set(a.pos.x - hx, a.pos.y - hy, a.pos.z - hz);
            const dist = d.length();
            if (dist > a.radius || dist < 0.001) continue;
            // proximity decides who moves: distance is real here
            const pull = Math.pow(1 - dist / a.radius, 1.6) * a.strength;
            d.multiplyScalar(1 / dist);

            // A need BENDS traffic, it does not swallow it. A purely radial
            // pull collapses every strand onto one point and the need renders
            // as a sun; adding a tangential component makes the current turn
            // around the need and carry on, which is both prettier and a more
            // honest picture of what matching does.
            tangent
              .set(0, i % 2 === 0 ? 1 : -1, 0)
              .cross(d)
              .normalize();
            // strong enough to visibly turn a current, weak enough that the
            // current escapes again — a need changes a trajectory, it does not
            // capture people forever
            const close = dist < a.radius * 0.42 ? (a.radius * 0.42 - dist) * 1.5 : 0;
            v.addScaledVector(d, pull * 2.2 - close);
            v.addScaledVector(tangent, pull * 4.2);
          }

          let nx = hx + v.x * step;
          let ny = hy + v.y * step;
          let nz = hz + v.z * step;

          // respawn anything that leaves the volume, at the far end
          if (Math.abs(nx) > 30 || Math.abs(ny) > 17 || nz > 24 || nz < -104) {
            nx = (Math.random() - 0.5) * 42;
            ny = (Math.random() - 0.5) * 23;
            nz = 18 - Math.random() * 116;
            for (let m = 0; m < len; m += 1) {
              positions[(i * len + m) * 3] = nx;
              positions[(i * len + m) * 3 + 1] = ny;
              positions[(i * len + m) * 3 + 2] = nz;
            }
          } else {
            for (let m = len - 1; m > 0; m -= 1) {
              const to = (i * len + m) * 3;
              const from = (i * len + m - 1) * 3;
              positions[to] = positions[from];
              positions[to + 1] = positions[from + 1];
              positions[to + 2] = positions[from + 2];
            }
          }
          positions[i * len * 3] = nx;
          positions[i * len * 3 + 1] = ny;
          positions[i * len * 3 + 2] = nz;
          heads[i * 3] = nx;
          heads[i * 3 + 1] = ny;
          heads[i * 3 + 2] = nz;
        }

        // ── write the ribbon buffer ───────────────────────────────────────
        const posAttr = st.lines.geometry.getAttribute("position") as THREE.BufferAttribute;
        const colAttr = st.lines.geometry.getAttribute("color") as THREE.BufferAttribute;
        const cool = new THREE.Color(0x86b4e6);
        const warm = new THREE.Color(0xffc07a);
        const tmp = new THREE.Color();
        const camX = stage.camera.position.x;
        const camZ = stage.camera.position.z;
        let w = 0;
        for (let i = 0; i < strands; i += 1) {
          // how much of the market's attention this strand is under
          let heat = 0;
          for (const a of all) {
            if (a.strength <= 0.01) continue;
            const dx = heads[i * 3] - a.pos.x;
            const dy = heads[i * 3 + 1] - a.pos.y;
            const dz = heads[i * 3 + 2] - a.pos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < a.radius) heat = Math.max(heat, 1 - dist / a.radius);
          }
          tmp.copy(cool).lerp(warm, Math.min(1, heat * 1.35));
          // depth falls away, so the near current is the subject and the far
          // one is weather
          const dz = heads[i * 3 + 2] - camZ;
          const dxc = heads[i * 3] - camX;
          const depth = Math.sqrt(dxc * dxc + dz * dz);
          const near = 0.26 + 0.74 * (1 - Math.min(1, Math.abs(depth - 22) / 98));
          for (let m = 0; m < len - 1; m += 1) {
            const a0 = (i * len + m) * 3;
            const a1 = (i * len + m + 1) * 3;
            posAttr.setXYZ(w, positions[a0], positions[a0 + 1], positions[a0 + 2]);
            posAttr.setXYZ(w + 1, positions[a1], positions[a1 + 1], positions[a1 + 2]);
            // bright at the head, dark at the tail: direction without arrows
            const f0 = Math.pow(1 - m / (len - 1), 1.15) * (0.9 + heat * 1.5) * near;
            const f1 = Math.pow(1 - (m + 1) / (len - 1), 1.15) * (0.9 + heat * 1.5) * near;
            colAttr.setXYZ(w, tmp.r * f0, tmp.g * f0, tmp.b * f0);
            colAttr.setXYZ(w + 1, tmp.r * f1, tmp.g * f1, tmp.b * f1);
            w += 2;
          }
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        // ── labels on the needs that are actually live ────────────────────
        const camPos = stage.camera.position;
        st.attractors.forEach((a, i) => {
          if (!a.label) return;
          const dist = camPos.distanceTo(a.pos);
          const near = 1 - Math.min(1, Math.abs(dist - 26) / 34);
          const m = a.label.material;
          m.opacity = lerp(m.opacity, near * span(t, 0.12, 0.3) * 0.9, Math.min(1, dt * 2));
          a.label.mesh.lookAt(camPos);
          a.label.mesh.visible = m.opacity > 0.02;
          void i;
        });

        const headline = headlineRef.current;
        if (headline) {
          headline.material.opacity = lerp(
            headline.material.opacity,
            1 - span(t, 0.1, 0.24),
            Math.min(1, dt * 3),
          );
          headline.mesh.position.set(
            camPos.x,
            camPos.y - 0.4,
            camPos.z - 7.5,
          );
          headline.mesh.lookAt(camPos);
          headline.mesh.visible = headline.material.opacity > 0.02;
        }

        // ── the camera flies through, it does not look at ─────────────────
        const cam = stage.camera;
        const travel = easeInOut(t);
        const z = lerp(30, -66, travel);
        const y = lerp(1.5, -1.2, easeInOut(span(t, 0.3, 1)));
        const drift = Math.sin(t * 3.1) * 5.5;
        const target = new THREE.Vector3(
          drift + stage.pointer.x * 3.4,
          y + stage.pointer.y * 2.2,
          z,
        );
        cam.position.lerp(target, red ? 1 : Math.min(1, dt * 1.5));
        cam.lookAt(drift * 0.4, y * 0.4, z - 24);

        // strength ramps in so the opening is calm weather, not a light show
        st.attractors.forEach((a, i) => {
          a.target = NEED_SEEDS[i].strength * span(t, 0.1, 0.34);
        });
      },

      renderFrame(stage) {
        const post = postRef.current;
        if (post) post.composer.render();
        else stage.renderer.render(stage.scene, stage.camera);
      },
    },
    { clearColor: "#04060A", fov: 46, maxDpr: budget.dpr },
  );

  return <div ref={hostRef} className="h-full w-full" />;
}
