import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CANDIDATE_PIPELINE_STAGES,
  nextActionForStage,
} from "@/lib/pipeline/candidate-pipeline";

/**
 * Guard: ONE canonical candidate pipeline (P4) stays canonical.
 *
 * The audit found 6 competing status models around a (demand, worker) pair.
 * The fix is a read-time DERIVATION over the existing facts — explicitly NOT
 * a 7th enum, table, or stored column. This guard pins:
 *   1. the 7-stage human set, in funnel order;
 *   2. that the derivation module is pure and introduces NO new storage
 *      (no SQL, no supabase import, derives from the existing fact sources);
 *   3. that no migration for a stored pipeline stage exists;
 *   4. exactly ONE next action per stage, each pointing at a real route.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const MODULE_PATH = join(APP_ROOT, "lib", "pipeline", "candidate-pipeline.ts");

const moduleSrc = readFileSync(MODULE_PATH, "utf8");

describe("Guard: the 7-stage canonical pipeline set is pinned", () => {
  it("has exactly the 7 human stages in funnel order", () => {
    expect(CANDIDATE_PIPELINE_STAGES).toEqual([
      "new", // Naujas
      "reviewing", // Peržiūrimas
      "contacted", // Susisiekti
      "interview", // Pokalbis
      "offer", // Pasiūlymas
      "accepted", // Priimtas
      "rejected", // Atmestas
    ]);
  });
});

describe("Guard: the stage is DERIVED, never stored (no 7th enum/table)", () => {
  it("the module contains no SQL DDL", () => {
    expect(moduleSrc).not.toMatch(/CREATE\s+TABLE/i);
    expect(moduleSrc).not.toMatch(/CREATE\s+TYPE/i);
    expect(moduleSrc).not.toMatch(/ALTER\s+TABLE/i);
  });

  it("the module is pure — no DB client, no server-only, no IO imports", () => {
    expect(moduleSrc).not.toMatch(/["']server-only["']/);
    expect(moduleSrc).not.toMatch(/@supabase\//);
    expect(moduleSrc).not.toMatch(/@\/lib\/supabase/);
    expect(moduleSrc).not.toMatch(/node:fs/);
    expect(moduleSrc).not.toMatch(/\bfetch\s*\(/);
  });

  it("the module documents derived-never-stored and the precedence ladder", () => {
    expect(moduleSrc).toMatch(/DERIVED, NEVER STORED/);
    expect(moduleSrc).toMatch(/Precedence ladder/i);
  });

  it("derives from the EXISTING fact sources (the 6-enum consolidation)", () => {
    expect(moduleSrc).toMatch(/demand_shortlist/);
    expect(moduleSrc).toMatch(/demand_interest_signals/);
    expect(moduleSrc).toMatch(/booking_requests/);
    expect(moduleSrc).toMatch(/conversation/i);
  });

  it("documents 'interview' honestly as a real open conversation, not a meeting", () => {
    expect(moduleSrc).toMatch(/NOT a scheduled meeting/i);
  });

  it("no migration stores a candidate pipeline stage", () => {
    const migrations = readdirSync(join(REPO_ROOT, "supabase", "migrations"));
    const offenders = migrations.filter((name) =>
      /candidate[_-]?pipeline|pipeline[_-]?stage/i.test(name),
    );
    expect(offenders).toEqual([]);
  });

  it("no migration adds new statuses to the existing pair enums for this feature", () => {
    // The three fact-source CHECK constraints stay untouched: the derivation
    // expresses all 7 stages from the applied vocabularies.
    const dir = join(REPO_ROOT, "supabase", "migrations");
    for (const name of readdirSync(dir)) {
      if (!/\.sql$/i.test(name)) continue;
      const src = readFileSync(join(dir, name), "utf8");
      // A stored canonical stage vocabulary would need these two words
      // together in one CHECK — pin that none exists.
      expect(
        /check\s*\(\s*status[^)]*'interview'/i.test(src),
        `${name} stores an 'interview' status — the pipeline must stay derived`,
      ).toBe(false);
    }
  });
});

describe("Guard: exactly one next action per stage, real routes only", () => {
  const ctx = { locale: "en", requestId: "r1" };

  it("each stage yields one key/href pair", () => {
    for (const stage of CANDIDATE_PIPELINE_STAGES) {
      const action = nextActionForStage(stage, ctx);
      expect(Object.keys(action).sort()).toEqual(["href", "key"]);
      expect(action.key.startsWith("candidatePipeline.action.")).toBe(true);
    }
  });

  it("every href resolves to an existing app route", () => {
    const routeFor = (href: string) => href.replace(/^\/en/, "").split("?")[0];
    const pageExists = (route: string) => {
      const abs = join(APP_ROOT, "app", "[locale]", ...route.split("/").filter(Boolean), "page.tsx");
      try {
        readFileSync(abs, "utf8");
        return true;
      } catch {
        return false;
      }
    };
    for (const stage of CANDIDATE_PIPELINE_STAGES) {
      const { href } = nextActionForStage(stage, ctx);
      expect(pageExists(routeFor(href)), `${stage} → ${href} has no page.tsx`).toBe(
        true,
      );
    }
  });

  it("the scouting page renders the derived stage (wired, not shelfware)", () => {
    const page = readFileSync(
      join(
        APP_ROOT,
        "app",
        "[locale]",
        "dashboard",
        "company",
        "scouting",
        "page.tsx",
      ),
      "utf8",
    );
    expect(page).toMatch(/deriveCandidatePipelineStage/);
    expect(page).toMatch(/nextActionForStage/);
    // Stage labels come from the candidatePipeline i18n namespace
    // (namespace-scoped translator + stage.<stage> keys).
    expect(page).toMatch(/getTranslations\(\s*["']candidatePipeline["']\s*\)/);
    expect(page).toMatch(/stage\.\$\{stage\}/);
  });
});
