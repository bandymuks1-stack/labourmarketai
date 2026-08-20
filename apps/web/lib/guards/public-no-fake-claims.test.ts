/**
 * Public copy & data must not make fake-style, unsupported claims.
 *
 * Part A scans the public message catalogs (JSON) for traction/verification
 * claims the product cannot honestly make (no real users/matches/revenue yet;
 * skills are self-declared / journal-supported, not verified).
 *
 * Part B scans the public LANDING data + components (.ts / .tsx) — not just
 * JSON — for the specific fabrication shapes the brief calls out: fabricated
 * traction counts, fake recent-activity timestamps / live-match counters, fake
 * verification/guarantee language, fabricated named real-looking public people,
 * and old "LABMA" wording on the Labourmarket.ai surface.
 *
 * What is ALLOWED (never flagged): product-system / atlas vocabulary —
 * People, Teams, Companies, Projects, Skills, Demand, Readiness, Location,
 * Trust, Next action, Project demand, Team readiness, Skill signal, Match logic,
 * Market map, etc. Only fabricated FACTS are banned, not strong product vision.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");

/** Collect every string leaf from a JSON object, with its dotted path. */
function strings(node: unknown, path = "", out: Array<[string, string]> = []) {
  if (typeof node === "string") {
    out.push([path, node]);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      strings(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

function loadAllStrings(): Array<[string, string]> {
  const files = [
    "messages/en.json",
    "messages/lt.json",
    "messages/ru.json",
    "messages/en/labour-market.json",
    "messages/lt/labour-market.json",
    "messages/ru/labour-market.json",
  ];
  const out: Array<[string, string]> = [];
  for (const f of files) {
    const abs = resolve(webRoot, f);
    if (!existsSync(abs)) continue;
    const json = JSON.parse(readFileSync(abs, "utf-8"));
    for (const [p, s] of strings(json)) out.push([`${f}:${p}`, s]);
  }
  return out;
}

/** Fabrication shapes that are never honest for this product. */
const BANNED: Array<{ re: RegExp; why: string }> = [
  { re: /millions? of (verified |registered )?(workers|users|professionals)/i, why: "fake scale of users" },
  { re: /thousands? of (verified )?(matches|hires|employers|jobs) (already|made)/i, why: "fake traction" },
  { re: /\b(ai|dirbtinis intelektas|искусственный интеллект)\b[^.]*\b(already )?(matched|matches|hired)\b/i, why: "fake AI matching claim" },
  { re: /guaranteed (higher )?(salary|pay|income|job|hire)/i, why: "guaranteed-outcome claim" },
  { re: /garantuot[aią]s?\s+(didesn|atlyginim|darb)/i, why: "guaranteed-outcome claim (LT)" },
  { re: /гарантирован[а-я]*\s+(зарплат|выш|работ)/i, why: "guaranteed-outcome claim (RU)" },
  { re: /\bverified (worker|skill)s? (community|network|by us)\b/i, why: "verified-status overclaim" },
];

describe("public copy makes no fake/unsupported claims", () => {
  const all = loadAllStrings();

  it("loaded public message catalogs", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it("contains none of the banned fabrication shapes", () => {
    const hits: string[] = [];
    for (const [where, s] of all) {
      for (const b of BANNED) {
        if (b.re.test(s)) hits.push(`${where} — ${b.why}: "${s}"`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Part B — landing DATA + COMPONENTS (.ts / .tsx), not only JSON.
// ---------------------------------------------------------------------------
const read = (rel: string) => {
  const abs = resolve(webRoot, rel);
  return existsSync(abs) ? readFileSync(abs, "utf-8") : "";
};

const LANDING_TS = [
  "content/placeholders.ts",
  "app/[locale]/(home)/page.tsx",
  "app/[locale]/live-market-review/live-market-page.tsx",
  "app/[locale]/live-market-review/live-market-command.tsx",
  "lib/market/live-market-landing.ts",
  "components/app/market-counters.tsx",
  "components/app/live-map.tsx",
  "components/app/recent-matches-feed.tsx",
  "components/app/regional-heatmap.tsx",
  "components/app/skills-demand-list.tsx",
  "components/app/supply-demand-chart.tsx",
  "components/app/mini-draft-card.tsx",
  "components/marketing/player-card-showcase.tsx",
  "components/marketing/draft-board.tsx",
  "components/marketing/market-pulse.tsx",
];

const TS_BANNED: Array<{ re: RegExp; why: string }> = [
  { re: /\b\d{2,3}\s?K\+/, why: "fabricated traction count (e.g. 320K+)" },
  { re: /\bminutesAgo\b/, why: "fabricated recent-activity timestamp / live-match counter" },
  { re: /\b\d+\s*(?:min|minutes|h|hours)\s+ago\b/i, why: "fabricated 'X ago' activity timestamp" },
  { re: /\bLABMA\b/, why: "old LABMA wording on the Labourmarket.ai public surface" },
  { re: /verified\s+(?:every\s+)?(?:worker|workers|skill|skills)\b/i, why: "fake verification overclaim" },
  { re: /guaranteed\s+(?:perfect\s+)?(?:match|matches|hire|job)/i, why: "guaranteed-outcome claim" },
];

// Regression list: specific fabricated real-looking people that were once on the
// public landing and must never return.
const BANNED_NAMES = [
  "Tomas Jankauskas",
  "Lukas van der Berg",
  "Stefan Bauer",
  "Mantas Petrauskas",
  "Markus de Vries",
  "Andrius K.",
  "Lukas H.",
  "Emil J.",
  "Jonas P.",
  "Pieter V.",
  "Mateusz S.",
  "Erik N.",
  "Henrik O.",
  "Jaak R.",
  "Marek W.",
  "Tomas K.",
];

describe("public landing data + components carry no fabricated factual claims", () => {
  const blobs = LANDING_TS.map((f) => [f, read(f)] as const).filter(
    ([, s]) => s.length > 0,
  );

  it("scans the landing data + component files", () => {
    expect(blobs.length).toBeGreaterThanOrEqual(10);
  });

  it("contains none of the fabrication shapes", () => {
    const hits: string[] = [];
    for (const [f, s] of blobs) {
      for (const b of TS_BANNED) {
        const m = s.match(b.re);
        if (m) hits.push(`${f} — ${b.why}: "${m[0]}"`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("does not reintroduce fabricated named public people", () => {
    const hits: string[] = [];
    for (const [f, s] of blobs) {
      for (const n of BANNED_NAMES) {
        if (s.includes(n)) hits.push(`${f} — fabricated public person name: "${n}"`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
