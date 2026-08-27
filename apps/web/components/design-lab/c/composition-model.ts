/**
 * CONCEPT C — "The Composition".
 *
 * The argument: a job title is a container, and work is not shaped like a
 * container. Work is a COMPOSITION assembled for a particular need, out of
 * people, teams and — increasingly, and as a first-class subject in this
 * product's architecture — AI agents under human supervision.
 *
 * So the object on screen is a set of capability elements, and a task is a
 * request that arranges them. Change the task and the same elements
 * re-arrange into a different composition with a different mix. Nothing is
 * claimed about volumes; the mix is illustrative and labelled as such.
 */

export type Role = "person" | "team" | "agent";

export type Task = {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly body: string;
  /** how many elements of each role this composition asks for */
  readonly quota: Readonly<Record<Role, number>>;
  readonly formation: "wall" | "arc" | "helix" | "ring";
};

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  person: "People",
  team: "Teams",
  agent: "AI agents",
};

export const TASKS: readonly Task[] = [
  {
    id: "refit",
    label: "Refit a building",
    title: "A building refit is mostly people.",
    body: "Trades, a site team, and one supervised agent doing the paperwork nobody wants to do twice. The composition is heavy at the human end, and it should be.",
    quota: { person: 15, team: 3, agent: 1 },
    formation: "wall",
  },
  {
    id: "programme",
    label: "Open a training programme",
    title: "A programme is a different shape entirely.",
    body: "An institution, its teachers, the learners' own practice, and the evidence each of them leaves behind. Education is not a separate product here — it is the same elements, arranged for a different need.",
    quota: { person: 9, team: 4, agent: 3 },
    formation: "arc",
  },
  {
    id: "product",
    label: "Ship a product",
    title: "Here the agents stop being an accessory.",
    body: "A small human core, and a set of agent roles that hold real reviewed work. An agent earns its place the same way a person does — by what was accepted, not by what it claimed.",
    quota: { person: 7, team: 2, agent: 6 },
    formation: "helix",
  },
  {
    id: "company",
    label: "Start a company",
    title: "And sometimes the composition is small.",
    body: "Two or three people who can actually do the thing, one team they can borrow, and enough evidence for somebody to take them seriously. That is a real market participant.",
    quota: { person: 5, team: 2, agent: 2 },
    formation: "ring",
  },
];

/** Fixed population of elements. Roles are permanent per element, so a task
 *  change visibly RE-SELECTS rather than re-labelling: you can see which
 *  elements were not needed this time. */
export const POPULATION: readonly Role[] = (() => {
  const out: Role[] = [];
  for (let i = 0; i < 22; i += 1) out.push("person");
  for (let i = 0; i < 10; i += 1) out.push("team");
  for (let i = 0; i < 8; i += 1) out.push("agent");
  return out;
})();
