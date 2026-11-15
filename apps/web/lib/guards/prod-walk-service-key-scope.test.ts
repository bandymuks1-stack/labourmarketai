import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PRODUCTION SERVICE-ROLE KEY STAYS OUT OF THE BROWSER WALK
 * (owner decision 2026-11-14, R2 P3-1 on #3303).
 *
 * In `prod-qa-walk.yml` the key used to sit in the `walk` job's job-level
 * `env`, so every step received it: `pnpm install` and its install scripts,
 * the browser walk and every Playwright spec — although no spec reads it.
 * It now sits on exactly the steps whose script uses it. This guard fails if
 *   - the walk job's job-level env carries a service-role secret;
 *   - a step that runs Playwright carries one;
 *   - a step carries one without running a script that reads it;
 *   - a step runs such a script without it (the move must not break them);
 *   - any other workflow job runs Playwright with a service-role SECRET in its
 *     job-level env.
 * The workflow is read as text (no YAML dependency): GitHub's indentation in
 * these files is fixed — jobs at 2 spaces, job keys at 4, steps at 6.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const WORKFLOWS = join(REPO, ".github", "workflows");
const read = (p: string) => readFileSync(p, "utf8");

/** A secret reference whose name says service role, or the walk's own variable name. */
const SERVICE_SECRET = /secrets\.[A-Z0-9_]*SERVICE_ROLE[A-Z0-9_]*|PROD_QA_SERVICE_ROLE_KEY/;

/** The text of one job: from `  <name>:` to the next 2-space key, or the end. */
function jobBlock(yml: string, name: string): string {
  const lines = yml.split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i]) || /^[A-Za-z]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function jobNames(yml: string): string[] {
  const jobsAt = yml.indexOf("\njobs:\n");
  if (jobsAt < 0) return [];
  return [...yml.slice(jobsAt).matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
}

/** The job-level `env:` mapping (4-space key), without step-level envs. */
function jobLevelEnv(job: string): string {
  const lines = job.split("\n");
  const start = lines.findIndex((l) => l === "    env:");
  if (start < 0) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {4}\S/.test(lines[i]) || /^ {0,3}\S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

/** Each step of a job, comments stripped so prose cannot satisfy or trip the guard. */
function steps(job: string): string[] {
  const at = job.indexOf("\n    steps:\n");
  if (at < 0) return [];
  return job
    .slice(at + "\n    steps:\n".length)
    .split(/\n(?= {6}- )/)
    .map((s) =>
      s
        .split("\n")
        .filter((l) => !/^\s*#/.test(l))
        .join("\n"),
    );
}

const stepName = (s: string) => /- name: (.+)/.exec(s)?.[1] ?? s.split("\n")[0].trim();
const runsPlaywright = (s: string) => /playwright test/.test(s);

/** The scripts in apps/web/scripts that read the production service-role key. */
const KEY_SCRIPTS = readdirSync(join(APP, "scripts"))
  .filter((f) => /^prod-qa-.*\.ts$/.test(f))
  .filter((f) => /process\.env\.PROD_QA_SERVICE_ROLE_KEY/.test(read(join(APP, "scripts", f))));
const runsKeyScript = (s: string) => KEY_SCRIPTS.some((f) => s.includes(`scripts/${f}`));

const walkYml = read(join(WORKFLOWS, "prod-qa-walk.yml"));
const walk = jobBlock(walkYml, "walk");
const walkSteps = steps(walk);

describe("prod-qa-walk: the service-role key is scoped to the steps that use it", () => {
  it("the parser found the walk job, its job-level env and its steps", () => {
    expect(walk).not.toBe("");
    expect(jobLevelEnv(walk)).toMatch(/PROD_QA_SUPABASE_URL:/);
    expect(walkSteps.length).toBeGreaterThan(10);
    expect(walkSteps.some((s) => /- name: Walk$/m.test(s))).toBe(true);
    // The scripts that need the key are found from their source, not a list kept by hand.
    expect(KEY_SCRIPTS).toEqual(
      expect.arrayContaining([
        "prod-qa-provision.ts",
        "prod-qa-mint-session.ts",
        "prod-qa-signup-form.ts",
        "prod-qa-need-intake.ts",
      ]),
    );
  });

  it("the walk job's job-level env carries no service-role secret", () => {
    expect(jobLevelEnv(walk)).not.toMatch(SERVICE_SECRET);
  });

  it("no step that runs Playwright receives the service-role key", () => {
    const playwright = walkSteps.filter(runsPlaywright);
    expect(playwright.map(stepName)).toEqual(
      expect.arrayContaining(["Walk", "Remove the CV walk's synthetic rows"]),
    );
    const offenders = playwright.filter((s) => SERVICE_SECRET.test(s)).map(stepName);
    expect(offenders).toEqual([]);
  });

  it("only a step that runs a key-reading script receives the key", () => {
    const offenders = walkSteps
      .filter((s) => SERVICE_SECRET.test(s) && !runsKeyScript(s))
      .map(stepName);
    expect(offenders).toEqual([]);
  });

  it("every step that runs a key-reading script still receives the key at step level", () => {
    const keyed = walkSteps.filter(runsKeyScript);
    expect(keyed.map(stepName)).toEqual([
      "Provision + mint the synthetic cast (allowlist only)",
      '"Sign-up walk: no account with the synthetic address exists (else stop)"',
      '"Sign-up walk: delete the account it created and check for orphans"',
      '"Need walk: read the stored need back and set it to rejected"',
    ]);
    const missing = keyed
      .filter((s) => !/\n {8}env:\n(?: {10}.*\n)*? {10}PROD_QA_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/.test(`${s}\n`))
      .map(stepName);
    expect(missing).toEqual([]);
  });

  it("no production walk spec reads a service-role key", () => {
    const dir = join(APP, "tests/e2e");
    const offenders = readdirSync(dir)
      .filter((f) => /^prod-.*\.ts$/.test(f) || f === "employee-beta-gate.spec.ts")
      .filter((f) => /SERVICE_ROLE/.test(read(join(dir, f))));
    expect(offenders).toEqual([]);
  });
});

describe("every workflow: no job runs Playwright with a service-role SECRET in its job-level env", () => {
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));
  it.each(files)("%s", (file) => {
    const yml = read(join(WORKFLOWS, file));
    const offenders = jobNames(yml).filter((name) => {
      const job = jobBlock(yml, name);
      return steps(job).some(runsPlaywright) && /secrets\.[A-Z0-9_]*SERVICE_ROLE/.test(jobLevelEnv(job));
    });
    expect(offenders).toEqual([]);
  });
});
