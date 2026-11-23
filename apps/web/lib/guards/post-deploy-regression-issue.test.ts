import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * POST-DEPLOY REGRESSION ISSUE (owner order 2026-11-23). After every
 * production deploy, a red smoke opens or updates ONE issue naming the deploy
 * SHA and the pull requests merged since the last green smoke. A green smoke
 * closes it. Nothing is rolled back automatically.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const wf = readFileSync(join(REPO, ".github/workflows/post-deploy-smoke.yml"), "utf8");
const SCRIPT = join(REPO, ".github/scripts/post-deploy-regression-issue.sh");
const script = readFileSync(SCRIPT, "utf8");

const report = wf.slice(wf.indexOf("\n  report:"));

describe("the report job", () => {
  it("runs after both halves, always, and never on a pull request", () => {
    expect(report).toMatch(/needs: \[smoke, signed-in\]/);
    expect(report).toMatch(/if: always\(\) && github\.event_name != 'pull_request'/);
  });

  it("is the only job that may write issues, and it reads no repository secret", () => {
    expect(wf.match(/issues: write/g)).toHaveLength(1);
    expect(report).toMatch(/issues: write/);
    expect(report).not.toMatch(/secrets\./);
    expect(report).toMatch(/GH_TOKEN: \$\{\{ github\.token \}\}/);
  });

  it("names the deploy SHA of the deploy run it follows", () => {
    expect(report).toMatch(/DEPLOY_SHA: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
  });

  it("the script never rolls back and keeps one issue", () => {
    expect(script).toMatch(/set -euo pipefail/);
    expect(script).not.toMatch(/\bgit (revert|reset|push|checkout)\b|\bgh (workflow run|run rerun|pr merge)\b/);
    expect(script).toContain('TITLE="Post-deploy smoke is failing on production"');
    expect(script).toMatch(/gh issue comment "\$open"/);
    expect(script).toMatch(/gh issue close "\$open"/);
  });
});

describe("the issue body lists the pull requests merged since the last green smoke", () => {
  function git(dir: string, ...args: string[]): string {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  }

  it("from a real history: deploy SHA, results, and only the merges after the green one", () => {
    const dir = mkdtempSync(join(tmpdir(), "regression-issue-"));
    try {
      git(dir, "init", "-q");
      git(dir, "config", "user.email", "ci@example.invalid");
      git(dir, "config", "user.name", "ci");
      const commit = (subject: string) => {
        writeFileSync(join(dir, "f.txt"), subject);
        git(dir, "add", "f.txt");
        git(dir, "commit", "-q", "-m", subject);
        return git(dir, "rev-parse", "HEAD");
      };
      commit("feat(a): an earlier change (#100)");
      const green = commit("fix(b): the green deploy (#101)");
      commit("feat(c): a new page (#102)");
      commit("chore: a direct commit without a PR");
      const deploy = commit("fix(d): the deploy that broke (#103)");

      const out = execFileSync("bash", [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          REGRESSION_ISSUE_DRY_RUN: "1",
          LAST_GREEN_SHA: green,
          SMOKE: "success",
          SIGNED_IN: "failure",
          BUILD: deploy.slice(0, 9),
          DEPLOY_SHA: deploy,
          RUN_URL: "https://github.com/o/r/actions/runs/1",
        },
      });
      expect(out).toContain(`**Deploy:** \`${deploy.slice(0, 8)}\``);
      expect(out).toContain("public `success` · signed-in `failure`");
      expect(out).toContain(`since the last green smoke on \`${green.slice(0, 8)}\``);
      expect(out).toContain("- #103 fix(d): the deploy that broke");
      expect(out).toContain("- #102 feat(c): a new page");
      expect(out).not.toContain("#101");
      expect(out).not.toContain("#100");
      expect(out).toContain("a code rollback is a human decision");

      const ok = execFileSync("bash", [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, REGRESSION_ISSUE_DRY_RUN: "1", LAST_GREEN_SHA: green, SMOKE: "success", SIGNED_IN: "success", DEPLOY_SHA: deploy, RUN_URL: "x" },
      });
      expect(ok.trim()).toBe(`GREEN ${deploy.slice(0, 8)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
