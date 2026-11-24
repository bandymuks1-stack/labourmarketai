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

  it("a run whose build changed underneath it reports a window, and the green build is kept", () => {
    expect(wf).toMatch(/window: \$\{\{ steps\.record\.outputs\.window \}\}/);
    expect(wf).toMatch(/window: \$\{\{ steps\.after\.outputs\.window \}\}/);
    expect(report).toMatch(/SMOKE_WINDOW: \$\{\{ needs\.smoke\.outputs\.window \}\}/);
    expect(report).toContain("SIGNED_IN_WINDOW: ${{ needs.signed-in.outputs.window }}");
    expect(report).toMatch(/if: steps\.report\.outputs\.green == 'true'\n\s+uses: actions\/upload-artifact@[0-9a-f]+ # v4\n\s+with:\n\s+name: verified-build/);
  });

  it("the script never rolls back and keeps one issue", () => {
    expect(script).toMatch(/set -euo pipefail/);
    expect(script).not.toMatch(/\bgit (revert|reset|push|checkout)\b|\bgh (workflow run|run rerun|pr merge)\b/);
    expect(script).toContain('TITLE="Post-deploy smoke is failing on production"');
    expect(script).toMatch(/gh issue comment "\$open"/);
    expect(script).toMatch(/gh issue close "\$open"/);
  });
});

describe("a refused walk brake is NOT RUN, never a failure (run 45374185126, issue #3760)", () => {
  const signedIn = wf.slice(wf.indexOf("\n  signed-in:"), wf.indexOf("\n  report:"));

  it("the brakes keep their thresholds, are asked again for a bounded time, and record the outcome", () => {
    expect(signedIn).toMatch(/id: brake\n/);
    expect(signedIn).toMatch(/for i in \$\(seq 1 14\); do\n\s+if node \.github\/scripts\/walk-brakes\.mjs deploy && node \.github\/scripts\/walk-brakes\.mjs health; then/);
    expect(signedIn).toMatch(/echo "brake=clear" >> "\$GITHUB_OUTPUT"/);
    expect(signedIn).toMatch(/echo "brake=refused" >> "\$GITHUB_OUTPUT"/);
    expect(signedIn).toMatch(/brake: \$\{\{ steps\.brake\.outputs\.brake \}\}/);
    expect(signedIn).not.toMatch(/HEALTH_URL|healthDbMs|deployQuietMinutes/);
    expect(report).toContain("SIGNED_IN_BRAKE: ${{ needs.signed-in.outputs.brake }}");
  });

  it("a refused brake makes the job red and the journeys never start, so it is never silently green", () => {
    expect(signedIn).toMatch(/if: steps\.brake\.outputs\.brake != 'clear'\n\s+run: \|\n[\s\S]*?did NOT run[\s\S]*?exit 1\n/);
    const refusedAt = signedIn.indexOf("Brake refused");
    expect(refusedAt).toBeGreaterThan(-1);
    expect(refusedAt).toBeLessThan(signedIn.indexOf("Mint two synthetic sessions"));
  });

  function run(env: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "regression-brake-"));
    try {
      execFileSync("git", ["-C", dir, "init", "-q"]);
      return execFileSync("bash", [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, REGRESSION_ISSUE_DRY_RUN: "1", LAST_GREEN_SHA: "", DEPLOY_SHA: "e630dd20aaaa", RUN_URL: "x", GITHUB_OUTPUT: join(dir, "out"), ...env },
      }) + readFileSync(join(dir, "out"), "utf8");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("refused with a green public half: no issue, nothing closed, not green", () => {
    const out = run({ SMOKE: "success", SIGNED_IN: "failure", SIGNED_IN_BRAKE: "refused" });
    expect(out).toContain("NOT RUN");
    expect(out).toContain("green=false");
    expect(out).not.toContain("Pull requests merged");
    expect(out).not.toContain("GREEN ");
  });

  it("refused with a red public half: the issue names the public failure and says signed-in did not run", () => {
    const out = run({ SMOKE: "failure", SIGNED_IN: "failure", SIGNED_IN_BRAKE: "refused" });
    expect(out).toContain("public `failure` · signed-in `not run (the walk brakes refused)`");
    expect(out).toContain("Pull requests merged");
  });

  it("a real signed-in failure after a clear brake still opens the issue", () => {
    const out = run({ SMOKE: "success", SIGNED_IN: "failure", SIGNED_IN_BRAKE: "clear" });
    expect(out).toContain("public `success` · signed-in `failure`");
    expect(out).toContain("Pull requests merged");
    expect(out).toContain("green=false");
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
      // A green run keeps the commit it verified, for the next red run's baseline.
      expect(readFileSync(join(dir, "verified-build.txt"), "utf8").trim()).toBe(deploy);

      // The range ends at the BUILD production served, not at a newer main
      // commit the deploy run carried (Codex review on #3271).
      const later = commit("feat(e): merged after the deploy started (#104)");
      const body = execFileSync("bash", [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, REGRESSION_ISSUE_DRY_RUN: "1", LAST_GREEN_SHA: green, SMOKE: "failure", SIGNED_IN: "skipped", BUILD: deploy.slice(0, 9), DEPLOY_SHA: later, RUN_URL: "x" },
      });
      expect(body).toContain("- #103 fix(d): the deploy that broke");
      expect(body).not.toContain("#104");

      // Production moved to another build during the run: no claim, issue untouched.
      const moved = execFileSync("bash", [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, REGRESSION_ISSUE_DRY_RUN: "1", LAST_GREEN_SHA: green, SMOKE: "failure", SIGNED_IN: "skipped", SMOKE_WINDOW: "changed", DEPLOY_SHA: deploy, RUN_URL: "x" },
      });
      expect(moved).toContain("WINDOW CHANGED");
      expect(moved).not.toContain("Pull requests merged");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
