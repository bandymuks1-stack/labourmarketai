"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useThreeStage, type Stage } from "../use-three-stage";
import { createPost, type Post } from "../r2/post";
import { buildHumanMask } from "../r2/human-mask";
import { makeTextPlane, type TextPlane } from "../r2/text-plane";
import { easeInOut, span } from "../r2/story";
import type { Budget } from "../r2/quality";
import { STANCES as STANCE_LIST } from "./presence-stances";
import {
  createFragmentMaterial,
  createPresenceMaterial,
  type PresenceUniforms,
} from "./presence-material";

export { STANCES } from "./presence-stances";

/** The four fragments of real work behind the figure. Public domain / CC0 —
 *  see public/design-lab/human/LICENSES.md. Never a hero image: each one is
 *  reduced to a warm monochrome trace and feathered into the dark. */
const FRAGMENTS = [
  { src: "/design-lab/human/welder.jpg", pos: [-6.4, 1.6, -7.5], scale: 5.6, rot: 0.08 },
  { src: "/design-lab/human/workshop.jpg", pos: [6.9, -0.4, -8.6], scale: 6.4, rot: -0.06 },
  { src: "/design-lab/human/lab.jpg", pos: [-4.2, -3.4, -5.4], scale: 4.4, rot: -0.11 },
  { src: "/design-lab/human/portrait.jpg", pos: [5.1, 3.4, -5.0], scale: 4.0, rot: 0.1 },
] as const;

