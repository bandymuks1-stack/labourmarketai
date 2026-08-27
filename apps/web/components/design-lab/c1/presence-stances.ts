/**
 * C1 — who the record belongs to.
 *
 * Kept out of the scene module on purpose: the experience shell reads this to
 * build the chips, and it must not drag three.js into the first load to do it.
 */
export const STANCES = [
  {
    id: "work",
    chip: "I work",
    capabilities: [
      "Installation",
      "Diagnostics",
      "Site safety",
      "Handover",
      "Coordination",
      "Documentation",
    ],
    warm: 0xffcf9a,
    cold: 0x46516b,
  },
  {
    id: "study",
    chip: "I study",
    capabilities: [
      "Laboratory work",
      "Field practice",
      "Technical writing",
      "Team projects",
      "Presenting",
      "Tooling",
    ],
    warm: 0xffd9b8,
    cold: 0x4b5f74,
  },
  {
    id: "build",
    chip: "I build",
    capabilities: [
      "Estimating",
      "Scheduling",
      "Subcontracting",
      "Quality control",
      "Client reporting",
      "Procurement",
    ],
    warm: 0xffc27a,
    cold: 0x5a4f62,
  },
] as const;

export type StanceId = (typeof STANCES)[number]["id"];
