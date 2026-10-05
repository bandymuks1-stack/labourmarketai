import type { Entity } from "@/components/app/system/entity";

/**
 * DASHBOARD MODEL — one grammar, five contexts.
 *
 * Every context fills the SAME slots: a persistent headline whose accent word
 * is the live count of what needs the person, a four-step CURRENT STATE object
 * (needs you → in motion → what changed → in the market), a strip of live
 * facts, then the operating regions. Nothing is invented by the screen: each
 * row below is a fact the product already holds (a seat, a record awaiting
 * confirmation, a conversation, a need).
 */
export type CtxId = "new" | "active" | "company" | "agency" | "heavy";

export const CTX_LABEL: Record<CtxId, string> = {
  new: "New person",
  active: "Working person",
  company: "Employer",
  agency: "Agency",
  heavy: "Heavy context",
};

export type Tone = "action" | "event" | "quiet";
export type Chip = { readonly text: string; readonly tone?: Tone };

export type Tile = {
  readonly entity: Entity;
  /** one chip per step; step 0 is the one that asks for something */
  readonly chips: readonly [Chip, Chip, Chip, Chip];
};

export type Attention = {
  readonly id: string;
  readonly entity: Entity;
  readonly text: string;
  readonly action: string;
  /** what completing it changes, shown in "What changed" */
  readonly becomes: string;
};

export type Motion = {
  readonly entity: Entity;
  readonly state: string;
  readonly progress: number;
  readonly next: string;
  readonly people: readonly string[];
};

export type Change = { readonly entity: Entity; readonly text: string; readonly when: string; readonly level: "confirmed" | "recorded" | "joined" };
export type Thread = { readonly entity: Entity; readonly who: string; readonly text: string; readonly when: string; readonly unread?: boolean };

export type Dashboard = {
  readonly id: CtxId;
  readonly actingAs: { readonly kind: "person" | "company"; readonly id: string; readonly name: string; readonly role: string };
  readonly date: string;
  readonly steps: readonly [string, string, string, string];
  readonly captions: readonly [string, string, string, string];
  readonly tiles: readonly [Tile, Tile, Tile, Tile, Tile];
  readonly strip: readonly string[];
  readonly attention: readonly Attention[];
  readonly motion: readonly Motion[];
  readonly people: readonly { readonly entity: Entity; readonly chip: string }[];
  readonly changes: readonly Change[];
  readonly threads: readonly Thread[];
  readonly market: readonly { readonly entity: Entity; readonly eyebrow: string; readonly title: string; readonly note: string }[];
  readonly peopleHead: { readonly eyebrow: string; readonly title: string; readonly sub: string };
  readonly motionHead: { readonly eyebrow: string; readonly title: string; readonly sub: string };
  readonly marketHead: { readonly eyebrow: string; readonly title: string; readonly sub: string };
};

const p = (id: string): Entity => ({ kind: "person", id });
const co = (id: string): Entity => ({ kind: "company", id });
const pr = (id: string): Entity => ({ kind: "project", id });
const tm = (id: string): Entity => ({ kind: "team", id });

const STEPS = ["01 — Needs you", "02 — In motion", "03 — What changed", "04 — In the market"] as const;

const marketNeeds = [
  { entity: co("nordhaus"), eyebrow: "Need · Oslo", title: "Scaffolders, three months", note: "3 seats · from 10 Nov" },
  { entity: co("fjord"), eyebrow: "Need · Stavanger", title: "Electricians for a hotel refit", note: "2 seats · from 12 Jan" },
  { entity: co("helios"), eyebrow: "Need · Hamburg", title: "Tiler for occupied apartments", note: "1 seat · from 2 Dec" },
  { entity: { kind: "service", id: "sv1", name: "Scaffold hire and erection", by: "Tallinna Tellingud OÜ" } as Entity, eyebrow: "Service", title: "Scaffold hire and erection", note: "Tallinna Tellingud OÜ" },
] as const;

