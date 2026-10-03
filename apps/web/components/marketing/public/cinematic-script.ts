/**
 * THE CINEMATIC STORY — the scene script (pure data, no React).
 *
 * One persistent set of entities (a person, a company/project, a team, one
 * piece of work that becomes a record and then history) lives on ONE stage.
 * Scroll does not swap slides: it moves the camera over the background
 * photograph, changes what is in focus, moves the same entities to new places,
 * draws and removes the relationships between them, and changes the
 * information layer. This file is the whole script: where each entity stands
 * in every scene, how the camera frames the photograph, which relationships
 * are drawn.
 *
 * COORDINATES. Entities are placed by their CENTRE as a percentage of the
 * stage (`cqw` x, `cqh` y). `d` = desktop (from `lg`), `m` = phone. A scene
 * with no place for an entity hides it.
 *
 * SCENES (0-8) and the overview (9, the static / reduced-motion composition):
 *   0 PERSON            1 PERSON <-> OPPORTUNITY / COMPANY
 *   2 CONVERSATION      3 PERSON -> TEAM -> PROJECT
 *   4 REAL WORK         5 WORK -> RECORD / EVIDENCE
 *   6 MANAGER CONFIRMS  7 PROFESSIONAL HISTORY / LIVING CV
 *   8 NEXT OPPORTUNITY (+ company: project -> people -> next need -> planning)
 */
export const SCENES = 9;
export const OVERVIEW = 9;

export type Pt = readonly [number, number];
export type Tier = "focus" | "context" | "quiet";
export type Place = { readonly d: Pt; readonly m: Pt; readonly tier?: Tier; readonly mHide?: boolean };

export type EntityId =
  | "person"
  | "org"
  | "chat"
  | "team"
  | "work"
  | "manager"
  | "history"
  | "next";

/** `mHide`: on a phone this entity stays out of this scene (the desktop stage has room for it, the phone does not). */
const P = (d: Pt, m: Pt, tier: Tier = "context", mHide = false): Place => ({ d, m, tier, ...(mHide ? { mHide } : {}) });

/** Where each entity stands, per scene index (0-8) and the overview (9). */
export const LAYOUT: Record<EntityId, Readonly<Record<number, Place>>> = {
  person: {
    0: P([68, 30], [38, 22], "focus"),
    1: P([58, 24], [36, 12], "focus"),
    2: P([55, 20], [36, 12]),
    3: P([22, 20], [36, 12]),
    4: P([56, 14], [36, 12]),
    5: P([56, 14], [36, 12]),
    6: P([72, 13], [36, 12]),
    7: P([56, 14], [36, 12]),
    8: P([60, 22], [36, 12], "focus"),
    9: P([62, 13], [36, 10]),
  },
  org: {
    1: P([87, 40], [62, 33], "focus"),
    2: P([87, 22], [62, 26]),
    3: P([87, 24], [62, 27]),
    4: P([87, 22], [62, 26]),
    5: P([87, 20], [62, 26], "quiet"),
    6: P([87, 62], [58, 60], "focus"),
    7: P([87, 24], [62, 27], "quiet", true),
    8: P([87, 56], [58, 51], "focus"),
    9: P([87, 36], [62, 23]),
  },
  chat: {
    2: P([71, 52], [50, 47], "focus"),
  },
  team: {
    3: P([73, 50], [42, 44], "focus"),
    9: P([87, 56], [50, 80], "context", true),
  },
  work: {
    4: P([73, 50], [50, 51], "focus"),
    5: P([73, 50], [50, 43], "focus"),
    6: P([72, 40], [42, 43], "focus"),
    7: P([57, 34], [42, 28], "focus"),
    9: P([62, 38], [50, 36]),
  },
  manager: {
    6: P([26, 40], [62, 26], "focus"),
  },
  history: {
    7: P([85, 50], [50, 53], "focus"),
    9: P([86, 66], [50, 58]),
  },
  next: {
    8: P([83, 26], [58, 28], "context"),
    9: P([62, 78], [50, 82], "quiet"),
  },
};

export type BackdropId = "site" | "van" | "foreman" | "tool" | "kitchen" | "owner" | "chef" | "car";

/** Camera: scale + translation (% of the photograph) + the origin it scales about. */
export type Camera = {
  readonly bg: BackdropId;
  readonly s: number;
  readonly x: number;
  readonly y: number;
  readonly o: string;
  /** the photograph's own focus (object-position), phone */
  readonly m?: { readonly s: number; readonly x: number; readonly y: number; readonly o: string };
};

/** Construction world (home + /for-workers): the scaffolder on the North facade. */
export const CAMERA_CONSTRUCTION: readonly Camera[] = [
  { bg: "site", s: 1.45, x: -6, y: 2, o: "50% 38%", m: { s: 1.54, x: 0.0, y: 14.0, o: "50% 38%" } },
  { bg: "site", s: 1.2, x: -9, y: 0, o: "50% 40%", m: { s: 1.3, x: 8.0, y: 11.4, o: "50% 38%" } },
  { bg: "van", s: 1.15, x: -4, y: 0, o: "38% 50%", m: { s: 1.3, x: 6.0, y: 12.0, o: "38% 40%" } },
  { bg: "foreman", s: 1.2, x: -8, y: 0, o: "50% 45%", m: { s: 1.24, x: 0.0, y: 9.6, o: "50% 40%" } },
  { bg: "site", s: 1.3, x: -3, y: 0, o: "50% 45%", m: { s: 1.42, x: 4.0, y: 14.0, o: "50% 45%" } },
  { bg: "site", s: 1.45, x: -4, y: -3, o: "52% 50%", m: { s: 1.54, x: 4.0, y: 14.0, o: "52% 50%" } },
  { bg: "foreman", s: 1.6, x: -6, y: 4, o: "46% 42%", m: { s: 1.54, x: 6.0, y: 16.0, o: "46% 40%" } },
  { bg: "tool", s: 1.15, x: -8, y: 0, o: "46% 50%", m: { s: 1.3, x: 2.0, y: 13.5, o: "46% 45%" } },
  { bg: "van", s: 1.3, x: -2, y: -2, o: "36% 50%", m: { s: 1.36, x: 6.0, y: 14.0, o: "36% 45%" } },
  { bg: "site", s: 1.2, x: -8, y: 0, o: "50% 40%", m: { s: 1.3, x: 4.0, y: 11.4, o: "50% 38%" } },
];

