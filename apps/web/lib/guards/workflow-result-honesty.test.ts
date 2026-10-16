import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Workflow RESULT honesty — the run says what the walk did, and the artefact
 * is what it claims to be (2026-10-16).
 *
 * Sibling of `ci-exit-code-safety.test.ts` (which pins `pipefail` for piped
 * commands). Two shapes it does not see, both found in `prod-qa-walk.yml`:
 *
 *  1. AN EXIT STATUS ECHOED AS THE LAST COMMAND. `echo "exit=$?"` as the final
 *     line of a `run:` block makes the step's status the ECHO's (0). The walk
 *     only failed honestly because GitHub's `shell: bash` silently adds `-e`;
 *     the block itself (`set -uo pipefail`, no `-e`) turned every failure into
 *     a pass the moment that runner default changed or the line was copied
 *     into a `shell: bash {0}` step.
 *  2. A MULTI-REPORTER STDOUT REDIRECTED INTO A .json FILE.
 *     `playwright test --reporter=list,json > result.json` writes both
 *     reporters to stdout, so the "JSON result" starts with list text and is
 *     not JSON (the uploaded prod-qa artefact of run 38799693673 failed
 *     `JSON.parse` at byte 1). The JSON reporter must get its own file
 *     (`PLAYWRIGHT_JSON_OUTPUT_FILE`).
 *
 * Static text checks over the files CI executes — no network, no GitHub API.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const WORKFLOWS = join(REPO, ".github", "workflows");

const workflowFiles = (): string[] =>
  readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => join(WORKFLOWS, f));

const read = (file: string) => readFileSync(file, "utf8").replace(/\r/g, "");

interface RunBlock {
  file: string;
  /** 1-based line of the `run: |` key. */
  line: number;
  body: string[];
}

/** Every literal `run: |` / `run: >` block, de-indented. */
function runBlocks(file: string, src = read(file)): RunBlock[] {
  const lines = src.split("\n");
  const out: RunBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*[|>][-+]?\s*$/);
    if (!m) continue;
    const keyIndent = lines[i].indexOf("run:");
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === "") {
        body.push("");
        continue;
      }
      const indent = l.length - l.trimStart().length;
      if (indent <= keyIndent) break;
      body.push(l.trim());
    }
    out.push({ file, line: i + 1, body });
  }
  return out;
}

/** Last executable line of a block (comments and blanks skipped). */
function lastCommand(body: string[]): string {
  for (let i = body.length - 1; i >= 0; i--) {
    const t = body[i].trim();
    if (t && !t.startsWith("#")) return t;
  }
  return "";
}

/** Shape 1: the block ends by echoing `$?` — its status is the echo's. */
const ECHOES_STATUS_LAST = (body: string[]): boolean =>
  /^(echo|printf)\b.*\$\?/.test(lastCommand(body));

/** Shape 2: a playwright run with a json reporter AND another reporter whose
 *  stdout is redirected into a .json file. Backslash continuations joined. */
function redirectsMixedReportersIntoJson(body: string[]): boolean {
  const joined = body.join("\n").replace(/\\\n\s*/g, " ");
  return joined.split("\n").some((cmd) => {
    if (!/\bplaywright\s+test\b/.test(cmd)) return false;
    const rep = cmd.match(/--reporter[= ]([^\s]+)/);
    if (!rep) return false;
    const names = rep[1].split(",");
    if (!names.includes("json") || names.length < 2) return false;
    return /(?:^|[^2&])>\s*["']?[^\s"']+\.json\b/.test(cmd);
  });
}

describe("workflow steps report the real result", () => {
  const blocks = workflowFiles().flatMap((f) => runBlocks(f));

  it("finds run blocks to check (the scan is not vacuous)", () => {
    expect(blocks.length).toBeGreaterThan(20);
  });

  it("no run block ends by echoing an exit status", () => {
    const offences = blocks
      .filter((b) => ECHOES_STATUS_LAST(b.body))
      .map((b) => `${b.file}:${b.line}  ${lastCommand(b.body)}`);
    expect(offences, offences.join("\n")).toEqual([]);
  });

  it("no playwright run redirects a multi-reporter stdout into a .json file", () => {
    const offences = blocks
      .filter((b) => redirectsMixedReportersIntoJson(b.body))
      .map((b) => `${b.file}:${b.line}`);
    expect(offences, offences.join("\n")).toEqual([]);
  });

  it("the detectors fire on the exact shapes that shipped", () => {
    const shipped = [
      "set -uo pipefail",
      "cd apps/web",
      'pnpm exec playwright test "$SPEC" --project=chromium --trace=off --reporter=list,json \\',
      "  > ../../prod-qa-result.json",
      'echo "exit=$?" >> "$GITHUB_STEP_SUMMARY"',
    ];
    expect(ECHOES_STATUS_LAST(shipped)).toBe(true);
    expect(redirectsMixedReportersIntoJson(shipped)).toBe(true);
    // …and stay quiet on the honest shapes.
    expect(ECHOES_STATUS_LAST(['echo "walk exit=${code}"', 'exit "${code}"'])).toBe(false);
    expect(
      redirectsMixedReportersIntoJson([
        'PLAYWRIGHT_JSON_OUTPUT_FILE="$W/r.json" pnpm exec playwright test x --reporter=list,json > "$W/walk.log" 2>&1 || code=$?',
      ]),
    ).toBe(false);
    expect(
      redirectsMixedReportersIntoJson(["pnpm exec playwright test x --reporter=json > r.json"]),
    ).toBe(false);
  });
});

describe("prod-qa-walk: a failing walk fails the run, and the evidence still uploads", () => {
  const file = join(WORKFLOWS, "prod-qa-walk.yml");
  const src = read(file);
  const walk = runBlocks(file, src).find((b) =>
    b.body.some((l) => /playwright\s+test/.test(l)),
  );

  it("has exactly one walk block", () => {
    expect(walk).toBeDefined();
  });

  it("captures the playwright exit code instead of letting a later command own the status", () => {
    const body = (walk?.body ?? []).join("\n");
    expect(body).toMatch(/--reporter=list,json[\s\S]{0,120}\|\|\s*code=\$\?/);
    expect(body).toMatch(/PLAYWRIGHT_JSON_OUTPUT_FILE=/);
  });

  it("returns that exit code as the block's final command", () => {
    expect(lastCommand(walk?.body ?? [])).toBe('exit "${code}"');
  });

  it("uploads the JSON result and the walk log even when the walk failed", () => {
    const upload = src.slice(src.indexOf("- name: Upload result"));
    expect(upload).toMatch(/^\s*if:\s*always\(\)/m);
    expect(upload).toContain("actions/upload-artifact@");
    expect(upload).toContain("prod-qa-result.json");
    expect(upload).toContain("prod-qa-walk.log");
  });

  it("still never uploads screenshots, traces or session files", () => {
    expect(src).toContain("--trace=off");
    const upload = src.slice(src.indexOf("- name: Upload result"));
    expect(upload).not.toMatch(/\.png|\.zip|storage-state|test-results/);
  });
});
