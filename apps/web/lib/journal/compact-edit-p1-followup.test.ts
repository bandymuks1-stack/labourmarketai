import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Journal compact edit — post-merge P1 regressions, tested through the REAL
 * `supersedeJournalEntry` action with a mocked supabase client.
 *
 * W0 (Invite-Ready Closure Train): both P1s are now closed ATOMICALLY by the
 * `journal_entry_supersede_v2` RPC. The action-level contract pinned here:
 *
 * P1-A — manually selected taxonomy skills create durable evidence:
 *   • a row picked from taxonomy search ships ITS slug via `p_selected_slugs`
 *     INSIDE the atomic RPC call — the transaction validates it (slug format,
 *     ACTIVE taxonomy row, not rejected in the same save) and persists
 *     `worker_skills` verified=false + the `journal_entry_skills` link, or
 *     ROLLS BACK the whole save;
 *   • malformed slugs never reach the payload (app-side shape filter);
 *   • a free-text row (activitySlug null) and a non-selected composer
 *     fragment never enter `p_selected_slugs`;
 *   • the action itself performs NO skill/link table writes — nothing left
 *     to swallow after the RPC commits.
 *
 * P1-B — repeated saves in one open drawer form ONE supersession chain:
 *   • save 1 supersedes A→B, save 2 supersedes B→C, save 3 supersedes C→D
 *     (never A twice);
 *   • a failed save does NOT advance the chain;
 *   • a stale client is refused BEFORE the RPC by the fast-path precheck, and
 *     a lost race is refused BY the RPC (`entry_superseded`) — both map to
 *     the `entry_superseded` result code the editor renders as a conflict.
 */

const revalidatePathMock = vi.fn((..._args: unknown[]) => undefined);
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

type PipelineCall = { entryId: string; text: string; excludeSlugs: string[] };
const pipelineCalls: PipelineCall[] = [];
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

// ── Chainable supabase mock (same harness as supersede-carry-forward) ──────
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

const OLD_ID = "entry-A";
const NEW_ID = "entry-B";
const RPC_V2 = "journal_entry_supersede_v2";

type EntryState = { superseded_by: string | null; deleted_at: string | null };

function requestedEntryId(calls: Call[]): string | null {
  const eq = calls.find((c) => c.method === "eq" && c.args[0] === "id");
  return (eq?.args[1] as string | undefined) ?? null;
}

/** Handler for the fast-path stale-chain precheck (`journal_entries` read).
 *  Default: the requested entry is live. */
function liveHandler(
  entryLookup?: (id: string | null) => EntryState | null,
): Handler {
  return (table, calls) => {
    switch (table) {
      case "journal_entries": {
        const id = requestedEntryId(calls);
        const state = entryLookup
          ? entryLookup(id)
          : { superseded_by: null, deleted_at: null };
        return { data: state ? { id, ...state } : null };
      }
      case "productivity_units":
        return {
          data: [
            { slug: "hours" },
            { slug: "minutes" },
            { slug: "days" },
            { slug: "square_meters" },
          ],
        };
      default:
        return { data: null };
    }
  };
}

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("locale", "lt");
  fd.set("engagement_context_id", "eng-1");
  fd.set("notes", "šiandien dirbau objekte");
  fd.set("work_date", "2026-07-19");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function fragment(overrides: Record<string, unknown> = {}) {
  return {
    rawPhrase: "Suvirinimas",
    timeValue: 2,
    timeUnit: "hours",
    activitySlug: null,
    activityLabel: "Suvirinimas",
    isUnknown: false,
    userLabel: null,
    selected: false,
    ...overrides,
  };
}

/** A compact-editor taxonomy selection: slug + the EXPLICIT selected flag. */
function selectedFragment(slug: string, overrides: Record<string, unknown> = {}) {
  return fragment({ activitySlug: slug, selected: true, ...overrides });
}

function v2Params(index = 0): Record<string, unknown> {
  const calls = rpcCalls.filter((c) => c.fn === RPC_V2);
  expect(calls.length).toBeGreaterThan(index);
  return calls[index].params;
}

