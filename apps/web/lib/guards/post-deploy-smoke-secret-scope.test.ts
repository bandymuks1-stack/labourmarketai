import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * POST-DEPLOY SMOKE — where the production service-role key may be visible.
 *
 * The signed-in half of `post-deploy-smoke.yml` mints two synthetic sessions, and
 * minting needs the service-role key. A job-level `env:` hands a value to EVERY
 * step of the job: dependency install (third-party install scripts), the browser
 * download and the Playwright run. None of those needs the key, so none may see
 * it. The key is set on the mint step alone, and nowhere else in the workflow.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const workflow = readFileSync(join(REPO, ".github/workflows/post-deploy-smoke.yml"), "utf8");
const lines = workflow.split("\n");

/** The step (`      - name: …` block) a line belongs to, or null above the first step. */
function stepOf(index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const step = /^ {6}- name: (.+)$/.exec(lines[i]!);
    if (step) return step[1]!.replace(/^"|"$/g, "");
    if (/^ {2}[\w-]+:\s*$/.test(lines[i]!)) return null; // reached the job header first
  }
  return null;
}

describe("post-deploy smoke: the service-role key is scoped to one step", () => {
  const uses = lines.map((text, index) => ({ text, index })).filter(({ text }) => /SERVICE_ROLE/.test(text) && !/^\s*#/.test(text));

  it("is referenced exactly once in the workflow", () => {
    expect(uses.map((u) => u.text.trim())).toEqual(["PROD_QA_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"]);
  });

  it("that one reference sits on the mint step, not on the job or the workflow", () => {
    expect(stepOf(uses[0]!.index)).toBe("Mint two synthetic sessions (worker, company owner)");
    // Step-level env is indented deeper than a job-level `env:` (4 spaces) or a top-level one (0).
    expect(/^ {10}\S/.test(uses[0]!.text)).toBe(true);
  });

  it("the steps that run third-party code or a browser do not name it", () => {
    for (const name of ["Install dependencies", "Install Playwright chromium", "Worker, employer and messaging surfaces open"]) {
      const start = lines.findIndex((l) => l.includes(`- name: ${name}`));
      expect(start, `step "${name}" exists`).toBeGreaterThan(-1);
      const end = lines.findIndex((l, i) => i > start && /^ {6}- name: /.test(l));
      expect(lines.slice(start, end === -1 ? undefined : end).join("\n")).not.toMatch(/SERVICE_ROLE/);
    }
  });
});
