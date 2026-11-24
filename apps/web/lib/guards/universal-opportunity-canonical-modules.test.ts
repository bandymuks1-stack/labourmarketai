/**
 * Universal Opportunity Platform — canonical-module guard.
 *
 * The opportunity/career/growth surfaces must all be built on the SINGLE
 * canonical modules, never a parallel system (FORBIDDEN: no second matching
 * engine, no second skills map, no second fit/profile system). This guard is
 * behavior-neutral — it locks invariants that are already true today so future
 * "career growth / transferable skills / adjacency / mobility" work reuses the
 * existing real primitives instead of duplicating them.
 *
 * Source: docs/audit/universal-opportunity-platform-v1.md (Wave 0).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  PROFESSION_SKILLS,
  skillsForProfession,
  professionsForSkill,
  professionRelatedness,
} from "@/lib/taxonomy/profession-skills";

const webRoot = join(__dirname, "..", "..");
const libRoot = join(webRoot, "lib");

const CANONICAL = {
  matchEngine: "lib/market/match-v1.ts",
  skillMap: "lib/taxonomy/profession-skills.ts",
  fit: "lib/market/fit.ts",
} as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === "guards") continue;
      walk(p, out);
    } else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("canonical opportunity modules exist and are the single source", () => {
  it("the three canonical modules are present", () => {
    for (const rel of Object.values(CANONICAL)) {
      expect(
        readFileSync(join(webRoot, rel), "utf-8").length,
        `${rel} must exist`,
      ).toBeGreaterThan(0);
    }
  });

  it("the single match engine exports matchWorkerToNeed", () => {
    const src = readFileSync(join(webRoot, CANONICAL.matchEngine), "utf-8");
    expect(src).toMatch(/export function matchWorkerToNeed/);
  });

  it("the transferable-skills primitives live in the canonical skill map", () => {
    // These are the real, seed-mirrored primitives a growth/adjacency feature
    // must reuse (audit areas 3 & 4). Pinning them prevents silent deletion.
    expect(typeof professionsForSkill).toBe("function");
    expect(typeof professionRelatedness).toBe("function");
    expect(typeof skillsForProfession).toBe("function");
    expect(Object.keys(PROFESSION_SKILLS).length).toBeGreaterThan(30);
  });
});

describe("no duplicate matching engine / skills map / relatedness", () => {
  const files = walk(libRoot).map((p) => ({
    rel: relative(webRoot, p).replace(/\\/g, "/"),
    src: readFileSync(p, "utf-8"),
  }));

  it("professionRelatedness is defined only in the canonical skill map", () => {
    const definers = files.filter(
      (f) =>
        /(export )?function professionRelatedness\b/.test(f.src) &&
        f.rel !== CANONICAL.skillMap,
    );
    expect(
      definers.map((f) => f.rel),
      "professionRelatedness must not be re-implemented outside the canonical map",
    ).toEqual([]);
  });

  it("no second profession→skills constant map is declared", () => {
    const dupes = files.filter(
      (f) =>
        /\bPROFESSION_SKILLS\b\s*[:=]/.test(f.src) && f.rel !== CANONICAL.skillMap,
    );
    expect(
      dupes.map((f) => f.rel),
      "PROFESSION_SKILLS map must be declared only in the canonical file",
    ).toEqual([]);
  });

  it("no second matchWorkerToNeed engine is declared", () => {
    const dupes = files.filter(
      (f) =>
        /export function matchWorkerToNeed\b/.test(f.src) &&
        f.rel !== CANONICAL.matchEngine,
    );
    expect(
      dupes.map((f) => f.rel),
      "matchWorkerToNeed must be declared only in the canonical engine",
    ).toEqual([]);
  });
});

describe("canonical primitives behave deterministically (locks current behavior)", () => {
  it("a profession is fully related to itself and less related to a distant one", () => {
    const self = professionRelatedness("electrician", "electrician");
    expect(self).toBe(1);
    const distant = professionRelatedness("electrician", "teacher");
    expect(distant).toBeLessThan(1);
  });

  it("professionsForSkill returns the professions that carry a skill", () => {
    const profs = professionsForSkill("customer-service");
    expect(profs.length).toBeGreaterThan(0);
    expect(profs).toContain("customer_service_specialist");
  });

  it("unknown professions honestly yield no skills and zero relatedness", () => {
    expect(skillsForProfession("not_a_real_profession_slug")).toEqual([]);
    expect(professionRelatedness("not_a_real_profession_slug", "electrician")).toBe(0);
  });
});