type Ribbon = {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly label: TextPlane;
  readonly end: THREE.Vector3;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function PresenceCanvas({
  stance,
  budget,
  reduced,
  storyT,
}: {
  readonly stance: number;
  readonly budget: Budget;
  readonly reduced: boolean;
  readonly storyT: { current: number };
}) {
  const stanceRef = useRef(stance);
  stanceRef.current = stance;
  const appliedStanceRef = useRef(-1);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const budgetRef = useRef(budget);
  budgetRef.current = budget;

  const uniformsRef = useRef<PresenceUniforms | null>(null);
  const fragmentsRef = useRef<THREE.Mesh[]>([]);
  const ribbonsRef = useRef<Ribbon[]>([]);
  const headlineRef = useRef<TextPlane | null>(null);
  const postRef = useRef<Post | null>(null);
  const pointerWorld = useRef(new THREE.Vector3(999, 999, 999));
  const portraitRef = useRef(false);

  const hostRef = useThreeStage(
    {
      setup(stage: Stage) {
        const { scene, renderer, camera } = stage;
        const b = budgetRef.current;

        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        scene.fog = new THREE.FogExp2(0x0a0806, 0.024);

        // ── the ground: a warm dark, graded in 3D ─────────────────────────
        const sky = new THREE.Mesh(
          new THREE.SphereGeometry(90, 32, 24),
          new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
              uHi: { value: new THREE.Color(0x171310) },
              uLo: { value: new THREE.Color(0x070605) },
            },
            vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `
              uniform vec3 uHi; uniform vec3 uLo; varying vec3 vP;
              void main(){
                float y = normalize(vP).y;
                gl_FragColor = vec4(mix(uLo, uHi, smoothstep(-0.6, 0.7, y)), 1.0);
              }`,
          }),
        );
        sky.renderOrder = -1;
        scene.add(sky);

        // ── the record, as points ─────────────────────────────────────────
        const mask = buildHumanMask(b.tier === "mobile" ? 320 : 640);
        const N = b.particles;
        const figurePts = mask.samplePoints(N, 4242);

        const cloud = new Float32Array(N * 3);
        const figure = new Float32Array(N * 3);
        const release = new Float32Array(N * 3);
        const seeds = new Float32Array(N);

        let s = 13371;
        const rand = () => {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 4294967296;
        };

        const FIG_H = 7.4;
        for (let i = 0; i < N; i += 1) {
          // scattered activity: a wide, slow, flattened drift field
          const a = rand() * Math.PI * 2;
          const r = 2.5 + Math.pow(rand(), 0.7) * 9.5;
          cloud[i * 3] = Math.cos(a) * r;
          cloud[i * 3 + 1] = (rand() - 0.5) * 8.5;
          cloud[i * 3 + 2] = Math.sin(a) * r * 0.6 - 1.5;

          // the same points, condensed into a person
          const fx = figurePts[i * 2] * FIG_H;
          const fy = figurePts[i * 2 + 1] * FIG_H;
          // a slab, thicker through the torso than at the edges
          const thickness = 0.55 * (1 - Math.min(1, Math.abs(figurePts[i * 2]) * 3.2));
          figure[i * 3] = fx;
          figure[i * 3 + 1] = fy;
          figure[i * 3 + 2] = (rand() - 0.5) * (0.35 + thickness);

          // released back into the market: pushed outward, still recognisable
          const k = 2.3 + rand() * 1.6;
          release[i * 3] = fx * k + (rand() - 0.5) * 6;
          release[i * 3 + 1] = fy * 1.25 + (rand() - 0.5) * 4;
          release[i * 3 + 2] = -4 - rand() * 16;

          seeds[i] = rand();
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(figure, 3));
        geo.setAttribute("aCloud", new THREE.BufferAttribute(cloud, 3));
        geo.setAttribute("aFigure", new THREE.BufferAttribute(figure, 3));
        geo.setAttribute("aRelease", new THREE.BufferAttribute(release, 3));
        geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

        const { material, uniforms } = createPresenceMaterial();
        uniforms.uSize.value = b.tier === "mobile" ? 5.0 : 4.4;
        uniformsRef.current = uniforms;
        const points = new THREE.Points(geo, material);
        points.frustumCulled = false;
        scene.add(points);

        // ── real work, behind the figure ──────────────────────────────────
        const loader = new THREE.TextureLoader();
        fragmentsRef.current = FRAGMENTS.map((f) => {
          const tex = loader.load(f.src);
          tex.colorSpace = THREE.SRGBColorSpace;
          const mat = createFragmentMaterial(tex);
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.68), mat);
          mesh.scale.setScalar(f.scale);
          mesh.position.set(f.pos[0], f.pos[1], f.pos[2]);
          mesh.rotation.z = f.rot;
          mesh.renderOrder = -0.5;
          scene.add(mesh);
          return mesh;
        });

        // ── capabilities, as traces leaving the body ──────────────────────
        const ribbonCount = b.tier === "mobile" ? 4 : 6;
        ribbonsRef.current = Array.from({ length: ribbonCount }, (_, i) => {
          const t = i / (ribbonCount - 1);
          const side = i % 2 === 0 ? -1 : 1;
          const startY = 2.4 - t * 4.2;
          const start = new THREE.Vector3(side * 0.5, startY, 0.2);
          const mid = new THREE.Vector3(side * (2.1 + t * 0.7), startY + 0.6, 1.4);
          const end = new THREE.Vector3(side * (3.7 + t * 0.7), startY + 1.0 - t * 0.45, 2.0);
          // quadratic bezier, NOT catmull-rom: a three-point catmull-rom
          // overshoots its endpoints, and the overshoot flew the traces off
          // the side of the frame taking their labels with them
          const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
          const mat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            uniforms: {
              uGrow: { value: 0 },
              uColor: { value: new THREE.Color(0xffc98a) },
              uTime: { value: 0 },
            },
            vertexShader: `
              varying vec2 vUv;
              void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
            `,
            fragmentShader: `
              uniform float uGrow; uniform vec3 uColor; uniform float uTime;
              varying vec2 vUv;
              void main(){
                if (vUv.x > uGrow) discard;
                // bright at the head of the trace, fading back toward the body
                float head = smoothstep(uGrow - 0.16, uGrow, vUv.x);
                float body = smoothstep(0.0, 0.45, vUv.x);
                float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
                float a = (0.16 + head * 0.85) * body * pow(across, 1.6);
                gl_FragColor = vec4(uColor * (0.7 + head * 1.4), a);
              }
            `,
          });
          const mesh = new THREE.Mesh(
            new THREE.TubeGeometry(curve, b.tier === "mobile" ? 26 : 48, 0.052, 8, false),
            mat,
          );
          scene.add(mesh);

          const label = makeTextPlane("—", 0.24, {
            font: `500 34px "JetBrains Mono", ui-monospace, monospace`,
            color: "#F6E7D2",
            letterSpacing: 1.8,
            uppercase: true,
            rule: true,
            align: side < 0 ? "right" : "left",
          });
          label.material.opacity = 0;
          label.mesh.position.copy(end).add(new THREE.Vector3(side * 0.62, 0.14, 0));
          scene.add(label.mesh);

          return { mesh, material: mat, label, end };
        });

        const headline = makeTextPlane(
          "Your work already knows\nwhat you can do.",
          0.72,
          {
            font: `600 60px Manrope, system-ui, sans-serif`,
            color: "#F7EFE4",
            letterSpacing: -1.4,
            align: "center",
          },
        );
        headline.mesh.position.set(0, 4.9, 1.6);
        headline.material.opacity = 0;
        headlineRef.current = headline;
        scene.add(headline.mesh);

        camera.position.set(0, 0.4, 17);
        camera.lookAt(0, 0, 0);

        postRef.current = createPost(renderer, scene, camera, {
          bloom: b.bloom,
          bloomStrength: 0.3,
          bloomRadius: 0.45,
          bloomThreshold: 0.9,
          vignette: 1.15,
          grain: 0.06,
          lift: new THREE.Color(0x140d07),
          saturation: 1.02,
        });

        return () => {
          geo.dispose();
          material.dispose();
          headline.dispose();
          ribbonsRef.current.forEach((r) => {
            r.mesh.geometry.dispose();
            r.material.dispose();
            r.label.dispose();
          });
          fragmentsRef.current.forEach((m) => {
            m.geometry.dispose();
            (m.material as THREE.ShaderMaterial).dispose();
          });
          postRef.current?.dispose();
        };
      },

      resize(stage) {
        postRef.current?.setSize(stage.size.w, stage.size.h, stage.size.dpr);
        const portrait = stage.size.w < stage.size.h;
        portraitRef.current = portrait;
        stage.camera.fov = portrait ? 52 : 38;
        stage.camera.updateProjectionMatrix();
      },

      frame(stage, dt, elapsed) {
        const u = uniformsRef.current;
        if (!u) return;
        const red = reducedRef.current;
        const t = storyT.current;

        // ── the stance decides what the capabilities are called ───────────
        if (appliedStanceRef.current !== stanceRef.current) {
          appliedStanceRef.current = stanceRef.current;
          const st = STANCE_LIST[stanceRef.current];
          u.uWarm.value.set(st.warm);
          u.uCold.value.set(st.cold);
          ribbonsRef.current.forEach((r, i) => {
            const side = i % 2 === 0 ? -1 : 1;
            const text = st.capabilities[i % st.capabilities.length];
            const pos = r.label.mesh.position.clone();
            r.label.dispose();
            const label = makeTextPlane(text, 0.24, {
              font: `500 34px "JetBrains Mono", ui-monospace, monospace`,
              color: "#F6E7D2",
              letterSpacing: 1.8,
              uppercase: true,
              rule: true,
              align: side < 0 ? "right" : "left",
            });
            label.material.opacity = 0;
            label.mesh.position.copy(pos);
            stage.scene.add(label.mesh);
            r.material.uniforms.uColor.value.set(st.warm);
            ribbonsRef.current[i] = { ...r, label };
          });
        }

        u.uTime.value = elapsed;

        // ── the story ─────────────────────────────────────────────────────
        // 0.00 quiet field · 0.16 real work appears · 0.34 the body condenses
        // 0.58 capabilities leave it · 0.80 released back into the market
        const form = red ? 1 : easeInOut(span(t, 0.16, 0.46));
        const release = red ? 0 : easeInOut(span(t, 0.78, 1.0));
        u.uForm.value = form;
        u.uRelease.value = release;
        u.uOpacity.value = 1.05;

        // pointer: a soft push, in world space on the figure's plane
        const px = stage.pointer.x;
        const py = stage.pointer.y;
        pointerWorld.current.set(px * 11, py * 6.2, 0.4);
        u.uPointer.value.copy(pointerWorld.current);
        u.uPointerAmp.value = lerp(
          u.uPointerAmp.value,
          red ? 0 : form * (1 - release) * 1.5,
          Math.min(1, dt * 3),
        );

        // ── the photographic layer ────────────────────────────────────────
        const fragAlpha = red
          ? 0.5
          : Math.min(span(t, 0.08, 0.24), 1 - span(t, 0.62, 0.86));
        fragmentsRef.current.forEach((m, i) => {
          const mat = m.material as THREE.ShaderMaterial;
          mat.uniforms.uOpacity.value = lerp(
            mat.uniforms.uOpacity.value,
            fragAlpha * (0.5 + (i % 2) * 0.22),
            Math.min(1, dt * 2),
          );
          mat.uniforms.uTime.value = elapsed;
          if (!red) {
            m.position.y += Math.sin(elapsed * 0.22 + i * 2.1) * dt * 0.16;
            m.rotation.z += Math.sin(elapsed * 0.11 + i) * dt * 0.006;
          }
          m.visible = mat.uniforms.uOpacity.value > 0.01;
        });

        // ── capability traces ─────────────────────────────────────────────
        const grow = red ? 1 : easeInOut(span(t, 0.5, 0.76));
        const camPos = stage.camera.position;
        ribbonsRef.current.forEach((r, i) => {
          const stagger = Math.max(0, Math.min(1, grow * 1.5 - i * 0.09));
          r.material.uniforms.uGrow.value = stagger;
          r.material.uniforms.uTime.value = elapsed;
          r.mesh.visible = stagger > 0.02;
          const lm = r.label.material;
          lm.opacity = lerp(
            lm.opacity,
            stagger > 0.94 ? 0.85 * (1 - span(t, 0.88, 1.0)) : 0,
            Math.min(1, dt * 3),
          );
          r.label.mesh.lookAt(camPos);
          r.label.mesh.visible = lm.opacity > 0.02;
        });

        const headline = headlineRef.current;
        if (headline) {
          headline.material.opacity = lerp(
            headline.material.opacity,
            1 - span(t, 0.18, 0.34),
            Math.min(1, dt * 3),
          );
          headline.mesh.lookAt(camPos);
          headline.mesh.visible = headline.material.opacity > 0.02;
        }

        // ── camera: wide field → the person → back out to the market ──────
        const cam = stage.camera;
        const inToPerson = easeInOut(span(t, 0.1, 0.5));
        const outToMarket = easeInOut(span(t, 0.76, 1.0));
        const portrait = portraitRef.current;
        const z = lerp(lerp(17, 13.6, inToPerson), 26, outToMarket) * (portrait ? 1.5 : 1);
        const y = lerp(lerp(0.6, 0.15, inToPerson), 2.2, outToMarket);
        const target = new THREE.Vector3(
          px * lerp(1.5, 0.5, inToPerson),
          y + py * 0.7,
          z,
        );
        cam.position.lerp(target, red ? 1 : Math.min(1, dt * 1.6));
        // on a phone the figure lives in the top half and the type below it
        cam.lookAt(0, lerp(0.2, -0.4, outToMarket) + (portrait ? 2.6 : 0), 0);

        u.uFogNear.value = lerp(8, 14, inToPerson);
        u.uFogFar.value = lerp(30, 46, outToMarket);
      },

      renderFrame(stage) {
        const post = postRef.current;
        if (post) post.composer.render();
        else stage.renderer.render(stage.scene, stage.camera);
      },
    },
    { clearColor: "#070605", fov: 38, maxDpr: budget.dpr },
  );

  return <div ref={hostRef} className="h-full w-full" />;
}
