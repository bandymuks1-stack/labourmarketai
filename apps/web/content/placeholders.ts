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

/** Structured map payloads (5b.2 LiveMap). `value` still carries a human
 *  summary; this is the typed data the map actually renders. */
export type LngLat = readonly [number, number];
export type GeoPayload =
  | { kind: "intensity"; code: string; intensity: number }
  | {
      kind: "counts";
      code: string;
      workers: number;
      projects: number;
      companies: number;
      matchesToday: number;
    }
  | { kind: "worker"; country: string; coord: LngLat; role: string }
  | {
      kind: "project";
      country: string;
      coord: LngLat;
      name: { lt: string; en: string };
      headcount: number;
    }
  | {
      kind: "match";
      country: string;
      workerCoord: LngLat;
      projectCoord: LngLat;
      score: number;
    }
  | { kind: "company"; country: string; coord: LngLat; name: string };

/** Player-card (FUT-style worker profile) payload (5b.3). */
export type PlayerStatKey = "SKL" | "REL" | "SPD" | "SAF" | "ADP" | "TRS";
export type PlayerTier = "gold" | "silver" | "bronze";
export type PlayerStatus = "LIVE" | "AVAILABLE" | "DRAFTED" | "BUSY";
export type PlayerCardData = {
  name: { lt: string; en: string };
  role: { lt: string; en: string };
  country: string;
  flag: string;
  ovr: number;
  tier: PlayerTier;
  status: PlayerStatus;
  photo: { src: string; alt: { lt: string; en: string } };
  stats: Record<PlayerStatKey, number>;
  skills: string[];
};

/** Companies-page demand preview payload (5b.3.5). */
export type DemandIntensity = "HOT" | "FILLING" | "OPEN";
export type DemandData = {
  project: { lt: string; en: string };
  location: { lt: string; en: string };
  headcount: number;
  skills: string[];
  intensity: DemandIntensity;
  rankedMatches: number;
};

/** DraftBoard mini-card payload (5b.4). */
export type DraftStatus = "reviewing" | "deciding" | "hired";
export type DraftCardData = {
  name: string;
  country: string;
  flag: string;
  role: { lt: string; en: string };
  ovr: number;
  tier: PlayerTier;
  status: DraftStatus;
};

/** MarketPulse panel payloads (5b.4). */
export type SkillTrend = "up" | "down" | "flat";
export type RegionDemand = {
  code: string;
  flag: string;
  name: { lt: string; en: string };
  intensity: number;
};
export type SkillDemandRow = {
  name: { lt: string; en: string };
  trend: SkillTrend;
  score: number;
};
export type RecentMatchEvent = {
  initials: string;
  project: { lt: string; en: string };
  minutesAgo: number;
};
export type MarketPanel =
  | { kind: "demand_by_country"; rows: RegionDemand[] }
  | { kind: "skills_top"; rows: SkillDemandRow[] }
  | {
      kind: "supply_demand";
      supply: number[];
      demand: number[];
      gapPct: number;
    }
  | { kind: "recent_matches"; rows: RecentMatchEvent[] };

/** Company score ring payload (5b.3.6) — symmetric to the worker fit-ring (concept). */
export type CompanyTier = "diamond" | "gold" | "silver" | "bronze";
export type CompanyScoreData = {
  legal_name: string;
  country: string;
  score: number;
  tier: CompanyTier;
  score_breakdown: {
    payment: number;
    completion: number;
    reviews: number;
    response: number;
  };
  main_industry: { lt: string; en: string };
};

/** Agencies-page pool preview payload (5b.3.5). */
export type AgencyPoolData = {
  poolSize: number;
  breakdown: { trade: string; count: number }[];
  status: { active: number; pending: number; available: number };
  avatars: number;
  extraCount: number;
};

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
  /** Structured map payload (5b.2). */
  geo?: GeoPayload;
  /** Player-card payload (5b.3). */
  card?: PlayerCardData;
  /** Companies-page demand preview (5b.3.5). */
  demand?: DemandData;
  /** Agencies-page pool preview (5b.3.5). */
  pool?: AgencyPoolData;
  /** Company score ring (5b.3.6). */
  company?: CompanyScoreData;
  /** DraftBoard mini-card (5b.4). */
  draft?: DraftCardData;
  /** MarketPulse panel payload (5b.4). */
  marketPanel?: MarketPanel;
};

const SQL = (q: string) => `SQL: ${q}`;

