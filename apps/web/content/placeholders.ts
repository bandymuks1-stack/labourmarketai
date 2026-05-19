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

/** Feed item glyph (5b.1 live skin). */
export type PlaceholderIcon = "join" | "demand" | "match" | "checkin";

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
  /**
   * Animated counters/tickers rotate through this set so the UI "moves"
   * without any real data. Still fake — `value` is the representative entry.
   */
  cycle?: readonly PlaceholderValue[];
  /** Feed-row glyph type (5b.1). */
  icon?: PlaceholderIcon;
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
    cycle: ["318K+", "320K+", "321K+", "323K+"],
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
    cycle: ["17K+", "18K+", "18K+", "19K+"],
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
    cycle: ["4.1K", "4.2K", "4.2K", "4.3K"],
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
    cycle: ["91%", "92%", "92%", "93%"],
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
  ...(
    [
      ["join", "Naujas darbuotojas prisijungė – Vilnius", "New worker joined — Vilnius"],
      ["demand", "Naujas darbo poreikis – Roterdamas", "New job demand — Rotterdam"],
      ["match", "Atitikimas: suvirintojas → projektas", "Match: welder → project"],
      ["checkin", "Darbuotojas pažymėjo atvykimą – Amsterdamas", "Worker checked in — Amsterdam"],
      ["join", "Agentūra įtraukė 4 montuotojus", "Agency added 4 fitters"],
      ["demand", "Naujas darbo poreikis – Kopenhaga", "New job demand — Copenhagen"],
      ["match", "Atitikimas: betonuotojas → projektas", "Match: concreter → project"],
      ["checkin", "Pamaina pradėta – Hamburgas", "Shift started — Hamburg"],
      ["join", "Darbuotojas patvirtino prieinamumą", "Worker confirmed availability"],
      ["demand", "Komanda suformuota projektui – Oslas", "Team formed for a project — Oslo"],
    ] as const
  ).map(
    ([icon, lt, en], i): Placeholder => ({
      id: `activity.feed.${i + 1}`,
      type: "metric",
      value: { lt, en },
      icon,
      description: `Live activity feed — streaming item ${i + 1} (${icon}).`,
      replacementSource: SQL(
        "SELECT action, entity, occurred_at FROM audit_logs ORDER BY occurred_at DESC LIMIT 10",
      ),
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    }),
  ),
  ...Array.from({ length: 12 }, (_, i): Placeholder => {
    const n = i + 1;
    const samples: Record<number, { lt: string; en: string }> = {
      1: { lt: "Naujas poreikis · Roterdamas · 6 montuotojų", en: "New demand · Rotterdam · 6 fitters" },
      2: { lt: "Atitikimas patvirtintas · Amsterdamas", en: "Match confirmed · Amsterdam" },
      3: { lt: "Agentūra prisijungė · Vilnius", en: "Agency joined · Vilnius" },
      4: { lt: "Pamaina pradėta · Hamburgas", en: "Shift started · Hamburg" },
      5: { lt: "12 darbuotojų laisvi · Kopenhaga", en: "12 workers available · Copenhagen" },
      6: { lt: "Naujas projektas · Oslas", en: "New project · Oslo" },
      7: { lt: "Suvirintojų paklausa +18% · Šiaurės Europa", en: "Welder demand +18% · Northern Europe" },
      8: { lt: "Komanda suformuota · Roterdamas", en: "Team formed · Rotterdam" },
      9: { lt: "Atvykimas pažymėtas · Amsterdamas", en: "Check-in logged · Amsterdam" },
      10: { lt: "Naujas poreikis · Berlynas · 4 elektrikai", en: "New demand · Berlin · 4 electricians" },
      11: { lt: "Profilis patvirtintas · Klaipėda", en: "Profile verified · Klaipėda" },
      12: { lt: "Sutartis pasirašyta · Stokholmas", en: "Contract signed · Stockholm" },
    };
    return {
      id: `ticker.event.${n}`,
      type: "metric",
      value: samples[n],
      description: `Hero live ticker — scrolling event ${n}.`,
      replacementSource: SQL(
        "SELECT ... FROM audit_logs ORDER BY occurred_at DESC LIMIT 12",
      ),
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    };
  }),
  ...(
    [
      [
        "active_workers",
        "Active workers count",
        ["318K", "320K", "321K", "323K"],
        SQL("SELECT count(*) FROM workers WHERE availability_status='available'"),
      ],
      [
        "live_demand",
        "Open job demands count",
        ["1,180", "1,205", "1,240", "1,262"],
        SQL("SELECT count(*) FROM job_demands WHERE status='open'"),
      ],
      [
        "matches_today",
        "Matches produced today",
        ["84", "97", "112", "129"],
        SQL("SELECT count(*) FROM matches WHERE computed_at::date = now()::date"),
      ],
      [
        "avg_ovr",
        "Average worker profile strength",
        ["71", "72", "72", "73"],
        SQL("SELECT round(avg(profile_completeness)) FROM workers"),
      ],
    ] as const
  ).map(
    ([key, label, cycle, replacementSource]): Placeholder => ({
      id: `counters.${key}`,
      type: "stat",
      value: cycle[0],
      cycle: [...cycle],
      description: `Hero market counter — ${label} (animated cycle, fake motion).`,
      replacementSource,
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    }),
  ),
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

/** Resolve a placeholder value to a display string for a locale.
 *  Client-safe (this module has no server-only deps). */
export function localizeValue(
  v: PlaceholderValue,
  locale: string,
): string {
  if (typeof v === "object") {
    if ("src" in v) return v.src;
    if ("lt" in v) return locale === "lt" ? v.lt : v.en;
  }
  return String(v);
}

export function placeholderText(id: string, locale: string): string {
  return localizeValue(getPlaceholder(id).value, locale);
}

/** The animated cycle for a counter/ticker placeholder, localized. Falls
 *  back to the single representative value when no cycle is registered. */
export function placeholderCycle(id: string, locale: string): string[] {
  const p = getPlaceholder(id);
  const set = p.cycle ?? [p.value];
  return set.map((v) => localizeValue(v, locale));
}
