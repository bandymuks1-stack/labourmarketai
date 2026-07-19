import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Journal compact edit — post-merge P1 follow-up regressions, tested through
 * the REAL `supersedeJournalEntry` action with a mocked supabase client.
 *
 * P1-A — manually selected taxonomy skills must create durable evidence:
 *   • a row picked from taxonomy search ships ITS slug as the fragment's
 *     `activitySlug`; the server validates it (slug-shaped, ACTIVE taxonomy
 *     row, not rejected in the same save) and links it to the NEW entry:
 *     `worker_skills` verified=false + `journal_entry_skills` evidence link;
 *   • an unknown / inactive / malformed slug is dropped — the row stays an
 *     honest free label, no fabricated taxonomy claim, no link writes;
 *   • a free-text row (activitySlug null) never touches worker_skills.
 *
 * P1-B — repeated saves in one open drawer form ONE supersession chain:
 *   • save 1 supersedes A→B, save 2 supersedes B→C, save 3 supersedes C→D
 *     (never A twice — that forked the chain into duplicate live entries);
 *   • after three saves exactly ONE entry is live and it carries the last
 *     submitted state;
 *   • a failed save does NOT advance the chain.
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

const ACTIVE_SKILLS = [
  { id: "s-welding", slug: "welding", is_active: true },
  { id: "s-driving", slug: "driving", is_active: true },
  { id: "s-retired", slug: "retired_skill", is_active: false },
];

function skillsMatching(calls: Call[]): unknown[] {
  const inCall = calls.find(
    (c) => c.method === "in" && c.args[0] === "slug",
  );
  const slugs = (inCall?.args[1] as string[] | undefined) ?? [];
  return ACTIVE_SKILLS.filter((s) => slugs.includes(s.slug));
}

/** Handler with a worker profile + an ACTIVE skills taxonomy. */
function p1aHandler(): Handler {
  return (table, calls) => {
    switch (table) {
      case "workers":
        return { data: { id: "w1" } };
      case "skills":
        return { data: skillsMatching(calls) };
      case "worker_skills":
        return { data: null };
      case "journal_entry_skills":
        // Old-entry link carry reads return nothing; upserts succeed.
        return calls.some((c) => c.method === "upsert")
          ? { data: null }
          : { data: [] };
      case "productivity_units":
        return {
          data: [
            { slug: "hours" },
            { slug: "minutes" },
            { slug: "days" },
            { slug: "square_meters" },
          ],
        };
      case "journal_entry_metrics":
        return { data: [] };
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
    ...overrides,
  };
}

beforeEach(() => {
  writePayloads = [];
  rpcCalls = [];
  pipelineCalls.length = 0;
  eventLog.length = 0;
  rpcMock = () => ({ data: NEW_ID, error: null });
});

describe("P1-A — selected taxonomy skill creates durable evidence", () => {
  it("links a validated selection to the NEW entry: worker_skills verified=false + evidence link", async () => {
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    // The entry TEXT does not contain the skill label — only the selected
    // fragment carries it (the exact production defect scenario).
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([
          fragment({ activitySlug: "welding" }),
        ]),
      }),
    );
    expect(res.ok).toBe(true);

    const own = writePayloads.find((w) => w.table === "worker_skills");
    expect(own).toBeTruthy();
    expect(own!.rows).toEqual([
      {
        worker_id: "w1",
        skill_id: "s-welding",
        verified: false,
        source: "self_declared",
        confidence_bin: "yellow",
      },
    ]);
    // Never downgrades an existing row — ignore-duplicate upsert only.
    expect(own!.options).toMatchObject({
      onConflict: "worker_id,skill_id",
      ignoreDuplicates: true,
    });

    const link = writePayloads.find(
      (w) => w.table === "journal_entry_skills",
    );
    expect(link).toBeTruthy();
    expect(link!.rows).toEqual([
      { journal_entry_id: NEW_ID, worker_id: "w1", skill_id: "s-welding" },
    ]);

    // Provenance: the fragment metrics on the new entry carry the slug + the
    // worker's phrase (index-paired), so the evidence chain is inspectable.
    const rpc = rpcCalls.find((c) => c.fn === "journal_entry_supersede")!;
    const metrics = rpc.params.p_metrics as Array<{
      metric_slug: string;
      value_text?: string | null;
    }>;
    expect(
      metrics.find((m) => m.metric_slug === "fragment_activity")?.value_text,
    ).toBe("1|welding");
    expect(
      metrics.find((m) => m.metric_slug === "parsed_fragment")?.value_text,
    ).toBe("1|Suvirinimas");

    // Linking lands BEFORE the pipeline run for the new entry.
    const linkIdx = eventLog.indexOf("upsert:journal_entry_skills");
    expect(linkIdx).toBeGreaterThanOrEqual(0);
    expect(eventLog.indexOf("pipeline")).toBeGreaterThan(linkIdx);
    expect(pipelineCalls[0].entryId).toBe(NEW_ID);
  });

  it("drops unknown, inactive and malformed slugs — no link writes, row stays a label", async () => {
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([
          fragment({ activitySlug: "not-in-taxonomy" }),
          fragment({ rawPhrase: "b", activitySlug: "retired_skill" }),
          fragment({ rawPhrase: "c", activitySlug: "bad slug; drop table" }),
        ]),
      }),
    );
    expect(res.ok).toBe(true);
    expect(
      writePayloads.filter((w) => w.table === "worker_skills"),
    ).toHaveLength(0);
    expect(
      writePayloads.filter((w) => w.table === "journal_entry_skills"),
    ).toHaveLength(0);
  });

  it("a free-text row (activitySlug null) never fabricates a taxonomy skill", async () => {
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([fragment({ activitySlug: null })]),
      }),
    );
    expect(res.ok).toBe(true);
    expect(
      writePayloads.filter((w) => w.table === "worker_skills"),
    ).toHaveLength(0);
    expect(
      writePayloads.filter((w) => w.table === "journal_entry_skills"),
    ).toHaveLength(0);
  });

  it("a slug rejected in the SAME save is never linked (removal wins)", async () => {
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([
          fragment({ activitySlug: "welding" }),
        ]),
        rejected_slugs_json: JSON.stringify(["welding"]),
      }),
    );
    expect(
      writePayloads.filter((w) => w.table === "worker_skills"),
    ).toHaveLength(0);
  });

  it("selection writes carry NO fake verification anywhere", async () => {
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([
          fragment({ activitySlug: "welding" }),
          fragment({ rawPhrase: "vairavau", activitySlug: "driving" }),
        ]),
      }),
    );
    const everything = JSON.stringify({ writePayloads, rpcCalls });
    expect(everything).not.toMatch(/"verified"\s*:\s*true/);
    expect(everything).not.toMatch(/manager_confirmed/);
  });
});