// ── 5b.2 LiveMap data — deterministic (seeded LCG, no Date/Math.random) so
// SSR and client agree. Coordinates are [lng, lat]; LiveMap projects them
// with the same equirectangular transform as the country paths.
type TargetDef = {
  code: string;
  anchors: readonly LngLat[];
  intensity: number;
  counts: { workers: number; projects: number; companies: number; matchesToday: number };
};
const MAP_TARGETS: readonly TargetDef[] = [
  { code: "NL", anchors: [[4.9, 52.37], [4.48, 51.92], [5.29, 52.13]], intensity: 84, counts: { workers: 47, projects: 12, companies: 9, matchesToday: 5 } },
  { code: "DE", anchors: [[13.4, 52.52], [9.99, 53.55], [11.58, 48.14], [6.96, 50.94], [8.68, 50.11]], intensity: 91, counts: { workers: 63, projects: 18, companies: 14, matchesToday: 8 } },
  { code: "DK", anchors: [[12.57, 55.68], [10.2, 56.16]], intensity: 72, counts: { workers: 28, projects: 7, companies: 5, matchesToday: 3 } },
  { code: "SE", anchors: [[18.07, 59.33], [11.97, 57.71], [13.0, 55.6]], intensity: 69, counts: { workers: 31, projects: 8, companies: 6, matchesToday: 3 } },
  { code: "NO", anchors: [[10.75, 59.91], [5.32, 60.39]], intensity: 58, counts: { workers: 19, projects: 5, companies: 4, matchesToday: 2 } },
  { code: "PL", anchors: [[21.01, 52.23], [17.04, 51.11], [19.94, 50.06]], intensity: 64, counts: { workers: 34, projects: 9, companies: 7, matchesToday: 4 } },
  { code: "LT", anchors: [[25.28, 54.69], [23.9, 54.9]], intensity: 77, counts: { workers: 22, projects: 6, companies: 5, matchesToday: 3 } },
  { code: "LV", anchors: [[24.11, 56.95]], intensity: 53, counts: { workers: 13, projects: 3, companies: 3, matchesToday: 1 } },
  { code: "EE", anchors: [[24.75, 59.44]], intensity: 55, counts: { workers: 14, projects: 4, companies: 3, matchesToday: 2 } },
];
const TARGET_BY_CODE = Object.fromEntries(
  MAP_TARGETS.map((t) => [t.code, t]),
) as Record<string, TargetDef>;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rnd = lcg(20260519);
function near(anchor: LngLat): LngLat {
  return [
    +(anchor[0] + (rnd() * 2 - 1) * 0.55).toFixed(3),
    +(anchor[1] + (rnd() * 2 - 1) * 0.32).toFixed(3),
  ];
}
function pickAnchor(code: string): LngLat {
  const a = TARGET_BY_CODE[code].anchors;
  return a[Math.floor(rnd() * a.length)];
}
function expand(plan: Record<string, number>): string[] {
  const out: string[] = [];
  for (const t of MAP_TARGETS)
    for (let i = 0; i < (plan[t.code] ?? 0); i++) out.push(t.code);
  return out;
}

// Whole-labour-market sample roles (Step 2): spread across sectors so the
// public preview never reads as construction-only. Construction trades remain
// as a normal minority among logistics, care, hospitality, retail, IT,
// manufacturing, cleaning and customer service.
const ROLES = [
  "Warehouse operative", "Delivery driver", "Care assistant", "Chef de partie",
  "Retail associate", "Electrician", "CNC machinist", "Cleaner",
  "IT support technician", "Welder", "Customer service agent", "Site supervisor",
] as const;
const PROJ = [
  { lt: "Sandėlio operacijos", en: "Warehouse operations" },
  { lt: "Viešbučio atidarymas", en: "Hotel opening" },
  { lt: "Logistikos centras", en: "Logistics centre" },
  { lt: "Slaugos namų pamaina", en: "Care-home staffing" },
  { lt: "Mažmeninės prekybos tinklas", en: "Retail rollout" },
  { lt: "Gamyklos linija", en: "Factory line" },
] as const;

