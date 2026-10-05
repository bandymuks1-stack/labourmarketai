import { LANES, ramp } from "@/lib/spatial/sequence";

/**
 * TELEMETRY — product information that lives IN the scene.
 *
 * Each item is anchored to something physical (a point on a photograph, an
 * evidence object, a lane, a socket in the market's world) and appears only
 * while the camera is there, then hands off to the next. The product is
 * SEEING and UNDERSTANDING the work; the text is what it understood.
 *
 * Sample person, sample need: the figures are illustrative content for the
 * prototype, never read from, or presented as, production data.
 */
export type TelAnchor =
  | { readonly kind: "frame"; readonly frame: string; readonly u: number; readonly v: number }
  | { readonly kind: "tile"; readonly tile: 1 | 2 }
  | { readonly kind: "lane"; readonly lane: number; readonly s: number }
  | { readonly kind: "screen"; readonly x: number; readonly y: number };

export type TelView = {
  readonly label: string;
  readonly value?: string;
  readonly sub?: string;
  readonly tone?: "quiet" | "focus" | "event";
};

export type Tel = {
  readonly id: string;
  readonly anchor: TelAnchor;
  /** fade in a→b, hold, fade out c→d (progress) */
  readonly win: readonly [number, number, number, number];
  readonly dx: number;
  readonly dy: number;
  readonly at: (p: number) => TelView;
};