describe("P1-B — repeated saves form ONE supersession chain", () => {
  /** Stateful supersede RPC emulating production 0018 semantics: any live-or-
   *  not old id succeeds and gets `superseded_by` stamped — which is exactly
   *  why a client that re-supersedes the ORIGINAL forks the chain into
   *  duplicate live entries. The client-side chain rule is the fix. */
  function statefulRpc() {
    const entries = new Map<string, { superseded_by: string | null }>([
      ["entry-A", { superseded_by: null }],
    ]);
    let n = 0;
    rpcMock = (fn, params) => {
      if (fn !== "journal_entry_supersede") return { data: null, error: null };
      const oldId = params.p_old_entry_id as string;
      if (!entries.has(oldId)) {
        return { data: null, error: { message: "entry_not_found" } };
      }
      const newId = `entry-${String.fromCharCode(66 + n++)}`; // B, C, D…
      entries.get(oldId)!.superseded_by = newId;
      entries.set(newId, { superseded_by: null });
      return { data: newId, error: null };
    };
    return {
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
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    const chain = statefulRpc();

    let current = "entry-A";
    for (const text of ["pirmas keitimas", "antras keitimas", "trečias keitimas"]) {
      const r = await clientSave(current, makeFormData({ notes: text }));
      expect(r.ok).toBe(true);
      current = r.current;
    }

    // Every save superseded the LATEST entry — never the original again.
    const oldIds = rpcCalls
      .filter((c) => c.fn === "journal_entry_supersede")
      .map((c) => c.params.p_old_entry_id);
    expect(oldIds).toEqual(["entry-A", "entry-B", "entry-C"]);

    // One live descendant only — no duplicate visible entries.
    expect(chain.liveIds()).toEqual(["entry-D"]);
    expect(current).toBe("entry-D");

    // The final live entry carries the LAST submitted state.
    const lastRpc = rpcCalls.filter(
      (c) => c.fn === "journal_entry_supersede",
    )[2];
    expect(lastRpc.params.p_original_text).toBe("trečias keitimas");
    expect(pipelineCalls.map((p) => p.entryId)).toEqual([
      "entry-B",
      "entry-C",
      "entry-D",
    ]);
  });

  it("data from the previous save survives into the next supersede (B's fragments ride into C)", async () => {
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    statefulRpc();

    // Save 1: adds a taxonomy selection with time. Save 2 (same open drawer)
    // re-submits the full row state — the model always ships the ENTIRE form,
    // so B's data plus the second edit lands in C.
    let current = "entry-A";
    const frag = fragment({ activitySlug: "welding" });
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
          fragment({ rawPhrase: "vairavau", activitySlug: "driving" }),
        ]),
      }),
    );
    expect(r.ok).toBe(true);

    const second = rpcCalls.filter(
      (c) => c.fn === "journal_entry_supersede",
    )[1];
    expect(second.params.p_old_entry_id).toBe("entry-B");
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
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    const chain = statefulRpc();

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
        .filter((c) => c.fn === "journal_entry_supersede")
        .map((c) => c.params.p_old_entry_id),
    ).toEqual(["entry-A", "entry-B", "entry-B"]);
    expect(chain.liveIds()).toEqual(["entry-C"]);
  });
});
