import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import {
  confirmedSkillWorkerIds,
  countCrossPartyConfirmed,
  crossPartyConfirmationState,
  STANDING_DOOR_NOT_INSTALLED,
  standingEvidenceTier,
  standingSourceTier,
  withCrossPartyStandingConfirmation,
  type CrossPartyStandingRead,
  type DoorConfirmationState,
} from "./skill-confirmation-standing";
import {
  readCrossPartyStandingStates,
  STANDING_DOOR_MAX_WORKER_IDS,
} from "./skill-confirmation-standing-read";

/**
 * Phase B: a viewer who is not the person (employer, manager, matching,
 * admin) learns whether each recorded skill confirmation still STANDS from
 * the DB door `worker_skill_confirmations_standing_v1`. Three outcomes, kept
 * apart: the door's states; the door not installed yet (today's stored-flag
 * reading, no regression before the migration is applied); and UNKNOWN (any
 * other failure: never confirmed, never "nothing").
 */

type DoorRow = { worker_id: unknown; skill_id: unknown; state: unknown };
type Answer = { data: unknown; error: { code?: string; message?: string } | null };

/** A fake caller client that records every door call and answers per call. */
function fakeClient(answer: (ids: string[], from: number, to: number) => Answer) {
  const calls: { ids: string[]; from: number; to: number; order: string[] }[] = [];
  const client = {
    rpc(name: string, args: { p_worker_ids: string[] }) {
      expect(name).toBe("worker_skill_confirmations_standing_v1");
      const call = { ids: args.p_worker_ids, from: -1, to: -1, order: [] as string[] };
      const q = {
        order(col: string) {
          call.order.push(col);
          return q;
        },
        range(from: number, to: number) {
          call.from = from;
          call.to = to;
          calls.push(call);
          return Promise.resolve(answer(call.ids, from, to));
        },
      };
      return q;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

const read = (rows: Record<string, Record<string, DoorConfirmationState>>): CrossPartyStandingRead =>
  new Map(Object.entries(rows).map(([w, m]) => [w, new Map(Object.entries(m))]));

describe("readCrossPartyStandingStates — the door read", () => {
  it("returns the door's states per worker and skill", async () => {
    const { client, calls } = fakeClient(() => ({
      data: [
        { worker_id: "w1", skill_id: "s1", state: "standing" },
        { worker_id: "w1", skill_id: "s2", state: "withdrawn" },
        { worker_id: "w2", skill_id: "s3", state: "self_confirmed" },
      ] satisfies DoorRow[],
      error: null,
    }));
    const out = await readCrossPartyStandingStates(client, ["w1", "w2", "w1", null, ""]);
    expect(out).not.toBe(STANDING_DOOR_NOT_INSTALLED);
    expect(out).not.toBeNull();
    const m = out as Exclude<CrossPartyStandingRead, null | typeof STANDING_DOOR_NOT_INSTALLED>;
    expect(m.get("w1")?.get("s1")).toBe("standing");
    expect(m.get("w1")?.get("s2")).toBe("withdrawn");
    expect(m.get("w2")?.get("s3")).toBe("self_confirmed");
    // de-duplicated, empty ids dropped, ordered by the door's key, paged
    expect(calls).toHaveLength(1);
    expect(calls[0].ids).toEqual(["w1", "w2"]);
    expect(calls[0].order).toEqual(["worker_id", "skill_id"]);
    expect([calls[0].from, calls[0].to]).toEqual([0, 999]);
  });

  it("asks nothing for no ids", async () => {
    const { client, calls } = fakeClient(() => ({ data: [], error: null }));
    const out = await readCrossPartyStandingStates(client, []);
    expect(out instanceof Map && out.size === 0).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it.each(["42883", "PGRST202"])("a missing function (%s) means the door is not installed", async (code) => {
    const { client } = fakeClient(() => ({ data: null, error: { code } }));
    expect(await readCrossPartyStandingStates(client, ["w1"])).toBe(STANDING_DOOR_NOT_INSTALLED);
  });

  it.each(["42501", "22023", "57014", "PGRST301", undefined])(
    "any other error (%s) is UNKNOWN (null), never 'not installed' and never an empty answer",
    async (code) => {
      const { client } = fakeClient(() => ({ data: null, error: { code, message: "boom" } }));
      expect(await readCrossPartyStandingStates(client, ["w1"])).toBeNull();
    },
  );

  it("a thrown transport error is UNKNOWN", async () => {
    const client = {
      rpc() {
        throw new Error("network");
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readCrossPartyStandingStates(client as any, ["w1"])).toBeNull();
  });

  it("a malformed (non-array) answer is UNKNOWN", async () => {
    const { client } = fakeClient(() => ({ data: { not: "rows" }, error: null }));
    expect(await readCrossPartyStandingStates(client, ["w1"])).toBeNull();
  });

  it("chunks at 500 ids, in parallel, and merges the chunks", async () => {
    const ids = Array.from({ length: STANDING_DOOR_MAX_WORKER_IDS + 101 }, (_, i) => `w${String(i).padStart(4, "0")}`);
    const { client, calls } = fakeClient((chunk) => ({
      data: [{ worker_id: chunk[0], skill_id: "s", state: "standing" }],
      error: null,
    }));
    const out = await readCrossPartyStandingStates(client, ids);
    expect(calls.map((c) => c.ids.length)).toEqual([500, 101]);
    expect(STANDING_DOOR_MAX_WORKER_IDS).toBe(500);
    const m = out as Map<string, Map<string, DoorConfirmationState>>;
    expect(m.get(ids[0])?.get("s")).toBe("standing");
    expect(m.get(ids[500])?.get("s")).toBe("standing");
  });

  it("pages a chunk past the 1000-row API cap; the page ceiling is UNKNOWN", async () => {
    const page = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({ worker_id: "w1", skill_id: `s${from + i}`, state: "standing" }));
    const { client, calls } = fakeClient((_ids, from) => ({
      data: from === 0 ? page(1000, 0) : page(3, from),
      error: null,
    }));
    const out = (await readCrossPartyStandingStates(client, ["w1"])) as Map<string, Map<string, string>>;
    expect(calls.map((c) => c.from)).toEqual([0, 1000]);
    expect(out.get("w1")?.size).toBe(1003);

    const endless = fakeClient((_ids, from) => ({ data: page(1000, from), error: null }));
    expect(await readCrossPartyStandingStates(endless.client, ["w1"])).toBeNull();
  });

  it("a later page that fails is UNKNOWN — never a partial answer, never 'not installed'", async () => {
    const { client } = fakeClient((_ids, from) =>
      from === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => ({ worker_id: "w1", skill_id: `s${i}`, state: "standing" })), error: null }
        : { data: null, error: { code: "PGRST202" } },
    );
    expect(await readCrossPartyStandingStates(client, ["w1"])).toBeNull();
  });

  it("a half-installed answer across chunks is UNKNOWN", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `w${String(i).padStart(4, "0")}`);
    const { client } = fakeClient((chunk) =>
      chunk.length === 500 ? { data: [], error: null } : { data: null, error: { code: "42883" } },
    );
    expect(await readCrossPartyStandingStates(client, ids)).toBeNull();
  });

  it("skips rows with an unrecognised state (that confirmation then reads UNKNOWN)", async () => {
    const { client } = fakeClient(() => ({
      data: [
        { worker_id: "w1", skill_id: "s1", state: "certified" },
        { worker_id: "w1", skill_id: null, state: "standing" },
        { worker_id: "w1", skill_id: "s2", state: "standing" },
      ],
      error: null,
    }));
    const out = await readCrossPartyStandingStates(client, ["w1"]);
    const rows = withCrossPartyStandingConfirmation(
      [
        { worker_id: "w1", skill_id: "s1", verified: true },
        { worker_id: "w1", skill_id: "s2", verified: true },
      ],
      out,
    );
    expect(rows.map((r) => r.confirmation)).toEqual(["unknown", "standing"]);
  });
});

describe("crossPartyConfirmationState / withCrossPartyStandingConfirmation", () => {
  const door = read({ w1: { s1: "standing", s2: "withdrawn", s3: "self_confirmed" } });

  it("never-confirmed rows stay 'none' whatever the door says", () => {
    for (const r of [door, STANDING_DOOR_NOT_INSTALLED, null] as const) {
      expect(crossPartyConfirmationState({ skill_id: "s1", verified: false }, "w1", r)).toBe("none");
    }
  });

  it("the door's state decides; a recorded row it did not answer for is UNKNOWN", () => {
    expect(crossPartyConfirmationState({ skill_id: "s1", verified: true }, "w1", door)).toBe("standing");
    expect(crossPartyConfirmationState({ skill_id: "s2", verified: true }, "w1", door)).toBe("withdrawn");
    expect(crossPartyConfirmationState({ skill_id: "s3", verified: true }, "w1", door)).toBe("self_confirmed");
    expect(crossPartyConfirmationState({ skill_id: "s9", verified: true }, "w1", door)).toBe("unknown");
    expect(crossPartyConfirmationState({ skill_id: "s1", verified: true }, "w2", door)).toBe("unknown");
    expect(crossPartyConfirmationState({ skill_id: "s1", verified: true }, null, door)).toBe("unknown");
  });

  it("door not installed: today's stored-flag reading, unchanged", () => {
    const rows = withCrossPartyStandingConfirmation(
      [
        { skill_id: "s1", verified: true, source: "manager_confirmed" },
        { skill_id: "s2", verified: false, source: "self_declared" },
      ],
      STANDING_DOOR_NOT_INSTALLED,
      "w1",
    );
    expect(rows.map((r) => [r.verified, r.source, r.confirmation])).toEqual([
      [true, "manager_confirmed", "recorded_unjudged"],
      [false, "self_declared", "none"],
    ]);
    expect(countCrossPartyConfirmed(rows)).toBe(1);
  });

  it("withdrawn / self-confirmed: not confirmed, and the manager_confirmed source no longer lifts the row", () => {
    const rows = withCrossPartyStandingConfirmation(
      [
        { skill_id: "s1", verified: true, source: "manager_confirmed" },
        { skill_id: "s2", verified: true, source: "manager_confirmed" },
        { skill_id: "s3", verified: true, source: "manager_confirmed" },
      ],
      door,
      "w1",
    );
    expect(rows.map((r) => [r.verified, r.verifiedRecorded, r.source])).toEqual([
      [true, true, "manager_confirmed"],
      [false, true, null],
      [false, true, null],
    ]);
    expect(countCrossPartyConfirmed(rows)).toBe(1);
    expect(rows.map(standingSourceTier)).toEqual(["manager_confirmed", "self_declared", "self_declared"]);
    expect(rows.map(standingEvidenceTier)).toEqual(["manager_confirmed", "self_declared", "self_declared"]);
  });

  it("UNKNOWN: never confirmed, never erased — source kept, tier under-stated to journal evidence, count unknown", () => {
    const rows = withCrossPartyStandingConfirmation(
      [{ skill_id: "s1", verified: true, source: "manager_confirmed" }],
      null,
      "w1",
    );
    expect(rows[0].verified).toBe(false);
    expect(rows[0].confirmation).toBe("unknown");
    expect(rows[0].source).toBe("manager_confirmed");
    expect(standingSourceTier(rows[0])).toBe("work_journal");
    expect(standingEvidenceTier(rows[0])).toBe("work_journal");
    expect(countCrossPartyConfirmed(rows)).toBeNull();
  });

  it("rows carry their own worker_id (batched readers)", () => {
    const rows = withCrossPartyStandingConfirmation(
      [
        { worker_id: "w1", skill_id: "s1", verified: true },
        { worker_id: "w1", skill_id: "s2", verified: true },
      ],
      door,
    );
    expect(rows.map((r) => r.verified)).toEqual([true, false]);
  });

  it("confirmedSkillWorkerIds counts a worker only for a confirmation that reads as confirmed", () => {
    const recorded = [
      { worker_id: "w1", skill_id: "s2", verified: true },
      { worker_id: "w1", skill_id: "s1", verified: true },
      { worker_id: "w2", skill_id: "s1", verified: true },
    ];
    expect([...confirmedSkillWorkerIds(recorded, door)]).toEqual(["w1"]);
    expect([...confirmedSkillWorkerIds(recorded, STANDING_DOOR_NOT_INSTALLED)].sort()).toEqual(["w1", "w2"]);
    expect([...confirmedSkillWorkerIds(recorded, null)]).toEqual([]);
  });

  it("never-confirmed rows keep the reader's own source reading (no unrelated change)", () => {
    const [row] = withCrossPartyStandingConfirmation(
      [{ skill_id: "s1", verified: false, source: "work_journal" }],
      door,
      "w1",
    );
    expect(standingSourceTier(row)).toBe("work_journal");
    expect(standingEvidenceTier(row)).toBe("work_journal");
  });
});

describe("the person's own work intelligence dates a self-confirmation (Codex #2608)", () => {
  const read = readFileSync(join(__dirname, "..", "journal", "work-intelligence-read.ts"), "utf8");
  it("reads verified_at with the flag, so a later independent approval makes it standing", () => {
    expect(read).toMatch(/\.select\("skill_id, verified, verified_by, verified_at, source, skills\(slug\)"\)/);
  });
  it("hands the confirmation verdict on, and the tier is the standing-aware one", () => {
    expect(read).toContain("...(r.confirmation ? { confirmation: r.confirmation } : {})");
    const wi = readFileSync(join(__dirname, "..", "journal", "work-intelligence.ts"), "utf8");
    expect(wi).toContain("standingEvidenceTier({ verified: s.verified, source: s.source, confirmation: s.confirmation })");
  });
});