/** Hospitality world (/for-companies): the restaurant, its owner and a cook. */
export const CAMERA_HOSPITALITY: readonly Camera[] = [
  { bg: "kitchen", s: 1.35, x: -6, y: 2, o: "44% 40%", m: { s: 1.42, x: 6.0, y: 14.0, o: "44% 40%" } },
  { bg: "owner", s: 1.2, x: -8, y: 0, o: "50% 42%", m: { s: 1.3, x: 0.0, y: 12.6, o: "50% 42%" } },
  { bg: "car", s: 1.2, x: -6, y: 0, o: "46% 40%", m: { s: 1.3, x: 4.0, y: 12.0, o: "46% 40%" } },
  { bg: "chef", s: 1.2, x: -8, y: 0, o: "50% 45%", m: { s: 1.24, x: 0.0, y: 9.6, o: "50% 40%" } },
  { bg: "kitchen", s: 1.35, x: -4, y: 0, o: "50% 55%", m: { s: 1.48, x: 6.0, y: 14.0, o: "50% 55%" } },
  { bg: "kitchen", s: 1.5, x: -4, y: -3, o: "52% 58%", m: { s: 1.54, x: 4.0, y: 14.0, o: "52% 58%" } },
  { bg: "chef", s: 1.55, x: -6, y: 4, o: "48% 42%", m: { s: 1.48, x: 4.0, y: 16.0, o: "48% 40%" } },
  { bg: "kitchen", s: 1.2, x: 5, y: 0, o: "44% 45%", m: { s: 1.3, x: 3, y: 10, o: "44% 45%" } },
  { bg: "car", s: 1.35, x: -4, y: -2, o: "44% 42%", m: { s: 1.36, x: 4.0, y: 14.0, o: "44% 42%" } },
  { bg: "kitchen", s: 1.2, x: -8, y: 0, o: "44% 40%", m: { s: 1.3, x: 4.0, y: 12.0, o: "44% 40%" } },
];

export type Line = {
  readonly from: EntityId;
  readonly to: EntityId;
  readonly tone?: "gold" | "success" | "dashed" | "line";
};

/** Relationships drawn in each scene (and the overview). */
export const LINES: Readonly<Record<number, readonly Line[]>> = {
  0: [],
  1: [{ from: "person", to: "org", tone: "gold" }],
  2: [
    { from: "person", to: "chat", tone: "gold" },
    { from: "chat", to: "org" },
  ],
  3: [
    { from: "person", to: "team", tone: "gold" },
    { from: "team", to: "org" },
  ],
  4: [
    { from: "person", to: "work", tone: "gold" },
    { from: "org", to: "work" },
  ],
  5: [{ from: "person", to: "work", tone: "gold" }],
  6: [
    { from: "work", to: "manager", tone: "success" },
    { from: "manager", to: "org" },
  ],
  7: [
    { from: "person", to: "work", tone: "gold" },
    { from: "work", to: "history", tone: "success" },
  ],
  8: [
    { from: "person", to: "next", tone: "dashed" },
    { from: "org", to: "next", tone: "dashed" },
  ],
  9: [
    { from: "person", to: "org", tone: "gold" },
    { from: "person", to: "work" },
    { from: "work", to: "history", tone: "success" },
    { from: "history", to: "next", tone: "dashed" },
  ],
};

/** Chapter (0-4) each scene belongs to: the five things the page explains. */
export const CHAPTER_KEYS = ["find_work", "find_people", "run", "record", "forward"] as const;
export type ChapterKey = (typeof CHAPTER_KEYS)[number];

/** Chapters lit in each scene (scene 1 is both sides of the same meeting). */
export const SCENE_CHAPTERS: Readonly<Record<number, readonly number[]>> = {
  0: [0],
  1: [0, 1],
  2: [1],
  3: [2],
  4: [2],
  5: [3],
  6: [3],
  7: [3],
  8: [4],
  9: [0, 1, 2, 3, 4],
};

/** First scene of each chapter — where the chapter rail scrolls to. */
export const CHAPTER_FIRST_SCENE: readonly number[] = [0, 1, 3, 5, 8];

/** Which backdrops to have mounted for a scene: itself and the next, nothing else. */
export function backdropsNeeded(camera: readonly Camera[], scene: number): BackdropId[] {
  const out = new Set<BackdropId>();
  for (const i of [scene, scene + 1]) {
    const c = camera[Math.min(i, SCENES - 1)];
    if (c) out.add(c.bg);
  }
  return [...out];
}

/** The camera a (possibly inactive) backdrop should rest at: the nearest scene that uses it. */
export function restingCamera(camera: readonly Camera[], bg: BackdropId, scene: number): Camera {
  const used = camera.map((c, i) => [c, i] as const).filter(([c, i]) => c.bg === bg && i < SCENES);
  const prev = used.filter(([, i]) => i <= scene).pop();
  return (prev ?? used[0] ?? [camera[0]!, 0])[0];
}
