import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the canonical server-side journal skill pipeline (P0 Track B).
 *
 * Locks the honesty contract:
 *   • a recognised ALREADY-declared skill strengthens (new evidence link),
 *     never re-adds;
 *   • a strong (exact/synonym) NEW recognition creates a worker_skills row —
 *     ALWAYS verified:false + source:'self_declared' + confidence_bin:'yellow';
 *   • a fuzzy NEW recognition is NEVER auto-added — review only;
 *   • idempotent retry: existing links count as alreadyLinked, nothing doubles;
 *   • a foreign entry fails closed (all zeros);
 *   • the reconcile + revalidation side effects run;
 *   • NO write payload anywhere carries verified:true or manager_confirmed.
 */

const revalidatePathMock = vi.fn((..._args: unknown[]) => undefined);
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const reconcileMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/journal/skill-source-apply", () => ({
  applyWorkerSkillSourceReconcile: (...args: unknown[]) =>
    reconcileMock(...args),
}));

const recognizeSkillsMock = vi.fn(
  (_text: string, _limit?: number): unknown[] => [],
);
vi.mock("@/lib/structuring/skill-recognition", () => ({
  recognizeSkills: (...args: [string, number?]) =>
    recognizeSkillsMock(...args),
}));

type CapabilitySuggestionStub = {
  label: string;
  normalizedLabel: string;
  ambiguous?: boolean;
};
const extractSuggestionsMock = vi.fn(
  (_text?: string): { capabilitySuggestions: CapabilitySuggestionStub[] } => ({
    capabilitySuggestions: [],
  }),
);
vi.mock("@/lib/structuring/extract-journal-suggestions", () => ({
  extractJournalSuggestions: (...args: [string]) =>
    extractSuggestionsMock(...args),
}));

// ── Chainable supabase mock ────────────────────────────────────────────────
type Call = { method: string; args: unknown[] };
type TableResponse = { data?: unknown; error?: unknown };
type Handler = (table: string, calls: Call[]) => TableResponse;

/** Every write payload seen by the mock, so honesty rules can be asserted
 *  over EVERYTHING the pipeline ever tried to persist. */
let writePayloads: { table: string; rows: unknown }[] = [];

function makeSupabase(handler: Handler, user: { id: string } | null) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from(table: string) {
      const calls: Call[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const m of [
        "select",
        "eq",
        "in",
        "order",
        "limit",
        "maybeSingle",
        "single",
        "update",
      ]) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ method: m, args });
          return builder;
        };
      }
      for (const m of ["insert", "upsert"]) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ method: m, args });
          writePayloads.push({ table, rows: args[0] });
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

import { processJournalEntrySkills } from "@/lib/journal/skill-pipeline";

const WORKER = { id: "w1" };
const ENTRY = { id: "e1", worker_id: "w1" };

/** Standard handler: auth rows resolve; per-table data injectable. */
function baseHandler(overrides: {
  skills?: unknown[];
  ownedSkillIds?: string[];
  existingLinks?: string[];
  entry?: { id: string; worker_id: string } | null;
  linkError?: unknown;
  claimRows?: { normalized_label: string }[];
  claimMetrics?: { value_text: string }[];
}): Handler {
  return (table, calls) => {
    const wrote = (m: string) => calls.some((c) => c.method === m);
    switch (table) {
      case "workers":
        return { data: WORKER };
      case "journal_entries":
        return { data: overrides.entry === undefined ? ENTRY : overrides.entry };
      case "skills":
        return { data: overrides.skills ?? [] };
      case "worker_skills":
        if (wrote("upsert")) return { data: null };
        return {
          data: (overrides.ownedSkillIds ?? []).map((skill_id) => ({
            skill_id,
          })),
        };
      case "journal_entry_skills":
        if (wrote("upsert")) return { error: overrides.linkError ?? null };
        return {
          data: (overrides.existingLinks ?? []).map((skill_id) => ({
            skill_id,
          })),
        };
      case "profile_skill_claims":
        return { data: overrides.claimRows ?? [] };
      case "journal_entry_metrics":
        if (wrote("insert")) return { data: null };
        return { data: overrides.claimMetrics ?? [] };
      default:
        return { data: null };
    }
  };
}

