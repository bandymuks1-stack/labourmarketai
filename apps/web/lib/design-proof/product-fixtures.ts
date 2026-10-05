/**
 * PRODUCT PROOF FIXTURES — arbitrary people and businesses, not protagonists.
 *
 * Sixteen people (one with a photograph, two anonymised, the rest without),
 * five companies (two with a logo), projects with and without media, and teams
 * of 2, 5 and 14. Every name, figure and place is invented sample content for
 * judging the design system; none of it is, or claims to be, production data.
 */

export type Level = "confirmed" | "recorded" | "declared";

export type Photo = { readonly src: string; readonly face: { readonly x: number; readonly y: number } };

export type Capability = {
  readonly label: string;
  readonly level: Level;
  readonly hours: number;
  /** records behind it, split by what stands behind them */
  readonly confirmed: number;
  readonly recorded: number;
};

export type Experience = {
  readonly id: string;
  readonly org: string;
  /** a company id when the visibility allows the client to be shown */
  readonly companyId?: string;
  readonly role: string;
  readonly project?: string;
  readonly from: string;
  readonly to: string;
  readonly hours?: number;
  readonly confirmed: number;
  readonly recorded: number;
  readonly note?: string;
  readonly team?: number;
};

export type Availability =
  | { readonly state: "now"; readonly note: string }
  | { readonly state: "from"; readonly note: string }
  | { readonly state: "busy"; readonly note: string; readonly from: number; readonly to: number };

export type Person = {
  readonly id: string;
  readonly name: string;
  readonly headline: string;
  readonly role: string;
  readonly photo?: Photo;
  readonly anonymous?: boolean;
  readonly location: string;
  readonly availability: Availability;
  readonly languages: readonly string[];
  readonly caps: readonly Capability[];
  readonly experience: readonly Experience[];
  readonly training: readonly { readonly label: string; readonly year: string; readonly kind: "education" | "course" }[];
  readonly documents: readonly { readonly label: string; readonly valid: string; readonly state: "valid" | "expiring" }[];
  readonly mobility?: string;
  readonly progression: readonly string[];
  readonly years: number;
  readonly about?: string;
};

const cap = (label: string, level: Level, hours: number, confirmed: number, recorded: number): Capability => ({
  label,
  level,
  hours,
  confirmed,
  recorded,
});

