"use client";

import { useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useThreeStage, type Stage } from "../use-three-stage";
import { POPULATION, TASKS, type Role, type Task } from "./composition-model";

/**
 * CONCEPT C — the composition, in a studio.
 *
 * Every element is a real object under real light: a machined slab with its
 * own material. People are warm anodised metal, teams are satin ceramic, AI
 * agents are dark polished graphite — three materials, so the MIX of a
 * composition is legible at a glance without a single label.
 *
 * The lighting is a procedural room environment (three's RoomEnvironment, run
 * through PMREM). That matters practically: the scene gets real image-based
 * reflections with NO downloaded HDRI, so the whole concept stays
 * self-contained and adds no external asset licence.
 */

type Element = {
  readonly mesh: THREE.Mesh;
  readonly role: Role;
  readonly idle: THREE.Vector3;
  readonly idleRot: THREE.Euler;
  target: THREE.Vector3;
  targetRot: THREE.Quaternion;
  targetScale: number;
  vel: THREE.Vector3;
  seed: number;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Deterministic layout noise — the studio must look identical every load. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which elements a task asks for, and where each of them goes. */
function assign(task: Task, elements: readonly Element[]) {
  const left: Record<Role, number> = { ...task.quota };
  const chosen: Element[] = [];
  for (const el of elements) {
    if (left[el.role] > 0) {
      left[el.role] -= 1;
      chosen.push(el);
    }
  }
  const n = chosen.length;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  chosen.forEach((el, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5;
    switch (task.formation) {
      case "wall": {
        // a facade section: courses of slabs, offset like brickwork
        const perRow = 4;
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const rows = Math.ceil(n / perRow);
        // Seen face-on this reads as a shelf, so the whole course is yawed:
        // a facade in perspective, which is how anyone actually sees one.
        const yaw = 0.46;
        const lx = (col - (perRow - 1) / 2) * 1.66 + (row % 2 ? 0.4 : -0.4);
        const lz = (row - (rows - 1) / 2) * -0.5 + Math.sin(i * 2.4) * 0.16;
        el.target.set(
          lx * Math.cos(yaw) + lz * Math.sin(yaw),
          (row - (rows - 1) / 2) * 0.6,
          -lx * Math.sin(yaw) + lz * Math.cos(yaw),
        );
        e.set(-0.13, yaw, 0);
        break;
      }
      case "arc": {
        // a cohort, turned toward one centre
        const a = (t - 0.5) * Math.PI * 1.05;
        const r = 4.6;
        el.target.set(
          Math.sin(a) * r,
          (i % 3) * 0.5 - 0.5,
          Math.cos(a) * r - r * 0.72,
        );
        e.set(0, -a, 0);
        break;
      }
      case "helix": {
        // a delivery: one continuous thread, humans and agents interleaved
        const turns = 1.85;
        const a = t * Math.PI * 2 * turns;
        const r = 2.5;
        el.target.set(Math.cos(a) * r, (t - 0.5) * 4.6, Math.sin(a) * r);
        e.set(0, -a + Math.PI / 2, 0.12);
        break;
      }
      case "ring":
      default: {
        const a = t * Math.PI * 2 * ((n - 1) / n);
        const r = 2.5;
        el.target.set(Math.cos(a) * r, Math.sin(i * 1.7) * 0.22, Math.sin(a) * r);
        e.set(0, -a, 0);
        break;
      }
    }
    q.setFromEuler(e);
    el.targetRot.copy(q);
    el.targetScale = 1;
  });

  // everything the composition did not ask for drifts back and stands down
  const chosenSet = new Set(chosen);
  for (const el of elements) {
    if (chosenSet.has(el)) continue;
    el.target.copy(el.idle).multiplyScalar(1.35);
    el.targetRot.setFromEuler(el.idleRot);
    el.targetScale = 0.001;
  }
}

export function CompositionCanvas({
  taskIndex,
  reduced,
  quality,
}: {
  readonly taskIndex: number;
  readonly reduced: boolean;
  readonly quality: "mobile" | "laptop" | "desktop";
}) {
  const taskRef = useRef(taskIndex);
  taskRef.current = taskIndex;
  const appliedRef = useRef(-1);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const elementsRef = useRef<Element[]>([]);
  const groupRef = useRef<THREE.Group | null>(null);
  // portrait re-frames rather than shrinks: the object takes the top of the
  // screen and the type takes the bottom, instead of the two fighting for the
  // same middle.
  const portraitRef = useRef(false);

  const hostRef = useThreeStage(
    {
      setup(stage: Stage) {
        const { scene, renderer } = stage;

        // ── the studio: a seamless cyclorama, painted once ──────────────
        const bg = document.createElement("canvas");
        bg.width = 4;
        bg.height = 256;
        const bx = bg.getContext("2d")!;
        const grad = bx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, "#F3F1ED");
        grad.addColorStop(0.55, "#E7E4DE");
        grad.addColorStop(1, "#CFCBC3");
        bx.fillStyle = grad;
        bx.fillRect(0, 0, 4, 256);
        const bgTex = new THREE.CanvasTexture(bg);
        bgTex.colorSpace = THREE.SRGBColorSpace;
        scene.background = bgTex;

        // ── real image-based lighting, with no downloaded asset ─────────
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = pmrem.fromScene(new RoomEnvironment(), 0.06);
        scene.environment = room.texture;

        const key = new THREE.DirectionalLight(0xffffff, 2.6);
        key.position.set(5.5, 9, 6);
        key.castShadow = quality !== "mobile";
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 1;
        key.shadow.camera.far = 40;
        key.shadow.camera.left = -12;
        key.shadow.camera.right = 12;
        key.shadow.camera.top = 12;
        key.shadow.camera.bottom = -12;
        key.shadow.bias = -0.0012;
        key.shadow.radius = 4;
        scene.add(key);
        // rim: the separation light. Without it a pale slab on a pale ground
        // has no silhouette and the whole studio reads flat.
        const rim = new THREE.DirectionalLight(0xffffff, 1.5);
        rim.position.set(-7, 3.5, -6.5);
        scene.add(rim);
        scene.add(new THREE.AmbientLight(0xffffff, 0.28));

        renderer.shadowMap.enabled = quality !== "mobile";
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(80, 80),
          new THREE.ShadowMaterial({ opacity: 0.16 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -3.0;
        floor.receiveShadow = true;
        scene.add(floor);

        // ── the elements ────────────────────────────────────────────────
        const geo = new RoundedBoxGeometry(1.52, 0.2, 0.96, 4, 0.055);
        const materials: Record<Role, THREE.Material> = {
          person: new THREE.MeshPhysicalMaterial({
            color: 0xc9a882,
            metalness: 0.92,
            roughness: 0.34,
          }),
          team: new THREE.MeshPhysicalMaterial({
            color: 0xe9e6df,
            metalness: 0.06,
            roughness: 0.36,
            clearcoat: 0.5,
            clearcoatRoughness: 0.3,
          }),
          agent: new THREE.MeshPhysicalMaterial({
            color: 0x22242a,
            metalness: 0.55,
            roughness: 0.12,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
          }),
        };

        const group = new THREE.Group();
        groupRef.current = group;
        scene.add(group);

        const rand = rng(20260827);
        const elements: Element[] = POPULATION.map((role) => {
          const mesh = new THREE.Mesh(geo, materials[role]);
          mesh.castShadow = quality !== "mobile";
          mesh.receiveShadow = quality !== "mobile";
          const a = rand() * Math.PI * 2;
          const r = 3.4 + rand() * 4.2;
          const idle = new THREE.Vector3(
            Math.cos(a) * r,
            (rand() - 0.5) * 5.4,
            Math.sin(a) * r * 0.7,
          );
          const idleRot = new THREE.Euler(
            (rand() - 0.5) * 0.5,
            rand() * Math.PI * 2,
            (rand() - 0.5) * 0.35,
          );
          mesh.position.copy(idle);
          mesh.setRotationFromEuler(idleRot);
          group.add(mesh);
          return {
            mesh,
            role,
            idle,
            idleRot,
            target: idle.clone(),
            targetRot: new THREE.Quaternion().setFromEuler(idleRot),
            targetScale: 1,
            vel: new THREE.Vector3(),
            seed: rand(),
          } satisfies Element;
        });
        elementsRef.current = elements;

        stage.camera.position.set(0.4, 1.1, 12.4);
        stage.camera.lookAt(0, 0, 0);

        return () => {
          geo.dispose();
          Object.values(materials).forEach((m) => m.dispose());
          bgTex.dispose();
          room.texture.dispose();
          pmrem.dispose();
        };
      },

      resize(stage) {
        const portrait = stage.size.w < 760;
        portraitRef.current = portrait;
        stage.camera.fov = portrait ? 44 : 36;
        stage.camera.updateProjectionMatrix();
        const g = groupRef.current;
        if (g) g.scale.setScalar(portrait ? 0.7 : 1);
      },

      frame(stage, dt, elapsed) {
        const els = elementsRef.current;
        if (els.length === 0) return;
        const red = reducedRef.current;

        if (appliedRef.current !== taskRef.current) {
          appliedRef.current = taskRef.current;
          assign(TASKS[taskRef.current], els);
        }

        // critically-damped-ish spring, staggered so the composition
        // ASSEMBLES rather than teleporting
        for (let i = 0; i < els.length; i += 1) {
          const el = els[i];
          const stagger = 1 - (i / els.length) * 0.45;
          const k = red ? 1 : Math.min(1, dt * 3.1 * stagger);
          el.mesh.position.lerp(el.target, k);
          el.mesh.quaternion.slerp(el.targetRot, k);
          const s = lerp(el.mesh.scale.x, el.targetScale, k);
          el.mesh.scale.setScalar(s);
          el.mesh.visible = s > 0.02;
        }

        // the whole composition breathes and turns, very slowly
        const g = groupRef.current;
        if (g) {
          const spin = red ? 0 : elapsed * 0.055;
          g.rotation.y = spin + stage.pointer.x * 0.22;
          g.rotation.x = stage.pointer.y * -0.1;
            g.position.y = red ? 0 : Math.sin(elapsed * 0.42) * 0.09;
        }

        const cam = stage.camera;
        const portrait = portraitRef.current;
        const target = new THREE.Vector3(
          (portrait ? 0 : 0.4) + (red ? 0 : stage.pointer.x * 0.5),
          (portrait ? 1.5 : 1.1) + (red ? 0 : stage.pointer.y * 0.4),
          portrait ? 12.0 : 12.4,
        );
        cam.position.lerp(target, red ? 1 : Math.min(1, dt * 2));
        cam.lookAt(0, 0.2, 0);
      },
    },
    {
      clearColor: "#E7E4DE",
      fov: 36,
      maxDpr: quality === "mobile" ? 1.5 : 2,
      toneMapping: THREE.ACESFilmicToneMapping,
      exposure: 1.05,
    },
  );

  return <div ref={hostRef} className="h-full w-full" />;
}