function run(handler: Handler, opts?: Partial<Parameters<typeof processJournalEntrySkills>[0]>) {
  currentSupabase = makeSupabase(handler, { id: "user-1" });
  return processJournalEntrySkills({
    entryId: "e1",
    text: "dirbau",
    locale: "lt",
    ...opts,
  });
}

beforeEach(() => {
  writePayloads = [];
  revalidatePathMock.mockClear();
  reconcileMock.mockClear();
  recognizeSkillsMock.mockReset();
  recognizeSkillsMock.mockReturnValue([]);
  extractSuggestionsMock.mockReset();
  extractSuggestionsMock.mockReturnValue({ capabilitySuggestions: [] });
});

describe("processJournalEntrySkills", () => {
  it("known-declared skill recognised → strengthened=1, added=0, link upserted", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        ownedSkillIds: ["s1"],
        existingLinks: [],
      }),
    );
    expect(result.status).toBe("completed");
    expect(result.detected).toBe(1);
    expect(result.added).toBe(0);
    expect(result.strengthened).toBe(1);
    expect(result.alreadyLinked).toBe(0);
    expect(result.cvUpdated).toBe(true);
    const linkWrite = writePayloads.find(
      (w) => w.table === "journal_entry_skills",
    );
    expect(linkWrite?.rows).toEqual([
      { journal_entry_id: "e1", worker_id: "w1", skill_id: "s1" },
    ]);
    // no worker_skills insert for an already-declared skill
    expect(
      writePayloads.some((w) => w.table === "worker_skills"),
    ).toBe(false);
  });

  it("new taxonomy skill (exact) → added=1, linked, verified:false + self_declared + yellow", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        ownedSkillIds: [],
        existingLinks: [],
      }),
    );
    expect(result.status).toBe("completed");
    expect(result.added).toBe(1);
    expect(result.strengthened).toBe(0);
    expect(result.cvUpdated).toBe(true);
    const skillWrite = writePayloads.find((w) => w.table === "worker_skills");
    expect(skillWrite?.rows).toEqual([
      {
        worker_id: "w1",
        skill_id: "s1",
        verified: false,
        source: "self_declared",
        confidence_bin: "yellow",
      },
    ]);
    const linkWrite = writePayloads.find(
      (w) => w.table === "journal_entry_skills",
    );
    expect(linkWrite?.rows).toEqual([
      { journal_entry_id: "e1", worker_id: "w1", skill_id: "s1" },
    ]);
  });

  it("fuzzy NEW skill → reviewNeeded, NOT added, NOT linked", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "low", via: "fuzzy", matchedText: "plytelms" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        ownedSkillIds: [],
        existingLinks: [],
      }),
    );
    expect(result.status).toBe("completed");
    expect(result.added).toBe(0);
    expect(result.strengthened).toBe(0);
    expect(result.reviewNeeded).toBe(1);
    expect(result.cvUpdated).toBe(false);
    expect(writePayloads).toHaveLength(0);
  });

  it("duplicate retry (link already exists) → alreadyLinked, nothing re-written", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        ownedSkillIds: ["s1"],
        existingLinks: ["s1"],
      }),
    );
    expect(result.status).toBe("completed");
    expect(result.added).toBe(0);
    expect(result.strengthened).toBe(0);
    expect(result.alreadyLinked).toBe(1);
    expect(result.cvUpdated).toBe(false);
    expect(writePayloads).toHaveLength(0);
  });

  it("excludeSlugs (worker rejections) leave no trace", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        ownedSkillIds: [],
      }),
      { excludeSlugs: ["tiling"] },
    );
    expect(result.detected).toBe(0);
    expect(result.added).toBe(0);
    expect(writePayloads).toHaveLength(0);
  });

  it("entry not owned → status failed, everything 0, no writes", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({ entry: { id: "e1", worker_id: "SOMEONE-ELSE" } }),
    );
    expect(result.status).toBe("failed");
    expect(result.detected).toBe(0);
    expect(result.added).toBe(0);
    expect(result.strengthened).toBe(0);
    expect(result.claimsSaved).toBe(0);
    expect(result.cvUpdated).toBe(false);
    expect(result.trace).toMatch(/^[0-9a-f]{12}$/);
    expect(writePayloads).toHaveLength(0);
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("free-text capability claim persists as worker_input skill_claim metric", async () => {
    extractSuggestionsMock.mockReturnValue({
      capabilitySuggestions: [
        { label: "Programavimas", normalizedLabel: "programavimas" },
      ],
    });
    const result = await run(baseHandler({}));
    expect(result.claimsSaved).toBe(1);
    expect(result.reviewNeeded).toBe(1);
    expect(result.cvUpdated).toBe(true);
    const metricWrite = writePayloads.find(
      (w) => w.table === "journal_entry_metrics",
    );
    expect(metricWrite?.rows).toEqual([
      {
        entry_id: "e1",
        metric_slug: "skill_claim",
        source: "worker_input",
        value_text: "Programavimas",
      },
    ]);
  });

  it("claim idempotency: existing profile claim / entry metric never re-saves", async () => {
    extractSuggestionsMock.mockReturnValue({
      capabilitySuggestions: [
        { label: "Programavimas", normalizedLabel: "programavimas" },
        { label: "Vairavimas", normalizedLabel: "vairavimas" },
      ],
    });
    const result = await run(
      baseHandler({
        claimRows: [{ normalized_label: "programavimas" }],
        claimMetrics: [{ value_text: "Vairavimas" }],
      }),
    );
    expect(result.claimsSaved).toBe(0);
    expect(
      writePayloads.some((w) => w.table === "journal_entry_metrics"),
    ).toBe(false);
  });

  it("runs the evidence-tier reconcile and revalidates journal + profile + cv", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        ownedSkillIds: ["s1"],
      }),
    );
    expect(reconcileMock).toHaveBeenCalledWith(currentSupabase, "w1");
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/lt/dashboard/journal");
    expect(paths).toContain("/lt/dashboard/profile");
    expect(paths).toContain("/lt/cv");
  });

  it("revalidate:false skips revalidation (reprocess-safe)", async () => {
    await run(baseHandler({}), { revalidate: false });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("link write failure after a successful add → status partial", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        ownedSkillIds: [],
        linkError: { code: "42501", message: "denied" },
      }),
    );
    expect(result.status).toBe("partial");
    expect(result.added).toBe(1);
    expect(result.strengthened).toBe(0);
  });

  it("HARD RULE: no write payload ever carries verified:true or manager_confirmed", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "a", confidence: "high", via: "exact", matchedText: "a" },
      { slug: "b", confidence: "medium", via: "synonym", matchedText: "b" },
      { slug: "c", confidence: "low", via: "fuzzy", matchedText: "c" },
    ]);
    extractSuggestionsMock.mockReturnValue({
      capabilitySuggestions: [{ label: "X", normalizedLabel: "x" }],
    });
    await run(
      baseHandler({
        skills: [
          { id: "s1", slug: "a", is_active: true },
          { id: "s2", slug: "b", is_active: true },
          { id: "s3", slug: "c", is_active: true },
        ],
        ownedSkillIds: ["s3"],
      }),
    );
    expect(writePayloads.length).toBeGreaterThan(0);
    for (const w of writePayloads) {
      const rows = Array.isArray(w.rows) ? w.rows : [w.rows];
      for (const row of rows as Record<string, unknown>[]) {
        expect(row.verified).not.toBe(true);
        for (const value of Object.values(row)) {
          expect(value).not.toBe("manager_confirmed");
        }
      }
    }
  });
});
