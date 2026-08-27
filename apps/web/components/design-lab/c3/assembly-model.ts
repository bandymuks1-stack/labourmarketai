import * as THREE from "three";

/**
 * C3 — "THE ASSEMBLY".
 *
 * Round 1 said the right thing with the wrong objects: a composition made of
 * rectangular blocks reads as a block diagram, and a block diagram is exactly
 * what this product must not look like. The idea survives; the material does
 * not.
 *
 * Here a capability is a FORM with a material identity — warm refractive glass
 * for a person, a satin membrane for a team, a dark polished blade with a live
 * seam for an AI agent, a smoked glass plate for an organisation — and a need
 * does not stack them, it GROWS a structure out of them.
 *
 * Nothing on this surface is a claim about real staffing. These are visual
 * storytelling states, as the brief says, and the page says so too.
 */

export type Role = "person" | "team" | "agent" | "org";

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  person: "People",
  team: "Teams",
  agent: "AI agents",
  org: "Organisations",
};

export type Formation = "helix" | "orbital" | "amphitheatre" | "seed";

export type Need = {
  readonly id: string;
  readonly chip: string;
  readonly headline: string;
  readonly body: string;
  /** capability labels that attach to forms once the structure settles */
  readonly labels: readonly string[];
  readonly quota: Readonly<Record<Role, number>>;
  readonly formation: Formation;
  /** the light the structure gives off when it completes */
  readonly core: THREE.ColorRepresentation;
};

export const NEEDS: readonly Need[] = [
  {
    id: "housing",
    chip: "Build sustainable housing",
    headline: "A need does not fill a vacancy. It grows a structure.",
    body: "Architecture, site management, energy expertise, a training partner and one supervised planning agent. They are not a list — they hold each other up, and the shape is the proof.",
    labels: [
      "Architecture",
      "Site management",
      "Energy modelling",
      "Procurement",
      "Training partner",
      "Planning agent",
    ],
    quota: { person: 15, team: 6, agent: 3, org: 5 },
    formation: "helix",
    core: 0xffc98a,
  },
  {
    id: "logistics",
    chip: "Launch AI logistics",
    headline: "Change the need and the same market reorganises.",
    body: "The people do not disappear — fewer of them are called, agents move to the centre, and the organisations that were structural become orbital. The composition is the answer, not the roster.",
    labels: [
      "Operations",
      "Routing agent",
      "Fleet data",
      "Compliance",
      "Warehouse crew",
      "Forecasting agent",
    ],
    quota: { person: 9, team: 4, agent: 10, org: 4 },
    formation: "orbital",
    core: 0x9fd8ff,
  },
  {
    id: "programme",
    chip: "Open a training programme",
    headline: "Education is not a separate product. It is the same field.",
    body: "An institution, its teachers, the learners' own practice, and the evidence each of them leaves. The same elements as any other need, arranged so that people can arrive without experience and leave with a record.",
    labels: [
      "Institution",
      "Teaching",
      "Practice placement",
      "Assessment",
      "Learner cohort",
      "Evidence review",
    ],
    quota: { person: 14, team: 8, agent: 3, org: 3 },
    formation: "amphitheatre",
    core: 0xffe2b0,
  },
  {
    id: "company",
    chip: "Start a company",
    headline: "Sometimes the whole structure is four people and a reason.",
    body: "Small does not mean weak. It means every element is load-bearing — and the market can see that, because each one arrives with a record instead of a description.",
    labels: ["Founding work", "Delivery", "First client", "Support agent"],
    quota: { person: 5, team: 2, agent: 2, org: 1 },
    formation: "seed",
    core: 0xffd39a,
  },
];

/**
 * The population, built to a budget.
 *
 * Roles are permanent per element, so a need visibly RE-SELECTS rather than
 * re-labels. The mix is expressed as PROPORTIONS: slicing a fixed list to fit
 * a smaller device silently deleted every organisation from the world, which
 * is the kind of bug that looks like an art-direction problem.
 */
const MIX: readonly (readonly [Role, number])[] = [
  ["person", 0.4],
  ["team", 0.22],
  ["agent", 0.24],
  ["org", 0.14],
];

