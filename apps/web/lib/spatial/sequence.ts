/**
 * THE SPATIAL SEQUENCE — one continuous camera path through the product's
 * states (PERSON → WORK → EVIDENCE → CAPABILITY → NEED → MATCH → PROJECT →
 * NEW EVIDENCE).
 *
 * The product's states are PLACES, not pages. A person's working life is a
 * corridor of frames (each a real working moment); the capabilities are lanes
 * that run along the floor of that corridor and thicken as work accumulates; a
 * market need is a second corridor in the same world. The camera moves through
 * all of it — it ENTERS a photograph, it PULLS BACK to see the whole record, it
 * watches the two corridors CONVERGE into one shared work context, and it
 * ARRIVES inside the project.
 *
 * Everything here is a pure function of progress p ∈ [0,1] (and of nothing
 * else), so the sequence can be scrubbed, reversed and tested. The renderer
 * (components/app/spatial/world-sequence.tsx) only draws what these functions
 * say.
 *
 * Coordinates: X right, Y down, Z toward the viewer (CSS 3D). A corridor
 * position `s` is a distance along −Z; the camera sits `t` along it.
 */

export const PERSPECTIVE = 1000;
export const FRAME_ASPECT = 2528 / 1696;

export type Cam = {
  /** focus point (corridor x, y) and position along the corridor */
  readonly fx: number;
  readonly fy: number;
  readonly t: number;
  /** orbit distance behind the focus (0 = a dolly shot) */
  readonly r: number;
  readonly yaw: number;
  readonly pitch: number;
};

type Key = Cam & { readonly p: number };

const K = (p: number, c: Partial<Cam>): Key => ({
  p,
  fx: 0,
  fy: 0,
  t: 0,
  r: 0,
  yaw: 0,
  pitch: 0,
  ...c,
});

/** The camera's path. Equal neighbours are holds (a dwell on a state). */
const KEYS: readonly Key[] = [
  K(0.0, {}),
  K(0.06, {}), // PERSON
  K(0.13, { t: 1100 }), // enter the photograph → WORK
  K(0.205, { t: 1100 }), // watch the work
  K(0.255, { t: 1100, r: 560, fy: 170 }), // step back: the evidence leaves the scene
  K(0.3, { t: 1100, r: 560, fy: 170 }), // …and is confirmed
  K(0.335, { t: 1100 }),
  K(0.375, { t: 2200 }), // history: Oslo
  K(0.405, { t: 2200 }),
  K(0.43, { t: 3300 }),
  K(0.46, { t: 3300 }),
  K(0.485, { t: 4400 }),
  K(0.52, { t: 4400 }), // …the brigade
  K(0.6, { t: 2900, r: 5600, yaw: -46, pitch: 14 }), // pull back: the whole record
  K(0.65, { fx: 800, t: 3300, r: 6300, yaw: -42, pitch: 18 }), // a need appears, ahead
  K(0.72, { fx: 800, t: 3300, r: 6300, yaw: -42, pitch: 18 }),
  K(0.81, { fx: 0, t: 4800, r: 4700, yaw: -28, pitch: 12 }), // the worlds converge
  K(0.87, { t: 5600 }), // arrive inside the project
  K(0.935, { t: 5600 }),
  K(1.0, { t: 4300, r: 5200, yaw: -32, pitch: 15 }), // the record has grown
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
};
export const ramp = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export function camAt(p: number): Cam {
  const q = clamp01(p);
  let i = KEYS.findIndex((k) => q < k.p) - 1;
  if (i < 0) i = q >= 1 ? KEYS.length - 2 : 0;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const u = smooth((q - a.p) / (b.p - a.p));
  return {
    fx: lerp(a.fx, b.fx, u),
    fy: lerp(a.fy, b.fy, u),
    t: lerp(a.t, b.t, u),
    r: lerp(a.r, b.r, u),
    yaw: lerp(a.yaw, b.yaw, u),
    pitch: lerp(a.pitch, b.pitch, u),
  };
}

/** Project a world point exactly as CSS 3D does for
 *  `translateZ(-r) rotateX(pitch) rotateY(yaw) translate3d(-fx,-fy,t)`. */
export function project(
  cam: Cam,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; scale: number; visible: boolean } {
  const vx = x - cam.fx;
  const vy = y - cam.fy;
  const vz = z + cam.t;
  const cy = Math.cos((cam.yaw * Math.PI) / 180);
  const sy = Math.sin((cam.yaw * Math.PI) / 180);
  const cp = Math.cos((cam.pitch * Math.PI) / 180);
  const sp = Math.sin((cam.pitch * Math.PI) / 180);
  const x1 = vx * cy + vz * sy;
  const z1 = -vx * sy + vz * cy;
  const y2 = vy * cp - z1 * sp;
  const z2 = vy * sp + z1 * cp;
  const z3 = z2 - cam.r;
  const d = PERSPECTIVE - z3;
  if (d <= 40) return { x: 0, y: 0, scale: 0, visible: false };
  const scale = PERSPECTIVE / d;
  return { x: w / 2 + x1 * scale, y: h / 2 + y2 * scale, scale, visible: true };
}

// ───────────────────────── the world ─────────────────────────

export type FrameDef = {
  readonly id: string;
  readonly kind: "person" | "need";
  /** distance along the corridor */
  readonly s: number;
  readonly src: string;
  /** the part of the photograph this frame shows (0–1); default the whole */
  readonly crop?: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  /** face-anchored focus for responsive crops */
  readonly aspect: number;
};