export const PEOPLE: readonly Person[] = [
  {
    id: "tk",
    name: "Tomas Kazlauskas",
    headline: "Scaffolder, façade and heritage work",
    role: "Scaffolder",
    photo: { src: "/hero/tomas/portrait-400.webp", face: { x: 0.5, y: 0.3 } },
    location: "Bergen, NO",
    availability: { state: "now", note: "Available now" },
    languages: ["Lithuanian", "English", "Norwegian (basic)"],
    years: 6,
    caps: [
      cap("Scaffold erection", "confirmed", 612, 21, 5),
      cap("Work at height", "confirmed", 540, 19, 4),
      cap("Fall-arrest planning", "recorded", 48, 0, 4),
      cap("Reading drawings", "confirmed", 36, 2, 1),
      cap("Leading a crew", "declared", 0, 0, 0),
    ],
    experience: [
      { id: "e1", org: "Nordhaus Build AS", companyId: "nordhaus", role: "Scaffolder", project: "Residential quarter, Bergen", from: "2025", to: "now", hours: 760, confirmed: 24, recorded: 6 },
      { id: "e2", org: "Baltic Scaffold UAB", role: "Scaffolder", project: "Old Town façade, Vilnius", from: "2023", to: "2025", hours: 1180, confirmed: 31, recorded: 9 },
      { id: "e3", org: "Kauno Pastolių Montažas", role: "Scaffolder", from: "2021", to: "2023", hours: 640, confirmed: 8, recorded: 12 },
    ],
    training: [{ label: "Scaffold inspector, level 2", year: "2024", kind: "course" }],
    documents: [
      { label: "Work at height certificate", valid: "to 2027", state: "valid" },
      { label: "First aid", valid: "to Nov 2026", state: "expiring" },
    ],
    mobility: "Norway, Sweden, Lithuania",
    progression: ["Apprentice", "Scaffolder", "Inspector"],
  },
  {
    id: "is",
    name: "Ingrid Solheim",
    headline: "Site lead, residential and commercial fit-out",
    role: "Site lead",
    location: "Oslo, NO",
    availability: { state: "from", note: "From 3 Nov" },
    languages: ["Norwegian", "English", "Swedish"],
    years: 14,
    caps: [
      cap("Site leadership", "confirmed", 3100, 58, 6),
      cap("HSE planning", "confirmed", 420, 14, 2),
      cap("Reading drawings", "confirmed", 900, 22, 3),
      cap("Subcontractor coordination", "confirmed", 640, 17, 4),
      cap("Cost control", "recorded", 120, 0, 8),
    ],
    experience: [
      { id: "e1", org: "Nordhaus Build AS", companyId: "nordhaus", role: "Site lead", project: "Harbour Quarter", from: "2022", to: "now", hours: 2400, confirmed: 46, recorded: 5, team: 22, note: "Led teams of up to 22" },
      { id: "e2", org: "Skanska", role: "Assistant site manager", project: "Office block, Oslo", from: "2018", to: "2022", hours: 3800, confirmed: 40, recorded: 6, team: 12 },
      { id: "e3", org: "Veidekke", role: "Foreman", from: "2012", to: "2018", hours: 5200, confirmed: 20, recorded: 15, team: 6 },
    ],
    training: [
      { label: "Construction management, BSc", year: "2012", kind: "education" },
      { label: "HSE for site leaders", year: "2023", kind: "course" },
    ],
    documents: [{ label: "Site manager authorisation", valid: "to 2028", state: "valid" }],
    mobility: "Norway",
    progression: ["Foreman", "Assistant site manager", "Site lead"],
    about: "Runs sites where several trades overlap; known for clear weekly plans.",
  },
  {
    id: "mn",
    name: "Marek Nowak",
    headline: "Electrician, installation and testing",
    role: "Electrician",
    location: "Gdańsk, PL",
    availability: { state: "now", note: "Available now" },
    languages: ["Polish", "English", "German (basic)"],
    years: 9,
    caps: [
      cap("Electrical installation", "confirmed", 4100, 44, 7),
      cap("Testing and commissioning", "confirmed", 700, 12, 3),
      cap("Reading drawings", "confirmed", 500, 9, 2),
      cap("Fire alarm systems", "recorded", 90, 0, 5),
    ],
    experience: [
      { id: "e1", org: "Fjord Electric AS", companyId: "fjord", role: "Electrician", project: "Hotel fit-out, Stavanger", from: "2024", to: "2026", hours: 2100, confirmed: 24, recorded: 3 },
      { id: "e2", org: "ElMont Sp. z o.o.", role: "Electrician", from: "2019", to: "2024", hours: 6100, confirmed: 28, recorded: 9 },
    ],
    training: [{ label: "Electrician, vocational", year: "2016", kind: "education" }],
    documents: [
      { label: "Electrical licence (EU)", valid: "to 2029", state: "valid" },
      { label: "Work at height", valid: "to Jan 2027", state: "valid" },
    ],
    mobility: "Norway, Germany, Poland",
    progression: ["Electrician"],
  },
  {
    id: "ap",
    name: "Aistė Petrauskaitė",
    headline: "Safety officer, construction sites",
    role: "Safety officer",
    location: "Kaunas, LT",
    availability: { state: "from", note: "From 10 Nov" },
    languages: ["Lithuanian", "English", "Russian"],
    years: 7,
    caps: [
      cap("Safety planning", "confirmed", 1500, 26, 3),
      cap("Site inspection", "confirmed", 900, 18, 2),
      cap("Incident reporting", "recorded", 60, 0, 6),
    ],
    experience: [
      { id: "e1", org: "Statybų Saugos Centras", role: "Safety officer", from: "2020", to: "now", hours: 3800, confirmed: 44, recorded: 5 },
      { id: "e2", org: "Hidrostatyba", role: "Safety assistant", from: "2018", to: "2020", hours: 1500, confirmed: 8, recorded: 6 },
    ],
    training: [{ label: "Occupational safety, MSc", year: "2018", kind: "education" }],
    documents: [{ label: "Safety coordinator licence", valid: "to Mar 2027", state: "valid" }],
    mobility: "Baltics, Norway",
    progression: ["Assistant", "Officer"],
  },
  {
    id: "do",
    name: "Daniel Okafor",
    headline: "Apprentice scaffolder, first year",
    role: "Scaffolder",
    location: "Oslo, NO",
    availability: { state: "now", note: "Available now" },
    languages: ["English", "Norwegian (basic)"],
    years: 1,
    caps: [
      cap("Scaffold erection", "recorded", 120, 1, 6),
      cap("Work at height", "declared", 0, 0, 0),
    ],
    experience: [
      { id: "e1", org: "Oslo Stillas AS", role: "Apprentice scaffolder", from: "2025", to: "now", hours: 120, confirmed: 1, recorded: 6 },
    ],
    training: [{ label: "Vocational school, building trades", year: "2025", kind: "education" }],
    documents: [],
    progression: ["Apprentice"],
  },
  {
    id: "an1",
    name: "Anonymous candidate",
    headline: "Electrician · 6 years · installation",
    role: "Electrician",
    anonymous: true,
    location: "Region: Mazovia, PL",
    availability: { state: "now", note: "Available now" },
    languages: ["Polish", "English"],
    years: 6,
    caps: [
      cap("Electrical installation", "confirmed", 2600, 28, 4),
      cap("Testing and commissioning", "recorded", 200, 0, 7),
    ],
    experience: [],
    training: [],
    documents: [{ label: "Electrical licence (EU)", valid: "valid", state: "valid" }],
    progression: [],
  },
  {
    id: "an2",
    name: "Anonymous candidate",
    headline: "Scaffolder · 4 years · façade",
    role: "Scaffolder",
    anonymous: true,
    location: "Region: Vilnius, LT",
    availability: { state: "from", note: "From 17 Nov" },
    languages: ["Lithuanian", "English"],
    years: 4,
    caps: [
      cap("Scaffold erection", "confirmed", 1400, 15, 3),
      cap("Work at height", "confirmed", 1200, 14, 2),
    ],
    experience: [],
    training: [],
    documents: [{ label: "Work at height", valid: "valid", state: "valid" }],
    progression: [],
  },
  {
    id: "lf",
    name: "Lena Fischer",
    headline: "Tiler, painter and joiner; drives",
    role: "Finishing trades",
    location: "Hamburg, DE",
    availability: { state: "now", note: "Available now" },
    languages: ["German", "English", "Turkish"],
    years: 11,
    caps: [
      cap("Tiling", "confirmed", 2800, 36, 4),
      cap("Painting and plastering", "confirmed", 1900, 22, 6),
      cap("Joinery", "recorded", 640, 3, 9),
      cap("Waterproofing", "confirmed", 520, 9, 1),
      cap("Delivery driving (B, BE)", "declared", 0, 0, 0),
      cap("Customer work in occupied homes", "recorded", 300, 0, 8),
    ],
    experience: [
      { id: "e1", org: "Self-employed", role: "Finishing trades", project: "Apartment renovations", from: "2020", to: "now", hours: 5200, confirmed: 41, recorded: 14, note: "Private and housing-company clients" },
      { id: "e2", org: "Bauwerk Nord GmbH", role: "Tiler", from: "2015", to: "2020", hours: 7400, confirmed: 22, recorded: 4 },
      { id: "e3", org: "Malerbetrieb Hansen", role: "Painter", from: "2012", to: "2015", hours: 3000, confirmed: 7, recorded: 5 },
    ],
    training: [
      { label: "Master tiler (Meister)", year: "2018", kind: "education" },
      { label: "Asbestos awareness", year: "2022", kind: "course" },
    ],
    documents: [{ label: "Driving licence B, BE", valid: "valid", state: "valid" }],
    mobility: "Germany, Denmark",
    progression: ["Apprentice", "Journeyman", "Master"],
  },
  {
    id: "pz",
    name: "Piotr Zieliński",
    headline: "Electrician, industrial and commercial",
    role: "Electrician",
    location: "Poznań, PL",
    availability: { state: "busy", note: "On a project until 20 Nov", from: 0, to: 7 },
    languages: ["Polish", "English"],
    years: 12,
    caps: [
      cap("Electrical installation", "confirmed", 6200, 60, 8),
      cap("Cable pulling and termination", "confirmed", 1600, 20, 2),
    ],
    experience: [{ id: "e1", org: "ElMont Sp. z o.o.", role: "Electrician", from: "2014", to: "now", hours: 9800, confirmed: 80, recorded: 10 }],
    training: [],
    documents: [{ label: "Electrical licence (EU)", valid: "to 2028", state: "valid" }],
    mobility: "Poland, Germany",
    progression: ["Electrician"],
  },
  {
    id: "mt",
    name: "Mari Tamm",
    headline: "Scaffolder and crew lead",
    role: "Scaffolder",
    location: "Tallinn, EE",
    availability: { state: "now", note: "Available now" },
    languages: ["Estonian", "English", "Finnish"],
    years: 8,
    caps: [
      cap("Scaffold erection", "confirmed", 2400, 30, 4),
      cap("Work at height", "confirmed", 2200, 28, 3),
      cap("Leading a crew", "confirmed", 640, 9, 2),
    ],
    experience: [
      { id: "e1", org: "Tallinna Tellingud OÜ", role: "Crew lead", from: "2021", to: "now", hours: 3000, confirmed: 34, recorded: 5, team: 5 },
      { id: "e2", org: "Tallinna Tellingud OÜ", role: "Scaffolder", from: "2018", to: "2021", hours: 2200, confirmed: 18, recorded: 4 },
    ],
    training: [{ label: "Scaffold erection, level 2", year: "2019", kind: "course" }],
    documents: [{ label: "Work at height", valid: "to 2027", state: "valid" }],
    mobility: "Nordics, Baltics",
    progression: ["Scaffolder", "Crew lead"],
  },
  {
    id: "jb",
    name: "Jonas Berg",
    headline: "Site lead, civil and infrastructure",
    role: "Site lead",
    location: "Bergen, NO",
    availability: { state: "busy", note: "On a project until 12 Dec", from: 0, to: 9 },
    languages: ["Norwegian", "English"],
    years: 17,
    caps: [
      cap("Site leadership", "confirmed", 6000, 70, 8),
      cap("HSE planning", "confirmed", 600, 11, 1),
    ],
    experience: [{ id: "e1", org: "Veidekke", role: "Site lead", from: "2016", to: "now", hours: 12000, confirmed: 70, recorded: 12, team: 30 }],
    training: [],
    documents: [],
    mobility: "Norway",
    progression: ["Foreman", "Site lead"],
  },
  {
    id: "sr",
    name: "Sofia Ramos",
    headline: "HSE advisor, construction and industry",
    role: "Safety officer",
    location: "Lisbon, PT",
    availability: { state: "now", note: "Available now" },
    languages: ["Portuguese", "English", "Spanish"],
    years: 10,
    caps: [
      cap("Safety planning", "confirmed", 3200, 40, 5),
      cap("Site inspection", "confirmed", 1800, 25, 3),
      cap("Training others", "recorded", 200, 0, 6),
    ],
    experience: [{ id: "e1", org: "Consultora SegObra", role: "HSE advisor", from: "2016", to: "now", hours: 6000, confirmed: 65, recorded: 8 }],
    training: [{ label: "Safety engineering, MSc", year: "2015", kind: "education" }],
    documents: [{ label: "HSE advisor certification", valid: "to 2028", state: "valid" }],
    mobility: "EU",
    progression: ["Technician", "Advisor"],
  },
  {
    id: "vk",
    name: "Viktor Kask",
    headline: "Electrician, residential",
    role: "Electrician",
    location: "Tartu, EE",
    availability: { state: "from", note: "From 12 Nov" },
    languages: ["Estonian", "English"],
    years: 5,
    caps: [cap("Electrical installation", "recorded", 1500, 4, 18), cap("Testing and commissioning", "declared", 0, 0, 0)],
    experience: [{ id: "e1", org: "Kask Elekter OÜ", role: "Electrician", from: "2021", to: "now", hours: 3200, confirmed: 4, recorded: 22 }],
    training: [],
    documents: [{ label: "Electrical licence (EE)", valid: "to 2028", state: "valid" }],
    progression: ["Electrician"],
  },
  {
    id: "ex1",
    name: "Maximilian Alexander von Hohenzollern-Weidenfeld",
    headline: "Gerüstbauer-Vorarbeiter für Fassaden- und Denkmalpflegearbeiten",
    role: "Gerüstbauer-Vorarbeiter",
    location: "Garmisch-Partenkirchen, DE",
    availability: { state: "from", note: "Verfügbar ab dem 17. November" },
    languages: ["Deutsch", "Englisch"],
    years: 12,
    caps: [cap("Gerüstbau an denkmalgeschützten Fassaden", "confirmed", 3100, 38, 4), cap("Arbeiten in großer Höhe", "confirmed", 2800, 33, 2)],
    experience: [],
    training: [],
    documents: [],
    progression: [],
  },
];

