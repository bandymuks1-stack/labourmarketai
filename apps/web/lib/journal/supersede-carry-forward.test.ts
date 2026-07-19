import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Journal compact edit UX (P0-F) — NO DATA LOSS on edit, tested through the
 * REAL `supersedeJournalEntry` action with a mocked supabase client.
 *
 * Pins:
 *   • the worker's DECISION markers (ambiguous_resolved / skill_rejected /
 *     skill_claim_rejected / unresolved_dismissed) are COPIED from the
 *     superseded entry to the new entry id BEFORE the pipeline runs, so the
 *     derivation honours them (resolved ambiguity never re-offered,
 *     rejected suggestion never resurrected);
 *   • the copy is idempotent (existing rows on the new entry are skipped —
 *     repeated saves never duplicate) and NEVER copies non-decision metrics;
 *   • per-activity times ship as INDEX-PAIRED fragment metric rows inside
 *     the atomic p_metrics payload;
 *   • save-time removals ride excludeSlugs into the pipeline;
 *   • an RPC failure returns a tagged error and runs NO pipeline (the
 *     component keeps all edits in the form — its state is never reset by
 *     the action);
 *   • no write payload anywhere carries verified:true / manager_confirmed.
 */

const revalidatePathMock = vi.fn((..._args: unknown[]) => undefined);
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

type PipelineCall = {
  entryId: string;
  text: string;
  excludeSlugs: string[];
};
const pipelineCalls: PipelineCall[] = [];
/** Ordered event log: metric inserts vs pipeline run (carry-forward MUST
 *  land before the pipeline). */
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

let writePayloads: { table: string; rows: unknown }[] = [];
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
          writePayloads.push({ table, rows: args[0] });
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

type MetricRow = {
  metric_slug: string;
  value_text: string | null;
  value_numeric?: number | null;
};

function entryIdOf(calls: Call[]): string | null {
  const eq = calls.find(
    (c) => c.method === "eq" && c.args[0] === "entry_id",
  );
  return (eq?.args[1] as string | undefined) ?? null;
}

