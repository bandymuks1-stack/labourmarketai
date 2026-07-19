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

type EntryState = { superseded_by: string | null; deleted_at: string | null };

function requestedEntryId(calls: Call[]): string | null {
  const eq = calls.find((c) => c.method === "eq" && c.args[0] === "id");
  return (eq?.args[1] as string | undefined) ?? null;
}

/** Old-entry decision-marker rows served by p1aHandler (per-test). */
let oldMetricsRef: Array<{
  metric_slug: string;
  value_text: string | null;
  value_numeric?: number | null;
}> = [];

/** Handler with a worker profile + an ACTIVE skills taxonomy. The stale-chain
 *  precheck reads `journal_entries` — `entryLookup` answers it (default: the
 *  requested entry is live). */
function p1aHandler(
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
      case "journal_entry_metrics": {
        if (calls.some((c) => c.method === "insert")) return { data: null };
        const eq = calls.find(
          (c) => c.method === "eq" && c.args[0] === "entry_id",
        );
        const id = (eq?.args[1] as string | undefined) ?? null;
        return { data: id === OLD_ID ? oldMetricsRef : [] };
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

beforeEach(() => {
  oldMetricsRef = [];
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
        fragments_json: JSON.stringify([selectedFragment("welding")]),
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
          selectedFragment("not-in-taxonomy"),
          selectedFragment("retired_skill", { rawPhrase: "b" }),
          selectedFragment("bad slug; drop table", { rawPhrase: "c" }),
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
        fragments_json: JSON.stringify([selectedFragment("welding")]),
        rejected_slugs_json: JSON.stringify(["welding"]),
      }),
    );
    expect(
      writePayloads.filter((w) => w.table === "worker_skills"),
    ).toHaveLength(0);
  });

  it("composer-style fragments (slug present, NOT selected) are never linked", async () => {
    // The legacy composer ships parser-derived activitySlugs on confirmed
    // fragments without the selected flag — its pre-existing metric-only
    // behaviour must not gain silent self-declaration side effects.
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([
          fragment({ activitySlug: "welding" }), // selected: false
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
    // The slug still lands in the fragment_activity provenance metric.
    const rpc = rpcCalls.find((c) => c.fn === "journal_entry_supersede")!;
    const metrics = rpc.params.p_metrics as Array<{
      metric_slug: string;
      value_text?: string | null;
    }>;
    expect(
      metrics.find((m) => m.metric_slug === "fragment_activity")?.value_text,
    ).toBe("1|welding");
  });

  it("a re-selected slug's OLD skill_rejected marker is NOT carried forward (others are)", async () => {
    // remove→save→re-add→save: the old rejection marker must not ride the
    // carry and permanently suppress the re-added skill on the chain.
    oldMetricsRef = [
      { metric_slug: "skill_rejected", value_text: "welding" },
      { metric_slug: "skill_rejected", value_text: "tiling" },
      { metric_slug: "unresolved_dismissed", value_text: "kažkoks fragmentas" },
    ];
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
    const res = await supersedeJournalEntry(
      OLD_ID,
      makeFormData({
        fragments_json: JSON.stringify([selectedFragment("welding")]),
      }),
    );
    expect(res.ok).toBe(true);
    const markerInsert = writePayloads.find(
      (w) => w.table === "journal_entry_metrics",
    );
    expect(markerInsert).toBeTruthy();
    const rows = markerInsert!.rows as Array<{
      metric_slug: string;
      value_text: string;
    }>;
    expect(rows.map((r) => `${r.metric_slug}|${r.value_text}`).sort()).toEqual([
      "skill_rejected|tiling",
      "unresolved_dismissed|kažkoks fragmentas",
    ]);
    // And the re-selected skill IS linked.
    expect(
      writePayloads.filter((w) => w.table === "journal_entry_skills"),
    ).toHaveLength(1);
  });

  it("selection writes carry NO fake verification anywhere", async () => {
    currentSupabase = makeSupabase(p1aHandler(), { id: "user-1" });
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
  /** Stateful supersede RPC emulating production 0018 semantics: any live-or-
   *  not old id succeeds and gets `superseded_by` stamped — which is exactly
   *  why a client that re-supersedes the ORIGINAL forks the chain into
   *  duplicate live entries. The client-side chain rule is the fix. */
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
    currentSupabase = makeSupabase(p1aHandler(chain.lookup), { id: "user-1" });

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
    const chain = statefulRpc();
    currentSupabase = makeSupabase(p1aHandler(chain.lookup), { id: "user-1" });

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
    const chain = statefulRpc();
    currentSupabase = makeSupabase(p1aHandler(chain.lookup), { id: "user-1" });

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

  it("a STALE client superseding an already-superseded entry is refused before the RPC", async () => {
    // Second tab / old ?editing= deep link: A was already superseded by B.
    currentSupabase = makeSupabase(
      p1aHandler((id) =>
        id === "entry-A"
          ? { superseded_by: "entry-B", deleted_at: null }
          : { superseded_by: null, deleted_at: null },
      ),
      { id: "user-1" },
    );
    const res = await supersedeJournalEntry("entry-A", makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("entry_superseded");
    expect(rpcCalls.filter((c) => c.fn === "journal_entry_supersede")).toHaveLength(0);
    expect(pipelineCalls).toHaveLength(0);
    expect(writePayloads).toHaveLength(0);
  });

  it("a deleted old entry is refused the same way", async () => {
    currentSupabase = makeSupabase(
      p1aHandler(() => ({ superseded_by: null, deleted_at: "2026-07-19T00:00:00Z" })),
      { id: "user-1" },
    );
    const res = await supersedeJournalEntry("entry-A", makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("entry_superseded");
    expect(rpcCalls.filter((c) => c.fn === "journal_entry_supersede")).toHaveLength(0);
  });
});