export const DASHBOARDS: Record<CtxId, Dashboard> = {
  // ───────────────────────── new / light person
  new: {
    id: "new",
    actingAs: { kind: "person", id: "do", name: "Daniel Okafor", role: "Personal" },
    date: "Tuesday 4 November",
    steps: STEPS,
    captions: ["One record is waiting for someone to confirm it", "Your first job, and what it has recorded so far", "Your first record was confirmed", "Work near you that fits what you have shown"],
    tiles: [
      { entity: p("do"), chips: [{ text: "Add 2 more records", tone: "action" }, { text: "1 job", tone: "quiet" }, { text: "1 confirmed", tone: "event" }, { text: "Fits 2 needs", tone: "quiet" }] },
      { entity: co("nordhaus"), chips: [{ text: "Ask for a confirmation", tone: "action" }, { text: "Current job", tone: "quiet" }, { text: "Confirmed 6 h", tone: "event" }, { text: "Hiring", tone: "quiet" }] },
      { entity: p("mt"), chips: [{ text: "Could confirm your work", tone: "action" }, { text: "Crew lead", tone: "quiet" }, { text: "Confirmed a record", tone: "event" }, { text: "Same trade", tone: "quiet" }] },
      { entity: pr("harbour"), chips: [{ text: "Not yet part of it", tone: "quiet" }, { text: "Needs scaffolders", tone: "quiet" }, { text: "Fits your work", tone: "quiet" }, { text: "3 seats open", tone: "action" }] },
      { entity: co("tellingud"), chips: [{ text: "Hires apprentices", tone: "quiet" }, { text: "Nearby", tone: "quiet" }, { text: "New need", tone: "quiet" }, { text: "Apprentice, 6 months", tone: "action" }] },
    ],
    strip: ["1 job recorded", "1 confirmed record", "2 needs fit your trade", "Documents: 0 uploaded"],
    attention: [
      { id: "n1", entity: p("mt"), text: "Ask Mari to confirm your last record — it turns your own record into history.", action: "Ask", becomes: "asked Mari Tamm to confirm 6 h" },
      { id: "n2", entity: co("nordhaus"), text: "Upload the certificate you already hold. Employers filter on it.", action: "Upload", becomes: "added a work at height certificate" },
    ],
    motion: [{ entity: co("nordhaus"), state: "Your current job", progress: 0.2, next: "Next record due Friday", people: ["mt", "is"] }],
    people: [{ entity: p("mt"), chip: "Crew lead · confirmed 6 h" }, { entity: p("is"), chip: "Site lead · hires" }, { entity: p("tk"), chip: "Same trade · Bergen" }, { entity: p("ap"), chip: "Safety officer · can confirm" }],
    changes: [{ entity: p("mt"), text: "confirmed 6 h of scaffold erection", when: "2 d", level: "confirmed" }],
    threads: [{ entity: p("mt"), who: "Mari Tamm", text: "Well done on Friday — I will confirm it.", when: "1 d", unread: true }],
    market: [
      { entity: pr("harbour"), eyebrow: "Project · Oslo", title: "Harbour Quarter fit-out", note: "3 scaffolder seats · from 10 Nov" },
      { entity: co("tellingud"), eyebrow: "Hires apprentices", title: "Tallinna Tellingud OÜ", note: "Apprentice, 6 months" },
      marketNeeds[3] as never,
      { entity: co("nordhaus"), eyebrow: "Employer · Oslo", title: "Nordhaus Build AS", note: "Your current employer is hiring" },
    ].map((m) => ({ ...m })),
    peopleHead: { eyebrow: "People around your work", title: "Who can *stand behind* it", sub: "Colleagues who can confirm what you recorded." },
    motionHead: { eyebrow: "Your work", title: "Where you *work now*", sub: "Each record you add builds your history." },
    marketHead: { eyebrow: "In the market", title: "Work that *fits* you", sub: "Matched on what you have shown, not what you have claimed." },
  },
  // ───────────────────────── active working person
  active: {
    id: "active",
    actingAs: { kind: "person", id: "mt", name: "Mari Tamm", role: "Personal" },
    date: "Tuesday 4 November",
    steps: STEPS,
    captions: ["Two things are waiting for you today", "Harbour Quarter is running, and you are in its team", "Your records are turning into history", "Work that fits your record, ranked by what stands behind it"],
    tiles: [
      { entity: p("is"), chips: [{ text: "Asks you to lead the crew", tone: "action" }, { text: "Site lead", tone: "quiet" }, { text: "Confirmed 6 h", tone: "event" }, { text: "Hires leads", tone: "quiet" }] },
      { entity: p("tk"), chips: [{ text: "Needs your sign-off", tone: "action" }, { text: "Your crew", tone: "quiet" }, { text: "Recorded 8 h", tone: "quiet" }, { text: "Same trade", tone: "quiet" }] },
      { entity: p("an2"), chips: [{ text: "Starts a week late", tone: "action" }, { text: "Scaffolder", tone: "quiet" }, { text: "Joined", tone: "event" }, { text: "Available", tone: "quiet" }] },
      { entity: pr("harbour"), chips: [{ text: "Starts 10 Nov", tone: "quiet" }, { text: "Week 1 of 16", tone: "quiet" }, { text: "Plan v3 confirmed", tone: "event" }, { text: "Needs a crew lead", tone: "action" }] },
      { entity: co("nordhaus"), chips: [{ text: "Client", tone: "quiet" }, { text: "Client", tone: "quiet" }, { text: "Agreement signed", tone: "event" }, { text: "Hiring", tone: "quiet" }] },
    ],
    strip: ["14 weeks to work", "3 records waiting", "Crew of 4", "Confirmed this month: 38 h"],
    attention: [
      { id: "a1", entity: p("tk"), text: "Tomas recorded 8 h on level 3. Confirm it, or ask what is missing.", action: "Confirm", becomes: "confirmed Tomas’s 8 h on level 3" },
      { id: "a2", entity: p("an2"), text: "Your new scaffolder starts a week after the project. Plan the cover.", action: "Plan cover", becomes: "planned cover for the first week" },
    ],
    motion: [
      { entity: pr("harbour"), state: "Active · week 1 of 16", progress: 0.06, next: "Site induction Monday 10 Nov", people: ["is", "tk", "mt", "mn", "ap"] },
      { entity: pr("hotel"), state: "Finishing · week 9 of 10", progress: 0.9, next: "Handover Friday", people: ["mn", "pz"] },
    ],
    people: [{ entity: p("is"), chip: "Site lead · asks you to lead" }, { entity: p("tk"), chip: "Waiting for your sign-off" }, { entity: p("an2"), chip: "Starts 17 Nov" }, { entity: p("ap"), chip: "Safety officer" }],
    changes: [
      { entity: p("is"), text: "confirmed 6 h of crew leadership for you", when: "2 h", level: "confirmed" },
      { entity: p("an2"), text: "joined the Harbour crew", when: "1 d", level: "joined" },
      { entity: p("tk"), text: "recorded 8 h on level 3", when: "1 d", level: "recorded" },
    ],
    threads: [
      { entity: tm("t5"), who: "Harbour core team", text: "Scaffold plan v2 is up. Level 3 access moved.", when: "14:31", unread: true },
      { entity: p("is"), who: "Ingrid Solheim", text: "Can you lead the crew from the 10th?", when: "11:05" },
    ],
    market: marketNeeds.slice(0, 3).map((m) => ({ ...m })),
    peopleHead: { eyebrow: "Your crew", title: "People *waiting* on you", sub: "Each of them can be confirmed or answered in one step." },
    motionHead: { eyebrow: "In motion", title: "Where you are *working*", sub: "The projects you are part of, and what happens next in each." },
    marketHead: { eyebrow: "In the market", title: "What your record *opens*", sub: "Ranked by confirmed work, then by how soon you could start." },
  },
  // ───────────────────────── employer
  company: {
    id: "company",
    actingAs: { kind: "company", id: "nordhaus", name: "Nordhaus Build AS", role: "Employer" },
    date: "Tuesday 4 November",
    steps: STEPS,
    captions: ["Three things need your decision before Monday", "Harbour Quarter: five of seven seats are held", "People joined, records were confirmed", "Candidates who fit the two seats that are still open"],
    tiles: [
      { entity: p("mn"), chips: [{ text: "Accepted · confirm start", tone: "action" }, { text: "Electrician", tone: "quiet" }, { text: "Joined the team", tone: "event" }, { text: "Fits 2 seats", tone: "quiet" }] },
      { entity: p("ap"), chips: [{ text: "Asked about site access", tone: "action" }, { text: "Safety officer", tone: "quiet" }, { text: "Confirmed 6 records", tone: "event" }, { text: "Available now", tone: "quiet" }] },
      { entity: p("pz"), chips: [{ text: "Busy until 20 Nov", tone: "action" }, { text: "Electrician", tone: "quiet" }, { text: "Clash found", tone: "quiet" }, { text: "Replace?", tone: "action" }] },
      { entity: pr("harbour"), chips: [{ text: "Starts Monday", tone: "quiet" }, { text: "5 of 7 seats", tone: "action" }, { text: "Team ready", tone: "event" }, { text: "2 seats open", tone: "action" }] },
      { entity: tm("t5"), chips: [{ text: "Core team", tone: "quiet" }, { text: "Core team", tone: "quiet" }, { text: "+2 joined", tone: "event" }, { text: "Needs 2", tone: "action" }] },
    ],
    strip: ["7 seats · 5 held", "2 date clashes", "6 records confirmed this week", "3 conversations"],
    attention: [
      { id: "c1", entity: p("mn"), text: "Marek accepted his seat. Confirm the start date so he can plan the move.", action: "Confirm start", becomes: "confirmed Marek Nowak’s start on 10 Nov" },
      { id: "c2", entity: p("ap"), text: "Aistė asked about site access for the first week.", action: "Reply", becomes: "answered Aistė about gate B access" },
      { id: "c3", entity: p("pz"), text: "Piotr is busy until 20 Nov — it overlaps the start. Replace him or move the seat.", action: "Resolve", becomes: "replaced Piotr with an electrician who starts on the 10th" },
    ],
    motion: [
      { entity: pr("harbour"), state: "Forming team · 5 of 7 seats", progress: 0.71, next: "Confirm team by Friday", people: ["is", "tk", "mt", "mn", "ap"] },
      { entity: pr("hotel"), state: "Active · week 9 of 10", progress: 0.9, next: "Handover Friday", people: ["mn", "pz", "lf"] },
      { entity: pr("oldtown"), state: "Planning · from 2 Mar", progress: 0.1, next: "Scope review Thursday", people: ["tk"] },
    ],
    people: [{ entity: p("mn"), chip: "Accepted a seat" }, { entity: p("ap"), chip: "Asked about access" }, { entity: p("pz"), chip: "Clash: busy until 20 Nov" }, { entity: p("an1"), chip: "Anonymous · fits electrician" }, { entity: p("mt"), chip: "Crew lead" }],
    changes: [
      { entity: p("ap"), text: "confirmed 6 records on the safety plan", when: "2 h", level: "confirmed" },
      { entity: p("mn"), text: "joined Harbour as electrician", when: "1 d", level: "joined" },
      { entity: p("is"), text: "created the Harbour core team", when: "2 d", level: "joined" },
    ],
    threads: [
      { entity: tm("t5"), who: "Harbour core team", text: "Scaffold plan v2 is up. Level 3 access moved to the east stair.", when: "14:31", unread: true },
      { entity: p("ap"), who: "Aistė Petrauskaitė", text: "Is gate B open on Monday at 07:00?", when: "11:05", unread: true },
      { entity: co("baltic"), who: "Baltic Staff UAB", text: "Two candidates ready for the open scaffolder seats.", when: "Mon" },
    ],
    market: [
      { entity: p("an1"), eyebrow: "Candidate · fits a seat", title: "Anonymous electrician", note: "6 years · available now" },
      { entity: p("vk"), eyebrow: "Candidate · fits a seat", title: "Viktor Kask", note: "Electrician · from 12 Nov" },
      { entity: co("baltic"), eyebrow: "Agency · Vilnius", title: "Baltic Staff UAB", note: "4 scaffolders available" },
    ],
    peopleHead: { eyebrow: "People", title: "Who is *waiting* on you", sub: "Everyone with an open question, a clash or a decision." },
    motionHead: { eyebrow: "Projects", title: "What is *running*", sub: "Every project, its seats, and the next thing that has to happen." },
    marketHead: { eyebrow: "Market", title: "Who could *fill* the gaps", sub: "Ranked by confirmed work in the capabilities the open seats need." },
  },
  // ───────────────────────── agency
  agency: {
    id: "agency",
    actingAs: { kind: "company", id: "baltic", name: "Baltic Staff UAB", role: "Agency" },
    date: "Tuesday 4 November",
    steps: STEPS,
    captions: ["Two clients are waiting for candidates", "Your people are placed across three projects", "Placements were confirmed this week", "New needs from employers you already work with"],
    tiles: [
      { entity: p("an2"), chips: [{ text: "Submit to Nordhaus", tone: "action" }, { text: "Placed on Old Town", tone: "quiet" }, { text: "Placement confirmed", tone: "event" }, { text: "Fits 1 need", tone: "quiet" }] },
      { entity: p("lf"), chips: [{ text: "Match for Helios", tone: "action" }, { text: "Available now", tone: "quiet" }, { text: "Interview done", tone: "event" }, { text: "Fits 2 needs", tone: "quiet" }] },
      { entity: p("mt"), chips: [{ text: "Crew lead · shortlist", tone: "action" }, { text: "Placed", tone: "quiet" }, { text: "Renewed", tone: "event" }, { text: "Fits 1 need", tone: "quiet" }] },
      { entity: co("nordhaus"), chips: [{ text: "Needs 3 scaffolders", tone: "action" }, { text: "Client", tone: "quiet" }, { text: "Placement signed", tone: "event" }, { text: "Rehires", tone: "quiet" }] },
      { entity: pr("oldtown"), chips: [{ text: "Starts 2 Mar", tone: "quiet" }, { text: "2 people placed", tone: "quiet" }, { text: "Staffed", tone: "event" }, { text: "Needs a lead", tone: "action" }] },
    ],
    strip: ["26 people on the books", "11 placed", "2 open client needs", "5 documents expiring"],
    attention: [
      { id: "g1", entity: p("an2"), text: "Nordhaus needs 3 scaffolders from 10 Nov. This candidate fits and starts a week late — submit with the note.", action: "Submit", becomes: "submitted a scaffolder to Nordhaus Build" },
      { id: "g2", entity: p("lf"), text: "Helios Interiors asked for a tiler in occupied homes. Lena has 300 h recorded there.", action: "Match", becomes: "matched Lena Fischer to Helios Interiors" },
    ],
    motion: [
      { entity: pr("harbour"), state: "Client: Nordhaus · 2 of 3 filled", progress: 0.66, next: "Submit 1 more by Friday", people: ["tk", "mt"] },
      { entity: pr("oldtown"), state: "Client: Baltic · planning", progress: 0.2, next: "Scope review Thursday", people: ["an2"] },
    ],
    people: [{ entity: p("an2"), chip: "Ready to submit" }, { entity: p("lf"), chip: "Matches Helios" }, { entity: p("mt"), chip: "Crew lead · placed" }, { entity: p("do"), chip: "New · apprentice" }],
    changes: [
      { entity: p("mt"), text: "renewed on Harbour Quarter for 16 weeks", when: "3 h", level: "confirmed" },
      { entity: p("an2"), text: "was placed on Old Town façade", when: "2 d", level: "joined" },
    ],
    threads: [
      { entity: co("nordhaus"), who: "Nordhaus Build AS", text: "Can you send the third scaffolder by Friday?", when: "13:02", unread: true },
      { entity: co("helios"), who: "Helios Interiors GmbH", text: "We prefer someone used to occupied apartments.", when: "Mon" },
    ],
    market: [
      { entity: co("nordhaus"), eyebrow: "Client need · Oslo", title: "Scaffolders, three months", note: "1 seat unfilled" },
      { entity: co("helios"), eyebrow: "Client need · Hamburg", title: "Tiler for occupied apartments", note: "1 seat · from 2 Dec" },
      { entity: co("fjord"), eyebrow: "New client · Stavanger", title: "Electricians for a hotel refit", note: "2 seats · from 12 Jan" },
    ],
    peopleHead: { eyebrow: "Your people", title: "Who is *ready* to place", sub: "Candidates whose confirmed work matches an open client need." },
    motionHead: { eyebrow: "Placements", title: "Where your people *work*", sub: "Clients, projects, and who you have placed on each." },
    marketHead: { eyebrow: "Client needs", title: "What clients *asked* for", sub: "Open needs from the employers you already work with." },
  },
  // ───────────────────────── heavy
  heavy: {
    id: "heavy",
    actingAs: { kind: "company", id: "nordhaus", name: "Nordhaus Build AS", role: "Employer" },
    date: "Tuesday 4 November",
    steps: STEPS,
    captions: ["Nine things need a decision — the oldest has waited four days", "Three projects, 31 people, two teams still forming", "Forty records were confirmed this week", "Twelve candidates fit the seats that are still open"],
    tiles: [
      { entity: p("pz"), chips: [{ text: "Clash with the start", tone: "action" }, { text: "Electrician", tone: "quiet" }, { text: "Replaced", tone: "event" }, { text: "Fits 2 seats", tone: "quiet" }] },
      { entity: p("ap"), chips: [{ text: "6 records to confirm", tone: "action" }, { text: "Safety officer", tone: "quiet" }, { text: "Confirmed 40 h", tone: "event" }, { text: "Available", tone: "quiet" }] },
      { entity: p("jb"), chips: [{ text: "Overlaps two projects", tone: "action" }, { text: "Site lead", tone: "quiet" }, { text: "Moved seat", tone: "event" }, { text: "Busy to 12 Dec", tone: "quiet" }] },
      { entity: pr("hotel"), chips: [{ text: "Handover Friday", tone: "action" }, { text: "Week 9 of 10", tone: "quiet" }, { text: "Punch list done", tone: "event" }, { text: "Closing", tone: "quiet" }] },
      { entity: tm("t14"), chips: [{ text: "13 people", tone: "quiet" }, { text: "13 people", tone: "quiet" }, { text: "+3 joined", tone: "event" }, { text: "Needs 2", tone: "action" }] },
    ],
    strip: ["31 people · 3 projects", "9 decisions", "40 records confirmed this week", "4 date clashes", "2 documents expiring"],
    attention: [
      { id: "h1", entity: p("pz"), text: "Piotr is busy until 20 Nov — overlaps Harbour’s start.", action: "Resolve", becomes: "resolved Piotr’s clash on Harbour" },
      { id: "h2", entity: p("ap"), text: "Six safety records are waiting for your confirmation.", action: "Confirm 6", becomes: "confirmed 6 of Aistė’s safety records" },
      { id: "h3", entity: p("jb"), text: "Jonas is assigned to two projects in the same weeks.", action: "Resolve", becomes: "moved Jonas off Old Town for weeks 1–7" },
      { id: "h4", entity: p("mn"), text: "Marek accepted. Confirm the start date.", action: "Confirm", becomes: "confirmed Marek’s start" },
      { id: "h5", entity: p("is"), text: "Ingrid asked for a second site lead for Old Town.", action: "Reply", becomes: "answered Ingrid about Old Town" },
      { id: "h6", entity: p("sr"), text: "A safety advisor’s HSE certificate expires in 12 days.", action: "Remind", becomes: "reminded Sofia about her certificate" },
      { id: "h7", entity: p("lf"), text: "Helios wants an answer on the tiler by Thursday.", action: "Answer", becomes: "answered Helios about the tiler" },
      { id: "h8", entity: p("vk"), text: "Viktor’s start is 2 days after the team starts.", action: "Plan", becomes: "planned Viktor’s first days" },
      { id: "h9", entity: p("an1"), text: "An anonymous electrician asked to share their identity.", action: "Review", becomes: "reviewed an identity request" },
    ],
    motion: [
      { entity: pr("harbour"), state: "Forming team · 5 of 7 seats", progress: 0.71, next: "Confirm team by Friday", people: ["is", "tk", "mt", "mn", "ap"] },
      { entity: pr("hotel"), state: "Active · week 9 of 10", progress: 0.9, next: "Handover Friday", people: ["mn", "pz", "lf", "jb"] },
      { entity: pr("oldtown"), state: "Planning · from 2 Mar", progress: 0.1, next: "Scope review Thursday", people: ["tk", "jb"] },
    ],
    people: [{ entity: p("pz"), chip: "Clash" }, { entity: p("jb"), chip: "Double-booked" }, { entity: p("ap"), chip: "6 to confirm" }, { entity: p("mn"), chip: "Accepted" }, { entity: p("sr"), chip: "Document expiring" }, { entity: p("an1"), chip: "Identity request" }],
    changes: [
      { entity: p("ap"), text: "confirmed 6 records on the safety plan", when: "2 h", level: "confirmed" },
      { entity: p("mn"), text: "joined Harbour as electrician", when: "1 d", level: "joined" },
      { entity: p("is"), text: "confirmed 12 records for the Harbour crew", when: "1 d", level: "confirmed" },
      { entity: p("lf"), text: "recorded 14 h in occupied apartments", when: "2 d", level: "recorded" },
      { entity: p("jb"), text: "confirmed 8 h of site leadership", when: "3 d", level: "confirmed" },
    ],
    threads: [
      { entity: tm("t5"), who: "Harbour core team", text: "Scaffold plan v2 is up.", when: "14:31", unread: true },
      { entity: p("ap"), who: "Aistė Petrauskaitė", text: "Is gate B open on Monday?", when: "11:05", unread: true },
      { entity: tm("t14"), who: "Stavanger hotel works", text: "Punch list closed.", when: "10:40" },
      { entity: co("baltic"), who: "Baltic Staff UAB", text: "Two candidates are ready.", when: "Mon" },
    ],
    market: [
      { entity: p("an1"), eyebrow: "Candidate", title: "Anonymous electrician", note: "6 years · available now" },
      { entity: p("vk"), eyebrow: "Candidate", title: "Viktor Kask", note: "Electrician · from 12 Nov" },
      { entity: p("sr"), eyebrow: "Candidate", title: "Sofia Ramos", note: "HSE advisor · available now" },
      { entity: co("baltic"), eyebrow: "Agency", title: "Baltic Staff UAB", note: "4 scaffolders available" },
    ],
    peopleHead: { eyebrow: "People", title: "Who is *waiting* on you", sub: "Everyone with an open question, a clash or a decision — oldest first." },
    motionHead: { eyebrow: "Projects", title: "What is *running*", sub: "Every project, its seats, and the next thing that has to happen." },
    marketHead: { eyebrow: "Market", title: "Who could *fill* the gaps", sub: "Ranked by confirmed work in the capabilities the open seats need." },
  },
};

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** The persistent headline: its accent word is the live count. */
export function headlineFor(n: number): string {
  if (n === 0) return "You are *clear*.";
  const w = WORDS[n] ?? String(n);
  return n === 1 ? `${w} thing *needs you*.` : `${w} things *need you*.`;
}


