/**
 * THE PRODUCTION CHECK QUEUE (owner order 2026-11-24). The plan tick stalled for
 * hours: the deploy brake refused the head pair (`company-governance:desktop`)
 * after every one of the day's frequent deploys, every tick re-dispatched that
 * same pair, and nothing behind it ran. The owner's rules, pinned here:
 *   - a refused walk does not restart the queue: the tick continues with the next
 *     pair that still needs a run and comes back to the refused one later;
 *   - chat, Living CV, sign-up, navigation and the core journeys come first;
 *   - manager-chat runs on desktop, phone and phone-375;
 *   - a deploy does not throw a walk away: the deploy brake WAITS for the quiet
 *     period (bounded) instead of refusing at once;
 *   - the safety rules stay: never a walk during a deploy or within its quiet
 *     period, never with an unhealthy production, never past the budget.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THRESHOLDS, deployWaitMinutes } from "../../../../.github/scripts/walk-brakes.mjs";

const read = (p: string) => readFileSync(resolve(__dirname, "../../../..", p), "utf8");
const TICK = read(".github/workflows/launch-readiness-walks.yml");
const WALK = read(".github/workflows/prod-qa-walk.yml");
const BRAKES = read(".github/scripts/walk-brakes.mjs");
const planOf = (yml: string) => {
  const a = yml.indexOf('PLAN="') + 'PLAN="'.length;
  return yml.slice(a, yml.indexOf('"', a)).split(/\s+/).filter(Boolean);
};
const rerunOf = (yml: string) => (/RERUN: "([^"]*)"/.exec(yml)?.[1] ?? "").split(/\s+/).filter(Boolean);

describe("the plan's priority", () => {
  const plan = planOf(TICK);

  it("manager-chat runs on all three screens, in the plan and on the current build", () => {
    for (const d of ["desktop", "phone", "phone-375"]) {
      expect(plan).toContain(`manager-chat:${d}`);
      expect(rerunOf(TICK)).toContain(`manager-chat:${d}`);
    }
  });

  it("chat, Living CV, sign-up and navigation come before everything else", () => {
    const first = plan.slice(0, 13);
    expect(first).toEqual([
      "manager-chat:desktop", "manager-chat:phone", "manager-chat:phone-375",
      "chat-continuity:phone", "chat-confirm-once:desktop",
      "profile-cv-history:desktop", "profile-cv-history:phone", "profile-cv-history:phone-375",
      "fresh-activation:desktop", "role-routes:desktop", "role-routes:phone",
      "mobile-surfaces:phone", "public-org-locales:phone",
    ]);
    const core = ["jobs-search:desktop", "journal-confirm:desktop", "notifications-inapp:phone", "orders-bookings:desktop"];
    for (const p of core) expect(plan.indexOf(p), p).toBeLessThan(plan.indexOf("company-governance:desktop"));
  });

  it("every pair appears once", () => {
    expect(new Set(plan).size).toBe(plan.length);
  });
});

describe("a refused walk does not hold the queue", () => {
  it("a pair refused by a brake in the last 30 min is passed over, and the next pair runs", () => {
    expect(TICK).toContain("refused_recently() {");
    expect(TICK).toContain("cutoff=$(date -u -d '30 minutes ago' +%FT%TZ)");
    expect(TICK).toMatch(/if refused_recently "\$spec" "\$device"; then log .*; continue; fi/);
  });

  it("the 30 min are counted from the refused run's completion, not its creation (Codex P2 on #3813)", () => {
    // With the brake's waits a refused run can take longer than 30 min to end.
    expect(TICK).toContain("--json displayTitle,createdAt,updatedAt,conclusion,databaseId");
    expect(TICK).toContain("\\t\\(.createdAt)\\t\\(.updatedAt)\\\"");
    expect(TICK).toContain("'$1 == t && $5 >= c {print $3}'");
  });

  it("a pair that has not run comes before the re-run of a failed one; the held pair is the last resort", () => {
    expect(TICK).toContain("RAN_KIND=failed");
    expect(TICK).toContain('if [ "$RAN_KIND" = never ]; then next="$pair"; break; fi');
    expect(TICK).toContain("next=${next:-${retry:-$held}}");
  });

  it("one-shot pairs still go first and the daily cap still holds", () => {
    expect(TICK.indexOf("One-shot pairs first")).toBeLessThan(TICK.indexOf("refused_recently() {"));
    expect(TICK.indexOf("today's cap reached")).toBeLessThan(TICK.indexOf("refused_recently() {"));
  });
});

describe("a deploy waits, it does not throw the walk away", () => {
  it("`deploy --wait N` reads a bounded wait; no flag judges once", () => {
    expect(deployWaitMinutes(["node", "walk-brakes.mjs", "deploy"])).toBe(0);
    expect(deployWaitMinutes(["node", "walk-brakes.mjs", "deploy", "--wait", "15"])).toBe(15);
    expect(deployWaitMinutes(["node", "walk-brakes.mjs", "deploy", "--wait", "999"])).toBe(30);
    expect(deployWaitMinutes(["node", "walk-brakes.mjs", "deploy", "--wait", "x"])).toBe(0);
    expect(THRESHOLDS.deployWaitPollMs).toBeGreaterThanOrEqual(10_000);
  });

  it("the rule is unchanged: it still refuses when production is not quiet within the bound", () => {
    const fn = BRAKES.slice(BRAKES.indexOf("async function cmdDeploy()"));
    expect(fn).toContain("let verdict = readDeployVerdict();");
    expect(fn).toContain("while (verdict.refuse && Date.now() + THRESHOLDS.deployWaitPollMs <= until)");
    expect(fn).toContain("if (verdict.refuse) refuse(");
    expect(THRESHOLDS.deployQuietMinutes).toBe(5);
  });

  it("both walk checks wait, and each job's timeout covers its wait", () => {
    const budget = WALK.slice(WALK.indexOf("\n  budget:"), WALK.indexOf("\n  walk:"));
    const walk = WALK.slice(WALK.indexOf("\n  walk:"), WALK.indexOf("\n  not-run:"));
    expect(budget).toContain("walk-brakes.mjs deploy --wait 15");
    expect(walk).toContain("walk-brakes.mjs deploy --wait 10");
    const timeout = (job: string) => Number(/timeout-minutes: (\d+)/.exec(job)?.[1] ?? 0);
    expect(timeout(budget)).toBeGreaterThanOrEqual(15 + 5);
    expect(timeout(walk)).toBeGreaterThanOrEqual(30 + 10);
  });
});
