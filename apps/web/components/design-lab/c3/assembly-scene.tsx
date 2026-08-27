"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useThreeStage, type Stage } from "../use-three-stage";
import { createPost, type Post } from "../r2/post";
import { buildHumanMask } from "../r2/human-mask";
import { makeTextPlane, type TextPlane } from "../r2/text-plane";
import { easeInOut, easeOut, span } from "../r2/story";
import type { Budget } from "../r2/quality";
import {
  buildEnvironment,
  buildGeometries,
  buildMaterials,
  type FormGeometries,
  type FormMaterials,
} from "./forms";
import { buildPopulation, layout, NEEDS, type Placement, type Role } from "./assembly-model";

type El = {
  readonly role: Role;
  readonly mesh: THREE.Mesh;
  readonly seam: THREE.Mesh | null;
  /** where it is travelling from, and the curve control point */
  readonly from: THREE.Vector3;
  readonly ctrl: THREE.Vector3;
  readonly fromQuat: THREE.Quaternion;
  target: Placement | null;
  /** idle position when this element is not part of the composition */
  readonly park: THREE.Vector3;
  travel: number;
  delay: number;
  fromScale: number;
  readonly spin: THREE.Vector3;
  readonly phase: number;
};

const TRAVEL_SECONDS = 1.55;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function AssemblyCanvas({
  needIndex,
  budget,
  reduced,
  storyT,
  onSettled,
}: {
  readonly needIndex: number;
  readonly budget: Budget;
  readonly reduced: boolean;
  readonly storyT: { current: number };
  readonly onSettled: (v: number) => void;
}) {
  const needRef = useRef(needIndex);
  needRef.current = needIndex;
  const appliedRef = useRef(-1);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const budgetRef = useRef(budget);
  budgetRef.current = budget;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const elsRef = useRef<El[]>([]);
  const groupRef = useRef<THREE.Group | null>(null);
  const coreRef = useRef<THREE.Mesh | null>(null);
  const haloRef = useRef<THREE.Sprite | null>(null);
  const labelsRef = useRef<{ plane: TextPlane; el: El | null; offset: THREE.Vector3 }[]>([]);
  const headlineRef = useRef<TextPlane | null>(null);
  const farRef = useRef<THREE.Points | null>(null);
  const linksRef = useRef<THREE.LineSegments | null>(null);
  const linkPairsRef = useRef<[number, number][]>([]);
  const postRef = useRef<Post | null>(null);
  const energyRef = useRef(0);
  const reportedRef = useRef(-1);
  const portraitRef = useRef(false);

  const hostRef = useThreeStage(
    {
      setup(stage: Stage) {
        const { scene, renderer, camera } = stage;
        const b = budgetRef.current;
        const detail = b.tier === "mobile" ? 1 : 2;

        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.92;
        // a transmission pass at half resolution is invisible on frosted glass
        // and roughly quarters its cost
        // Transmission is the single most expensive thing in this scene: it
        // re-renders the opaque pass into a target every frame. A quarter-res
        // target is invisible on frosted glass and is the difference between
        // this running and this hanging.
        (renderer as unknown as { transmissionResolutionScale?: number })
          .transmissionResolutionScale = 0.25;

        scene.environment = buildEnvironment(renderer);
        // an environment alone lights reflections, not form. Physical glass
        // needs a key it can catch an edge on, or it reads as a dark blob.
        (scene as unknown as { environmentIntensity?: number }).environmentIntensity = 0.85;
        scene.fog = new THREE.FogExp2(0x07070a, 0.022);

        const key = new THREE.DirectionalLight(0xfff1dc, 1.7);
        key.position.set(7.5, 9, 6.5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xbcd6ff, 1.15);
        rim.position.set(-8.5, 2.5, -7);
        scene.add(rim);
        const under = new THREE.DirectionalLight(0xffbb88, 0.3);
        under.position.set(0, -8, 3);
        scene.add(under);
        scene.add(new THREE.AmbientLight(0x3a4258, 0.22));

        // ── the void, as a real gradient in 3D rather than a CSS backdrop ──
        const sky = new THREE.Mesh(
          new THREE.SphereGeometry(120, 32, 24),
          new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
              uTop: { value: new THREE.Color(0x141620) },
              uMid: { value: new THREE.Color(0x0a0b10) },
              uBottom: { value: new THREE.Color(0x05050700) },
            },
            vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `
              uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom;
              varying vec3 vP;
              void main(){
                float y = normalize(vP).y;
                vec3 c = mix(uMid, uTop, smoothstep(-0.1, 0.85, y));
                c = mix(vec3(0.02,0.02,0.028), c, smoothstep(-0.9, -0.05, y));
                gl_FragColor = vec4(c, 1.0);
              }`,
          }),
        );
        sky.renderOrder = -1;
        scene.add(sky);

        // ── the human presence that lives inside every warm form ──────────
        const mask = buildHumanMask(b.tier === "mobile" ? 256 : 448);
        const humanTex = new THREE.CanvasTexture(mask.canvas);
        humanTex.colorSpace = THREE.NoColorSpace;
        humanTex.needsUpdate = true;
        const inlayMat = new THREE.MeshBasicMaterial({
          map: humanTex,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          color: new THREE.Color(0xffb066),
        });
        const inlayGeo = new THREE.PlaneGeometry(0.42, 0.68);

        const geos: FormGeometries = buildGeometries(detail);
        const mats: FormMaterials = buildMaterials(null);

        const group = new THREE.Group();
        group.scale.setScalar(1.0);
        groupRef.current = group;
        scene.add(group);

        // ── the elements ──────────────────────────────────────────────────
        let seed = 90210;
        const rand = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };

        const roles = buildPopulation(b.forms);
        let refractiveLeft = b.refractive;
        const els: El[] = roles.map((role) => {
          const wantsRefraction = role === "person" || role === "org";
          const refractive = wantsRefraction && refractiveLeft > 0;
          if (refractive) refractiveLeft -= 1;
          const geo =
            role === "person"
              ? geos.person
              : role === "team"
                ? geos.team
                : role === "agent"
                  ? geos.agent
                  : geos.org;
          const mesh = new THREE.Mesh(geo, mats.byRole(role, refractive));
          const a = rand() * Math.PI * 2;
          const park = new THREE.Vector3(
            Math.cos(a) * (11 + rand() * 7),
            (rand() - 0.5) * 11,
            Math.sin(a) * (11 + rand() * 7),
          );
          mesh.position.copy(park);
          mesh.scale.setScalar(0.001);
          group.add(mesh);

          let seam: THREE.Mesh | null = null;
          if (role === "agent") {
            seam = new THREE.Mesh(geos.agentSeam, mats.seam);
            seam.position.set(0, 0, 0.13);
            mesh.add(seam);
          }
          if (role === "person") {
            const inlay = new THREE.Mesh(inlayGeo, inlayMat);
            inlay.position.set(0, 0, 0.02);
            mesh.add(inlay);
          }

          return {
            role,
            mesh,
            seam,
            from: park.clone(),
            ctrl: new THREE.Vector3(),
            fromQuat: new THREE.Quaternion(),
            target: null,
            park,
            travel: 1,
            delay: 0,
            fromScale: 0.001,
            spin: new THREE.Vector3(
              (rand() - 0.5) * 0.09,
              (rand() - 0.5) * 0.12,
              (rand() - 0.5) * 0.07,
            ),
            phase: rand() * Math.PI * 2,
          } satisfies El;
        });
        elsRef.current = els;
        // React StrictMode mounts this effect twice in development: the first
        // element set is built, planned, then thrown away. Without this reset
        // the surviving set keeps `appliedRef` from the discarded one and is
        // never given a layout at all — the scene loads and simply never
        // assembles. Every new element set demands a new plan.
        appliedRef.current = -1;

        // ── the links: what makes it a STRUCTURE rather than a scatter ────
        // Without these the composition reads as objects that happen to be
        // near each other. With them it reads as something load-bearing, which
        // is the entire argument of the concept.
        const maxLinks = 96;
        const linkGeo = new THREE.BufferGeometry();
        linkGeo.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(maxLinks * 6), 3),
        );
        linkGeo.setAttribute(
          "color",
          new THREE.BufferAttribute(new Float32Array(maxLinks * 6), 3),
        );
        const links = new THREE.LineSegments(
          linkGeo,
          new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        links.frustumCulled = false;
        linksRef.current = links;
        group.add(links);

        // ── the core: what the structure is FOR ───────────────────────────
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 3), mats.core);
        coreRef.current = core;
        group.add(core);

        const haloCanvas = document.createElement("canvas");
        haloCanvas.width = haloCanvas.height = 128;
        const hctx = haloCanvas.getContext("2d")!;
        const grad = hctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, "rgba(255,220,180,1)");
        grad.addColorStop(0.35, "rgba(255,180,120,0.35)");
        grad.addColorStop(1, "rgba(255,160,90,0)");
        hctx.fillStyle = grad;
        hctx.fillRect(0, 0, 128, 128);
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(haloCanvas),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            opacity: 0.9,
          }),
        );
        halo.scale.setScalar(2);
        haloRef.current = halo;
        group.add(halo);

        // ── typography, in the world ──────────────────────────────────────
        const headline = makeTextPlane(
          "Work is not a job title.\nIt is a composition.",
          1.35,
          {
            font: `600 62px Manrope, system-ui, sans-serif`,
            color: "#F6F2EC",
            letterSpacing: -1.6,
            align: "left",
          },
        );
        headline.mesh.position.set(-1.4, 0.3, -7.5);
        headline.material.opacity = 0;
        headlineRef.current = headline;
        scene.add(headline.mesh);

        const labelCount = b.tier === "mobile" ? 3 : 6;
        labelsRef.current = Array.from({ length: labelCount }, () => {
          const plane = makeTextPlane("—", 0.34, {
            font: `500 34px "JetBrains Mono", ui-monospace, monospace`,
            color: "#F2E7D8",
            letterSpacing: 1.6,
            uppercase: true,
            rule: true,
          });
          plane.material.opacity = 0;
          scene.add(plane.mesh);
          return { plane, el: null as El | null, offset: new THREE.Vector3() };
        });

        // ── the market beyond this one composition ────────────────────────
        const farCount = b.tier === "mobile" ? 260 : 900;
        const farPos = new Float32Array(farCount * 3);
        for (let i = 0; i < farCount; i += 1) {
          // three distant constellations, not a starfield
          const c = i % 3;
          const cx = [-34, 26, 6][c];
          const cy = [7, -6, 14][c];
          const cz = [-46, -58, -72][c];
          farPos[i * 3] = cx + (rand() - 0.5) * 16;
          farPos[i * 3 + 1] = cy + (rand() - 0.5) * 11;
          farPos[i * 3 + 2] = cz + (rand() - 0.5) * 14;
        }
        const far = new THREE.Points(
          new THREE.BufferGeometry().setAttribute(
            "position",
            new THREE.BufferAttribute(farPos, 3),
          ),
          new THREE.PointsMaterial({
            size: 0.42,
            color: 0xffd9b0,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
            toneMapped: false,
          }),
        );
        farRef.current = far;
        scene.add(far);

        camera.position.set(0, 1.4, 12);
        camera.lookAt(0, 0, 0);

        postRef.current = createPost(renderer, scene, camera, {
          bloom: b.bloom,
          bloomStrength: 0.2,
          bloomRadius: 0.34,
          bloomThreshold: 0.985,
          vignette: 1.05,
          grain: 0.05,
          lift: new THREE.Color(0x120c08),
          saturation: 1.04,
        });

        return () => {
          geos.dispose();
          mats.dispose();
          inlayGeo.dispose();
          inlayMat.dispose();
          humanTex.dispose();
          headline.dispose();
          labelsRef.current.forEach((l) => l.plane.dispose());
          postRef.current?.dispose();
        };
      },

      resize(stage) {
        postRef.current?.setSize(stage.size.w, stage.size.h, stage.size.dpr);
        const portrait = stage.size.w < stage.size.h;
        portraitRef.current = portrait;
        stage.camera.fov = portrait ? 46 : 34;
        stage.camera.updateProjectionMatrix();
      },

      frame(stage, dt, elapsed) {
        const els = elsRef.current;
        if (els.length === 0) return;
        const red = reducedRef.current;
        const t = storyT.current;

        // ── a need change re-plans every element's journey ────────────────
        if (appliedRef.current !== needRef.current) {
          appliedRef.current = needRef.current;
          const need = NEEDS[needRef.current];
          const places = layout(
            need,
            els.map((e) => e.role),
          );
          els.forEach((el, i) => {
            el.from.copy(el.mesh.position);
            el.fromQuat.copy(el.mesh.quaternion);
            el.fromScale = el.mesh.scale.x;
            el.target = places[i];
            const dest = places[i]?.position ?? el.park;
            // arc the path: a straight line between two points reads as a
            // teleport with extra steps
            el.ctrl
              .copy(el.from)
              .add(dest)
              .multiplyScalar(0.5)
              .add(
                new THREE.Vector3(
                  Math.sin(i * 2.1) * 2.6,
                  Math.cos(i * 1.7) * 2.2 + 1.2,
                  Math.sin(i * 1.3) * 2.6,
                ),
              );
            el.travel = 0;
            el.delay = (places[i]?.order ?? 0.9) * 0.6 + (i % 5) * 0.03;
          });
          energyRef.current = 0;

          // a spanning structure: every selected element reaches for its
          // nearest already-placed neighbour, and the first of each role
          // reaches for the core. Computed once per need, not per frame.
          const sel = els
            .map((e, i) => ({ e, i }))
            .filter((x) => x.e.target)
            .sort((a, b) => (a.e.target!.order ?? 0) - (b.e.target!.order ?? 0));
          const pairs: [number, number][] = [];
          for (let k = 0; k < sel.length; k += 1) {
            let best = -1;
            let bestD = Infinity;
            for (let j = 0; j < k; j += 1) {
              const d = sel[k].e.target!.position.distanceTo(sel[j].e.target!.position);
              if (d < bestD) {
                bestD = d;
                best = j;
              }
            }
            if (best >= 0 && bestD < 5.5) pairs.push([sel[k].i, sel[best].i]);
            else pairs.push([sel[k].i, -1]); // -1 = the core
          }
          linkPairsRef.current = pairs.slice(0, 96);
          // labels re-bind to whatever is actually in the new composition
          const selected = els.filter((e) => e.target);
          labelsRef.current.forEach((l, k) => {
            const pick = selected[Math.floor((k / labelsRef.current.length) * selected.length)];
            l.el = pick ?? null;
            l.offset.set(0, 0.95, 0);
            const text = need.labels[k % need.labels.length] ?? "";
            l.plane.dispose();
            const plane = makeTextPlane(text, 0.34, {
              font: `500 34px "JetBrains Mono", ui-monospace, monospace`,
              color: "#F4EADC",
              letterSpacing: 1.6,
              uppercase: true,
              rule: true,
            });
            plane.material.opacity = 0;
            stage.scene.add(plane.mesh);
            labelsRef.current[k] = { plane, el: l.el, offset: l.offset };
          });
        }

        // ── travel + settle ───────────────────────────────────────────────
        let arrived = 0;
        const tmp = new THREE.Vector3();
        for (let i = 0; i < els.length; i += 1) {
          const el = els[i];
          const dest = el.target?.position ?? el.park;
          const destScale = el.target ? el.target.scale : 0.001;

          if (el.travel < 1) {
            const step = red ? 1 : dt / TRAVEL_SECONDS;
            el.delay = Math.max(0, el.delay - dt);
            if (el.delay <= 0) el.travel = Math.min(1, el.travel + step);
          }
          const p = easeInOut(el.travel);
          // quadratic bezier: from → ctrl → dest
          const inv = 1 - p;
          tmp.set(0, 0, 0)
            .addScaledVector(el.from, inv * inv)
            .addScaledVector(el.ctrl, 2 * inv * p)
            .addScaledVector(dest, p * p);

          // once settled, breathe around the target rather than freezing
          if (el.travel >= 1 && !red) {
            const b = elapsed * 0.5 + el.phase;
            tmp.x += Math.sin(b) * 0.055;
            tmp.y += Math.cos(b * 0.83) * 0.07;
            tmp.z += Math.sin(b * 0.71) * 0.055;
          }
          el.mesh.position.copy(tmp);

          if (el.target) {
            el.mesh.quaternion.slerpQuaternions(el.fromQuat, el.target.quaternion, p);
            if (!red) {
              el.mesh.rotateX(Math.sin(elapsed * 0.22 + el.phase) * 0.05);
              el.mesh.rotateY(elapsed * el.spin.y * 0.35);
            }
          } else if (!red) {
            el.mesh.rotateX(el.spin.x * dt);
            el.mesh.rotateY(el.spin.y * dt);
          }

          const s = lerp(el.fromScale, destScale, easeOut(p));
          el.mesh.scale.setScalar(Math.max(0.0001, s));
          el.mesh.visible = s > 0.01;
          if (el.seam) {
            const m = el.seam.material as THREE.MeshBasicMaterial;
            m.opacity = 0.25 + 0.75 * el.travel * (0.6 + 0.4 * Math.sin(elapsed * 2.4 + el.phase));
          }
          if (el.target && el.travel >= 0.999) arrived += 1;
        }

        const links = linksRef.current;
        if (links) {
          const lp = links.geometry.getAttribute("position") as THREE.BufferAttribute;
          const lc = links.geometry.getAttribute("color") as THREE.BufferAttribute;
          const pairs = linkPairsRef.current;
          const origin = new THREE.Vector3(0, 0, 0);
          for (let k = 0; k < lp.count / 2; k += 1) {
            const pair = pairs[k];
            if (!pair) {
              lp.setXYZ(k * 2, 0, 0, 0);
              lp.setXYZ(k * 2 + 1, 0, 0, 0);
              lc.setXYZ(k * 2, 0, 0, 0);
              lc.setXYZ(k * 2 + 1, 0, 0, 0);
              continue;
            }
            const a = els[pair[0]];
            const bEl = pair[1] >= 0 ? els[pair[1]] : null;
            const pa = a.mesh.position;
            const pb = bEl ? bEl.mesh.position : origin;
            lp.setXYZ(k * 2, pa.x, pa.y, pa.z);
            lp.setXYZ(k * 2 + 1, pb.x, pb.y, pb.z);
            // a link only exists once both ends have arrived
            const w = Math.min(a.travel, bEl ? bEl.travel : 1);
            const g = Math.pow(Math.max(0, w - 0.55) / 0.45, 1.5) * 0.42;
            lc.setXYZ(k * 2, g * 1.0, g * 0.74, g * 0.46);
            lc.setXYZ(k * 2 + 1, g * 0.5, g * 0.4, g * 0.3);
          }
          lp.needsUpdate = true;
          lc.needsUpdate = true;
        }

        const selectedCount = els.filter((e) => e.target).length || 1;
        const settled = arrived / selectedCount;
        energyRef.current = lerp(energyRef.current, settled, red ? 1 : Math.min(1, dt * 2.4));
        const rounded = Math.round(settled * 20) / 20;
        if (rounded !== reportedRef.current) {
          reportedRef.current = rounded;
          onSettledRef.current(rounded);
        }

        // ── the core answers the structure ────────────────────────────────
        const core = coreRef.current;
        const halo = haloRef.current;
        const need = NEEDS[needRef.current];
        if (core) {
          const m = core.material as THREE.MeshBasicMaterial;
          m.color.set(need.core);
          const pulse = red ? 1 : 0.92 + Math.sin(elapsed * 1.6) * 0.08;
          core.scale.setScalar((0.3 + energyRef.current * 0.6) * pulse);
          m.opacity = 0.25 + energyRef.current * 0.75;
        }
        if (halo) {
          const m = halo.material as THREE.SpriteMaterial;
          m.color.set(need.core);
          halo.scale.setScalar(1.5 + energyRef.current * 2.1);
          m.opacity = 0.10 + energyRef.current * 0.26;
        }

        // ── labels ────────────────────────────────────────────────────────
        const camPos = stage.camera.position;
        labelsRef.current.forEach((l) => {
          const vis = l.el && l.el.travel > 0.85 ? 1 : 0;
          const m = l.plane.material;
          m.opacity = lerp(m.opacity, vis * (0.35 + energyRef.current * 0.6), Math.min(1, dt * 3));
          if (l.el) {
            l.plane.mesh.position.copy(l.el.mesh.position).add(l.offset);
            l.plane.mesh.lookAt(camPos);
          }
          l.plane.mesh.visible = m.opacity > 0.02;
        });

        // ── camera: one continuous move from survey to intimacy and back ──
        const cam = stage.camera;
        // beats: 0 wide cloud · .25 push in · .55 orbit · .8 pull back to market
        const push = easeInOut(span(t, 0.02, 0.42));
        const pull = easeInOut(span(t, 0.72, 1.0));
        // A portrait viewport crops horizontally, so the same radius that
        // frames the structure on a laptop pushes it off both sides of a
        // phone. Distance, not a smaller structure, is the fix.
        const portrait = portraitRef.current;
        const pullBack = portrait ? 1.85 : 1;
        const radius = lerp(lerp(15.5, 9.6, push), 26, pull) * pullBack;
        const height = lerp(lerp(3.2, 1.2, push), 6.2, pull) * (portrait ? 1.4 : 1);
        const orbit =
          (red ? 0 : elapsed * 0.045) + span(t, 0.4, 0.85) * 1.15 + stage.pointer.x * 0.16;
        const target = new THREE.Vector3(
          Math.sin(orbit) * radius,
          height + stage.pointer.y * 0.9,
          Math.cos(orbit) * radius,
        );
        cam.position.lerp(target, red ? 1 : Math.min(1, dt * 1.9));
        // aim BELOW the structure in portrait, which lifts it into the top of
        // the frame and leaves the bottom to the type
        cam.lookAt(0, lerp(portrait ? -4.2 : 0, -1.2, pull), lerp(0, -8, pull));

        // headline lives in the world and is revealed by the opening move
        const headline = headlineRef.current;
        if (headline) {
          headline.material.opacity = lerp(
            headline.material.opacity,
            1 - span(t, 0.16, 0.32),
            Math.min(1, dt * 3),
          );
          // sit the headline between the camera and the structure, so the
          // forms genuinely pass in front of and behind the words
          headline.mesh.position
            .copy(cam.position)
            .lerp(new THREE.Vector3(0, 0.6, 0), 0.42);
          headline.mesh.lookAt(camPos);
          headline.mesh.visible = headline.material.opacity > 0.02;
        }

        const far = farRef.current;
        if (far) {
          const m = far.material as THREE.PointsMaterial;
          m.opacity = lerp(m.opacity, span(t, 0.74, 0.96) * 0.85, Math.min(1, dt * 2));
          far.rotation.y = elapsed * 0.008;
        }
      },

      renderFrame(stage) {
        const post = postRef.current;
        if (post) post.composer.render();
        else stage.renderer.render(stage.scene, stage.camera);
      },
    },
    {
      clearColor: "#07070A",
      fov: 34,
      maxDpr: budget.dpr,
    },
  );

  return <div ref={hostRef} className="h-full w-full" />;
}