function baseHandler(overrides: {
  oldMetrics?: MetricRow[];
  newMetrics?: MetricRow[];
}): Handler {
  return (table, calls) => {
    switch (table) {
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
      case "journal_entry_metrics": {
        if (calls.some((c) => c.method === "insert")) return { data: null };
        const id = entryIdOf(calls);
        if (id === OLD_ID) return { data: overrides.oldMetrics ?? [] };
        return { data: overrides.newMetrics ?? [] };
      }
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

const DECISION_ROWS: MetricRow[] = [
  { metric_slug: "ambiguous_resolved", value_text: "kasa=>cash_register_operation", value_numeric: 2 },
  { metric_slug: "skill_rejected", value_text: "tiling" },
  { metric_slug: "skill_claim_rejected", value_text: "kažkoks gebėjimas" },
  { metric_slug: "unresolved_dismissed", value_text: "kažkoks fragmentas" },
];

beforeEach(() => {
  writePayloads = [];
  rpcCalls = [];
  pipelineCalls.length = 0;
  eventLog.length = 0;
  rpcMock = () => ({ data: NEW_ID, error: null });
});

describe("supersedeJournalEntry — decision-marker carry-forward", () => {
  it("copies the 4 decision marker kinds to the new entry BEFORE the pipeline", async () => {
    currentSupabase = makeSupabase(
      baseHandler({
        oldMetrics: [
          ...DECISION_ROWS,
          // Non-decision metrics must NOT be copied (they are rebuilt from
          // the submitted form via p_metrics).
          { metric_slug: "quantity", value_text: null, value_numeric: 6 },
          { metric_slug: "pipeline_version", value_text: null, value_numeric: 2 },
        ],
      }),
      { id: "user-1" },
    );
    const res = await supersedeJournalEntry(OLD_ID, makeFormData());
    expect(res.ok).toBe(true);

    const markerInsert = writePayloads.find(
      (w) => w.table === "journal_entry_metrics",
    );
    expect(markerInsert).toBeTruthy();
    const rows = markerInsert!.rows as Array<{
      entry_id: string;
      metric_slug: string;
      value_text: string;
      source: string;
      value_numeric?: number;
    }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.entry_id === NEW_ID)).toBe(true);
    expect(rows.every((r) => r.source === "worker_input")).toBe(true);
    expect(rows.map((r) => r.metric_slug).sort()).toEqual([
      "ambiguous_resolved",
      "skill_claim_rejected",
      "skill_rejected",
      "unresolved_dismissed",
    ]);
    const resolved = rows.find((r) => r.metric_slug === "ambiguous_resolved")!;
    expect(resolved.value_text).toBe("kasa=>cash_register_operation");
    expect(resolved.value_numeric).toBe(2);

    // Order: carry-forward insert strictly before the pipeline run, so the
    // derivation sees the markers.
    const insertIdx = eventLog.indexOf("insert:journal_entry_metrics");
    const pipelineIdx = eventLog.indexOf("pipeline");
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(pipelineIdx).toBeGreaterThan(insertIdx);
    expect(pipelineCalls[0].entryId).toBe(NEW_ID);
  });

  it("is idempotent — markers already on the new entry are never re-inserted", async () => {
    currentSupabase = makeSupabase(
      baseHandler({
        oldMetrics: DECISION_ROWS,
        newMetrics: DECISION_ROWS,
      }),
      { id: "user-1" },
    );
    const res = await supersedeJournalEntry(OLD_ID, makeFormData());
    expect(res.ok).toBe(true);
    expect(
      writePayloads.filter((w) => w.table === "journal_entry_metrics"),
    ).toHaveLength(0);
  });

  it("duplicate markers on the OLD entry copy once (double-save safety)", async () => {
    currentSupabase = makeSupabase(
      baseHandler({
        oldMetrics: [
          { metric_slug: "skill_rejected", value_text: "tiling" },
          { metric_slug: "skill_rejected", value_text: "tiling" },
        ],
      }),
      { id: "user-1" },
    );
    await supersedeJournalEntry(OLD_ID, makeFormData());
    const rows = writePayloads.find((w) => w.table === "journal_entry_metrics")!
      .rows as unknown[];
    expect(rows).toHaveLength(1);
  });
});

describe("supersedeJournalEntry — per-activity time pairing in p_metrics", () => {
  it("several activities keep their OWN times via index-paired metric rows", async () => {
    currentSupabase = makeSupabase(baseHandler({}), { id: "user-1" });
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

    const rpc = rpcCalls.find((c) => c.fn === "journal_entry_supersede")!;
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
    currentSupabase = makeSupabase(baseHandler({}), { id: "user-1" });
    await supersedeJournalEntry(
      OLD_ID,
      makeFormData({ rejected_slugs_json: JSON.stringify(["tiling"]) }),
    );
    expect(pipelineCalls[0].excludeSlugs).toEqual(["tiling"]);
  });

  it("an RPC failure returns a tagged error and runs NO pipeline", async () => {
    rpcMock = () => ({ data: null, error: { message: "boom" } });
    currentSupabase = makeSupabase(baseHandler({}), { id: "user-1" });
    const res = await supersedeJournalEntry(OLD_ID, makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("entry_insert_failed");
    expect(pipelineCalls).toHaveLength(0);
    expect(writePayloads).toHaveLength(0);
  });

  it("no write payload anywhere carries fake verification", async () => {
    currentSupabase = makeSupabase(
      baseHandler({ oldMetrics: DECISION_ROWS }),
      { id: "user-1" },
    );
    await supersedeJournalEntry(OLD_ID, makeFormData());
    const everything = JSON.stringify({ writePayloads, rpcCalls });
    expect(everything).not.toMatch(/"verified"\s*:\s*true/);
    expect(everything).not.toMatch(/manager_confirmed/);
  });
});
