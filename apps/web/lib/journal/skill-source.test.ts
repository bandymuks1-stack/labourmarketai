import { describe, expect, it } from "vitest";
import {
  computeSkillSource,
  reconcileWorkerSkillSources,
  type WorkerSkillRow,
} from "./skill-source";

describe("computeSkillSource — deterministic evidence tier", () => {
  it("self_declared when neither journal-supported nor verified", () => {
    expect(computeSkillSource({ verified: false, journalSupported: false })).toBe("self_declared");
  });
  it("work_journal when journal-supported and not verified", () => {
    expect(computeSkillSource({ verified: false, journalSupported: true })).toBe("work_journal");
  });
  it("manager_confirmed when verified (highest), regardless of journal support", () => {
    expect(computeSkillSource({ verified: true, journalSupported: false })).toBe("manager_confirmed");
    expect(computeSkillSource({ verified: true, journalSupported: true })).toBe("manager_confirmed");
  });
});

describe("reconcileWorkerSkillSources — worker-side promotion/demotion (no fakes)", () => {
  const row = (skill_id: string, source: string, verified = false): WorkerSkillRow => ({
    skill_id,
    source,
    verified,
  });

  it("promotes a self_declared skill to work_journal when it gains journal support", () => {
    const updates = reconcileWorkerSkillSources(
      [row("s1", "self_declared")],
      new Set(["s1"]),
    );
    expect(updates).toEqual([{ skill_id: "s1", source: "work_journal" }]);
  });

  it("does NOT promote a self_declared skill with no journal support", () => {
    const updates = reconcileWorkerSkillSources([row("s1", "self_declared")], new Set());
    expect(updates).toEqual([]);
  });

  it("demotes work_journal back to self_declared when the last link is removed", () => {
    const updates = reconcileWorkerSkillSources([row("s1", "work_journal")], new Set());
    expect(updates).toEqual([{ skill_id: "s1", source: "self_declared" }]);
  });

  it("NEVER touches a verified (manager_confirmed) row — even with no journal support", () => {
    const updates = reconcileWorkerSkillSources(
      [row("s1", "manager_confirmed", true)],
      new Set(),
    );
    expect(updates).toEqual([]);
  });

  it("never fakes a confirmation — journal support alone never yields manager_confirmed", () => {
    const updates = reconcileWorkerSkillSources([row("s1", "self_declared")], new Set(["s1"]));
    expect(updates.every((u) => u.source !== "manager_confirmed")).toBe(true);
  });

  it("only returns the diff (idempotent — no churn when already correct)", () => {
    const updates = reconcileWorkerSkillSources(
      [row("s1", "work_journal"), row("s2", "self_declared")],
      new Set(["s1"]),
    );
    expect(updates).toEqual([]);
  });

  it("reconciles a mixed set in one pass, leaving confirmed rows alone", () => {
    const updates = reconcileWorkerSkillSources(
      [
        row("s1", "self_declared"), // gains support → work_journal
        row("s2", "work_journal"), // lost support → self_declared
        row("s3", "manager_confirmed", true), // confirmed → untouched
        row("s4", "work_journal"), // still supported → unchanged
      ],
      new Set(["s1", "s4"]),
    );
    expect(updates).toContainEqual({ skill_id: "s1", source: "work_journal" });
    expect(updates).toContainEqual({ skill_id: "s2", source: "self_declared" });
    expect(updates.find((u) => u.skill_id === "s3")).toBeUndefined();
    expect(updates.find((u) => u.skill_id === "s4")).toBeUndefined();
  });
});
