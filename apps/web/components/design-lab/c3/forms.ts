import * as THREE from "three";
import type { Role } from "./assembly-model";

/**
 * C3 — the material identity of the world.
 *
 * Four materials, four silhouettes, and the difference between them has to be
 * readable in a single frame without a legend:
 *
 *   person → a warm refractive LENS. Actual transmission, so it bends what is
 *            behind it and picks up the environment. A faint human silhouette
 *            sits inside it: capability is somebody, not something.
 *   team   → a satin MEMBRANE. An open shell, thin and double-sided, so a team
 *            reads as something that shelters rather than something that sits.
 *   agent  → a dark polished BLADE with one live emissive seam. Precise, cold,
 *            obviously manufactured — and obviously not a person.
 *   org    → a smoked glass PLATE. Large, quiet, load-bearing.
 *
 * No boxes. Nothing that could be mistaken for a brick.
 */

function noiseDisplace(geo: THREE.BufferGeometry, amp: number, freq: number, seed = 1) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * freq + seed) * Math.cos(v.y * freq * 1.3 + seed * 1.7) +
      Math.sin(v.z * freq * 0.8 + seed * 2.3) * 0.6;
    const s = 1 + n * amp;
    pos.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export type FormGeometries = {
  readonly person: THREE.BufferGeometry;
  readonly team: THREE.BufferGeometry;
  readonly agent: THREE.BufferGeometry;
  readonly agentSeam: THREE.BufferGeometry;
  readonly org: THREE.BufferGeometry;
  dispose(): void;
};

export function buildGeometries(detail: number): FormGeometries {
  // person — a soft asymmetric lens. Deliberately built on a SPHERE rather
  // than an icosahedron: icosahedron geometry is non-indexed, so recomputed
  // normals come out flat and the form reads as a cut gem — a different,
  // colder object than the one this concept wants.
  const person = noiseDisplace(
    new THREE.SphereGeometry(0.52, detail >= 2 ? 64 : 32, detail >= 2 ? 44 : 22),
    0.08,
    2.4,
    3,
  );
  person.scale(1.2, 0.84, 1.0);

  // team — an open shell segment
  const team = new THREE.SphereGeometry(
    0.95,
    detail >= 2 ? 48 : 28,
    detail >= 2 ? 28 : 16,
    -1.15,
    2.3,
    0.42,
    1.05,
  );

  // agent — a slender blade: an octahedron squeezed into a shard
  const agent = new THREE.OctahedronGeometry(0.62, 1);
  agent.scale(0.2, 1.25, 0.42);

  // its seam — a thin emissive sliver that bloom will pick up
  const agentSeam = new THREE.PlaneGeometry(0.055, 1.3);

  // org — a wide, very thin disc
  const org = new THREE.CylinderGeometry(1.55, 1.55, 0.05, detail >= 2 ? 64 : 32, 1);

  return {
    person,
    team,
    agent,
    agentSeam,
    org,
    dispose() {
      person.dispose();
      team.dispose();
      agent.dispose();
      agentSeam.dispose();
      org.dispose();
    },
  };
}

export type FormMaterials = {
  readonly person: THREE.MeshPhysicalMaterial;
  readonly personLite: THREE.MeshPhysicalMaterial;
  readonly team: THREE.MeshPhysicalMaterial;
  readonly agent: THREE.MeshPhysicalMaterial;
  readonly seam: THREE.MeshBasicMaterial;
  readonly org: THREE.MeshPhysicalMaterial;
  readonly orgLite: THREE.MeshPhysicalMaterial;
  readonly core: THREE.MeshBasicMaterial;
  byRole(role: Role, refractive: boolean): THREE.Material;
  dispose(): void;
};

export function buildMaterials(humanTexture: THREE.Texture | null): FormMaterials {
  const person = new THREE.MeshPhysicalMaterial({
    color: 0xffe6c6,
    metalness: 0,
    roughness: 0.09,
    transmission: 0.92,
    thickness: 1.15,
    ior: 1.46,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    attenuationColor: new THREE.Color(0xd7975a),
    attenuationDistance: 2.4,
    emissive: new THREE.Color(0xffb877),
    emissiveIntensity: humanTexture ? 0.5 : 0,
    emissiveMap: humanTexture,
    transparent: false,
  });

  // the same read without the transmission bill — used past the refractive
  // budget and on phones, where a transmission pass is not affordable
  const personLite = new THREE.MeshPhysicalMaterial({
    color: 0xf0d2ab,
    metalness: 0.08,
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.6,
    emissive: new THREE.Color(0xffb877),
    emissiveIntensity: humanTexture ? 0.42 : 0,
    emissiveMap: humanTexture,
  });

  const team = new THREE.MeshPhysicalMaterial({
    color: 0xc9c5bc,
    metalness: 0.04,
    roughness: 0.36,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    sheen: 1,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.4,
  });

  const agent = new THREE.MeshPhysicalMaterial({
    color: 0x232833,
    metalness: 1,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });

  const seam = new THREE.MeshBasicMaterial({
    color: 0xa9d8f5,
    transparent: true,
    opacity: 0.92,
    toneMapped: false,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const org = new THREE.MeshPhysicalMaterial({
    color: 0x9fb0c4,
    metalness: 0.15,
    roughness: 0.14,
    transmission: 0.55,
    thickness: 0.35,
    ior: 1.4,
    transparent: false,
    attenuationColor: new THREE.Color(0x3d5470),
    attenuationDistance: 1.4,
  });

  // the same plate without the transmission bill
  const orgLite = new THREE.MeshPhysicalMaterial({
    color: 0x4b5b70,
    metalness: 0.4,
    roughness: 0.42,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
  });

  const core = new THREE.MeshBasicMaterial({
    color: 0xffc98a,
    toneMapped: false,
    transparent: true,
    opacity: 0.9,
  });

  return {
    person,
    personLite,
    team,
    agent,
    seam,
    org,
    orgLite,
    core,
    byRole(role, refractive) {
      if (role === "person") return refractive ? person : personLite;
      if (role === "team") return team;
      if (role === "agent") return agent;
      return refractive ? org : orgLite;
    },
    dispose() {
      [person, personLite, team, agent, seam, org, orgLite, core].forEach((m) => m.dispose());
    },
  };
}

/**
 * A small procedural studio, rendered once through PMREM.
 *
 * This is what makes glass look like glass: reflections need something to
 * reflect. Building the softboxes in code keeps the concept self-contained —
 * no HDRI is downloaded and no environment asset licence is added.
 */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(30, 30, 30),
    new THREE.MeshBasicMaterial({ color: 0x0b0c10, side: THREE.BackSide }),
  );
  env.add(box);

  const softbox = (
    w: number,
    h: number,
    color: number,
    intensity: number,
    pos: [number, number, number],
    look: [number, number, number] = [0, 0, 0],
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }),
    );
    m.position.set(...pos);
    m.lookAt(new THREE.Vector3(...look));
    env.add(m);
    return m;
  };

  // key: large, warm, high and to the right
  softbox(16, 10, 0xfff0dc, 6.5, [9, 8, 6]);
  // rim: cool, behind and left, narrow
  softbox(4, 14, 0xcfe4ff, 5.0, [-10, 2, -7]);
  // fill: broad, dim, low front
  softbox(20, 8, 0xffffff, 1.1, [0, -6, 10]);
  // top bounce
  softbox(14, 14, 0xfff6ea, 1.6, [0, 12, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material)?.dispose();
  });
  return target.texture;
}
