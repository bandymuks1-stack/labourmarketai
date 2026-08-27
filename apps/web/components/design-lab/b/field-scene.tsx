"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useThreeStage, type Stage } from "../use-three-stage";
import { ANCHORS, buildGeoTexture } from "./geo-texture";
import {
  createFieldMaterial,
  createFieldUniforms,
  demandAtWorld,
  FIELD_DEPTH,
  FIELD_WIDTH,
  MAX_CENTERS,
  MESH_SCALE,
  uvToWorld,
  type FieldUniforms,
} from "./field-material";

export type FieldMode = "person" | "organisation";
export type PlacedNeed = { x: number; z: number } | null;

type Fil = {
  hx: number;
  hz: number;
  x: number;
  z: number;
  jitter: number;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function FieldCanvas({
  mode,
  phaseRef,
  reduced,
  quality,
  onPlace,
  needRef,
}: {
  readonly mode: FieldMode;
  readonly phaseRef: { current: number };
  readonly reduced: boolean;
  readonly quality: "mobile" | "laptop" | "desktop";
  readonly onPlace: (p: { x: number; z: number }) => void;
  readonly needRef: { current: PlacedNeed };
}) {
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  const uniforms = useRef<FieldUniforms>(createFieldUniforms());
  const needStrength = useRef(0);
  const filsRef = useRef<Fil[]>([]);
  const landAt = useRef<((x: number, z: number) => number) | null>(null);
  const linesRef = useRef<THREE.LineSegments | null>(null);

  const hostRef = useThreeStage(
    {
      setup(stage: Stage) {
        const u = uniforms.current;

        // ── the ground truth: real coastline, rasterised once ───────────
        const geo = buildGeoTexture();
        const tex = new THREE.CanvasTexture(geo.canvas);
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        u.uTex.value = tex;

        ANCHORS.slice(0, MAX_CENTERS).forEach((a, i) => {
          const [uu, vv] = geo.uvOf(a.lng, a.lat);
          const [x, z] = uvToWorld(uu, vv);
          u.uCenters.value[i].set(x, z, 3.4 + a.weight * 3.0, a.weight);
        });

        const ctx = geo.canvas.getContext("2d")!;
        const { width, height } = geo.canvas;
        const data = ctx.getImageData(0, 0, width, height).data;
        landAt.current = (x, z) => {
          const uu = x / FIELD_WIDTH + 0.5;
          const vv = -z / FIELD_DEPTH + 0.5;
          if (uu < 0 || uu > 1 || vv < 0 || vv > 1) return 0;
          const px = Math.min(width - 1, Math.max(0, Math.round(uu * width)));
          // flipY on the GPU side, so the CPU row index inverts to match
          const py = Math.min(
            height - 1,
            Math.max(0, Math.round((1 - vv) * height)),
          );
          return data[(py * width + px) * 4] / 255;
        };

        // ── the field ───────────────────────────────────────────────────
        const segX = quality === "mobile" ? 170 : quality === "laptop" ? 260 : 360;
        const segZ = Math.round(segX * (FIELD_DEPTH / FIELD_WIDTH));
        const plane = new THREE.PlaneGeometry(
          FIELD_WIDTH * MESH_SCALE,
          FIELD_DEPTH * MESH_SCALE,
          segX,
          segZ,
        );
        const mesh = new THREE.Mesh(plane, createFieldMaterial(u));
        mesh.rotation.x = -Math.PI / 2;
        stage.scene.add(mesh);

        // ── people, standing on it ──────────────────────────────────────
        const count = quality === "mobile" ? 80 : quality === "laptop" ? 140 : 190;
        const fils: Fil[] = [];
        let seed = 1337;
        const rand = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        let guard = 0;
        while (fils.length < count && guard < count * 400) {
          guard += 1;
          const x = (rand() - 0.5) * FIELD_WIDTH * 0.9;
          const z = (rand() - 0.5) * FIELD_DEPTH * 0.9;
          if ((landAt.current?.(x, z) ?? 0) < 0.6) continue;
          const d = demandAtWorld(
            x,
            z,
            u.uCenters.value,
            new THREE.Vector4(0, 0, 1, 0),
          );
          // people are where the market is — but never only there
          if (rand() > 0.22 + Math.min(0.78, d * 0.85)) continue;
          fils.push({ hx: x, hz: z, x, z, jitter: rand() });
        }
        filsRef.current = fils;

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(fils.length * 6), 3),
        );
        lineGeo.setAttribute(
          "color",
          new THREE.BufferAttribute(new Float32Array(fils.length * 6), 3),
        );
        const lines = new THREE.LineSegments(
          lineGeo,
          new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        linesRef.current = lines;
        stage.scene.add(lines);

        // ── placing a need: raycast the flat map plane ──────────────────
        const ray = new THREE.Raycaster();
        const flat = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const hit = new THREE.Vector3();
        const ndc = new THREE.Vector2();
        const el = stage.renderer.domElement;
        let lastPlace = 0;
        const onDown = (e: PointerEvent | MouseEvent) => {
          const now = performance.now();
          if (now - lastPlace < 250) return;
          lastPlace = now;
          const rect = el.getBoundingClientRect();
          ndc.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -(((e.clientY - rect.top) / rect.height) * 2 - 1),
          );
          ray.setFromCamera(ndc, stage.camera);
          if (ray.ray.intersectPlane(flat, hit)) {
            onPlaceRef.current({ x: hit.x, z: hit.z });
          }
        };
        el.style.cursor = "crosshair";
        // both, deliberately: synthetic input (automation, some assistive
        // tech) does not always deliver a pointerdown, and a dropped click on
        // the one interaction this concept has is not an acceptable failure.
        el.addEventListener("pointerdown", onDown);
        el.addEventListener("click", onDown as EventListener);

        return () => {
          el.removeEventListener("pointerdown", onDown);
          el.removeEventListener("click", onDown as EventListener);
          tex.dispose();
        };
      },

      resize(stage) {
        // a portrait viewport crops the horizontal field of view, which turns
        // a survey into a keyhole. Widen the lens instead of moving the camera.
        stage.camera.fov = stage.size.w < 760 ? 46 : 32;
        stage.camera.updateProjectionMatrix();
      },

      frame(stage, dt, elapsed) {
        const u = uniforms.current;
        const red = reducedRef.current;
        u.uTime.value = elapsed;
        u.uReveal.value = red
          ? 1
          : Math.min(1, Math.pow(Math.min(1, elapsed / 1.9), 0.75));
        u.uMode.value = lerp(
          u.uMode.value,
          modeRef.current === "organisation" ? 0.22 : 0,
          Math.min(1, dt * 3),
        );

        const need = needRef.current;
        if (need) {
          needStrength.current = lerp(
            needStrength.current,
            1.2,
            Math.min(1, dt * 2.2),
          );
          u.uNeed.value.set(need.x, need.z, 6.5, needStrength.current);
        } else {
          needStrength.current = lerp(needStrength.current, 0, Math.min(1, dt * 4));
          u.uNeed.value.w = needStrength.current;
        }

        // ── camera: one continuous descent, survey to ground ───────────
        const p = Math.min(1, Math.max(0, phaseRef.current));
        const cam = stage.camera;
        // Portrait is a steeper, closer pass over the same field, not the same
        // shot cropped: a phone screen has no room for an empty upper half.
        const portrait = stage.size.w < 760;
        const tx = lerp(0, 3, p) + (red ? 0 : stage.pointer.x * lerp(3.4, 1.4, p));
        const ty =
          (portrait ? lerp(21, 9, p) : lerp(25, 10, p)) +
          (red ? 0 : stage.pointer.y * lerp(2.6, 1.0, p));
        const tz = portrait ? lerp(44, 24, p) : lerp(60, 28, p);
        const k = red ? 1 : Math.min(1, dt * 2.4);
        cam.position.x = lerp(cam.position.x, tx, k);
        cam.position.y = lerp(cam.position.y, ty, k);
        cam.position.z = lerp(cam.position.z, tz, k);
        cam.lookAt(
          0,
          portrait ? lerp(-9, -2, p) : lerp(1.0, 2.4, p),
          portrait ? lerp(-16, -16, p) : lerp(-16, -18, p),
        );

        u.uFogStart.value = lerp(42, 22, p);
        u.uFogK.value = lerp(0.030, 0.034, p);
        u.uIso.value = lerp(0.55, 0.34, p);

        // ── filaments ──────────────────────────────────────────────────
        const lines = linesRef.current;
        const fils = filsRef.current;
        if (!lines || fils.length === 0) return;
        const pos = lines.geometry.getAttribute("position") as THREE.BufferAttribute;
        const col = lines.geometry.getAttribute("color") as THREE.BufferAttribute;
        const sampler = landAt.current;
        const pull = modeRef.current === "organisation" ? 0.6 : 0.3;
        const bright = modeRef.current === "organisation" ? 0.9 : 0.55;
        const move = red ? 1 : Math.min(1, dt * 2.0);

        for (let i = 0; i < fils.length; i += 1) {
          const f = fils[i];
          let txx = f.hx;
          let tzz = f.hz;
          if (need) {
            const d = Math.hypot(f.hx - need.x, f.hz - need.z);
            const kk = d < 26 ? Math.pow(1 - d / 26, 1.4) * pull : 0;
            txx = lerp(f.hx, need.x, kk);
            tzz = lerp(f.hz, need.z, kk);
          }
          f.x += (txx - f.x) * move;
          f.z += (tzz - f.z) * move;

          const land = sampler ? sampler(f.x, f.z) : 1;
          const dem = demandAtWorld(f.x, f.z, u.uCenters.value, u.uNeed.value);
          const base =
            (land * u.uLandH.value +
              dem *
                u.uDemandH.value *
                Math.min(1, Math.max(0, (land - 0.15) / 0.6))) *
            u.uReveal.value;
          const sway = red ? 0 : Math.sin(elapsed * 0.6 + f.jitter * 11) * 0.08;
          const height = (0.35 + f.jitter * 0.55 + dem * 0.95) * u.uReveal.value;

          pos.setXYZ(i * 2, f.x, base, f.z);
          pos.setXYZ(i * 2 + 1, f.x + sway, base + height, f.z);

          const near = need
            ? Math.max(0, 1 - Math.hypot(f.x - need.x, f.z - need.z) / 26)
            : 0;
          col.setXYZ(
            i * 2,
            (0.4 + near * 0.75) * bright,
            (0.6 + near * 0.34) * bright,
            (0.88 + near * 0.1) * bright,
          );
          col.setXYZ(i * 2 + 1, 0, 0, 0);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
      },
    },
    { clearColor: "#06070A", fov: 32, maxDpr: quality === "mobile" ? 1.5 : 2 },
  );

  return <div ref={hostRef} className="h-full w-full" />;
}
