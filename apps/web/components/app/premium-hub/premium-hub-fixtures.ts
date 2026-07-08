// Premium Hub — CONCEPT-PREVIEW display data (doctrine §18: fake values are
// allowed ONLY when visually marked as preview / concept / not live yet). This
// screen carries that marker in its header (`premiumHub.conceptBadge`). Nothing
// here is a real user's saved record; every value below is stand-in content that
// shows the SHAPE of the future real data. When the real bindings land (see
// docs/launch/premium-hub-screen-data-bindings.md) these props are replaced by
// RLS-scoped reads and this fixture is deleted. Structural/chrome labels live in
// i18n (messages/{lt,en,ru}.json → `premiumHub`); the strings below are content,
// not translations, so they stay identical across locales (a real name/skill is
// never translated either).

export interface HubSkill {
  /** Skill name as it would come from the worker's real profile. */
  label: string;
  /** Self-declared level 0–100 (never a verified/certified score). */
  value: number;
}

export interface HubPerson {
  name: string;
  role: string;
  skills: HubSkill[];
}

export interface HubCompany {
  companyName: string;
  location: string;
  sector: string;
  team: number;
  projects: number;
  active: number;
}

export interface HubProject {
  name: string;
  workDone: number;
  workTotal: number;
  photosPresent: boolean;
  defects: number;
  handoverPercent: number;
}

export interface HubMapNode {
  /** viewBox coordinates (0–400 x, 0–260 y) — abstract, not geographic. */
  x: number;
  y: number;
  /** The single highlighted point vs. the ambient market points. */
  active?: boolean;
}

export interface PremiumHubData {
  person: HubPerson;
  company: HubCompany;
  project: HubProject;
  mapNodes: HubMapNode[];
}

/** The one preview payload the hub renders until real data is wired. */
export const PREMIUM_HUB_PREVIEW: PremiumHubData = {
  person: {
    name: "Tomas Petrauskas",
    role: "Statybų vadovas",
    skills: [
      { label: "Projektų valdymas", value: 86 },
      { label: "Derybos", value: 72 },
      { label: "Statybos procesai", value: 80 },
      { label: "Biudžeto kontrolė", value: 76 },
    ],
  },
  company: {
    companyName: "Statyba LT, UAB",
    location: "Vilnius, Lietuva",
    sector: "Statybų sektorius",
    team: 42,
    projects: 18,
    active: 7,
  },
  project: {
    name: "Verslo centras",
    workDone: 12,
    workTotal: 24,
    photosPresent: true,
    defects: 3,
    handoverPercent: 72,
  },
  // Abstract network of market points with one highlighted active point. These
  // are decorative signal positions, not coordinates — the market map stays a
  // stylized CSS/SVG panel (no external / paid map provider, no geocoding).
  mapNodes: [
    { x: 64, y: 190 },
    { x: 128, y: 96 },
    { x: 196, y: 150 },
    { x: 150, y: 214 },
    { x: 256, y: 74 },
    { x: 300, y: 168 },
    { x: 344, y: 120 },
    { x: 232, y: 132, active: true },
  ],
};
