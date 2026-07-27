import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Journal compact edit — NO DATA LOSS on edit, tested through the REAL
 * `supersedeJournalEntry` action with a mocked supabase client.
 *
 * W0 (Invite-Ready Closure Train, post-#840 review P1): the supersede is now
 * ATOMIC. The `journal_entry_supersede_v2` RPC carries the worker's decision
 * markers, non-rederivable skill links and selected taxonomy evidence INSIDE
 * the database transaction. The action therefore:
 *   • ships `p_selected_slugs` + `p_rejected_slugs` on the RPC call and
 *     performs NO app-side carry/link writes at all (nothing to swallow —
 *     a failed required write fails the whole RPC and the whole save);
 *   • per-activity times still ship as INDEX-PAIRED fragment metric rows
 *     inside the atomic `p_metrics` payload;
 *   • save-time removals still ride `excludeSlugs` into the pipeline;
 *   • an RPC failure returns a tagged error and runs NO pipeline (the
 *     component keeps all edits in the form — its state is never reset by
 *     the action);
 *   • no write payload anywhere carries verified:true / manager_confirmed.
 */

const revalidatePathMock = vi.fn((..._args: unknown[]) => undefined);
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

// The action localizes its error messages via next-intl (journal.errors.*);
// outside a request there is no locale context, so mock the translator to
// echo keys — these tests assert result CODES, never message copy.
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "lt"),
  getTranslations: vi.fn(async () => (key: string) => key),
}));

type PipelineCall = {
  entryId: string;
  text: string;
  excludeSlugs: string[];
};
const pipelineCalls: PipelineCall[] = [];
/** Ordered event log: RPC vs pipeline (the atomic RPC must land first). */
const eventLog: string[] = [];

vi.mock("@/lib/journal/skill-pipeline", () => ({
  processJournalEntrySkills: vi.fn(
    async (opts: { entryId: string; text: string; excludeSlugs?: string[] }) => {
      pipelineCalls.push({
        entryId: opts.entryId,
        text: opts.text,
        excludeSlugs: [...(opts.excludeSlugs ?? [])],
      });
      eventLog.push("pipeline");
      return {
        status: "completed",
        detected: 0,
        added: 0,
        strengthened: 0,
        alreadyLinked: 0,
        reviewNeeded: 0,
        claimsSaved: 0,
        cvUpdated: false,
        trace: "t",
        addedSkills: [],
        strengthenedSkills: [],
        alreadyLinkedSkills: [],
        claimsSavedLabels: [],
        candidates: [],
        rejected: [],
        recognition: { pipelineVersion: 2, unresolvedFragments: [] },
      };
    },
  ),
  failedPipelineResult: vi.fn(() => ({ status: "failed" })),
}));

// ── Chainable supabase mock ────────────────────────────────────────────────
type Call = { method: string; args: unknown[] };
type TableResponse = { data?: unknown; error?: unknown };
type Handler = (table: string, calls: Call[]) => TableResponse;

let writePayloads: { table: string; rows: unknown; options?: unknown }[] = [];
let rpcMock: (
  fn: string,
  params: Record<string, unknown>,
) => { data: unknown; error: unknown };
let rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];

function makeSupabase(handler: Handler, user: { id: string } | null) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      eventLog.push(`rpc:${fn}`);
      return rpcMock(fn, params);
    }),
    from(table: string) {
      const calls: Call[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const m of ["select", "eq", "in", "order", "limit", "maybeSingle"]) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ method: m, args });
          return builder;
        };
      }
      for (const m of ["insert", "upsert"]) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ method: m, args });
          writePayloads.push({ table, rows: args[0], options: args[1] });
          eventLog.push(`${m}:${table}`);
          return builder;
        };
      }
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        const res = handler(table, calls);
        return Promise.resolve({
          data: res.data ?? null,
          error: res.error ?? null,
        }).then(resolve, reject);
      };
      return builder;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentSupabase: any;
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => currentSupabase),
}));

import { supersedeJournalEntry } from "@/lib/journal/actions";

const OLD_ID = "old-entry";
const NEW_ID = "new-entry";
const RPC_V2 = "journal_entry_supersede_v2";

function baseHandler(): Handler {
  return (table) => {
    switch (table) {
      // Stale-chain fast-path precheck: the action refuses an
      // already-superseded/deleted old entry before calling the RPC.
      case "journal_entries":
        return { data: { id: OLD_ID, superseded_by: null, deleted_at: null } };
      case "productivity_units":
        return {
          data: [
            { slug: "hours" },
            { slug: "minutes" },
            { slug: "days" },
            { slug: "square_meters" },
          ],
        };
      case "professions":
        return { data: { id: "prof-1" } };
      default:
        return { data: null };
    }
  };
}

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("locale", "lt");
  fd.set("engagement_context_id", "eng-1");
  fd.set("notes", "1 val vairavau, 3 val kasoje");
  fd.set("work_date", "2026-07-01");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  writePayloads = [];
  rpcCalls = [];
  pipelineCalls.length = 0;
  eventLog.length = 0;
  rpcMock = () => ({ data: NEW_ID, error: null });
});

