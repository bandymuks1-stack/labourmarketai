import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Living CV constitution (owner decision 2026-10-11, docs/DECISIONS/0023):
 * indirect / POTENTIAL capabilities are discovered from evidenced work and
 * shown as a separate evidence state — never dropped, never stored as a skill,
 * never shown as confirmed. Relabelling `welding-blueprint` to "Welding" must
 * not remove the potential blueprint-reading signal.
 */
const APP = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(APP, rel), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}

describe("Living CV keeps potential-capability discovery", () => {
  it("welding still points at blueprint reading after the label fix", () => {
    const map = read("lib/skills/potential-skills.ts");
    expect(map).toMatch(/"welding-blueprint": \["blueprint-reading"\]/);
    expect(JSON.parse(read("messages/en/skill-names.json"))["welding-blueprint"]).toBe("Welding");
  });

  it("the growth reading carries potential, computed before the two-skill floor", () => {
    const g = read("lib/journal/growth-reading.ts");
    const at = g.indexOf("derivePotentialSkills(");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(g.indexOf("if (evidenced.length < 2)"));
    expect(g.match(/\bpotential,\n/g)?.length).toBe(2);
  });

  it("is rendered as its own, labelled evidence state on both growth surfaces", () => {
    const k = read("components/app/work-in-numbers/growth-kinds.tsx");
    expect(k).toContain('data-evidence-state="potential"');
    expect(k).toContain('t("potentialFrom"');
    for (const rel of ["components/app/journal-work-intelligence.tsx", "app/[locale]/dashboard/work-in-numbers/page.tsx"]) {
      expect(read(rel)).toContain("potential={potential}");
    }
  });

  it("reaches the Living CV itself, from evidenced tiers only, on screen and never in print", () => {
    const cv = read("app/[locale]/cv/page.tsx");
    expect(cv).toMatch(/derivePotentialSkills\(\s*\[\.\.\.cv\.tiers\.confirmed, \.\.\.cv\.tiers\.evidence\],\s*\[\.\.\.cv\.tiers\.confirmed, \.\.\.cv\.tiers\.evidence, \.\.\.cv\.tiers\.declared\],/);
    const block = cv.slice(cv.indexOf('data-testid="cv-potential"') - 120, cv.indexOf('data-testid="cv-potential"') + 40);
    expect(block).toContain("print:hidden");
    expect(cv).toContain('data-evidence-state="potential"');
    expect(cv).toContain('tIntel("potentialFrom"');
  });

  it("is never written: no write path imports the potential map", () => {
    const writers = walk(resolve(APP, "lib")).filter((p) => {
      const s = readFileSync(p, "utf8");
      return /from\("worker_skills"\)[\s\S]{0,200}\.(insert|upsert|update)\(/.test(s);
    });
    for (const p of writers) expect(readFileSync(p, "utf8")).not.toMatch(/potential-skills/);
  });
});