function mapPlaceholderSet(): Placeholder[] {
  const base = {
    status: "placeholder" as const,
    addedIn: "M0" as const,
    consentRequired: false,
  };
  const out: Placeholder[] = [];

  for (const t of MAP_TARGETS) {
    out.push({
      ...base,
      id: `map.country.intensity.${t.code}`,
      type: "metric",
      value: `${t.code} · intensity ${t.intensity}/100`,
      geo: { kind: "intensity", code: t.code, intensity: t.intensity },
      description: `LiveMap glow intensity for target market ${t.code}.`,
      replacementSource:
        "Activity index per country derived from `workers` + `job_demands` density (post-launch analytics).",
    });
    out.push({
      ...base,
      id: `map.country.counts.${t.code}`,
      type: "metric",
      value: `${t.code} · ${t.counts.workers}w · ${t.counts.projects}p`,
      geo: { kind: "counts", code: t.code, ...t.counts },
      description: `LiveMap hover counts for target market ${t.code}.`,
      replacementSource: SQL(
        `SELECT count(*) FROM workers/projects/companies/matches WHERE country='${t.code}'`,
      ),
    });
  }

  expand({ NL: 5, DE: 7, DK: 4, SE: 4, NO: 2, PL: 3, LT: 2, LV: 2, EE: 1 }).forEach(
    (code, i) => {
      const role = ROLES[i % ROLES.length];
      out.push({
        ...base,
        id: `map.marker.worker.${i + 1}`,
        type: "person",
        value: { lt: `Darbuotojas · ${role} · ${code}`, en: `Worker · ${role} · ${code}` },
        geo: { kind: "worker", country: code, coord: near(pickAnchor(code)), role },
        description: `LiveMap worker marker ${i + 1} (${code}).`,
        replacementSource:
          "Coarse worker location from `workers.current_location_country` + consented geo.",
      });
    },
  );

  expand({ NL: 2, DE: 3, DK: 1, SE: 2, NO: 1, PL: 1, LT: 1, EE: 1 }).forEach(
    (code, i) => {
      const p = PROJ[i % PROJ.length];
      const headcount = 4 + ((i * 3) % 9);
      out.push({
        ...base,
        id: `map.marker.project.${i + 1}`,
        type: "project",
        value: { lt: `${p.lt} · ${code}`, en: `${p.en} · ${code}` },
        geo: {
          kind: "project",
          country: code,
          coord: near(pickAnchor(code)),
          name: { lt: `${p.lt} · ${code}`, en: `${p.en} · ${code}` },
          headcount,
        },
        description: `LiveMap project marker ${i + 1} (${code}).`,
        replacementSource: "Real project from `projects` WHERE status='live' (city geocoded).",
      });
    },
  );

  expand({ DE: 2, NL: 2, DK: 1, SE: 1 }).forEach((code, i) => {
    const wc = near(pickAnchor(code));
    const pc = near(pickAnchor(code));
    const score = 62 + ((i * 7) % 36);
    out.push({
      ...base,
      id: `map.marker.match.${i + 1}`,
      type: "metric",
      value: { lt: `Atitikimas · ${code} · ${score}`, en: `Match · ${code} · ${score}` },
      geo: { kind: "match", country: code, workerCoord: wc, projectCoord: pc, score },
      description: `LiveMap match connector ${i + 1} (${code}).`,
      replacementSource: "Real match from `matches` linking a worker to a job_demand.",
    });
  });

  expand({ NL: 3, DE: 4, DK: 2, SE: 3, NO: 1, PL: 2, LT: 1, LV: 1, EE: 1 }).forEach(
    (code, i) => {
      const name = `Contractor ${code}-${i + 1} (sample)`;
      out.push({
        ...base,
        id: `map.marker.company.${i + 1}`,
        type: "company",
        value: { lt: `Įmonė · ${code}`, en: `Company · ${code}` },
        geo: { kind: "company", country: code, coord: near(pickAnchor(code)), name },
        description: `LiveMap company marker ${i + 1} (${code}).`,
        replacementSource: "Real company from `companies` (HQ city geocoded; consent for name).",
      });
    },
  );

  return out;
}

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
      "Real consented worker profile from the `workers` table joined with `worker_skills`, plus the published contextual fit signal formula (concept).",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: true,
    notes: "consented:false — same persona as reference imagery.",
    card: {
      name: { lt: "Tomas Jankauskas", en: "Tomas Jankauskas" },
      role: { lt: "Statybos vadovas", en: "Site Supervisor" },
      country: "NL",
      flag: "🇳🇱",
      ovr: 90,
      tier: "gold",
      status: "LIVE",
      photo: {
        src: "/placeholders/worker-portrait.svg",
        alt: {
          lt: "Darbuotojo portretas (vietos rezervas)",
          en: "Worker portrait (placeholder)",
        },
      },
      stats: { SKL: 92, REL: 93, SPD: 86, SAF: 95, ADP: 85, TRS: 91 },
      skills: ["Site supervision", "Steel fixing", "Safety+"],
    },
  },
  {
    id: "workers.featured.1",
    type: "person",
    value: {
      lt: "Lukas van der Berg — Sandėlio komandos vadovas",
      en: "Lukas van der Berg — Warehouse Team Lead",
    },
    description: "PlayerCard showcase — gold-tier worker profile (NL, logistics).",
    replacementSource:
      "Real worker profile data from the `workers` table joined with `worker_skills`, plus the published contextual fit signal formula (concept).",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: true,
    notes: "consented:false — sample persona; photo is a placeholder.",
    card: {
      name: { lt: "Lukas van der Berg", en: "Lukas van der Berg" },
      role: { lt: "Sandėlio komandos vadovas", en: "Warehouse Team Lead" },
      country: "NL",
      flag: "🇳🇱",
      ovr: 92,
      tier: "gold",
      status: "AVAILABLE",
      photo: {
        src: "/placeholders/worker-portrait.svg",
        alt: {
          lt: "Darbuotojo portretas (vietos rezervas)",
          en: "Worker portrait (placeholder)",
        },
      },
      stats: { SKL: 95, REL: 94, SPD: 88, SAF: 96, ADP: 87, TRS: 93 },
      skills: ["Forklift operation", "Inventory control", "Safety+"],
    },
  },
  {
    id: "workers.featured.2",
    type: "person",
    value: {
      lt: "Stefan Bauer — Slaugos koordinatorius",
      en: "Stefan Bauer — Care Coordinator",
    },
    description: "PlayerCard showcase — silver-tier worker profile (DE, care/health).",
    replacementSource:
      "Real worker profile data from the `workers` table joined with `worker_skills`, plus the published contextual fit signal formula (concept).",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: true,
    notes: "consented:false — sample persona; photo is a placeholder.",
    card: {
      name: { lt: "Stefan Bauer", en: "Stefan Bauer" },
      role: { lt: "Slaugos koordinatorius", en: "Care Coordinator" },
      country: "DE",
      flag: "🇩🇪",
      ovr: 87,
      tier: "silver",
      status: "LIVE",
      photo: {
        src: "/placeholders/worker-portrait.svg",
        alt: {
          lt: "Darbuotojo portretas (vietos rezervas)",
          en: "Worker portrait (placeholder)",
        },
      },
      stats: { SKL: 84, REL: 95, SPD: 80, SAF: 90, ADP: 83, TRS: 94 },
      skills: ["Elderly care", "Scheduling", "First aid"],
    },
  },
  {
    id: "workers.featured.3",
    type: "person",
    value: {
      lt: "Mantas Petrauskas — Virėjas",
      en: "Mantas Petrauskas — Chef de partie",
    },
    description: "PlayerCard showcase — bronze-tier worker profile (LT, hospitality).",
    replacementSource:
      "Real worker profile data from the `workers` table joined with `worker_skills`, plus the published contextual fit signal formula (concept).",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: true,
    notes: "consented:false — sample persona; photo is a placeholder.",
    card: {
      name: { lt: "Mantas Petrauskas", en: "Mantas Petrauskas" },
      role: { lt: "Virėjas", en: "Chef de partie" },
      country: "LT",
      flag: "🇱🇹",
      ovr: 79,
      tier: "bronze",
      status: "AVAILABLE",
      photo: {
        src: "/placeholders/worker-portrait.svg",
        alt: {
          lt: "Darbuotojo portretas (vietos rezervas)",
          en: "Worker portrait (placeholder)",
        },
      },
      stats: { SKL: 80, REL: 78, SPD: 79, SAF: 81, ADP: 77, TRS: 80 },
      skills: ["Cooking", "Food safety", "Teamwork"],
    },
  },
  {
    id: "playercards.caption.dragToCompare",
    type: "metric",
    value: { lt: "← Tempk palyginimui", en: "← Drag to compare" },
    description:
      "PlayerCard showcase — decorative caption hinting at M2 comparison.",
    replacementSource:
      "Real side-by-side worker comparison UX (drag/select) ships in M2.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
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
      ["join", "Statybos ir apdailos darbai", "Construction & finishing work"],
      ["demand", "Logistika ir sandėliai", "Logistics & warehousing"],
      ["match", "Slauga ir priežiūra", "Care & nursing"],
      ["checkin", "Gamyba ir surinkimas", "Manufacturing & assembly"],
      ["join", "Transportas ir vairuotojai", "Transport & drivers"],
      ["demand", "Apgyvendinimas ir maitinimas", "Hospitality & catering"],
      ["match", "Elektra ir mechanika", "Electrical & mechanical"],
      ["checkin", "Valymas ir pastatų priežiūra", "Cleaning & facilities"],
      ["join", "Suvirinimas ir metalo darbai", "Welding & metalwork"],
      ["demand", "Žemės ūkis ir sezoniniai darbai", "Agriculture & seasonal work"],
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
      1: { lt: "Statyba ir apdaila", en: "Construction & finishing" },
      2: { lt: "Logistika ir sandėliai", en: "Logistics & warehousing" },
      3: { lt: "Slauga ir priežiūra", en: "Care & nursing" },
      4: { lt: "Gamyba ir surinkimas", en: "Manufacturing & assembly" },
      5: { lt: "Transportas ir vairuotojai", en: "Transport & drivers" },
      6: { lt: "Apgyvendinimas ir maitinimas", en: "Hospitality & catering" },
      7: { lt: "Žemės ūkis ir sezoniniai darbai", en: "Agriculture & seasonal work" },
      8: { lt: "Valymas ir pastatų priežiūra", en: "Cleaning & facilities" },
      9: { lt: "Elektra ir mechanika", en: "Electrical & mechanical" },
      10: { lt: "Suvirinimas ir metalo darbai", en: "Welding & metalwork" },
      11: { lt: "Nyderlandai · Vokietija · Skandinavija", en: "Netherlands · Germany · Scandinavia" },
      12: { lt: "Baltijos šalys · Šiaurės Europa", en: "Baltics · Northern Europe" },
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
        "Average profile-evidence coverage (sample)",
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
      lt: "8 sandėlininkai · 6 vairuotojai · 5 slaugytojai · 5 pagalbiniai",
      en: "8 warehouse · 6 drivers · 5 carers · 5 helpers",
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
        lt: "Agentūra: „Patvirtinti dar 3 vairuotojai“ · prieš 1 val",
        en: "Agency: “3 more drivers confirmed” · 1 h ago",
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
      lt: "Slauga · Programavimas · Sandėlio operacijos · Maisto gaminimas · Vairavimas C/CE",
      en: "Nursing & care · Software development · Warehouse ops · Cooking · Truck driving",
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
        lt: `${lt}: juodraštis — galutinį, įpareigojantį tekstą prieš viešą startą peržiūrės teisininkai.`,
        en: `${en}: draft — final, binding text to be reviewed by counsel before public launch.`,
      },
      description: `Legal page body content — ${en}.`,
      replacementSource: "Final text reviewed by counsel — see M5.",
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
    }),
  ),
  {
    id: "demand.featured.1",
    type: "project",
    value: {
      lt: "Renovacijos darbai – Roterdamas · 8 vietos · 47 atitikimai",
      en: "Renovation works – Rotterdam · 8 roles · 47 matches",
    },
    description: "Companies-page demand preview card (5b.3.5).",
    replacementSource: SQL(
      "SELECT jd.*, count(m.*) FROM job_demands jd LEFT JOIN matches m ON m.job_demand_id=jd.id WHERE jd.status='open' GROUP BY jd.id",
    ),
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
    demand: {
      project: {
        lt: "Sandėlio operacijos – Roterdamas",
        en: "Warehouse operations – Rotterdam",
      },
      location: { lt: "Roterdamas, NL", en: "Rotterdam, NL" },
      headcount: 8,
      skills: ["Forklift operation", "Inventory control", "Order picking", "Safety+"],
      intensity: "HOT",
      rankedMatches: 47,
    },
  },
  {
    id: "agency.pool.preview",
    type: "metric",
    value: {
      lt: "Agentūros rezervas · 86 darbuotojai · 31 aktyvūs",
      en: "Agency pool · 86 workers · 31 active",
    },
    description: "Agencies-page pool control-room preview panel (5b.3.5).",
    replacementSource: SQL(
      "SELECT trade, count(*) FROM agency_workers JOIN workers ... GROUP BY trade; status counts from agency_workers.status",
    ),
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
    pool: {
      poolSize: 86,
      breakdown: [
        { trade: "Logistics", count: 22 },
        { trade: "Care", count: 18 },
        { trade: "Hospitality", count: 15 },
        { trade: "Retail", count: 17 },
        { trade: "General", count: 14 },
      ],
      status: { active: 31, pending: 9, available: 46 },
      avatars: 4,
      extraCount: 12,
    },
  },
  {
    id: "companies.featured.1",
    type: "company",
    value: {
      lt: "Rangos įmonė (pavyzdys) · įvertinimas 88 · NL",
      en: "Contractor (sample) · score 88 · NL",
    },
    description:
      "Company score ring on the /for-companies demand preview (5b.3.6).",
    replacementSource:
      "Real `companies` row: companies.trust_score powers the ring; breakdown from payment history, project completion, worker reviews and response time once those signals exist.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: true,
    notes: "consented:false — sample company; real names need consent.",
    company: {
      legal_name: "Contractor (sample)",
      country: "NL",
      score: 88,
      tier: "gold",
      score_breakdown: {
        payment: 92,
        completion: 86,
        reviews: 84,
        response: 90,
      },
      main_industry: { lt: "Statyba", en: "Construction" },
    },
  },
  ...(
    [
      { id: "draft.onDeck.1", name: "Andrius K.", country: "LT", flag: "🇱🇹", role: { lt: "Sandėlininkas", en: "Warehouse operative" }, ovr: 88, tier: "silver" as PlayerTier, status: "reviewing" as DraftStatus },
      { id: "draft.onDeck.2", name: "Lukas H.",  country: "DE", flag: "🇩🇪", role: { lt: "CNC operatorius",  en: "CNC machinist" },      ovr: 92, tier: "gold" as PlayerTier,   status: "reviewing" as DraftStatus },
      { id: "draft.onDeck.3", name: "Emil J.",   country: "DK", flag: "🇩🇰", role: { lt: "Virėjas",  en: "Chef de partie" },   ovr: 79, tier: "bronze" as PlayerTier, status: "reviewing" as DraftStatus },
      { id: "draft.onDeck.4", name: "Jonas P.",  country: "LV", flag: "🇱🇻", role: { lt: "Pardavėjas konsultantas",    en: "Sales assistant" }, ovr: 84, tier: "silver" as PlayerTier, status: "reviewing" as DraftStatus },
      { id: "draft.live.1",   name: "Pieter V.", country: "NL", flag: "🇳🇱", role: { lt: "Statybvietės vadovas", en: "Site Supervisor" }, ovr: 91, tier: "gold" as PlayerTier,   status: "deciding" as DraftStatus },
      { id: "draft.live.2",   name: "Mateusz S.",country: "PL", flag: "🇵🇱", role: { lt: "Slaugytojas",  en: "Care assistant" },     ovr: 82, tier: "silver" as PlayerTier, status: "deciding" as DraftStatus },
      { id: "draft.live.3",   name: "Erik N.",   country: "SE", flag: "🇸🇪", role: { lt: "Valymo vadovas", en: "Cleaning supervisor" }, ovr: 86, tier: "silver" as PlayerTier, status: "deciding" as DraftStatus },
      { id: "draft.drafted.1",name: "Henrik O.", country: "NO", flag: "🇳🇴", role: { lt: "Krano operatorius", en: "Crane operator" }, ovr: 90, tier: "gold" as PlayerTier,   status: "hired" as DraftStatus },
      { id: "draft.drafted.2",name: "Jaak R.",   country: "EE", flag: "🇪🇪", role: { lt: "IT specialistas", en: "IT support technician" }, ovr: 81, tier: "silver" as PlayerTier, status: "hired" as DraftStatus },
      { id: "draft.drafted.3",name: "Marek W.",  country: "PL", flag: "🇵🇱", role: { lt: "Vairuotojas",  en: "Delivery driver" }, ovr: 77, tier: "bronze" as PlayerTier, status: "hired" as DraftStatus },
      { id: "draft.drafted.4",name: "Tomas K.",  country: "LT", flag: "🇱🇹", role: { lt: "Saugos specialistas", en: "Safety officer" }, ovr: 89, tier: "silver" as PlayerTier, status: "hired" as DraftStatus },
    ] as const
  ).map(
    (c): Placeholder => ({
      id: c.id,
      type: "person",
      value: {
        lt: `${c.name} · ${c.role.lt} · ${c.country} · fit ${c.ovr}/99 (concept)`,
        en: `${c.name} · ${c.role.en} · ${c.country} · fit ${c.ovr}/99 (concept)`,
      },
      description: `DraftBoard mini-card (${c.status}, ${c.country}).`,
      replacementSource:
        "Real matching events from `match_events` joined with `workers` and `projects`, computed by the M2 matching module.",
      status: "placeholder",
      addedIn: "M0",
      consentRequired: true,
      notes: "consented:false — sample persona for the live-draft visual.",
      draft: {
        name: c.name,
        country: c.country,
        flag: c.flag,
        role: { lt: c.role.lt, en: c.role.en },
        ovr: c.ovr,
        tier: c.tier,
        status: c.status,
      },
    }),
  ),
  {
    id: "market.demand.byCountry",
    type: "metric",
    value: {
      lt: "Paklausa pagal šalį · 9 rinkos (pavyzdys)",
      en: "Demand by country · 9 markets (sample)",
    },
    description: "MarketPulse panel — demand intensity per launch country.",
    replacementSource:
      "Real market intelligence aggregated from `job_demands` + `workers` per country, computed in M4 (PROJECT_VISION.md §8 module 11).",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
    marketPanel: {
      kind: "demand_by_country",
      rows: [
        { code: "DE", flag: "🇩🇪", name: { lt: "Vokietija",   en: "Germany" },     intensity: 92 },
        { code: "NL", flag: "🇳🇱", name: { lt: "Nyderlandai", en: "Netherlands" }, intensity: 84 },
        { code: "PL", flag: "🇵🇱", name: { lt: "Lenkija",     en: "Poland" },      intensity: 78 },
        { code: "DK", flag: "🇩🇰", name: { lt: "Danija",      en: "Denmark" },     intensity: 71 },
        { code: "SE", flag: "🇸🇪", name: { lt: "Švedija",     en: "Sweden" },      intensity: 67 },
        { code: "LT", flag: "🇱🇹", name: { lt: "Lietuva",     en: "Lithuania" },   intensity: 64 },
        { code: "NO", flag: "🇳🇴", name: { lt: "Norvegija",   en: "Norway" },      intensity: 58 },
        { code: "EE", flag: "🇪🇪", name: { lt: "Estija",      en: "Estonia" },     intensity: 55 },
        { code: "LV", flag: "🇱🇻", name: { lt: "Latvija",     en: "Latvia" },      intensity: 53 },
      ],
    },
  },
  {
    id: "market.skills.topDemand",
    type: "metric",
    value: {
      lt: "Paklausiausi įgūdžiai · 8 pozicijos (pavyzdys)",
      en: "Top in-demand skills · 8 entries (sample)",
    },
    description: "MarketPulse panel — ranked top in-demand skills.",
    replacementSource:
      "Aggregated from `job_demands.required_skills` over the last 30 days, computed in M4 (PROJECT_VISION.md §8 module 11).",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
    marketPanel: {
      kind: "skills_top",
      rows: [
        { name: { lt: "Slauga ir priežiūra",   en: "Nursing & care" },         trend: "up",   score: 94 },
        { name: { lt: "Programavimas",         en: "Software development" },    trend: "up",   score: 89 },
        { name: { lt: "Sandėlio operacijos",   en: "Warehouse operations" },   trend: "up",   score: 86 },
        { name: { lt: "Maisto gaminimas",      en: "Cooking" },                trend: "flat", score: 83 },
        { name: { lt: "Elektros instaliacija", en: "Electrical installation" },trend: "up",   score: 79 },
        { name: { lt: "Vairavimas C/CE",       en: "Truck driving" },          trend: "up",   score: 76 },
        { name: { lt: "Klientų aptarnavimas",  en: "Customer service" },       trend: "flat", score: 72 },
        { name: { lt: "CNC apdirbimas",        en: "CNC machining" },          trend: "up",   score: 70 },
      ],
    },
  },
  ((): Placeholder => {
    const r = lcg(20260520);
    const supply = Array.from({ length: 30 }, (_, i) =>
      Math.round(50 + i * 0.4 + (r() * 8 - 4)),
    );
    const demand = Array.from({ length: 30 }, (_, i) =>
      Math.round(55 + i * 0.9 + (r() * 8 - 4)),
    );
    return {
      id: "market.supplyDemand.series",
      type: "metric",
      value: {
        lt: "Pasiūla vs paklausa · 30d (pavyzdys)",
        en: "Supply vs demand · 30d (sample)",
      },
      description: "MarketPulse panel — supply vs demand 30-day series.",
      replacementSource:
        "Daily supply (`workers.availability_status='available'`) and demand (`job_demands.status='open'`) counts over a 30-day window, computed in M4 (PROJECT_VISION.md §8 module 11).",
      status: "placeholder",
      addedIn: "M0",
      consentRequired: false,
      marketPanel: { kind: "supply_demand", supply, demand, gapPct: -12 },
    };
  })(),
  {
    id: "market.recentMatches.feed",
    type: "metric",
    value: {
      lt: "Paskutiniai atitikimai · 8 įvykiai (pavyzdys)",
      en: "Recent matches · 8 events (sample)",
    },
    description: "MarketPulse panel — streaming recent-matches feed pool.",
    replacementSource:
      "Recent rows from `match_events` joined with `workers`/`projects`, streamed live in M4 (PROJECT_VISION.md §8 module 11).",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
    marketPanel: {
      kind: "recent_matches",
      rows: [
        { initials: "AK", project: { lt: "Roterdamas · Sandėlininkas",  en: "Rotterdam · Warehouse operative" }, minutesAgo: 2 },
        { initials: "LH", project: { lt: "Berlynas · CNC operatorius",  en: "Berlin · CNC machinist" },      minutesAgo: 5 },
        { initials: "EJ", project: { lt: "Kopenhaga · Virėjas",         en: "Copenhagen · Chef" },           minutesAgo: 9 },
        { initials: "PV", project: { lt: "Amsterdamas · Vadovas",       en: "Amsterdam · Supervisor" },      minutesAgo: 14 },
        { initials: "MS", project: { lt: "Varšuva · Slaugytojas",       en: "Warsaw · Care assistant" },     minutesAgo: 21 },
        { initials: "EN", project: { lt: "Stokholmas · Valytojas",      en: "Stockholm · Cleaner" },         minutesAgo: 33 },
        { initials: "HO", project: { lt: "Oslas · Vairuotojas",         en: "Oslo · Delivery driver" },      minutesAgo: 48 },
        { initials: "JR", project: { lt: "Talinas · IT specialistas",   en: "Tallinn · IT support" },        minutesAgo: 72 },
      ],
    },
  },
  {
    id: "pricing.workers.tiers",
    type: "metric",
    value: {
      lt: "Pagrindas nemokamas; premium (galerijos, AI asistentas, VIP matomumas) — nedidelis mokestis",
      en: "Core free; premium (galleries, AI assistant, VIP visibility) — small fee",
    },
    description:
      "Worker pricing model — two-tier honest statement used in the worker FAQ.",
    replacementSource:
      "Final worker pricing set by the founder and published before full launch; core stays free.",
    status: "placeholder",
    addedIn: "M0",
    consentRequired: false,
    notes:
      "Core (profile/matches/search/messaging) free; premium add-ons carry a small fee.",
  },
  ...mapPlaceholderSet(),
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