describe("supersedeJournalEntry — atomic carry (in-RPC, no app-side writes)", () => {
  it("performs ZERO app-side table writes — everything rides the atomic RPC", async () => {
    currentSupabase = makeSupabase(baseHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({ rejected_slugs_json: JSON.stringify(["tiling"]) }),
    );
    expect(res.ok).toBe(true);

    // The old post-commit carry/link helpers are gone: no insert/upsert into
    // journal_entry_metrics / journal_entry_skills / worker_skills from the
    // action. The RPC transaction owns those writes now.
    expect(writePayloads).toHaveLength(0);

    const rpc = rpcCalls.find((c) => c.fn === RPC_V2)!;
    expect(rpc).toBeTruthy();
    // Rejections ride the transaction so marker carry + link carry exclude
    // them server-side (a deliberate removal sticks, atomically).
    expect(rpc.params.p_rejected_slugs).toEqual(["tiling"]);
    expect(rpc.params.p_selected_slugs).toEqual([]);
  });

  it("runs the pipeline AFTER the RPC, for the NEW entry id", async () => {
    currentSupabase = makeSupabase(baseHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(OLD_ID, makeFormData());
    expect(res.ok).toBe(true);
    const rpcIdx = eventLog.indexOf(`rpc:${RPC_V2}`);
    const pipelineIdx = eventLog.indexOf("pipeline");
    expect(rpcIdx).toBeGreaterThanOrEqual(0);
    expect(pipelineIdx).toBeGreaterThan(rpcIdx);
    expect(pipelineCalls[0].entryId).toBe(NEW_ID);
  });
});

describe("supersedeJournalEntry — per-activity time pairing in p_metrics", () => {
  it("several activities keep their OWN times via index-paired metric rows", async () => {
    currentSupabase = makeSupabase(baseHandler(), { id: "user-1" });
    const fragments = [
      {
        rawPhrase: "1 val vairavau",
        timeValue: 1,
        timeUnit: "hours",
        activitySlug: null,
        activityLabel: "vairavimas",
        isUnknown: false,
        userLabel: null,
      },
      {
        rawPhrase: "3 val kasoje",
        timeValue: 180,
        timeUnit: "minutes",
        activitySlug: null,
        activityLabel: "kasininko darbas",
        isUnknown: false,
        userLabel: null,
      },
    ];
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({ fragments_json: JSON.stringify(fragments) }),
    );
    expect(res.ok).toBe(true);

    const rpc = rpcCalls.find((c) => c.fn === RPC_V2)!;
    const metrics = rpc.params.p_metrics as Array<{
      metric_slug: string;
      value_text?: string | null;
      value_numeric?: number | null;
      unit_slug?: string | null;
    }>;
    expect(
      metrics.filter((m) => m.metric_slug === "parsed_fragment").map((m) => m.value_text),
    ).toEqual(["1|1 val vairavau", "2|3 val kasoje"]);
    const times = metrics.filter((m) => m.metric_slug === "fragment_time");
    expect(times).toEqual([
      expect.objectContaining({ value_text: "1", value_numeric: 1, unit_slug: "hours" }),
      expect.objectContaining({ value_text: "2", value_numeric: 180, unit_slug: "minutes" }),
    ]);
    expect(
      metrics.filter((m) => m.metric_slug === "fragment_activity").map((m) => m.value_text),
    ).toEqual(["1|vairavimas", "2|kasininko darbas"]);
  });
});

describe("supersedeJournalEntry — exclusions, failure, integrity", () => {
  it("removed skills ride excludeSlugs into the pipeline", async () => {
    currentSupabase = makeSupabase(baseHandler(), { id: "user-1" });
    await supersedeJournalEntry(
      OLD_ID,
      makeFormData({ rejected_slugs_json: JSON.stringify(["tiling"]) }),
    );
    expect(pipelineCalls[0].excludeSlugs).toEqual(["tiling"]);
  });

  it("an RPC failure returns a tagged error and runs NO pipeline", async () => {
    rpcMock = () => ({ data: null, error: { message: "boom" } });
    currentSupabase = makeSupabase(baseHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(OLD_ID, makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("entry_insert_failed");
    expect(pipelineCalls).toHaveLength(0);
    expect(writePayloads).toHaveLength(0);
  });

  it("an RPC-level entry_superseded (lost race) maps to the conflict code", async () => {
    // The fast-path precheck saw a live entry, but the RPC row-lock found it
    // superseded by the time the transaction ran — the atomic guard wins.
    rpcMock = () => ({
      data: null,
      error: { message: "entry_superseded", code: "55000" },
    });
    currentSupabase = makeSupabase(baseHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(OLD_ID, makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("entry_superseded");
    expect(pipelineCalls).toHaveLength(0);
  });

  it("an RPC-level skill_slug_unknown maps to skill_selection_invalid (whole save rolled back)", async () => {
    rpcMock = () => ({
      data: null,
      error: { message: "skill_slug_unknown", code: "22023" },
    });
    currentSupabase = makeSupabase(baseHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(OLD_ID, makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("skill_selection_invalid");
    expect(pipelineCalls).toHaveLength(0);
  });

  it("no write payload anywhere carries fake verification", async () => {
    currentSupabase = makeSupabase(baseHandler(), { id: "user-1" });
    await supersedeJournalEntry(OLD_ID, makeFormData());
    const everything = JSON.stringify({ writePayloads, rpcCalls });
    expect(everything).not.toMatch(/"verified"\s*:\s*true/);
    expect(everything).not.toMatch(/manager_confirmed/);
  });
});