beforeEach(() => {
  writePayloads = [];
  rpcCalls = [];
  pipelineCalls.length = 0;
  eventLog.length = 0;
  rpcMock = () => ({ data: NEW_ID, error: null });
});

describe("P1-A — selected taxonomy evidence rides the ATOMIC RPC", () => {
  it("ships the selected slug via p_selected_slugs; no app-side skill writes", async () => {
    currentSupabase = makeSupabase(liveHandler(), { id: "user-1" });
    // The entry TEXT does not contain the skill label — only the selected
    // fragment carries it (the exact production defect scenario).
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([selectedFragment("welding")]),
      }),
    );
    expect(res.ok).toBe(true);

    const params = v2Params();
    expect(params.p_selected_slugs).toEqual(["welding"]);
    expect(params.p_rejected_slugs).toEqual([]);

    // The action performs NO worker_skills / journal_entry_skills /
    // journal_entry_metrics writes — the transaction owns the evidence.
    expect(writePayloads).toHaveLength(0);

    // Provenance: the fragment metrics carry the slug + the worker's phrase
    // (index-paired), so the evidence chain is inspectable.
    const metrics = params.p_metrics as Array<{
      metric_slug: string;
      value_text?: string | null;
    }>;
    expect(
      metrics.find((m) => m.metric_slug === "fragment_activity")?.value_text,
    ).toBe("1|welding");
    expect(
      metrics.find((m) => m.metric_slug === "parsed_fragment")?.value_text,
    ).toBe("1|Suvirinimas");

    // Pipeline runs AFTER the atomic commit, for the new id.
    expect(eventLog.indexOf("pipeline")).toBeGreaterThan(
      eventLog.indexOf(`rpc:${RPC_V2}`),
    );
    expect(pipelineCalls[0].entryId).toBe(NEW_ID);
  });

  it("filters malformed slugs out of the payload; duplicates collapse", async () => {
    currentSupabase = makeSupabase(liveHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([
          selectedFragment("welding"),
          selectedFragment("welding", { rawPhrase: "dar kartą" }),
          selectedFragment("bad slug; drop table", { rawPhrase: "c" }),
          selectedFragment("UPPER", { rawPhrase: "d" }),
        ]),
      }),
    );
    expect(res.ok).toBe(true);
    expect(v2Params().p_selected_slugs).toEqual(["welding"]);
  });

  it("an unknown/inactive slug fails the WHOLE save (skill_selection_invalid), nothing silently dropped", async () => {
    rpcMock = () => ({
      data: null,
      error: { message: "skill_slug_unknown", code: "22023" },
    });
    currentSupabase = makeSupabase(liveHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([selectedFragment("not_in_taxonomy")]),
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("skill_selection_invalid");
    // Atomic: no pipeline, no partial writes, the form keeps every edit.
    expect(pipelineCalls).toHaveLength(0);
    expect(writePayloads).toHaveLength(0);
  });

  it("a free-text row (activitySlug null) never enters p_selected_slugs", async () => {
    currentSupabase = makeSupabase(liveHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([fragment({ activitySlug: null })]),
      }),
    );
    expect(res.ok).toBe(true);
    expect(v2Params().p_selected_slugs).toEqual([]);
  });

  it("a slug rejected in the SAME save still ships via p_rejected_slugs (removal resolved in-RPC)", async () => {
    currentSupabase = makeSupabase(liveHandler(), { id: "user-1" });
    await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([selectedFragment("welding")]),
        rejected_slugs_json: JSON.stringify(["welding"]),
      }),
    );
    const params = v2Params();
    // Both lanes reach the transaction; the RPC resolves selected∩rejected to
    // REJECTED deterministically (pinned by the migration guard test).
    expect(params.p_rejected_slugs).toEqual(["welding"]);
    expect(params.p_selected_slugs).toEqual(["welding"]);
  });

  it("composer-style fragments (slug present, NOT selected) are never in p_selected_slugs", async () => {
    // The legacy composer ships parser-derived activitySlugs on confirmed
    // fragments without the selected flag — its pre-existing metric-only
    // behaviour must not gain silent self-declaration side effects.
    currentSupabase = makeSupabase(liveHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([
          fragment({ activitySlug: "welding" }), // selected: false
        ]),
      }),
    );
    expect(res.ok).toBe(true);
    const params = v2Params();
    expect(params.p_selected_slugs).toEqual([]);
    // The slug still lands in the fragment_activity provenance metric.
    const metrics = params.p_metrics as Array<{
      metric_slug: string;
      value_text?: string | null;
    }>;
    expect(
      metrics.find((m) => m.metric_slug === "fragment_activity")?.value_text,
    ).toBe("1|welding");
  });

  it("save payloads carry NO fake verification anywhere", async () => {
    currentSupabase = makeSupabase(liveHandler(), { id: "user-1" });
    await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([
          selectedFragment("welding"),
          selectedFragment("driving", { rawPhrase: "vairavau" }),
        ]),
      }),
    );
    const everything = JSON.stringify({ writePayloads, rpcCalls });
    expect(everything).not.toMatch(/"verified"\s*:\s*true/);
    expect(everything).not.toMatch(/manager_confirmed/);
  });
});

