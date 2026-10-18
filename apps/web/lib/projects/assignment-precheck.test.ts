import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import {
  runAssignmentPrecheck,
  type PrecheckDeps,
} from "@/lib/projects/assignment-precheck-core";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

const P = "11111111-1111-4111-8111-111111111111";
const W = "22222222-2222-4222-8222-222222222222";

/** A recording fake: ONLY reads exist. Any write method is absent, so a write
 *  would throw — and every call is logged so the test can assert none ran. */
function fakeSupabase(opts: {
  manages?: boolean | null;
  manageError?: boolean;
  worker?: { id: string } | null;
  project?: { start_date: string | null; end_date: string | null } | null;
}) {
  const calls: string[] = [];
  const supabase = {
    rpc: (name: string) => {
      calls.push(`rpc:${name}`);
      return Promise.resolve({
        data: opts.manages ?? true,
        error: opts.manageError ? { message: "x" } : null,
      });
    },
    from: (table: string) => {
      calls.push(`from:${table}`);
      const row = table === "workers" ? opts.worker : opts.project;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: row ?? null, error: null }),
      };
      return chain;
    },
  };
  return { supabase: supabase as never, calls };
}

const clear: ReservationVerdict = { state: "clear", collisions: [], gaps: [] };
const collides: ReservationVerdict = {
  state: "collides",
  collisions: [
    {
      source: "booking",
      sourceId: "b1",
      label: null,
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      overlapStart: "2026-10-01",
      overlapEnd: "2026-10-05",
    },
  ],
  gaps: [],
};

function deps(over: Partial<PrecheckDeps> & { fake: ReturnType<typeof fakeSupabase> }): PrecheckDeps {
  return {
    supabase: over.fake.supabase,
    userId: "u1",
    hasCompany: true,
    canOverride: true,
    checkReservation: vi.fn(async () => clear),
    freeColleagues: vi.fn(async () => []),
    ...over,
  };
}

const dated = { start_date: "2026-10-01", end_date: "2026-10-10" };

describe("runAssignmentPrecheck", () => {
  it("refuses a caller who cannot manage the project, and reads nothing else", async () => {
    const fake = fakeSupabase({ manages: false, worker: { id: "w" }, project: dated });
    const check = vi.fn(async () => clear);
    const r = await runAssignmentPrecheck(deps({ fake, checkReservation: check }), { projectId: P, workerProfileId: W });
    expect(r).toEqual({ ok: false, code: "not_authorized" });
    expect(check).not.toHaveBeenCalled();
    expect(fake.calls).toEqual(["rpc:can_manage_project"]);
  });

  it("refuses an unauthenticated caller, a missing workspace and malformed ids", async () => {
    const fake = fakeSupabase({});
    expect(await runAssignmentPrecheck(deps({ fake, userId: null }), { projectId: P, workerProfileId: W })).toEqual({ ok: false, code: "auth" });
    expect(await runAssignmentPrecheck(deps({ fake, hasCompany: false }), { projectId: P, workerProfileId: W })).toEqual({ ok: false, code: "no_company" });
    expect(await runAssignmentPrecheck(deps({ fake }), { projectId: "x", workerProfileId: W })).toEqual({ ok: false, code: "invalid" });
    expect(fake.calls).toEqual([]);
  });

  it("an undated project is unknown with the undated_window gap, never clear", async () => {
    const fake = fakeSupabase({ worker: { id: "w" }, project: { start_date: null, end_date: null } });
    const { reserveCapacity } = await import("@/lib/workforce/commitment-reservation");
    const r = await runAssignmentPrecheck(
      deps({ fake, checkReservation: async (i) => reserveCapacity({ window: i.window, held: [] }) }),
      { projectId: P, workerProfileId: W },
    );
    expect(r.ok && r.verdict.state).toBe("unknown");
    expect(r.ok && r.verdict.gaps).toContainEqual({ reason: "undated_window" });
  });

  it("an unreadable worker or project is unknown, never clear", async () => {
    for (const fake of [
      fakeSupabase({ worker: null, project: dated }),
      fakeSupabase({ worker: { id: "w" }, project: null }),
    ]) {
      const check = vi.fn(async () => clear);
      const r = await runAssignmentPrecheck(deps({ fake, checkReservation: check }), { projectId: P, workerProfileId: W });
      expect(r.ok && r.verdict.state).toBe("unknown");
      expect(check).not.toHaveBeenCalled();
    }
  });

  it("a failing reservation read is unknown, not clear and not an error", async () => {
    const fake = fakeSupabase({ worker: { id: "w" }, project: dated });
    const r = await runAssignmentPrecheck(
      deps({ fake, checkReservation: async () => { throw new Error("boom"); } }),
      { projectId: P, workerProfileId: W },
    );
    expect(r.ok && r.verdict.state).toBe("unknown");
  });

  it("a collision carries exact collisions, alternatives, the window and canOverride; the project is excluded", async () => {
    const fake = fakeSupabase({ worker: { id: "w" }, project: dated });
    const check = vi.fn(async () => collides);
    const free = vi.fn(async () => [{ profileId: "p2", name: "Colleague" }]);
    const r = await runAssignmentPrecheck(
      deps({ fake, checkReservation: check, freeColleagues: free, canOverride: false }),
      { projectId: P, workerProfileId: W },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdict.collisions).toHaveLength(1);
    expect(r.alternatives).toEqual([{ profileId: "p2", name: "Colleague" }]);
    expect(r.window).toEqual({ startDate: "2026-10-01", endDate: "2026-10-10" });
    expect(r.canOverride).toBe(false);
    expect(check).toHaveBeenCalledWith({ workerId: "w", window: r.window, exclude: [P] });
  });

  it("looks up alternatives only after a collision", async () => {
    const fake = fakeSupabase({ worker: { id: "w" }, project: dated });
    const free = vi.fn(async () => []);
    await runAssignmentPrecheck(deps({ fake, freeColleagues: free }), { projectId: P, workerProfileId: W });
    expect(free).not.toHaveBeenCalled();
  });

  it("WRITES NOTHING: only the can_manage_project read and table reads happen", async () => {
    const fake = fakeSupabase({ worker: { id: "w" }, project: dated });
    await runAssignmentPrecheck(deps({ fake }), { projectId: P, workerProfileId: W });
    expect(fake.calls.filter((c) => c.startsWith("rpc:"))).toEqual(["rpc:can_manage_project"]);
    expect(fake.calls.filter((c) => c.startsWith("from:")).sort()).toEqual(["from:projects", "from:workers"]);
  });
});

describe("pre-check wiring (structural pins)", () => {
  const root = join(__dirname, "..", "..");
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("neither pre-check file can express a write", () => {
    for (const f of ["lib/projects/assignment-precheck-core.ts", "lib/projects/assignment-precheck.ts"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(src, f).not.toMatch(/rpc\(\s*"(assign|end|record)_/);
    }
  });

  it("the form states the override has no receipt and the check is advisory", () => {
    const ui = read("components/app/project-assignment-manager.tsx");
    expect(ui).toContain("there is NO receipt of the override");
    expect(ui).toContain("checkAssignmentClashAction");
  });

  it("the new strings exist in all six locale files", () => {
    for (const loc of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      for (const k of ["precheckChecking", "precheckCollidesTitle", "precheckChoose", "precheckAssignAnyway", "precheckAdvisory"]) {
        const v = m.projects.assign.reservation[k];
        expect(typeof v, `${loc} ${k}`).toBe("string");
        expect(v).not.toMatch(/demo/i);
      }
      expect(typeof m.projectStages.ganttBlocks).toBe("string");
    }
  });
});
