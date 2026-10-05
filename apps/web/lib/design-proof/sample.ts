/**
 * DESIGN PROOF FIXTURE — a labelled sample person, never a record.
 *
 * Tomas K. is one of the two fictional sample personas of the living-worker
 * hero (public/hero/tomas). Every figure here is sample content for judging the
 * product's visual language against real states (confirmed, recorded, declared,
 * missing); none of it is read from, or claims to be, production data.
 */

export type PlateRef = {
  readonly src: string;
  readonly small: string;
  /** Where the person's face sits in the photograph (0–1). */
  readonly face: { readonly x: number; readonly y: number };
  readonly alt: string;
};

const plate = (stem: string, face: { x: number; y: number }, alt: string): PlateRef => ({
  src: `/hero/tomas/${stem}-1920.webp`,
  small: `/hero/tomas/${stem}-960.webp`,
  face,
  alt,
});

export const PLATES = {
  tool: plate("01-tool", { x: 0.494, y: 0.296 }, "Tomas K. with a scaffold spanner and safety harness"),
  site: plate("02-site-lt", { x: 0.51, y: 0.234 }, "Tomas K. on scaffolding in Vilnius old town"),
  van: plate("03-van", { x: 0.383, y: 0.32 }, "Tomas K. beside a work van in the morning"),
  norway: plate("04-country-no", { x: 0.4985, y: 0.286 }, "Tomas K. on a site above a fjord in Norway"),
  specialist: plate("05-specialist", { x: 0.4985, y: 0.275 }, "Tomas K. reading drawings on a site in Stockholm"),
  foreman: plate("06-foreman", { x: 0.5035, y: 0.2735 }, "Tomas K. with a tablet, his crew behind him"),
  portrait: {
    src: "/hero/tomas/portrait-800.webp",
    small: "/hero/tomas/portrait-400.webp",
    face: { x: 0.5, y: 0.3 },
    alt: "Portrait of Tomas K.",
  },
} as const satisfies Record<string, PlateRef>;

export type CapabilityId = "scaf" | "wah" | "safe" | "draw" | "lead";

export type Capability = {
  readonly id: CapabilityId;
  readonly label: string;
  /** `declared` = the person says so and nothing yet shows it. */
  readonly declared?: boolean;
};

export const CAPABILITIES: readonly Capability[] = [
  { id: "scaf", label: "Scaffold erection" },
  { id: "wah", label: "Work at height" },
  { id: "safe", label: "Safety planning" },
  { id: "draw", label: "Reading drawings" },
  { id: "lead", label: "Leading a crew", declared: true },
];

export type WorkRecord = {
  readonly id: string;
  readonly text: string;
  readonly hours: number;
  /** A second party stands behind it. */
  readonly confirmed: boolean;
  readonly skills: readonly CapabilityId[];
  readonly thumb: PlateRef;
};

export type Chapter = {
  readonly id: string;
  readonly place: string;
  readonly role: string;
  readonly period: string;
  readonly plate: PlateRef;
  readonly records: readonly WorkRecord[];
};

/** Newest first. */
export const CHAPTERS: readonly Chapter[] = [
  {
    id: "sto",
    place: "Stockholm",
    role: "Construction specialist",
    period: "2026 — now",
    plate: PLATES.specialist,
    records: [
      { id: "s1", text: "Checked formwork drawings against the site, level 2", hours: 8, confirmed: true, skills: ["draw"], thumb: PLATES.specialist },
      { id: "s2", text: "Scaffold inspection with the site safety lead", hours: 6, confirmed: true, skills: ["wah"], thumb: PLATES.foreman },
      { id: "s3", text: "Morning crew briefing, four people", hours: 2, confirmed: false, skills: ["draw"], thumb: PLATES.foreman },
    ],
  },
  {
    id: "ber",
    place: "Bergen",
    role: "Scaffolder",
    period: "2025",
    plate: PLATES.norway,
    records: [
      { id: "b1", text: "Scaffold erection, hillside quarter", hours: 40, confirmed: true, skills: ["scaf", "wah"], thumb: PLATES.norway },
      { id: "b2", text: "Fall-arrest plan walk-through", hours: 12, confirmed: false, skills: ["safe", "wah"], thumb: PLATES.tool },
      { id: "b3", text: "Rain cover on the façade, night shift", hours: 6, confirmed: false, skills: ["scaf"], thumb: PLATES.van },
    ],
  },
  {
    id: "vil",
    place: "Vilnius",
    role: "Scaffolder",
    period: "2023 — 2024",
    plate: PLATES.site,
    records: [
      { id: "v1", text: "Old Town façade scaffolding, first month", hours: 62, confirmed: true, skills: ["scaf", "wah"], thumb: PLATES.site },
      { id: "v2", text: "Heritage façade, narrow street access", hours: 48, confirmed: true, skills: ["scaf", "wah"], thumb: PLATES.site },
      { id: "v3", text: "Apartment block renovation", hours: 54, confirmed: false, skills: ["scaf"], thumb: PLATES.van },
    ],
  },
];

/** The work moment that has just been recorded and is waiting. */
export const TODAY_MOMENT: WorkRecord = {
  id: "today",
  text: "Scaffold strip-out, Kaunas",
  hours: 6,
  confirmed: false,
  skills: ["scaf", "wah"],
  thumb: PLATES.tool,
};

export type Standing = "confirmed" | "recorded" | "declared";

export type CapabilityRead = {
  readonly capability: Capability;
  readonly hours: number;
  readonly records: number;
  readonly confirmedRecords: number;
  readonly standing: Standing;
  readonly thumbs: readonly PlateRef[];
};

/** What each capability stands on, derived from the records — never typed in. */
export function readCapabilities(records: readonly WorkRecord[]): CapabilityRead[] {
  return CAPABILITIES.map((capability) => {
    const rs = records.filter((r) => r.skills.includes(capability.id));
    const confirmedRecords = rs.filter((r) => r.confirmed).length;
    const standing: Standing =
      rs.length === 0 ? "declared" : confirmedRecords > 0 ? "confirmed" : "recorded";
    return {
      capability,
      hours: rs.reduce((n, r) => n + r.hours, 0),
      records: rs.length,
      confirmedRecords,
      standing,
      thumbs: rs.slice(0, 3).map((r) => r.thumb),
    };
  }).sort((a, b) => b.hours - a.hours);
}

export type Requirement = {
  readonly id: string;
  readonly text: string;
  readonly detail: string;
  readonly capability: CapabilityId;
};

export const NEED = {
  title: "Scaffolders for a residential quarter",
  place: "Bergen",
  org: "Nordhaus Build",
  starts: "from 20 October",
  plate: PLATES.norway,
  requirements: [
    { id: "q1", text: "Scaffold erection, multi-storey", detail: "Façade and hillside access", capability: "scaf" },
    { id: "q2", text: "Work at height", detail: "Harness, every shift", capability: "wah" },
    { id: "q3", text: "Fall-arrest and safety planning", detail: "Writes and walks the plan", capability: "safe" },
    { id: "q4", text: "Leads a crew of four", detail: "Directs the morning briefing", capability: "lead" },
  ] satisfies readonly Requirement[],
} as const;
