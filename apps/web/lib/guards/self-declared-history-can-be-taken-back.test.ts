import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUILT_NOT_CONNECTED sweep — a person could state a work-history entry about
 * themselves and never take it back.
 *
 * `remove_self_declared_work_history_v1` has been applied and callable since
 * migration 20260714161000 and was named in no source file at all, while the
 * capability profile carried a form that WRITES history through its sibling
 * `save_self_declared_work_history_v1`. A living CV whose statements are
 * one-way is the wrong shape.
 *
 * The guard pins the connection AND its limits — all of which are the RPC's
 * own, so this adds no authority. Static file pinning; no database.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

const ACTIONS = stripTs(read("lib/profile/cv-section-import-actions.ts"));
const UI = stripTs(read("components/app/capability-profile-section.tsx"));
const CARD = stripTs(read("components/app/cv-engagement-cards.tsx"));
const PAGE = stripTs(read("app/[locale]/dashboard/profile/page.tsx"));
const MIG = readFileSync(
  join(REPO, "supabase/migrations/20260714161000_self_declared_work_history_v1.sql"),
  "utf8",
);

describe("1. the removal the database already offered is reachable", () => {
  it("an action calls the RPC", () => {
    expect(ACTIONS).toMatch(/removeSelfDeclaredWorkHistoryAction/);
    expect(ACTIONS).toMatch(/"remove_self_declared_work_history_v1"/);
  });

  it("the profile surface calls the action", () => {
    expect(UI).toMatch(/removeSelfDeclaredWorkHistoryAction\(id\)/);
    expect(UI).toMatch(/capability-experience-remove-/);
  });
});

describe("2. every limit is the RPC's own", () => {
  const fn = MIG.slice(
    MIG.indexOf("function public.remove_self_declared_work_history_v1"),
    MIG.indexOf("function public.remove_self_declared_work_history_v1") + 1400,
  ).toLowerCase();

  it("own row, self-declared, never the primary engagement", () => {
    expect(fn).toContain("ec.profile_id = uid");
    expect(fn).toContain("ec.organization_id is null");
    expect(fn).toContain("ec.is_primary = false");
  });

  it("history that carries journal records is refused, not destroyed", () => {
    expect(fn).toContain("foreign_key_violation");
    expect(fn).toContain("'in_use'");
  });

  it("the control is offered only where those preconditions hold", () => {
    expect(CARD).toMatch(/selfDeclared\?: boolean;/);
    expect(PAGE).toMatch(/selfDeclared: org === null && e\.is_primary !== true/);
    expect(UI).toMatch(/c\.selfDeclared &&/);
  });
});

describe("3. the refusals reach the person", () => {
  it("`in_use` becomes a stated reason, not a generic failure", () => {
    expect(ACTIONS).toMatch(/if \(outcome === "in_use"\) return \{ ok: false, code: "conflict" \}/);
    expect(UI).toMatch(/res\.code === "conflict" \? t\("expRemoveInUse"\)/);
  });

  it("an error is shown rather than swallowed", () => {
    expect(UI).toMatch(/data-testid="capability-experience-remove-error"/);
  });

  it("`not_found` stays merged — the action is not an existence oracle", () => {
    // The RPC returns `not_found` for a missing row AND for one the caller may
    // not touch; the action must not tell those apart either.
    expect(ACTIONS).toMatch(/if \(outcome !== "removed"\) return \{ ok: false, code: "invalid" \}/);
  });
});

describe("4. copy exists where the section does", () => {
  const LOCALES = ["en", "lt", "de", "nl", "ru"] as const;
  for (const loc of LOCALES) {
    it(`${loc} carries the three keys`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        capabilityProfile: Record<string, unknown>;
      };
      for (const k of ["expRemove", "expRemoveInUse", "expRemoveError"]) {
        expect(typeof j.capabilityProfile[k]).toBe("string");
      }
    });
  }
});