export function buildPopulation(total: number): Role[] {
  const out: Role[] = [];
  for (const [role, share] of MIX) {
    const n = Math.max(1, Math.round(total * share));
    for (let i = 0; i < n; i += 1) out.push(role);
  }
  // interleave so the parked cloud is not sorted by role
  return out
    .map((r, i) => ({ r, k: (i * 7919) % out.length }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.r);
}

export type Placement = {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: number;
  /** how far through the assembly cascade this element arrives, 0..1 */
  readonly order: number;
};

const ROLE_ORDER: Record<Role, number> = { agent: 0, person: 1, team: 2, org: 3 };

/**
 * Where every selected element goes for a given need. The formations are
 * STRUCTURES — a thing that grows, a thing that orbits, a thing that gathers,
 * a thing that is small and dense — never a grid and never a stack.
 */
export function layout(need: Need, roles: readonly Role[]): (Placement | null)[] {
  const left: Record<Role, number> = { ...need.quota };
  const chosen: number[] = [];
  roles.forEach((r, i) => {
    if (left[r] > 0) {
      left[r] -= 1;
      chosen.push(i);
    }
  });

  const out: (Placement | null)[] = roles.map(() => null);
  const byRole: Record<Role, number[]> = { person: [], team: [], agent: [], org: [] };
  for (const i of chosen) byRole[roles[i]].push(i);

  const e = new THREE.Euler();
  const place = (
    i: number,
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
    scale: number,
  ) => {
    e.set(rx, ry, rz);
    out[i] = {
      position: new THREE.Vector3(x, y, z),
      quaternion: new THREE.Quaternion().setFromEuler(e),
      scale,
      order:
        (ROLE_ORDER[roles[i]] / 3) * 0.55 +
        (byRole[roles[i]].indexOf(i) / Math.max(1, byRole[roles[i]].length)) * 0.45,
    };
  };

  switch (need.formation) {
    case "helix": {
      // a thing that GROWS: a double helix of people rising past floor plates
      const P = byRole.person;
      P.forEach((i, k) => {
        const t = k / Math.max(1, P.length - 1);
        const a = t * Math.PI * 3.1 + (k % 2 ? Math.PI : 0);
        const r = 2.35 + Math.sin(t * Math.PI) * 0.5;
        place(i, Math.cos(a) * r, -3.1 + t * 6.4, Math.sin(a) * r, 0.15, -a, 0.22, 1);
      });
      byRole.org.forEach((i, k) => {
        // floor plates: offset and tilted, never a coaxial stack — five
        // coincident discs at the origin read as one white blob, not as
        // structure
        const t = k / Math.max(1, byRole.org.length - 1);
        const a = t * 2.4;
        place(
          i,
          Math.cos(a) * 0.8,
          -3.4 + t * 6.6,
          Math.sin(a) * 0.8,
          0.06,
          a,
          0.05,
          1.05 - t * 0.3,
        );
      });
      byRole.team.forEach((i, k) => {
        const a = (k / Math.max(1, byRole.team.length)) * Math.PI * 2;
        place(i, Math.cos(a) * 3.5, -1.2 + Math.sin(k * 1.7) * 2.2, Math.sin(a) * 3.5, 0.3, -a + Math.PI, 0, 1);
      });
      byRole.agent.forEach((i, k) => {
        const a = (k / Math.max(1, byRole.agent.length)) * Math.PI * 2 + 0.4;
        place(i, Math.cos(a) * 1.15, 1.9 + k * 0.55, Math.sin(a) * 1.15, 0, -a, 0.5, 1);
      });
      break;
    }
    case "orbital": {
      // a MACHINE: agents inner and fast, people wide, plates as two discs
      byRole.agent.forEach((i, k) => {
        const a = (k / Math.max(1, byRole.agent.length)) * Math.PI * 2;
        const tilt = k % 2 ? 0.4 : -0.35;
        place(i, Math.cos(a) * 1.5, Math.sin(a) * 1.5 * Math.sin(tilt), Math.sin(a) * 1.5 * Math.cos(tilt), tilt, -a, Math.PI / 2, 1);
      });
      byRole.person.forEach((i, k) => {
        const a = (k / Math.max(1, byRole.person.length)) * Math.PI * 2 + 0.2;
        const r = 3.9;
        place(i, Math.cos(a) * r, Math.sin(k * 2.1) * 0.5, Math.sin(a) * r, 0.1, -a, 0, 1);
      });
      byRole.team.forEach((i, k) => {
        const a = (k / Math.max(1, byRole.team.length)) * Math.PI * 2 + 0.9;
        place(i, Math.cos(a) * 2.7, 1.6 + (k % 2) * -3.2, Math.sin(a) * 2.7, k % 2 ? 2.5 : 0.7, -a, 0, 1.15);
      });
      byRole.org.forEach((i, k) => {
        place(i, 0, k % 2 ? 2.9 : -2.9, 0, 0, k * 0.8, 0, 1.35);
      });
      break;
    }
    case "amphitheatre": {
      // a COHORT: concentric arcs opening toward the viewer
      const P = byRole.person;
      P.forEach((i, k) => {
        const row = Math.floor(k / 5);
        const inRow = k % 5;
        const rows = Math.ceil(P.length / 5);
        const r = 2.6 + row * 1.15;
        const a = (-0.55 + (inRow / 4) * 1.1) * (1 + row * 0.06);
        place(i, Math.sin(a) * r, -1.6 + row * 0.72, Math.cos(a) * r - 1.2, -0.18, -a, 0, 1);
        void rows;
      });
      byRole.team.forEach((i, k) => {
        const a = -0.7 + (k / Math.max(1, byRole.team.length - 1)) * 1.4;
        place(i, Math.sin(a) * 4.4, 2.5, Math.cos(a) * 4.4 - 1.2, 1.9, -a, 0, 1.3);
      });
      byRole.org.forEach((i, k) => {
        place(i, -3.2 + k * 3.2, -2.6, -2.4, 0, 0.3 * k, 0, 1.1);
      });
      byRole.agent.forEach((i, k) => {
        place(i, -1.4 + k * 1.4, 0.4, -3.6, 0, 0.5, 0.3, 1);
      });
      break;
    }
    case "seed":
    default: {
      const all = chosen;
      all.forEach((i, k) => {
        const a = (k / Math.max(1, all.length)) * Math.PI * 2;
        const r = 1.5 + (k % 3) * 0.45;
        const y = Math.sin(k * 2.3) * 0.9;
        place(i, Math.cos(a) * r, y, Math.sin(a) * r, 0.2, -a, 0.1, 1.05);
      });
      break;
    }
  }

  return out;
}