export const personById = (id: string): Person => PEOPLE.find((p) => p.id === id)!;

// ───────────── companies ─────────────

export type Company = {
  readonly id: string;
  readonly name: string;
  readonly kind: "Employer" | "Agency" | "Contractor";
  readonly place: string;
  /** an SVG path for a logo mark, or undefined (no logo) */
  readonly logo?: { readonly path: string; readonly viewBox?: string };
};

export const COMPANIES: readonly Company[] = [
  {
    id: "nordhaus",
    name: "Nordhaus Build AS",
    kind: "Employer",
    place: "Oslo, NO",
    logo: { path: "M12 52V20l20-12 20 12v32h-12V30L32 24l-8 6v22z", viewBox: "0 0 64 64" },
  },
  {
    id: "baltic",
    name: "Baltic Staff UAB",
    kind: "Agency",
    place: "Vilnius, LT",
    logo: { path: "M10 14h26a12 12 0 010 24H22v12h-12zM22 24v4h14a2 2 0 000-4z", viewBox: "0 0 64 64" },
  },
  { id: "fjord", name: "Fjord Electric AS", kind: "Contractor", place: "Stavanger, NO" },
  { id: "tellingud", name: "Tallinna Tellingud OÜ", kind: "Contractor", place: "Tallinn, EE" },
  { id: "helios", name: "Helios Interiors GmbH", kind: "Employer", place: "Hamburg, DE" },
  { id: "exco", name: "Internationale Gebäudetechnik und Anlagenbau GmbH & Co. KG", kind: "Contractor", place: "Ludwigshafen am Rhein, DE" },
];

