/**
 * WORLD ELEMENTS — the twelve elements the product is made of.
 *
 * Owner text, locked 2026-07-28: `docs/product/PRODUCT_VISION_LOCK_V1.md`
 * (the HIGHEST product design authority — above the Product Constitution for
 * any product/UX/architecture question).
 *
 * THE RULE THIS ENCODES: every future feature must be an EXTENSION of one or
 * more of these twelve elements. A feature that extends none of them is not a
 * feature — it is a second product inside the product.
 *
 * Nothing here is invented: the list, the wording and the prohibitions are the
 * owner's, recorded 1:1 in the document above.
 *
 * Pure data. No IO.
 */

export type WorldElementId =
  | "ai_conversation"
  | "user_avatar"
  | "market_world_map"
  | "objects"
  | "organizations"
  | "projects"
  | "teams"
  | "work_journal"
  | "skills"
  | "reputation"
  | "documents"
  | "communication";

export interface WorldElement {
  readonly id: WorldElementId;
  /** Owner's name for the element. */
  readonly name: string;
  /** What it is — and, where the owner said so, what it is NOT. */
  readonly definition: string;
  /** Rules the owner attached to this element. */
  readonly rules: readonly string[];
}

export const WORLD_ELEMENTS: readonly WorldElement[] = [
  {
    id: "ai_conversation",
    name: "AI Conversation",
    definition:
      "The primary user interface. The AI leads the dialogue, understands the goal, performs actions, opens the context it needs, closes it, and returns to the conversation.",
    rules: [
      "There may be no second AI.",
      "There may be no equally-ranked alternative way to operate the product.",
      "All communication happens through the AI; it only temporarily opens the context it needs.",
    ],
  },
  {
    id: "user_avatar",
    name: "User Avatar",
    definition:
      "Not an illustration — the user's digital identity. It carries the profile, skills, work history, work journal, reputation, documents, certificates, availability, organizations and teams.",
    rules: ["Every action is performed in the avatar's name."],
  },
  {
    id: "market_world_map",
    name: "Market World Map",
    definition:
      "Not a job-search screen — a visual world of the labour market. People, avatars, companies, projects, objects, workplaces, demand signals, teams, training, events, leagues, partners and AI objects exist on it as LAYERS.",
    rules: ["The map becomes the primary representation of the world."],
  },
  {
    id: "objects",
    name: "Objects",
    definition:
      "Not an address. A construction site, factory, warehouse, office, project, training centre, event, or any other place of activity.",
    rules: ["Objects have their own history."],
  },
  {
    id: "organizations",
    name: "Organizations",
    definition: "Companies and agencies as first-class inhabitants of the world.",
    rules: [],
  },
  {
    id: "projects",
    name: "Projects",
    definition: "Units of future and current work that people and teams are assigned to.",
    rules: [],
  },
  {
    id: "teams",
    name: "Teams",
    definition: "Groups of avatars working together, inside or across organizations.",
    rules: [],
  },
  {
    id: "work_journal",
    name: "Work Journal",
    definition:
      "The PRIMARY source of skills. Not a separate product — integrated into the conversation and the avatar. Skills, experience, reputation, achievements and AI recommendations are all formed from it.",
    rules: ["It is not a separate product.", "It is integrated into the conversation and the avatar."],
  },
  {
    id: "skills",
    name: "Skills",
    definition:
      "Not generated from a CV. The primary source is the work journal; a CV is only an additional source of information.",
    rules: ["Skills are never generated from a CV as the primary source."],
  },
  {
    id: "reputation",
    name: "Reputation",
    definition:
      "Built only from real activity. Leagues are not a game — they are the reputation and motivation system.",
    rules: ["Leagues rest only on real activity."],
  },
  {
    id: "documents",
    name: "Documents",
    definition: "Certificates, proofs and files attached to the avatar and to work.",
    rules: [],
  },
  {
    id: "communication",
    name: "Communication",
    definition:
      "Happens through the AI. Inbox is not a product. Bookings are not a product. Requests are not a product. Candidates are not a product.",
    rules: [
      "Inbox / bookings / requests / candidates are NOT products.",
      "The AI only temporarily opens the context that is needed.",
    ],
  },
] as const;

export function worldElement(id: string): WorldElement | null {
  return WORLD_ELEMENTS.find((e) => e.id === id) ?? null;
}

export function worldElementIds(): readonly string[] {
  return WORLD_ELEMENTS.map((e) => e.id);
}

/**
 * The six questions every PR must answer, in the owner's order.
 * The surface declaration carries the answers; the gate refuses a blank.
 */
export const MANDATORY_PR_QUESTIONS = [
  "Which core world element is being extended?",
  "Why can an existing element not be used?",
  "How does this feature integrate into the AI conversation?",
  "How will it be reflected in the Avatar's state?",
  "How will it be reflected in the World Map?",
  "How is it related to the Work Journal?",
] as const;

/** What may never be created (owner's prohibition list). */
export const FORBIDDEN_CREATIONS = [
  "a new dashboard",
  "a new wizard",
  "a new permanent module",
  "a new AI",
  "a duplicating function",
  "a new product inside the product",
] as const;

/**
 * Dashboard's permitted scope. The owner's definition is a CEILING, not a
 * starting point: the dashboard is not a workplace.
 */
export const DASHBOARD_PERMITTED_CONTENT = [
  "current state",
  "the day's summary",
  "active tasks",
  "the conversation",
] as const;