const R = (stem: string) => `/hero/rasa/${stem}-1920.webp`;

export const FRAMES: readonly FrameDef[] = [
  { id: "F0", kind: "person", s: 0, src: R("00-base"), aspect: FRAME_ASPECT },
  { id: "F1", kind: "person", s: 1100, src: R("02-kitchen-lt"), aspect: FRAME_ASPECT },
  { id: "F2", kind: "person", s: 2200, src: R("04-country-no"), aspect: FRAME_ASPECT },
  { id: "F3", kind: "person", s: 3300, src: R("05-cook"), aspect: FRAME_ASPECT },
  { id: "F4", kind: "person", s: 4400, src: R("06-head-chef"), aspect: FRAME_ASPECT },
  {
    id: "N1",
    kind: "need",
    s: 5600,
    src: R("04-country-no"),
    crop: { x0: 0.6, y0: 0.04, x1: 1, y1: 0.66 },
    aspect: (0.4 * 2528) / (0.62 * 1696),
  },
  // the project: the same kitchen as the need, now with the person in it
  { id: "P1", kind: "need", s: 5600, src: R("06-head-chef"), aspect: FRAME_ASPECT },
  {
    id: "N2",
    kind: "need",
    s: 6700,
    src: R("06-head-chef"),
    crop: { x0: 0, y0: 0.1, x1: 0.4, y1: 0.95 },
    aspect: (0.4 * 2528) / (0.85 * 1696),
  },
];

/** Corridor offset of the need world (px): far to the side, then converged. */
export const NEED_OFFSET = 2400;

export function needOffset(p: number): number {
  return NEED_OFFSET * (1 - ramp(p, 0.72, 0.81));
}

/** The need world fades into existence as a market signal. */
export function needAlpha(p: number): number {
  return ramp(p, 0.545, 0.605);
}

/** How strongly a frame is drawn, for a dolly (camera inside the corridor). */
export function frameOpacity(f: FrameDef, cam: Cam, p: number): number {
  const orbit = smooth(cam.r / 1400);
  const x = f.s - cam.t;
  let dolly: number;
  if (x >= 0) {
    const scale = PERSPECTIVE / (PERSPECTIVE + x);
    dolly = smooth((scale - 0.3) / 0.25);
  } else {
    const scale = PERSPECTIVE / Math.max(80, PERSPECTIVE + x);
    dolly = 1 - smooth((scale - 1.3) / 0.85);
  }
  const base = lerp(dolly, 1, orbit);
  if (f.id === "P1") return base * ramp(p, 0.8, 0.845);
  if (f.id === "N1") return base * needAlpha(p) * (1 - ramp(p, 0.8, 0.84));
  return f.kind === "need" ? base * needAlpha(p) : base;
}

// ───────────────────────── lanes (capabilities) ─────────────────────────

export type LaneDef = {
  readonly id: string;
  readonly label: string;
  /** cumulative hours at a corridor position (piecewise linear) */
  readonly cum: readonly (readonly [number, number])[];
};

export const LANES: readonly LaneDef[] = [
  { id: "knife", label: "Knife work", cum: [[700, 0], [1100, 40], [2200, 100], [3300, 160], [4400, 200]] },
  { id: "plating", label: "Plating", cum: [[1700, 0], [2200, 60], [3300, 180], [4400, 212]] },
  { id: "hygiene", label: "Kitchen hygiene", cum: [[2900, 0], [3300, 70], [4400, 140]] },
  { id: "lead", label: "Leads a brigade", cum: [[3900, 0], [4400, 86]] },
];

export const MAX_LANE_HOURS = 220;

export function laneHoursAt(lane: LaneDef, s: number): number {
  const c = lane.cum;
  if (s <= c[0]![0]) return 0;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!;
    const b = c[i]!;
    if (s <= b[0]) return lerp(a[1], b[1], (s - a[0]) / (b[0] - a[0]));
  }
  return c[c.length - 1]![1];
}

/** The lane the camera is currently dwelling on — attention, so colour. */
export function focusLane(p: number): number | null {
  if (p >= 0.14 && p < 0.335) return 0;
  if (p >= 0.375 && p < 0.405) return 1;
  if (p >= 0.43 && p < 0.46) return 2;
  if (p >= 0.485 && p < 0.52) return 3;
  if (p >= 0.935 && p < 1) return 3;
  return null;
}

// ───────────────────────── events ─────────────────────────

export const EVENTS = {
  trackFrom: 0.14,
  trackTo: 0.205,
  liftFrom: 0.208,
  liftTo: 0.235,
  dockFrom: 0.235,
  dockTo: 0.265,
  confirmAt: 0.275,
  beams: [0.64, 0.66, 0.68, 0.7] as readonly number[],
  stamps: { interest: 0.725, terms: 0.765, agreed: 0.805 },
  newLiftFrom: 0.935,
  newLiftTo: 0.955,
  newDockTo: 0.985,
} as const;

export type StateName = "person" | "work" | "evidence" | "capability" | "need" | "match" | "project";
export const STATES: readonly StateName[] = ["person", "work", "evidence", "capability", "need", "match", "project"];

export function stateAt(p: number): StateName {
  if (p < 0.075) return "person";
  if (p < 0.205) return "work";
  if (p < 0.335) return "evidence";
  if (p < 0.575) return "capability";
  if (p < 0.715) return "need";
  if (p < 0.84) return "match";
  return "project";
}

/** Total length of the sequence in seconds when it plays by itself. */
export const DURATION_S = 78;
