import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The conflict flow's DECISION step (detect, explain, alternatives, human
 * decision). A collision is shown with colleagues confirmed free on the same
 * dates and two plain choices — undo, or swap. It is still never a block
 * (SEP-2): the assignment is written first, the decision follows.
 */
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("assignment conflict decision", () => {
  const actions = read("lib/projects/actions.ts");
  const panel = read("components/app/project-assignment-manager.tsx");
  const model = read("lib/planning/worker-reservation.ts");

  it("alternatives come only from confirmed-clear verdicts, never unknown", () => {
    expect(model).toMatch(/verdict\.state === "clear"\) free\.push/);
    expect(model).toMatch(/committed\.status !== "ok" \|\| availability\.status !== "ok"\) return \[\]/);
  });

  it("alternatives are looked up only after a collision and never fail the assignment", () => {
    expect(actions).toMatch(/verdict\.state !== "collides"\) return \{ verdict, alternatives: \[\] \}/);
    // The lookup moved to its own module so the read-only pre-check shares it.
    expect(actions).toMatch(/freeColleagues\(supabase, workerProfileId, projectId, window\)/);
    expect(read("lib/projects/free-colleagues.ts")).toMatch(/export async function freeColleagues[\s\S]{0,1600}catch/);
  });

  it("the panel offers undo and swap on a collision, with the assignment it answers", () => {
    expect(actions).toMatch(/assigned\?: \{ projectId: string; workerProfileId: string \}/);
    expect(panel).toMatch(/assign-reservation-undo/);
    expect(panel).toMatch(/assign-reservation-swap/);
    expect(panel).toMatch(/endAssignmentAction\(a\.projectId, a\.workerProfileId\)/);
  });

  for (const loc of ["en", "lt", "ru", "nl", "de", "pl"]) {
    it(`${loc} carries the decision copy`, () => {
      const r = JSON.parse(read(`messages/${loc}.json`)).projects?.assign?.reservation;
      for (const key of ["alternativesTitle", "swap", "undo", "decided"]) {
        expect(r?.[key], `${loc}.${key}`).toBeTruthy();
      }
    });
  }
});