/** All placeholders whose id starts with `prefix` (e.g. "map.marker.worker.").
 *  Used by LiveMap to pull its marker sets. */
export function placeholdersByPrefix(prefix: string): Placeholder[] {
  return placeholders.filter((p) => p.id.startsWith(prefix));
}

/** Player-card payload for a registered worker profile (5b.3). */
export function getCard(id: string): PlayerCardData {
  const c = getPlaceholder(id).card;
  if (!c) throw new Error(`Placeholder "${id}" has no card payload.`);
  return c;
}

/** Demand-preview payload (5b.3.5). */
export function getDemand(id: string): DemandData {
  const d = getPlaceholder(id).demand;
  if (!d) throw new Error(`Placeholder "${id}" has no demand payload.`);
  return d;
}

/** Agency-pool payload (5b.3.5). */
export function getPool(id: string): AgencyPoolData {
  const p = getPlaceholder(id).pool;
  if (!p) throw new Error(`Placeholder "${id}" has no pool payload.`);
  return p;
}

/** Company-score payload (5b.3.6). */
export function getCompany(id: string): CompanyScoreData {
  const c = getPlaceholder(id).company;
  if (!c) throw new Error(`Placeholder "${id}" has no company payload.`);
  return c;
}

/** Draft mini-card payload (5b.4). */
export function getDraft(id: string): DraftCardData {
  const d = getPlaceholder(id).draft;
  if (!d) throw new Error(`Placeholder "${id}" has no draft payload.`);
  return d;
}

/** Typed market-panel payload (5b.4). Narrows by the `kind` discriminator. */
export function getMarketPanel<K extends MarketPanel["kind"]>(
  id: string,
  kind: K,
): Extract<MarketPanel, { kind: K }> {
  const p = getPlaceholder(id).marketPanel;
  if (!p || p.kind !== kind)
    throw new Error(`Placeholder "${id}" has no ${kind} marketPanel.`);
  return p as Extract<MarketPanel, { kind: K }>;
}

/** Narrowed geo payloads of a given kind, in registry order. */
export function geoPayloads<K extends GeoPayload["kind"]>(
  prefix: string,
  kind: K,
): Extract<GeoPayload, { kind: K }>[] {
  const out: Extract<GeoPayload, { kind: K }>[] = [];
  for (const p of placeholders) {
    if (p.id.startsWith(prefix) && p.geo && p.geo.kind === kind) {
      out.push(p.geo as Extract<GeoPayload, { kind: K }>);
    }
  }
  return out;
}
