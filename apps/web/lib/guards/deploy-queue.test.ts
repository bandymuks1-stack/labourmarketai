import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ONE DEPLOY QUEUE (owner P0 2026-11-24). A production deploy and its
 * production checks are ONE run of deploy-vps.yml, in ONE concurrency group,
 * so the next deploy cannot start while this deploy is being checked. A check
 * that did not run is BLOCKED, never PASS or FAIL. A check that genuinely
 * fails freezes normal deploys until its issue is closed; only the repository
 * owner can deploy through the freeze, with a reason, and the checks still run.
 *
 * Run 45374185126 (issue #3760) is why: no signed-in journey ran, yet the run
 * was reported as a regression.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const WF_DIR = join(REPO, ".github/workflows");
const read = (f: string) => readFileSync(join(WF_DIR, f), "utf8").replace(/\r/g, "");
const deploy = read("deploy-vps.yml");
const smoke = read("post-deploy-smoke.yml");
const GATE = join(REPO, ".github/scripts/deploy-freeze-gate.sh");
const REPORT = join(REPO, ".github/scripts/post-deploy-regression-issue.sh");

/** The block of one job: from `  <name>:` to the next job (two-space key). */
function job(wf: string, name: string): string {
  const start = wf.indexOf(`\n  ${name}:\n`);
  if (start < 0) throw new Error(`job ${name} missing`);
  const rest = wf.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe("one queue: the checks are jobs of the deploy run, in the deploy-vps group", () => {
  it("deploy-vps.yml has one workflow-level group, deploy-vps, that never cancels a started run", () => {
    expect(deploy).toMatch(/\nconcurrency:\n {2}group: deploy-vps\n {2}cancel-in-progress: false\n/);
    // No job leaves the queue with a group of its own.
    expect(deploy.match(/\n\s+concurrency:/g)?.length ?? 0).toBe(1);
  });

  it("the checks need the deploy job and reuse post-deploy-smoke.yml, not a copy", () => {
    const checks = job(deploy, "checks");
    expect(checks).toMatch(/needs: \[build, deploy\]/);
    expect(checks).toMatch(/if: needs\.deploy\.result == 'success' && needs\.deploy\.outputs\.shipped == 'true'/);
    expect(checks).toMatch(/uses: \.\/\.github\/workflows\/post-deploy-smoke\.yml/);
    expect(checks).toContain("deploy_sha: ${{ needs.build.outputs.sha }}");
    expect(checks).toMatch(/issues: write/);
    expect(job(deploy, "deploy")).toContain("shipped: ${{ steps.order.outputs.go }}");
    // The checks live in one file: the deploy workflow runs no browser or crawl of its own.
    expect(deploy).not.toMatch(/playwright|public-cta-crawl|prod-deploy-smoke\.spec/);
  });

  it("the smoke is callable, needs the deploy sha, and no longer starts on its own after a deploy", () => {
    const on = smoke.slice(smoke.indexOf("\non:"), smoke.indexOf("\npermissions:"));
    expect(on).toMatch(/\n {2}workflow_call:\n {4}inputs:\n {6}deploy_sha:\n[\s\S]*?required: true/);
    expect(on).not.toMatch(/workflow_run/);
    // Called, its group is its own run's: reusing `deploy-vps` inside that group would deadlock.
    expect(smoke).toContain("group: post-deploy-smoke-${{ inputs.deploy_sha && format('in-deploy-{0}', github.run_id) ||");
    expect(smoke).not.toMatch(/group: deploy-vps\b/);
  });

  it("no other workflow ships, rolls back or calls the checks outside that group", () => {
    const actions: Record<string, string[]> = {};
    for (const f of readdirSync(WF_DIR).filter((x) => /\.ya?ml$/.test(x))) {
      const wf = read(f);
      for (const m of wf.matchAll(/"lmdeploy@\$\{HOST\}" "([a-z-]+)/g)) (actions[f] ??= []).push(m[1]!);
      if (f !== "deploy-vps.yml") {
        expect(wf, f).not.toMatch(/uses: \.\/\.github\/workflows\/post-deploy-smoke\.yml/);
        expect(wf, f).not.toMatch(/workflows: \["Deploy to VPS"\]/);
      }
    }
    for (const [f, acts] of Object.entries(actions)) {
      if (f === "deploy-vps.yml") continue;
      expect(acts.filter((a) => a === "deploy" || a === "rollback"), f).toEqual([]);
    }
    expect(actions["deploy-vps.yml"]).toEqual(["deploy"]);
  });
});

describe("the freeze is checked before anything is built or shipped", () => {
  it("gate is the first job; build needs gate; deploy needs build", () => {
    const jobsAt = deploy.indexOf("\njobs:\n");
    const firstJob = /\n {2}([a-z][\w-]*):\n/.exec(deploy.slice(jobsAt + 5));
    expect(firstJob?.[1]).toBe("gate");
    expect(job(deploy, "gate")).toMatch(/run: bash \.github\/scripts\/deploy-freeze-gate\.sh/);
    expect(job(deploy, "build")).toMatch(/\n {4}needs: gate\n/);
    expect(job(deploy, "deploy")).toMatch(/\n {4}needs: build\n/);
    expect(deploy.indexOf("deploy-freeze-gate.sh")).toBeLessThan(deploy.indexOf("Ship + activate on the VPS"));
  });

  it("emergency is a dispatch input that needs a reason; the owner and the reason reach the gate", () => {
    expect(deploy).toMatch(/\n {6}emergency:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: false/);
    expect(deploy).toMatch(/\n {6}reason:\n/);
    const gate = job(deploy, "gate");
    expect(gate).toContain("ACTOR: ${{ github.actor }}");
    expect(gate).toContain("OWNER: ${{ github.repository_owner }}");
    expect(gate).toContain("REASON: ${{ inputs.reason }}");
  });

  function gate(env: Record<string, string>): { code: number; out: string } {
    try {
      const out = execFileSync("bash", [GATE], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, EMERGENCY: "", REASON: "", ACTOR: "", GITHUB_STEP_SUMMARY: "", DEPLOY_FREEZE_DRY_RUN: "1", OWNER: "the-owner", RUN_URL: "https://example.invalid/run/1", ...env },
      });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status: number; stdout: string };
      return { code: err.status, out: err.stdout };
    }
  }
  const FROZEN = "3760 https://github.com/o/r/issues/3760";

  it("no freeze: the deploy starts", () => {
    expect(gate({ DEPLOY_FREEZE_OPEN: "", ACTOR: "someone" }).code).toBe(0);
  });

  it("an open freeze refuses a normal deploy as BLOCKED with the issue link", () => {
    const r = gate({ DEPLOY_FREEZE_OPEN: FROZEN, ACTOR: "the-owner", EMERGENCY: "false" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("BLOCKED: deploy freeze #3760 is open (https://github.com/o/r/issues/3760)");
  });

  it("emergency needs the owner AND a reason, frozen or not", () => {
    for (const open of [FROZEN, ""]) {
      expect(gate({ DEPLOY_FREEZE_OPEN: open, EMERGENCY: "true", ACTOR: "not-the-owner", REASON: "x" }).code).toBe(1);
      expect(gate({ DEPLOY_FREEZE_OPEN: open, EMERGENCY: "true", ACTOR: "the-owner", REASON: "   " }).code).toBe(1);
      expect(gate({ DEPLOY_FREEZE_OPEN: open, EMERGENCY: "true", ACTOR: "", REASON: "x" }).code).toBe(1);
    }
  });

  it("an emergency from the owner's account with a reason passes the freeze and is logged on the freeze issue", () => {
    const r = gate({ DEPLOY_FREEZE_OPEN: FROZEN, EMERGENCY: "true", ACTOR: "the-owner", REASON: "security fix" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("LOG #3760: Emergency deploy through the freeze, dispatched from the the-owner account: security fix.");
    expect(r.out).toContain("the checks still run");
  });
});

describe("BLOCKED is never PASS or FAIL; a real FAIL freezes", () => {
  function report(env: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "deploy-queue-"));
    try {
      execFileSync("git", ["-C", dir, "init", "-q"]);
      const out = execFileSync("bash", [REPORT], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, REGRESSION_ISSUE_DRY_RUN: "1", LAST_GREEN_SHA: "", DEPLOY_SHA: "e630dd20aaaa", RUN_URL: "x", GITHUB_OUTPUT: join(dir, "out"), GITHUB_STEP_SUMMARY: join(dir, "summary"), ...env },
      });
      return out + readFileSync(join(dir, "out"), "utf8");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("the public half BLOCKED (production never settled on the deploy's build): no issue, nothing closed", () => {
    const out = report({ SMOKE: "failure", SMOKE_STATE: "blocked", SIGNED_IN: "skipped" });
    expect(out).toContain("BLOCKED / NOT RUN");
    expect(out).toContain("green=false");
    expect(out).not.toContain("Pull requests merged");
  });

  it("the walk brakes refused for the whole bounded wait: not run, no issue", () => {
    const out = report({ SMOKE: "success", SMOKE_STATE: "ran", SIGNED_IN: "failure", SIGNED_IN_BRAKE: "refused" });
    expect(out).toContain("NOT RUN");
    expect(out).not.toContain("Pull requests merged");
  });

  it("a check that ran and failed writes the regression body (the issue carries deploy-freeze)", () => {
    const out = report({ SMOKE: "success", SMOKE_STATE: "ran", SIGNED_IN: "failure", SIGNED_IN_BRAKE: "clear", SIGNED_IN_JOURNEYS: "failure" });
    expect(out).toContain("Pull requests merged");
    expect(readFileSync(REPORT, "utf8")).toMatch(/gh issue create --title "\$TITLE" --label "\$FREEZE_LABEL"/);
  });

  it("the public half waits, bounded, for THIS deploy's build and records BLOCKED when it never comes", () => {
    const settle = smoke.slice(smoke.indexOf("- name: Production is settled on one build"), smoke.indexOf("- name: Security headers"));
    expect(settle).toContain("EXPECT: ${{ inputs.deploy_sha }}");
    expect(settle).toMatch(/for i in \$\(seq 1 30\); do/);
    expect(settle).toMatch(/if \[ -n "\$want" \] && \[ "\$b" != "\$want" \]; then b=""; fi/);
    expect(settle).toMatch(/echo "state=blocked" >> "\$GITHUB_OUTPUT"/);
    expect(smoke).toContain("SMOKE_STATE: ${{ needs.smoke.outputs.state }}");
  });

  it("the brakes and their thresholds are unchanged by the queue", () => {
    const brakes = readFileSync(join(REPO, ".github/scripts/walk-brakes.mjs"), "utf8");
    expect(brakes).toMatch(/healthDbMs: 1500,/);
    expect(brakes).toMatch(/healthAuthMs: 1500,/);
    expect(brakes).toMatch(/deployQuietMinutes: 5,/);
  });
});

/** Every `run: |` block of a workflow, by indentation, with `${{ … }}` replaced by a plain word. */
function runBlocks(wf: string): { at: number; body: string }[] {
  const lines = wf.split("\n");
  const out: { at: number; body: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run: \|\s*$/.exec(lines[i]!);
    if (!m) continue;
    const keyIndent = m[1]!.length + (lines[i]!.trimStart().startsWith("- ") ? 2 : 0);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.trim() !== "" && l.length - l.trimStart().length <= keyIndent) break;
      body.push(l);
    }
    out.push({ at: i + 1, body: body.join("\n").replace(/\$\{\{[^}]*\}\}/g, "X") });
    i = j - 1;
  }
  return out;
}