export const companyById = (id: string): Company => COMPANIES.find((c) => c.id === id)!;

// ───────────── projects & teams ─────────────

export type Project = {
  readonly id: string;
  readonly name: string;
  readonly place: string;
  readonly client: string;
  readonly from: string;
  readonly to: string;
  readonly status: "Forming team" | "Active" | "Planning";
  readonly media?: { readonly src: string; readonly pos: string };
};

export const PROJECTS: readonly Project[] = [
  {
    id: "harbour",
    name: "Harbour Quarter fit-out",
    place: "Oslo, NO",
    client: "nordhaus",
    from: "10 Nov",
    to: "28 Feb",
    status: "Forming team",
    media: { src: "/hero/tomas/04-country-no-1920.webp", pos: "12% 70%" },
  },
  { id: "oldtown", name: "Old Town façade restoration", place: "Vilnius, LT", client: "baltic", from: "2 Mar", to: "30 Jun", status: "Planning" },
  { id: "hotel", name: "Hotel kitchen refit", place: "Stavanger, NO", client: "fjord", from: "12 Jan", to: "20 Mar", status: "Active" },
  { id: "exp", name: "Erweiterung des Hauptbahnhofs, Bauabschnitt 3b — Gleisfeld Nord und Bahnsteigüberdachung", place: "Frankfurt am Main, DE", client: "exco", from: "2 Mar", to: "30 Sep", status: "Planning" },
];

