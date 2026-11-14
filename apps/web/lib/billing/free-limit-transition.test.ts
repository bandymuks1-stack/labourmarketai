import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { decideOpenNeedsGate } from "./open-needs-gate";
import { openNeedsUsageView } from "./open-needs-usage";

/**
 * THE FREE-LIMIT TRANSITION (owner decision 2026-11-13).
 *
 * When the FREE limit (1 concurrent active need) starts to apply to an
 * organization that already holds more:
 *   R1  existing needs are kept — never deleted, closed or paused by billing;
 *   R2  a NEW need above the limit is refused;
 *   R3  the surplus needs stay active however long they remain open;
 *   R4  a new need is allowed again only when a slot frees up (the count drops
 *       below the limit) or a paid plan lifts the ceiling;
 *   R5  conversations, offers, projects and every other process are never
 *       interrupted: the limit is consulted ONLY when a need is created or
 *       reopened.
 *
 * These are the rules the gate already follows; this file pins each one so a
 * later change cannot weaken them silently. NOT built, and not claimed here:
 * the customer notice, a stored 30-day transition date, and any reminder. The
 * gate has no notion of time: it refuses from the moment enforcement applies.
 */
const WEB = join(__dirname, "..", "..");
const FREE = { enforced: true, planKey: "free_organization", limit: 1 } as const;

describe("R2/R3/R4 — the decision, for an organization already above the limit", () => {
  it("R2: with 3 active needs on FREE, a new need is refused and the refusal states the real count", () => {
    expect(decideOpenNeedsGate({ ...FREE, used: 3 })).toEqual({
      allowed: false, reason: "over_open_need_limit", limit: 1, used: 3, next: "upgrade", planKey: "free_organization",
    });
  });

  it("R3: the decision is the same on any later day — it reads only the count, never a date", () => {
    const src = readFileSync(join(WEB, "lib/billing/open-needs-gate.ts"), "utf8");
    const decide = src.slice(src.indexOf("export function decideOpenNeedsGate"), src.indexOf("function nextStep"));
    expect(decide).not.toMatch(/Date|now\(|created_at|expires|deadline/);
  });

  it("R4: closing needs frees a slot only once the count is BELOW the limit", () => {
    expect(decideOpenNeedsGate({ ...FREE, used: 2 }).allowed).toBe(false);
    expect(decideOpenNeedsGate({ ...FREE, used: 1 }).allowed).toBe(false);
    expect(decideOpenNeedsGate({ ...FREE, used: 0 })).toEqual({ allowed: true, enforced: true, limit: 1, used: 0 });
  });

  it("R4: a paid plan (no ceiling) allows a new need whatever the count", () => {
    expect(decideOpenNeedsGate({ enforced: true, planKey: "company_pilot", limit: null, used: 3 })).toEqual({
      allowed: true, enforced: true, limit: null, used: 3,
    });
  });

  it("an organization the limit does not apply to yet is never refused", () => {
    expect(decideOpenNeedsGate({ enforced: false, planKey: "free_organization", limit: 1, used: 3 }).allowed).toBe(true);
  });

  it("the usage line tells an over-limit organization where it stands (at the limit, with the upgrade step)", () => {
    const view = openNeedsUsageView(decideOpenNeedsGate({ ...FREE, used: 3 }));
    expect(view).toMatchObject({ visible: true, used: 3, limit: 1, remaining: 0, atLimit: true, next: "upgrade" });
  });
});

describe("R1/R5 — billing never touches existing needs or other processes", () => {
  const sources = (dir: string): string[] =>
    readdirSync(join(WEB, dir)).flatMap((name) => {
      const rel = `${dir}/${name}`;
      if (statSync(join(WEB, rel)).isDirectory()) return sources(rel);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
    });

  it("R1: the only billing module that names customer_requests COUNTS them (head count, no write)", () => {
    const touching = [...sources("lib/billing"), ...sources("app/api/billing")].filter((f) =>
      readFileSync(join(WEB, f), "utf8").includes('"customer_requests"'),
    );
    expect(touching).toEqual(["lib/billing/open-needs-gate.ts"]);
    const gate = readFileSync(join(WEB, "lib/billing/open-needs-gate.ts"), "utf8");
    expect(gate).toMatch(/\.from\("customer_requests"\)\s*\.select\("id", \{ count: "exact", head: true \}\)/);
    expect(gate).not.toMatch(/\.(update|delete|insert|upsert|rpc)\(/);
  });

  it("R5: the gate is consulted only when a need is created or reopened (plus the read-only usage line)", () => {
    const callers = [...sources("lib"), ...sources("app"), ...sources("components")]
      .filter((f) => f !== "lib/billing/open-needs-gate.ts")
      .filter((f) => /\bgateOpenNeeds\(/.test(readFileSync(join(WEB, f), "utf8")))
      .sort();
    expect(callers).toEqual([
      "lib/billing/open-needs-usage-read.ts",
      "lib/demand/demand-lifecycle.ts",
      "lib/demand/demand-request.ts",
    ]);
  });

  it("R5: in the lifecycle the gate guards REOPEN only — closing a need is never refused by the limit", () => {
    const life = readFileSync(join(WEB, "lib/demand/demand-lifecycle.ts"), "utf8");
    const close = life.slice(life.indexOf("export async function closeDemand"), life.indexOf("gateOpenNeeds(supabase"));
    expect(life.indexOf("export async function closeDemand")).toBeGreaterThan(-1);
    expect(close).not.toContain("over_open_need_limit");
    expect((life.match(/gateOpenNeeds\(/g) ?? []).length).toBe(1);
  });
});