describe("every shell step of the queue parses (a quote inside ${var:+…} broke the first PR run)", () => {
  for (const f of ["deploy-vps.yml", "post-deploy-smoke.yml"]) {
    it(f, () => {
      const blocks = runBlocks(read(f));
      expect(blocks.length).toBeGreaterThan(5);
      for (const b of blocks) {
        let err = "";
        try {
          execFileSync("bash", ["-n"], { input: b.body, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        } catch (e) {
          err = String((e as { stderr?: string }).stderr ?? e);
        }
        expect(err, `${f}:${b.at}`).toBe("");
      }
    });
  }
});

describe("a runner or clean-up failure is not a regression (R3 on #3762)", () => {
  function report(env: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "deploy-queue-infra-"));
    try {
      execFileSync("git", ["-C", dir, "init", "-q"]);
      const out = execFileSync("bash", [REPORT], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, REGRESSION_ISSUE_DRY_RUN: "1", LAST_GREEN_SHA: "", DEPLOY_SHA: "e630dd20aaaa", RUN_URL: "x", GITHUB_OUTPUT: join(dir, "out"), GITHUB_STEP_SUMMARY: join(dir, "summary"), SMOKE: "success", SMOKE_STATE: "ran", SIGNED_IN: "failure", SIGNED_IN_BRAKE: "clear", ...env },
      });
      return out + readFileSync(join(dir, "out"), "utf8");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("the public half's runner setup failing is BLOCKED, not FAIL", () => {
    expect(smoke).toContain(
      "state: ${{ (steps.setup_pnpm.outcome == 'failure' || steps.setup_node.outcome == 'failure' || steps.install.outcome == 'failure' || steps.playwright.outcome == 'failure') && 'blocked' || steps.build.outputs.state }}",
    );
  });

  it("the signed-in journeys never started (setup or mint failed): NOT RUN, no issue", () => {
    expect(smoke).toContain("journeys: ${{ steps.journeys.outcome }}");
    expect(smoke).toContain("SIGNED_IN_JOURNEYS: ${{ needs.signed-in.outputs.journeys }}");
    for (const j of ["skipped", ""]) {
      const out = report({ SIGNED_IN_JOURNEYS: j });
      expect(out).toContain("NOT RUN");
      expect(out).toContain("green=false");
      expect(out).not.toContain("Pull requests merged");
    }
  });

  it("the journeys passed but a clean-up after them failed: INCOMPLETE, no issue, not green", () => {
    const out = report({ SIGNED_IN_JOURNEYS: "success" });
    expect(out).toContain("INCOMPLETE");
    expect(out).toContain("green=false");
    expect(out).not.toContain("Pull requests merged");
  });

  it("the journeys themselves failed: FAIL, the issue is written", () => {
    expect(report({ SIGNED_IN_JOURNEYS: "failure" })).toContain("Pull requests merged");
  });
});

