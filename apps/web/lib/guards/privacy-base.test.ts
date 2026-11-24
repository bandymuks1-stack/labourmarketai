import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Privatumo bazės guard'as (doktrinos §20, owner tekstas 1:1 — 2026-06-11).
 *
 * Pina ir DOKTRINOS TEKSTĄ (visi 6 punktai §20 skyriuje), ir TECHNINIUS
 * invariantus:
 *
 *   1. Cross-role keliai lieka uždari (worker dokumentai/pirkimo istorijos
 *      tipo duomenys niekada neteka darbdaviui/agentūrai be sutikimo).
 *   2. Kryžminiai atlygio agregatai turi imties grindis (n>=2 individo
 *      apsauga; n<5 — small-sample vėliava).
 *   3. MOKSLAS DIRBA TIK SU ANONIMINIAIS DUOMENIMIS: research_* lentelės
 *      struktūriškai be PII (jokių person-ref/PII stulpelių).
 *   4. Jokių elgsenos profilio identifikatorių kode ar schemoje.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const stripSql = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) =>
  f.endsWith(".sql"),
);

describe("§20 Privatumo bazė is in the doctrine (owner text 1:1)", () => {
  const doctrine = readFileSync(
    join(REPO, "docs", "PLATFORM_DOCTRINE.md"),
    "utf8",
  );
  it("section exists with the owner heading", () => {
    expect(doctrine).toMatch(
      /Section 20 — Privatumo bazė \(visomis kryptimis\)/,
    );
    expect(doctrine).toContain("owner tekstas 2026-06-11, įrašytas 1:1");
  });
  it("all six points are present verbatim (key phrases)", () => {
    for (const phrase of [
      "NIEKADA nematomi",
      "jokiu netiesioginiu keliu",
      "ne darbuotojo privilegija, o platformos fizika",
      "mažos imties slenksčiu (n<5 šablonas)",
      "Individualių elgsenos",
      "MOKSLAS DIRBA TIK SU ANONIMINIAIS DUOMENIMIS — be išimčių",
      "pseudonimizuoti ID + agregacija + k-slenkstis",
      "Identifikuotų tyrimų kategorija platformoje",
      "niekada nekeičia konkretaus",
      "matching, matomumo, kainų ar pasiūlymų",
      "skaidriai aprašomi privacy policy",
    ]) {
      expect(doctrine, `§20 missing phrase: ${phrase}`).toContain(phrase);
    }
  });
  it("the changelog records the §20 amendment", () => {
    expect(doctrine).toMatch(/\| 2026-06-11 \| §20 \|/);
  });
});

describe("1 · cross-role paths stay closed", () => {
  it("agency pool never reads worker_documents (aggregates only via consent RPC)", () => {
    expect(read("lib/agency/pool.ts")).not.toMatch(/worker_documents/);
  });
  it("the consent aggregates RPC filters on consent and projects counts only", () => {
    const sql = stripSql(
      readFileSync(
        join(MIGRATIONS_DIR, "20260611170000_s6_worker_docs_consent.sql"),
        "utf8",
      ),
    ).toLowerCase();
    expect(sql).toMatch(/docs_aggregate_consent is true/);
    expect(sql).not.toMatch(/file_path|note|document_type_slug/);
  });
  it("candidate-skill clarifications stay owner-only on the manager board", () => {
    expect(read("lib/projects/operations.ts")).not.toMatch(
      /skill_candidate_clarifications/,
    );
  });
});

describe("2 · cross-person pay aggregates keep their sample floors", () => {
  it("league declared average requires n >= 2 (no individual leak)", () => {
    expect(read("lib/admin/league.ts")).toMatch(/LEAGUE_MIN_POSITION_N = 2/);
  });
  it("position-average RPC returns avg ONLY when sample_n >= 2", () => {
    const sql = stripSql(
      readFileSync(
        join(MIGRATIONS_DIR, "20260610214000_market_rate_averages.sql"),
        "utf8",
      ),
    ).toLowerCase();
    expect(sql).toMatch(/case when count\(\*\) >= 2/);
  });
  it("small-sample flags stay at n < 5 in the market read models", () => {
    expect(read("lib/admin/market-analysis.ts")).toMatch(/SMALL_SAMPLE_N = 5/);
    expect(read("lib/market/thermometer-data.ts")).toMatch(/SMALL_SAMPLE_N = 5/);
  });
});

describe("3 · MOKSLAS DIRBA TIK SU ANONIMINIAIS DUOMENIMIS (research_* be PII)", () => {
  // Person-reference / PII columns that may NEVER appear inside a
  // research_* table definition (structural anonymity).
  const PII =
    /\b(profile_id|worker_id|user_id|email|full_name|display_name|phone|ip_address|first_name|last_name)\b/;

  it("every research_* table (now or future) is structurally PII-free", () => {
    for (const file of migrationFiles) {
      const sql = stripSql(
        readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
      ).toLowerCase();
      const tableRe =
        /create table (?:if not exists )?public\.(research_[a-z_]+)\s*\(([\s\S]*?)\);/g;
      let m: RegExpExecArray | null;
      while ((m = tableRe.exec(sql)) !== null) {
        expect(
          PII.test(m[2]),
          `${file}: research table ${m[1]} carries a PII/person-ref column`,
        ).toBe(false);
      }
    }
  });
});

describe("4 · no behavioral-profile identifiers anywhere", () => {
  const BAN =
    /\b(behavio(?:u)?r_(?:score|profile|track)|engagement_score|activity_score|user_profiling|tracking_pixel|session_replay)\b/i;

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "guards" || name === "node_modules") continue;
        walk(p, out);
      } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  };

  it("app source carries no behavioral-profiling identifiers", () => {
    const files = [
      ...walk(join(APP, "lib")),
      ...walk(join(APP, "app")),
      ...walk(join(APP, "components")),
    ];
    const offenders = files
      .filter((f) => BAN.test(stripTs(readFileSync(f, "utf8"))))
      .map((f) => f);
    expect(offenders, `behavioral identifiers in: ${offenders.join(", ")}`)
      .toEqual([]);
  });

  it("no migration introduces a behavioral-profiling column/table", () => {
    for (const file of migrationFiles) {
      const sql = stripSql(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      expect(BAN.test(sql), `${file}: behavioral identifier`).toBe(false);
    }
  });
});