export const NEED = {
  projectId: "harbour",
  roles: [
    { id: "lead", label: "Site lead", count: 1, caps: ["Site leadership", "HSE planning"] },
    { id: "scaf", label: "Scaffolder", count: 3, caps: ["Scaffold erection", "Work at height"] },
    { id: "elec", label: "Electrician", count: 2, caps: ["Electrical installation"] },
    { id: "hse", label: "Safety officer", count: 1, caps: ["Safety planning"] },
  ],
  /** capabilities the project needs covered at all, with the headcount that has them confirmed */
  required: ["Site leadership", "Work at height", "Scaffold erection", "Electrical installation", "Safety planning", "Reading drawings"],
} as const;

export type RoleId = (typeof NEED.roles)[number]["id"];

/** weeks 0–13 for the project window */
export const WEEKS = 14;

export const TEAMS = {
  pair: { id: "t2", name: "Façade crew A", members: ["tk", "mt"] },
  five: { id: "t5", name: "Harbour core team", members: ["is", "tk", "mt", "mn", "ap"] },
  huge: { id: "t40", name: "Großbaustelle Hauptbahnhof, alle Gewerke", members: Array.from({ length: 40 }, (_, i) => ["is", "tk", "mt", "mn", "ap", "do", "lf", "pz"][i % 8]!) },
  large: {
    id: "t14",
    name: "Stavanger hotel works",
    members: ["is", "tk", "mt", "mn", "ap", "do", "lf", "pz", "jb", "sr", "vk", "an1", "an2"],
  },
} as const;