const hms = (sec: number) => {
  const s = Math.floor(sec);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const telAlpha = (t: Tel, p: number): number =>
  ramp(p, t.win[0], t.win[1]) * (1 - ramp(p, t.win[2], t.win[3]));

const lane = (i: number): Tel => ({
  id: `lane-${i}`,
  anchor: { kind: "lane", lane: i, s: 300 + i * 1000 },
  win: [0.565, 0.585, 0.715, 0.74],
  dx: 0,
  dy: -40,
  at: () => ({
    label: "Capability",
    value: LANES[i]!.label,
    sub: `${[200, 212, 140, 86][i]} h`,
  }),
});

const req = (
  i: number,
  from: number,
  frame: string,
  u: number,
  v: number,
  value: string,
  met: boolean,
  sub: string,
  dx: number,
  dy: number,
): Tel => ({
  id: `req-${i}`,
  anchor: { kind: "frame", frame, u, v },
  win: [from, from + 0.016, 0.84, 0.865],
  dx,
  dy,
  at: () => ({ label: met ? "Requires · met" : "Requires · open", value, sub, tone: met ? "quiet" : "focus" }),
});

export const TELEMETRY: readonly Tel[] = [
  {
    id: "person",
    anchor: { kind: "frame", frame: "F0", u: 0.515, v: 0.26 },
    win: [0.004, 0.02, 0.055, 0.078],
    dx: 130,
    dy: -80,
    at: () => ({ label: "Person", value: "Rasa J.", sub: "Cook · Oslo, Norway" }),
  },
  {
    id: "work-place",
    anchor: { kind: "frame", frame: "F1", u: 0.86, v: 0.1 },
    win: [0.115, 0.14, 0.2, 0.215],
    dx: -40,
    dy: 56,
    at: () => ({ label: "Work", value: "Restaurant kitchen", sub: "Vilnius · 2022" }),
  },
  {
    id: "track",
    anchor: { kind: "frame", frame: "F1", u: 0.76, v: 0.665 },
    win: [0.142, 0.16, 0.215, 0.228],
    dx: 80,
    dy: -70,
    at: (p) =>
      p < 0.205
        ? { label: "Recording", value: "Knife work · prep", sub: hms(13212 * ramp(p, 0.145, 0.204)) }
        : { label: "Recorded", value: "Knife work · 3 h 40", sub: "Waiting for the kitchen manager", tone: "focus" },
  },
  {
    id: "tile-1",
    anchor: { kind: "tile", tile: 1 },
    win: [0.228, 0.245, 0.335, 0.352],
    dx: 70,
    dy: -64,
    at: (p) => ({
      label: "Evidence",
      value: "Knife work · 3 h 40",
      sub: p < 0.275 ? "Waiting for the kitchen manager" : "Confirmed · kitchen manager",
      tone: p < 0.275 ? "quiet" : p < 0.315 ? "event" : "quiet",
    }),
  },
  {
    id: "f2",
    anchor: { kind: "frame", frame: "F2", u: 0.42, v: 0.62 },
    win: [0.372, 0.388, 0.405, 0.422],
    dx: 420,
    dy: -150,
    at: () => ({ label: "Plating", value: "212 h · 9 records", sub: "Oslo · restaurant pass", tone: "focus" }),
  },
  {
    id: "f3",
    anchor: { kind: "frame", frame: "F3", u: 0.3, v: 0.88 },
    win: [0.427, 0.445, 0.46, 0.477],
    dx: 90,
    dy: -96,
    at: () => ({ label: "Kitchen hygiene", value: "140 h · 7 records", sub: "Oslo · open kitchen", tone: "focus" }),
  },
  {
    id: "f4",
    anchor: { kind: "frame", frame: "F4", u: 0.515, v: 0.255 },
    win: [0.482, 0.5, 0.52, 0.545],
    dx: 130,
    dy: -70,
    at: () => ({ label: "Leads a brigade", value: "86 h · 6 records", sub: "Recorded · not yet confirmed", tone: "focus" }),
  },
  lane(0),
  lane(1),
  lane(2),
  lane(3),
  {
    id: "summary",
    anchor: { kind: "screen", x: 0.07, y: 0.16 },
    win: [0.552, 0.575, 0.64, 0.668],
    dx: 0,
    dy: 0,
    at: () => ({ label: "Living record", value: "4 capabilities", sub: "638 h · Vilnius → Oslo" }),
  },
  {
    id: "need",
    anchor: { kind: "frame", frame: "N1", u: 0.5, v: 0.1 },
    win: [0.565, 0.588, 0.72, 0.742],
    dx: 0,
    dy: -54,
    at: () => ({ label: "Market signal → need", value: "Sous chef", sub: "Nordic restaurant · Oslo · from 20 Oct" }),
  },
  req(0, 0.64, "N2", 0.42, 0.5, "Knife and prep", true, "confirmed · 160 h", -150, -80),
  req(1, 0.66, "N1", 0.22, 0.7, "Plating to the pass", true, "confirmed · 212 h", -230, 40),
  req(2, 0.68, "N1", 0.72, 0.34, "Kitchen hygiene plan", true, "confirmed · 140 h", 90, -120),
  req(3, 0.7, "N2", 0.6, 0.22, "Leads a brigade of four", false, "86 h recorded, nothing confirmed", 130, 90),
  {
    id: "match",
    anchor: { kind: "screen", x: 0.5, y: 0.87 },
    win: [0.722, 0.732, 0.757, 0.768],
    dx: 0,
    dy: 0,
    at: () => ({ label: "Match", value: "Interest sent", sub: "Rasa J. → Nordic restaurant, Oslo", tone: "focus" }),
  },
  {
    id: "talk",
    anchor: { kind: "screen", x: 0.5, y: 0.87 },
    win: [0.762, 0.772, 0.797, 0.808],
    dx: 0,
    dy: 0,
    at: () => ({ label: "Conversation", value: "Start · shift · housing", sub: "Terms in progress", tone: "focus" }),
  },
  {
    id: "agreed",
    anchor: { kind: "screen", x: 0.5, y: 0.87 },
    win: [0.802, 0.812, 0.845, 0.866],
    dx: 0,
    dy: 0,
    at: () => ({ label: "Agreement", value: "Agreed", sub: "Project created · from 20 October", tone: "event" }),
  },
  {
    id: "station",
    anchor: { kind: "frame", frame: "P1", u: 0.56, v: 0.5 },
    win: [0.876, 0.892, 0.935, 0.956],
    dx: 190,
    dy: -120,
    at: () => ({ label: "Station", value: "Rasa J. assigned", sub: "Line · 06:00 – 14:00 · Oslo", tone: "focus" }),
  },
  {
    id: "team-a",
    anchor: { kind: "frame", frame: "P1", u: 0.22, v: 0.34 },
    win: [0.888, 0.903, 0.932, 0.952],
    dx: 70,
    dy: -100,
    at: () => ({ label: "Team", value: "Cook", sub: "212 h confirmed" }),
  },
  {
    id: "team-b",
    anchor: { kind: "frame", frame: "P1", u: 0.79, v: 0.3 },
    win: [0.892, 0.907, 0.932, 0.952],
    dx: -70,
    dy: -100,
    at: () => ({ label: "Team", value: "Cook", sub: "340 h confirmed" }),
  },
  {
    id: "tile-2",
    anchor: { kind: "tile", tile: 2 },
    win: [0.946, 0.962, 1.01, 1.02],
    dx: 70,
    dy: -70,
    at: () => ({ label: "New evidence", value: "Led the morning briefing · 2 h", sub: "Waiting for the head chef", tone: "focus" }),
  },
  {
    id: "grew",
    anchor: { kind: "screen", x: 0.5, y: 0.84 },
    win: [0.984, 0.996, 1.01, 1.02],
    dx: 0,
    dy: 0,
    at: () => ({ label: "The record grew", value: "Leads a brigade — now shown", sub: "A stronger record, and new needs in reach" }),
  },
];
