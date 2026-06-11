import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Doktrinos §19 guard — Atitikties principas (Fit, ne reitingas).
 *
 * People are NEVER rated. A percentage exists only inside a concrete need
 * context, always with its basis and with the confirmed-vs-declared share
 * separated. This guard pins:
 *   1. the doctrine section (owner text 1:1) + its four consequences;
 *   2. the S6 fit spec note (ESCO-ID overlap, contextual, confirmed share,
 *      never persisted);
 *   3. a code-level ban on global person/company score identifiers in the
 *      live source tree;
 *   4. the LT/EN copy staying free of universal-score marketing (SR-6 hold).
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const doctrine = readFileSync(join(REPO, "docs", "PLATFORM_DOCTRINE.md"), "utf8");
const spec = readFileSync(
  join(REPO, "docs", "product", "s6-matching-fit-spec-note.md"),
  "utf8",
);

describe("§19 Atitikties principas is in the doctrine (owner text 1:1)", () => {
  it("section exists with the owner quote verbatim", () => {
    expect(doctrine).toMatch(/Section 19 — Atitikties principas \(Fit, ne reitingas\)/);
    expect(doctrine).toContain("Žmonių mes niekada nereitinguojame");
    expect(doctrine).toContain("kurie atitinka N% Y");
    expect(doctrine).toContain(
      "Termometras tik rodo išraišką, kiek atitinka paieškos kriterijus",
    );
  });
  it("all four technical consequences are stated", () => {
    expect(doctrine).toContain("Jokio globalaus asmens ar įmonės balo");
    expect(doctrine).toContain(
      "atitinka 95% šio darbo įgūdžių: 19 iš 20, iš jų 14 patvirtinti",
    );
    expect(doctrine).toContain("Patvirtintų vs deklaruotų įgūdžių dalis");
    expect(doctrine).toContain("skirtinguose kontekstuose turi skirtingus %");
  });
});

describe("S6 fit spec note pins the contextual ESCO-overlap form", () => {
  it("fit = ESCO-ID overlap with basis + confirmed share, never persisted", () => {
    expect(spec).toMatch(/ESCO kanoninius ID/);
    expect(spec).toMatch(/\|Y ∩ C\| \/ \|Y\|/);
    expect(spec).toContain("iš jų 14 patvirtinti");
    expect(spec).toMatch(/Persistinti fit %/);
  });
});

describe("no global person/company score identifiers in live source", () => {
  // Legacy/declared exceptions, each with a reason:
  //   - lib/supabase/types.ts      — prod schema reality (legacy columns);
  //   - components/app/ovr-ring.tsx + player-card.tsx — the PRE-ALPHA FIFA
  //     concept showcase, placeholder-governed (content/placeholders.ts) and
  //     reframed by SR-6; it writes nothing and reads no real person data;
  //   - content/placeholders.ts    — the governance registry itself;
  //   - lib/guards/** and scripts/** — the police, not the suspect.
  const ALLOW = new Set([
    "lib/supabase/types.ts",
    "components/app/ovr-ring.tsx",
    "components/app/player-card.tsx",
    "content/placeholders.ts",
  ]);
  const BAN =
    /\b(trust_score|profile_strength|overall_score|person_score|worker_rating|company_rating|global_score|human_score)\b/i;

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "guards" || name === "node_modules") continue;
        walk(p, out);
      } else if (/\.(ts|tsx)$/.test(name)) {
        out.push(p);
      }
    }
    return out;
  };

  it("lib/ + app/ + components/ carry no banned identifier", () => {
    const files = [
      ...walk(join(APP, "lib")),
      ...walk(join(APP, "app")),
      ...walk(join(APP, "components")),
    ];
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(APP, f).replace(/\\/g, "/");
      if (ALLOW.has(rel)) continue;
      if (BAN.test(stripComments(readFileSync(f, "utf8")))) offenders.push(rel);
    }
    expect(offenders, `banned global-score identifiers in: ${offenders.join(", ")}`)
      .toEqual([]);
  });
});

describe("LT/EN copy stays free of universal-score marketing (SR-6 hold)", () => {
  it("no OVR / profile strength / 0–99 wording", () => {
    for (const locale of ["lt", "en"]) {
      const blob = read(`messages/${locale}.json`);
      expect(blob).not.toMatch(/\bOVR\b/);
      expect(blob).not.toMatch(/profile strength|profilio stiprum/i);
      expect(blob).not.toMatch(/0[–-]99/);
    }
  });
});