describe("the emergency path is described honestly (R3 blocker on #3762)", () => {
  const POLICY = "## Deploy freeze emergency — the owner only, in person (binding — follows from owner P0 2026-11-24; owner to confirm)";

  it("AGENTS.md and CLAUDE.md bind agents never to dispatch an emergency or lift a freeze", () => {
    for (const f of ["AGENTS.md", "CLAUDE.md"]) {
      const doc = readFileSync(join(REPO, f), "utf8");
      expect(doc, f).toContain(POLICY);
      expect(doc, f).toMatch(/agents never dispatch `deploy-vps\.yml` with `emergency=true`/);
      expect(doc, f).toMatch(/never remove the `deploy-freeze` label or close a freeze issue/);
    }
  });

  it("the workflow, the gate and the issue never claim the account check is an owner-identity check", () => {
    const gateSrc = readFileSync(GATE, "utf8");
    const reportSrc = readFileSync(REPORT, "utf8");
    expect(deploy).not.toMatch(/Owner only: deploy through/);
    expect(deploy).toMatch(/cannot tell an agent from the\s+#?\s*owner/);
    expect(gateSrc).toMatch(/HONEST LIMIT: agent sessions act through that same account/);
    expect(gateSrc).not.toMatch(/by the owner \(/);
    expect(reportSrc).toContain("Agents never close this issue, remove its label or dispatch an emergency");
    expect(reportSrc).not.toMatch(/owner-only emergency/i);
  });

  it("only the deploy-freeze LABEL freezes: a same-titled issue without it (e.g. #3793) never does", () => {
    const gateSrc = readFileSync(GATE, "utf8");
    expect(gateSrc).toMatch(/gh issue list --state open --label "\$LABEL"/);
    expect(gateSrc).not.toMatch(/--search "in:title/);
    expect(gateSrc).not.toContain("TITLE=");
    // the report job is the one place that sets the label, and only on a real failure
    expect(readFileSync(REPORT, "utf8")).toMatch(/gh issue create --title "\$TITLE" --label "\$FREEZE_LABEL"/);
  });
});