describe("P1-B — repeated saves form ONE supersession chain", () => {
  /** Stateful supersede RPC emulating the ATOMIC v2 semantics: a superseded
   *  old id is REFUSED with `entry_superseded` (the row-lock guarantee). */
  function statefulRpc() {
    const entries = new Map<string, { superseded_by: string | null }>([
      ["entry-A", { superseded_by: null }],
    ]);
    let n = 0;
    const lookup = (id: string | null): EntryState | null => {
      const e = id ? entries.get(id) : undefined;
      return e ? { superseded_by: e.superseded_by, deleted_at: null } : null;
    };
    rpcMock = (fn, params) => {
      if (fn !== RPC_V2) return { data: null, error: null };
      const oldId = params.p_old_entry_id as string;
      const old = entries.get(oldId);
      if (!old) {
        return { data: null, error: { message: "entry_not_found" } };
      }
      if (old.superseded_by !== null) {
        return {
          data: null,
          error: { message: "entry_superseded", code: "55000" },
        };
      }
      const newId = `entry-${String.fromCharCode(66 + n++)}`; // B, C, D…
      old.superseded_by = newId;
      entries.set(newId, { superseded_by: null });
      return { data: newId, error: null };
    };
    return {
      lookup,
      liveIds: () =>
        [...entries.entries()]
          .filter(([, e]) => e.superseded_by === null)
          .map(([id]) => id),
    };
  }

  /** The component's save rule (pinned by the source guard): every save
   *  targets the LATEST live id; the chain advances ONLY on ok. */
  async function clientSave(
    current: string,
    fd: FormData,
  ): Promise<{ current: string; ok: boolean }> {
    const res = await supersedeJournalEntry(current, fd);
    return res.ok
      ? { current: res.entryId, ok: true }
      : { current, ok: false };
  }

  it("three consecutive saves: A→B→C→D, exactly ONE live entry, last state wins", async () => {
    const chain = statefulRpc();
    currentSupabase = makeSupabase(liveHandler(chain.lookup), { id: "user-1" });

    let current = "entry-A";
    for (const text of ["pirmas keitimas", "antras keitimas", "trečias keitimas"]) {
      const r = await clientSave(current, makeFormData({ notes: text }));
      expect(r.ok).toBe(true);
      current = r.current;
    }

    // Every save superseded the LATEST entry — never the original again.
    const oldIds = rpcCalls
      .filter((c) => c.fn === RPC_V2)
      .map((c) => c.params.p_old_entry_id);
    expect(oldIds).toEqual(["entry-A", "entry-B", "entry-C"]);

    // One live descendant only — no duplicate visible entries.
    expect(chain.liveIds()).toEqual(["entry-D"]);
    expect(current).toBe("entry-D");

    // The final live entry carries the LAST submitted state.
    const lastRpc = rpcCalls.filter((c) => c.fn === RPC_V2)[2];
    expect(lastRpc.params.p_original_text).toBe("trečias keitimas");
    expect(pipelineCalls.map((p) => p.entryId)).toEqual([
      "entry-B",
      "entry-C",
      "entry-D",
    ]);
  });

  it("data from the previous save survives into the next supersede (B's fragments ride into C)", async () => {
    const chain = statefulRpc();
    currentSupabase = makeSupabase(liveHandler(chain.lookup), { id: "user-1" });

    // Save 1: adds a taxonomy selection with time. Save 2 (same open drawer)
    // re-submits the full row state — the model always ships the ENTIRE form,
    // so B's data plus the second edit lands in C.
    let current = "entry-A";
    const frag = selectedFragment("welding");
    let r = await clientSave(
      current,
      makeFormData({ fragments_json: JSON.stringify([frag]) }),
    );
    current = r.current;
    r = await clientSave(
      current,
      makeFormData({
        notes: "papildyta",
        fragments_json: JSON.stringify([
          frag,
          selectedFragment("driving", { rawPhrase: "vairavau" }),
        ]),
      }),
    );
    expect(r.ok).toBe(true);

    const second = rpcCalls.filter((c) => c.fn === RPC_V2)[1];
    expect(second.params.p_old_entry_id).toBe("entry-B");
    expect(second.params.p_selected_slugs).toEqual(["welding", "driving"]);
    const metrics = second.params.p_metrics as Array<{
      metric_slug: string;
      value_text?: string | null;
    }>;
    const activities = metrics
      .filter((m) => m.metric_slug === "fragment_activity")
      .map((m) => m.value_text);
    expect(activities).toEqual(["1|welding", "2|driving"]);
  });

  it("a failed save does NOT advance the chain — the retry targets the same entry", async () => {
    const chain = statefulRpc();
    currentSupabase = makeSupabase(liveHandler(chain.lookup), { id: "user-1" });

    let current = "entry-A";
    let r = await clientSave(current, makeFormData());
    current = r.current;
    expect(current).toBe("entry-B");

    // Second save fails at the RPC — no new entry, chain stays at B.
    const okRpc = rpcMock;
    rpcMock = () => ({ data: null, error: { message: "boom" } });
    r = await clientSave(current, makeFormData());
    expect(r.ok).toBe(false);
    expect(r.current).toBe("entry-B");

    // Retry succeeds and supersedes B (not A, not a phantom id).
    rpcMock = okRpc;
    r = await clientSave(r.current, makeFormData());
    expect(r.ok).toBe(true);
    expect(
      rpcCalls
        .filter((c) => c.fn === RPC_V2)
        .map((c) => c.params.p_old_entry_id),
    ).toEqual(["entry-A", "entry-B", "entry-B"]);
    expect(chain.liveIds()).toEqual(["entry-C"]);
  });

  it("a STALE client superseding an already-superseded entry is refused before the RPC", async () => {
    // Second tab / old ?editing= deep link: A was already superseded by B.
    currentSupabase = makeSupabase(
      liveHandler((id) =>
        id === "entry-A"
          ? { superseded_by: "entry-B", deleted_at: null }
          : { superseded_by: null, deleted_at: null },
      ),
      { id: "user-1" },
    );
    const res = await supersedeJournalEntry("entry-A", makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("entry_superseded");
    expect(rpcCalls.filter((c) => c.fn === RPC_V2)).toHaveLength(0);
    expect(pipelineCalls).toHaveLength(0);
    expect(writePayloads).toHaveLength(0);
  });

  it("a LOST RACE (precheck passed, RPC row-lock refused) maps to entry_superseded", async () => {
    // Both tabs read the entry as live; the RPC serialises them — the loser
    // gets the structured conflict, not a fork.
    rpcMock = () => ({
      data: null,
      error: { message: "entry_superseded", code: "55000" },
    });
    currentSupabase = makeSupabase(liveHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry("entry-A", makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("entry_superseded");
    expect(pipelineCalls).toHaveLength(0);
    expect(writePayloads).toHaveLength(0);
  });
});
