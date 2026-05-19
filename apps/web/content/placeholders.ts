/**
 * Single registry of truth for ALL placeholder content (brief: Placeholder
 * Content Governance). Components NEVER inline a fake name/number/logo — they
 * render <Placeholder id="..." />, which reads from here. This guarantees
 * every placeholder is findable, tagged, and promotable in one place.
 */

export type PlaceholderType =
  | "person"
  | "stat"
  | "logo"
  | "testimonial"
  | "metric"
  | "screenshot"
  | "company"
  | "project";

export type PlaceholderValue =
  | { lt: string; en: string }
  | string
  | number
  | { src: string; alt: string };

export type PlaceholderStatus = "placeholder" | "pending-real" | "replaced";

export type Milestone = "M0" | "M1" | "M2" | "M3" | "M4" | "M5" | string;

export type Placeholder = {
  id: string;
  type: PlaceholderType;
  value: PlaceholderValue;
  /** What this represents in the UI. */
  description: string;
  /** Exactly what real data replaces this and from where. */
  replacementSource: string;
  status: PlaceholderStatus;
  addedIn: Milestone;
  /** true for persons, logos, testimonials. */
  consentRequired: boolean;
  notes?: string;
};

const SQL = (q: string) => `SQL: ${q}`;

export const placeholders: readonly Placeholder[] = [
  {
    id: "hero.worker.featured",
    type: "person",
    value: {
      lt: "Tomas Jankauskas — Statybos vadovas",
      en: "Tomas Jankauskas — Site Supervisor",
    },
    description: "Featured worker on the landing hero profile card.",
    replacementSource:
      "Real consented worker profile from the `workers` table (featured-profile consent on file).",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: true,
    notes: "consented:false — same persona as reference imagery.",
  },
  {
    id: "hero.project.featured",
    type: "project",
    value: {
      lt: "Renovacijos darbai – Amsterdamas",
      en: "Renovation Works – Amsterdam",
    },
    description: "Featured active project on the landing hero project card.",
    replacementSource:
      "Real project from `projects` where status='live'.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
  },
  {
    id: "stats.active_workers",
    type: "stat",
    value: "320K+",
    description: "Hero stat row — active workers count.",
    replacementSource: SQL(
      "SELECT count(*) FROM workers WHERE status='available'",
    ),
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
  },
  {
    id: "stats.live_projects",
    type: "stat",
    value: "18K+",
    description: "Hero stat row — live projects count.",
    replacementSource: SQL(
      "SELECT count(*) FROM projects WHERE status='live'",
    ),
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
  },
  {
    id: "stats.companies",
    type: "stat",
    value: "4.2K",
    description: "Hero stat row — companies count.",
    replacementSource: SQL("SELECT count(*) FROM companies"),
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
  },
  {
    id: "stats.success_rate",
    type: "stat",
    value: "92%",
    description: "Hero stat row — success rate.",
    replacementSource:
      "Derived from `match_actions` accept rate over the last 90 days.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
  },
  ...Array.from({ length: 6 }, (_, i): Placeholder => {
    const n = i + 1;
    return {
      id: `partners.logo.${n}`,
      type: "logo",
      value: {
        src: "/placeholders/logo-mark.svg",
        alt: `Partner logo placeholder ${n}`,
      },
      description: `Trusted-by logo row — slot ${n} (dimmed placeholder mark).`,
      replacementSource:
        "Real partner logo with written consent (see docs/CONSENT_LOG.md).",
      status: "placeholder",
      addedIn: "M0",
      consentRequired: true,
      notes: "consented:false",
    };
  }),
  {
    id: "testimonial.featured",
    type: "testimonial",
    value: {
      lt: "Perėjus prie labourmarket.ai, įdarbinimo laikas sutrumpėjo 42% — Markus de Vries",
      en: "Since switching to labourmarket.ai, our time to hire dropped by 42% — Markus de Vries",
    },
    description: "Featured testimonial quote on the landing page.",
    replacementSource: "Real quote with a signed release on file.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: true,
    notes: "consented:false",
  },
  ...(
    [
      ["free", "Nemokamas", "Free"],
      ["business", "Verslo", "Business"],
      ["agency", "Agentūros", "Agency"],
      ["enterprise", "Įmonių", "Enterprise"],
    ] as const
  ).map(
    ([slug, lt, en]): Placeholder => ({
      id: `pricing.plan.${slug}`,
      type: "stat",
      value: { lt: `${lt}: kaina nustatoma`, en: `${en}: pricing TBD` },
      description: `Pricing card — ${en} plan monthly price.`,
      replacementSource:
        "Founder-set monthly price in `plans.price_eur_monthly` " +
        "(slug='" +
        slug +
        "'); promote here once pricing is finalized.",
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
      notes: "Plan tier row is real config; only the price is unset.",
    }),
  ),
  ...Array.from({ length: 3 }, (_, i): Placeholder => {
    const n = i + 1;
    const samples: Record<number, { lt: string; en: string }> = {
      1: {
        lt: "Naujas darbo poreikis – Rotterdamas",
        en: "New job demand posted — Rotterdam",
      },
      2: {
        lt: "Darbuotojas patvirtino prieinamumą",
        en: "Worker confirmed availability",
      },
      3: {
        lt: "Komanda suformuota projektui",
        en: "Team formed for a project",
      },
    };
    return {
      id: `activity.feed.${n}`,
      type: "metric",
      value: samples[n],
      description: `Live activity feed — recent item ${n}.`,
      replacementSource: SQL(
        "SELECT ... FROM audit_logs ORDER BY occurred_at DESC LIMIT 5",
      ),
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    };
  }),
  {
    id: "system.status",
    type: "metric",
    value: { lt: "GYVA SISTEMA", en: "LIVE SYSTEM" },
    description: "Top-nav status pill (green pulse) — pre-launch placeholder.",
    replacementSource:
      "Real platform health signal from the status/uptime service once the platform is live.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
    notes: "Platform is pre-launch; the pill is aspirational until then.",
  },
  ...Array.from({ length: 4 }, (_, i): Placeholder => {
    const n = i + 1;
    const samples: Record<number, { lt: string; en: string }> = {
      1: { lt: "5 CV laukia peržiūros", en: "5 CVs awaiting review" },
      2: {
        lt: "3 darbuotojai turi pažymėti atvykimą",
        en: "3 workers to check in",
      },
      3: { lt: "1 saugos įspėjimas objekte", en: "1 site safety alert" },
      4: {
        lt: "2 sutartys baigiasi šią savaitę",
        en: "2 contracts expiring this week",
      },
    };
    return {
      id: `hero.action.${n}`,
      type: "metric",
      value: samples[n],
      description: `Hero action-center card — action item ${n}.`,
      replacementSource: SQL(
        "SELECT ... FROM audit_logs / match_actions for the signed-in account",
      ),
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    };
  }),
  {
    id: "team.onsite.count",
    type: "stat",
    value: "24",
    description: "Second-row 'Team on site' card — workers on site count.",
    replacementSource: SQL(
      "SELECT count(*) FROM workers w JOIN agency_workers ... WHERE on_site",
    ),
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
  },
  {
    id: "team.onsite.roles",
    type: "metric",
    value: {
      lt: "8 montuotojai · 6 betonuotojai · 5 suvirintojai · 5 pagalbiniai",
      en: "8 fitters · 6 concreters · 5 welders · 5 helpers",
    },
    description: "Second-row 'Team on site' card — role breakdown summary.",
    replacementSource:
      "Aggregated from `worker_skills` / `agency_workers` for the active project.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
  },
  ...Array.from({ length: 3 }, (_, i): Placeholder => {
    const n = i + 1;
    const samples: Record<number, { lt: string; en: string }> = {
      1: {
        lt: "Rangovas: „Rytojaus pamaina prasideda 6:30“ · prieš 4 min",
        en: "Contractor: “Tomorrow's shift starts 6:30” · 4 min ago",
      },
      2: {
        lt: "Agentūra: „Patvirtinti dar 3 suvirintojai“ · prieš 1 val",
        en: "Agency: “3 more welders confirmed” · 1 h ago",
      },
      3: {
        lt: "Darbuotojas: „Atvykstu pirmadienį“ · prieš 2 val",
        en: "Worker: “Arriving Monday” · 2 h ago",
      },
    };
    return {
      id: `comm.thread.${n}`,
      type: "metric",
      value: samples[n],
      description: `Second-row 'Communication' card — thread snippet ${n}.`,
      replacementSource: SQL(
        "SELECT body, sent_at FROM messages ORDER BY sent_at DESC LIMIT 3",
      ),
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    };
  }),
  {
    id: "companies.main_contractor",
    type: "company",
    value: { lt: "Pagrindinis rangovas (pavyzdys)", en: "Main contractor (sample)" },
    description: "Second-row 'Companies & HR' card — main contractor name.",
    replacementSource:
      "Real company from `companies` with written consent to be shown.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: true,
    notes: "consented:false",
  },
  ...Array.from({ length: 3 }, (_, i): Placeholder => {
    const n = i + 1;
    return {
      id: `companies.subcontractor.${n}`,
      type: "company",
      value: {
        lt: `Subrangovas ${n} (pavyzdys)`,
        en: `Subcontractor ${n} (sample)`,
      },
      description: `Second-row 'Companies & HR' card — subcontractor ${n}.`,
      replacementSource:
        "Real company from `companies` with written consent to be shown.",
      status: "placeholder",
      addedIn: "M0",
      consentRequired: true,
      notes: "consented:false",
    };
  }),
  ...(
    [
      [
        "demand",
        "Paklausa (pavyzdiniai duomenys)",
        "Demand (sample data)",
        "derived from `job_demands` posted over the last 30 days",
      ],
      [
        "workers",
        "Laisvi darbuotojai (pavyzdiniai duomenys)",
        "Available workers (sample data)",
        "derived from `workers` where availability_status='available'",
      ],
      [
        "competition",
        "Konkurencija (pavyzdiniai duomenys)",
        "Competition (sample data)",
        "derived from competing `job_demands` density per region",
      ],
    ] as const
  ).map(
    ([key, lt, en, src]): Placeholder => ({
      id: `market.${key}.series`,
      type: "metric",
      value: { lt, en },
      description: `Market-intelligence band — ${key} sparkline (series is sample data).`,
      replacementSource: `Time series ${src}.`,
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    }),
  ),
  {
    id: "market.top_skills",
    type: "metric",
    value: {
      lt: "Armatūros rišimas · Klojiniai · MIG/MAG suvirinimas · Pastoliai · ŠVOK",
      en: "Steel fixing · Formwork · MIG/MAG welding · Scaffolding · HVAC",
    },
    description: "Market-intelligence band — top in-demand skills list.",
    replacementSource: SQL(
      "SELECT skill, count(*) FROM job_demands, unnest(required_skills) ... ORDER BY 2 DESC LIMIT 5",
    ),
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
  },
  ...(
    [
      ["worker", "Darbuotojo profilio srautas", "Worker avatar flow"],
      ["company", "Įmonės paklausos srautas", "Company demand flow"],
      ["agency", "Agentūros režimo srautas", "Agency mode flow"],
    ] as const
  ).map(
    ([role, lt, en]): Placeholder => ({
      id: `screenshot.flow.${role}`,
      type: "screenshot",
      value: {
        lt: `${lt} — ekrano vaizdas bus pridėtas`,
        en: `${en} — screenshot pending`,
      },
      description: `${en} screenshot card on the /for-${role === "worker" ? "workers" : role === "company" ? "companies" : "agencies"} page.`,
      replacementSource:
        "Real product screenshot captured from the built feature (M1+).",
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    }),
  ),
  ...(
    [
      ["terms", "Naudojimo sąlygos", "Terms of Service"],
      ["privacy", "Privatumo politika", "Privacy Policy"],
      ["cookies", "Slapukų politika", "Cookie Policy"],
    ] as const
  ).map(
    ([doc, lt, en]): Placeholder => ({
      id: `legal.${doc}`,
      type: "metric",
      value: {
        lt: `${lt}: juodraštis — galutinį tekstą peržiūrės teisininkai (M5).`,
        en: `${en}: draft — final text to be reviewed by counsel (M5).`,
      },
      description: `Legal page body content — ${en}.`,
      replacementSource: "Final text reviewed by counsel — see M5.",
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    }),
  ),
] as const;

export function getPlaceholder(id: string): Placeholder {
  const found = placeholders.find((p) => p.id === id);
  if (!found) {
    throw new Error(
      `Unknown placeholder id "${id}". Add it to content/placeholders.ts.`,
    );
  }
  return found;
}

export function placeholdersByStatus(
  status: PlaceholderStatus,
): Placeholder[] {
  return placeholders.filter((p) => p.status === status);
}