/** What each state IS, said plainly: the stage's own title for the state. */
export const STATE_TITLES = ["Waiting for you", "Running now", "Because of what happened", "Outside your walls"] as const;

/**
 * WHAT CHANGED IS CAUSAL. Each recent event is shown with what it caused:
 *   joined a team        -> a role is filled      -> coverage changed
 *   evidence confirmed   -> capability stronger   -> Living CV updated
 *   agreement accepted   -> project activated     -> the team can start
 *   work recorded        -> history grew          -> waits for confirmation
 * derived from the event itself and the kind of thing it happened to.
 */
export function causalChain(tile: Tile): readonly [string, string, string] {
  const e = tile.chips[2].text;
  const k = tile.entity.kind;
  const t = e.toLowerCase();
  if (k === "person") {
    if (/join|moved|placed|replaced/.test(t)) return [e, "Role filled", "Coverage changed"];
    if (/confirm|renewed|done/.test(t)) return [e, "Capability stronger", "Living CV updated"];
    if (/record/.test(t)) return [e, "History grew", "Waits for confirmation"];
    return [e, "Plan updated", "Next step ready"];
  }
  if (k === "company") return [/sign|accept|agree/.test(t) ? "Agreement accepted" : e, "Project activated", "The team can start"];
  if (k === "project") return [e, /ready|staffed|done/.test(t) ? "Project activated" : "Plan moved", "Seats opened"];
  if (k === "team") return [e, "Seats filled", "Coverage changed"];
  return [e, "Plan updated", "Next step ready"];
}
