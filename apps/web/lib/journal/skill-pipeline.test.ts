import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the canonical server-side journal skill pipeline
 * (Universal Journal Recall, pipeline v2).
 *
 * Locks the honesty contract:
 *   • a recognised ALREADY-declared skill strengthens (new evidence link),
 *     never re-adds;
 *   • a strong (exact/synonym) NEW recognition creates a worker_skills row —
 *     ALWAYS verified:false + source:'self_declared' + confidence_bin:'yellow';
 *   • a fuzzy NEW recognition is NEVER auto-added — visible candidate only;
 *   • idempotent retry: existing links count as alreadyLinked, nothing doubles;
 *   • a foreign entry fails closed (all zeros);
 *   • unresolved fragments persist as append-only metric rows (zero loss);
 *   • save-time exclusions become durable entry-scoped skill_rejected markers;
 *   • the legacy counts EQUAL summarizeJournalPipelineResult of the lists;
 *   • NO write payload anywhere carries verified:true or manager_confirmed.
 *
 * Recognition lanes are mocked at the LEXICON level (recognizeSkills /
 * extractAmbiguousCandidates / extractProfileSkillClaims); the REAL
 * fragmenter + derivation run in between, so the pipeline is tested against
 * the true derivation contract.
 */

const revalidatePathMock = vi.fn((..._args: unknown[]) => undefined);
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

// Returns true = reconcile fully applied (P1 integrity contract): a false
// return now counts as a REQUIRED-phase failure and blocks the version stamp.
const reconcileMock = vi.fn(async (..._args: unknown[]) => true);
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

type ClaimStub = {
  label: string;
  normalizedLabel: string;
  ambiguous?: boolean;
};
const extractClaimsMock = vi.fn((_text?: string): ClaimStub[] => []);
vi.mock("@/lib/profile/skill-claim-extractor", () => ({
  extractProfileSkillClaims: (...args: [string]) => extractClaimsMock(...args),
  normalizeClaimLabel: (label: string) =>
    label.trim().toLowerCase().replace(/\s+/g, " "),
  getJournalClaimRowMeta: () => undefined,
}));

type AmbiguousStub = {
  label: string;
  reason: string;
  possibleSlug: string;
  choices: { slug: string; label: string }[];
};
const ambiguousMock = vi.fn((_text: string): AmbiguousStub[] => []);
vi.mock("@/lib/structuring/ambiguous-journal-candidates", () => ({
  extractAmbiguousCandidates: (...args: [string]) => ambiguousMock(...args),
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

import {
  processJournalEntrySkills,
  type JournalSkillPipelineResult,
} from "@/lib/journal/skill-pipeline";
import { summarizeJournalPipelineResult } from "@/lib/journal/journal-recognition";

const WORKER = { id: "w1" };
const ENTRY = { id: "e1", worker_id: "w1" };

/** Standard handler: auth rows resolve; per-table data injectable. */
function baseHandler(overrides: {
  skills?: unknown[];
  /** Worker's declared skills: {id, slug} pairs. */
  declared?: { id: string; slug: string }[];
  existingLinks?: string[];
  entry?: { id: string; worker_id: string } | null;
  linkError?: unknown;
  claimRows?: { normalized_label: string }[];
  /** journal_entry_metrics rows the marker read returns. */
  entryMetrics?: {
    metric_slug: string;
    value_text?: string | null;
    value_numeric?: number | null;
  }[];
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
          data: (overrides.declared ?? []).map((d) => ({
            skill_id: d.id,
            skills: { slug: d.slug },
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
        return { data: overrides.entryMetrics ?? [] };
      case "skill_candidate_clarifications":
        return { data: null };
      default:
        return { data: null };
    }
  };
}

function run(
  handler: Handler,
  opts?: Partial<Parameters<typeof processJournalEntrySkills>[0]>,
) {
  currentSupabase = makeSupabase(handler, { id: "user-1" });
  return processJournalEntrySkills({
    entryId: "e1",
    text: "klijavau plyteles",
    locale: "lt",
    ...opts,
  });
}

/** Metric write rows for a given metric_slug across all payloads. */
function metricWrites(slug: string): Record<string, unknown>[] {
  return writePayloads
    .filter((w) => w.table === "journal_entry_metrics")
    .flatMap((w) => (Array.isArray(w.rows) ? w.rows : [w.rows]))
    .filter((r): r is Record<string, unknown> => !!r)
    .filter((r) => (r as { metric_slug?: string }).metric_slug === slug);
}

/** Signal-table writes (the three tables where a wrong write = fake data). */
function signalWrites() {
  return writePayloads.filter((w) =>
    ["worker_skills", "journal_entry_skills", "skill_candidate_clarifications"].includes(
      w.table,
    ),
  );
}

/** The legacy counts must ALWAYS equal the pure summary of the lists. */
function expectSummaryConsistency(result: JournalSkillPipelineResult) {
  const summary = summarizeJournalPipelineResult(result);
  expect(result.detected).toBe(summary.detected);
  expect(result.added).toBe(summary.added);
  expect(result.strengthened).toBe(summary.strengthened);
  expect(result.alreadyLinked).toBe(summary.alreadyLinked);
  expect(result.reviewNeeded).toBe(summary.reviewNeeded);
  expect(result.claimsSaved).toBe(summary.claimsSaved);
  expect(result.cvUpdated).toBe(summary.cvUpdated);
}

beforeEach(() => {
  writePayloads = [];
  revalidatePathMock.mockClear();
  reconcileMock.mockClear();
  recognizeSkillsMock.mockReset();
  recognizeSkillsMock.mockReturnValue([]);
  extractClaimsMock.mockReset();
  extractClaimsMock.mockReturnValue([]);
  ambiguousMock.mockReset();
  ambiguousMock.mockReturnValue([]);
});

describe("processJournalEntrySkills (v2)", () => {
  it("known-declared skill recognised → strengthened=1, added=0, link upserted", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [{ id: "s1", slug: "tiling" }],
        existingLinks: [],
      }),
    );
    expect(result.status).toBe("completed");
    expect(result.detected).toBe(1);
    expect(result.added).toBe(0);
    expect(result.strengthened).toBe(1);
    expect(result.strengthenedSkills).toEqual([{ slug: "tiling" }]);
    expect(result.alreadyLinked).toBe(0);
    expect(result.cvUpdated).toBe(true);
    expectSummaryConsistency(result);
    const linkWrite = writePayloads.find(
      (w) => w.table === "journal_entry_skills",
    );
    expect(linkWrite?.rows).toEqual([
      { journal_entry_id: "e1", worker_id: "w1", skill_id: "s1" },
    ]);
    // no worker_skills insert for an already-declared skill
    expect(writePayloads.some((w) => w.table === "worker_skills")).toBe(false);
  });

  it("new taxonomy skill (exact) → added=1, linked, verified:false + self_declared + yellow", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [],
        existingLinks: [],
      }),
    );
    expect(result.status).toBe("completed");
    expect(result.added).toBe(1);
    expect(result.addedSkills).toEqual([{ slug: "tiling" }]);
    expect(result.strengthened).toBe(0);
    expect(result.cvUpdated).toBe(true);
    expectSummaryConsistency(result);
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
    // number of worker_skills rows written equals addedSkills length
    expect((skillWrite?.rows as unknown[]).length).toBe(
      result.addedSkills.length,
    );
  });

  it("fuzzy NEW skill → visible candidate, NOT added, NOT linked", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "low", via: "fuzzy", matchedText: "plytelms" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [],
        existingLinks: [],
      }),
    );
    expect(result.status).toBe("completed");
    expect(result.added).toBe(0);
    expect(result.strengthened).toBe(0);
    expect(result.reviewNeeded).toBe(1);
    expect(result.cvUpdated).toBe(false);
    expectSummaryConsistency(result);
    expect(signalWrites()).toHaveLength(0);
    // The fuzzy recognition is a VISIBLE confirmable candidate.
    expect(result.candidates).toMatchObject([
      {
        kind: "fuzzy_skill",
        label: "tiling",
        slug: "tiling",
        reason: "plytelms",
      },
    ]);
    // …and it lives in the recognition object too (one source).
    expect(result.recognition.candidates).toMatchObject([
      { kind: "fuzzy_skill", slug: "tiling" },
    ]);
  });

  it("fuzzy recognition of a DECLARED slug counts as recognized-declared → link", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "low", via: "fuzzy", matchedText: "plytelms" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [{ id: "s1", slug: "tiling" }],
        existingLinks: [],
      }),
    );
    expect(result.strengthened).toBe(1);
    expect(result.candidates).toEqual([]);
    expectSummaryConsistency(result);
  });

  it("duplicate retry (link already exists) → alreadyLinked, nothing re-written", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [{ id: "s1", slug: "tiling" }],
        existingLinks: ["s1"],
        entryMetrics: [{ metric_slug: "pipeline_version", value_numeric: 2 }],
      }),
    );
    expect(result.status).toBe("completed");
    expect(result.added).toBe(0);
    expect(result.strengthened).toBe(0);
    expect(result.alreadyLinked).toBe(1);
    expect(result.alreadyLinkedSkills).toEqual([{ slug: "tiling" }]);
    expect(result.cvUpdated).toBe(false);
    expectSummaryConsistency(result);
    // truly nothing written on a fully-idempotent retry (version stamped too)
    expect(writePayloads).toHaveLength(0);
  });

  it("excludeSlugs (worker rejections) leave no trace AND become durable markers", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [],
      }),
      { excludeSlugs: ["tiling"] },
    );
    expect(result.detected).toBe(0);
    expect(result.added).toBe(0);
    expect(signalWrites()).toHaveLength(0);
    // …but the rejection is VISIBLE in the result (nothing silently dropped)…
    expect(result.rejected).toEqual([
      { label: "tiling", reason: "user_rejected" },
    ]);
    // …and persisted as an entry-scoped append-only marker (survives reprocess).
    expect(metricWrites("skill_rejected")).toMatchObject([
      { entry_id: "e1", value_text: "tiling", source: "worker_input" },
    ]);
    expectSummaryConsistency(result);
  });

  it("a durable skill_rejected marker keeps excluding on reprocess (no excludeSlugs)", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [],
        entryMetrics: [
          { metric_slug: "skill_rejected", value_text: "tiling" },
          { metric_slug: "pipeline_version", value_numeric: 2 },
        ],
      }),
    );
    expect(result.detected).toBe(0);
    expect(result.rejected).toEqual([
      { label: "tiling", reason: "user_rejected" },
    ]);
    expect(writePayloads).toHaveLength(0);
  });

  it("recognition that fails taxonomy resolve → rejected/inactive_skill", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
      { slug: "ghost-skill", confidence: "high", via: "exact", matchedText: "ghost" },
    ]);
    const result = await run(
      baseHandler({
        skills: [
          { id: "s1", slug: "tiling", is_active: true },
          { id: "s2", slug: "ghost-skill", is_active: false },
        ],
        declared: [{ id: "s1", slug: "tiling" }],
      }),
    );
    expect(result.detected).toBe(1);
    expect(result.rejected).toEqual([
      { label: "ghost-skill", reason: "inactive_skill" },
    ]);
    expectSummaryConsistency(result);
  });

  it("ambiguous phrasing → clarification-lane candidate with choices, NEVER worker_skills", async () => {
    ambiguousMock.mockReturnValue([
      {
        label: "Namų tvarkymas / valymas",
        reason: "»tvarkiau namus« gali reikšti valymą arba remontą",
        possibleSlug: "cleaning-services",
        choices: [
          { slug: "cleaning-services", label: "Namų valymas" },
          { slug: "appliance-repair", label: "Namų remontas / priežiūra" },
        ],
      },
    ]);
    const result = await run(baseHandler({}), { text: "tvarkiau namus" });
    expect(result.detected).toBe(0);
    expect(result.added).toBe(0);
    expect(result.reviewNeeded).toBe(1);
    expect(result.candidates).toMatchObject([
      {
        kind: "ambiguous",
        label: "Namų tvarkymas / valymas",
        slug: "cleaning-services",
        choices: [
          { slug: "cleaning-services", label: "Namų valymas" },
          { slug: "appliance-repair", label: "Namų remontas / priežiūra" },
        ],
      },
    ]);
    // Persisted through the EXISTING clarification lane only.
    expect(writePayloads.some((w) => w.table === "worker_skills")).toBe(false);
    expect(
      writePayloads.some((w) => w.table === "journal_entry_skills"),
    ).toBe(false);
    const clar = writePayloads.find(
      (w) => w.table === "skill_candidate_clarifications",
    );
    expect(clar?.rows).toEqual([
      {
        profile_id: "user-1",
        label: "Namų tvarkymas / valymas",
        normalized_label: "namų tvarkymas / valymas",
      },
    ]);
    expectSummaryConsistency(result);
  });

  it("ambiguous candidate stays a CHOICE even when a reading is already declared (worker decides the evidence)", async () => {
    ambiguousMock.mockReturnValue([
      {
        label: "Namų tvarkymas / valymas",
        reason: "gali reikšti valymą arba remontą",
        possibleSlug: "cleaning-services",
        choices: [{ slug: "cleaning-services", label: "Namų valymas" }],
      },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s9", slug: "cleaning-services", is_active: true }],
        declared: [{ id: "s9", slug: "cleaning-services" }],
        entryMetrics: [{ metric_slug: "pipeline_version", value_numeric: 2 }],
      }),
      { text: "tvarkiau namus" },
    );
    expect(result.candidates).toMatchObject([
      { kind: "ambiguous", label: "Namų tvarkymas / valymas" },
    ]);
    expect(result.reviewNeeded).toBe(1);
    // The ambiguity NEVER touches worker_skills / links by itself.
    expect(writePayloads.some((w) => w.table === "worker_skills")).toBe(false);
    expect(
      writePayloads.some((w) => w.table === "journal_entry_skills"),
    ).toBe(false);
  });

  it("EXPLICIT same-fragment recognition of a choice slug suppresses the ambiguity (duplicate)", async () => {
    recognizeSkillsMock.mockReturnValue([
      {
        slug: "cleaning-services",
        confidence: "high",
        via: "exact",
        matchedText: "valiau",
      },
    ]);
    ambiguousMock.mockReturnValue([
      {
        label: "Namų tvarkymas / valymas",
        reason: "gali reikšti valymą arba remontą",
        possibleSlug: "cleaning-services",
        choices: [{ slug: "cleaning-services", label: "Namų valymas" }],
      },
    ]);
    const result = await run(
      baseHandler({
        skills: [{ id: "s9", slug: "cleaning-services", is_active: true }],
        declared: [],
      }),
      { text: "valiau ir tvarkiau namus" },
    );
    expect(result.candidates.filter((c) => c.kind === "ambiguous")).toEqual([]);
    expect(result.addedSkills).toEqual([{ slug: "cleaning-services" }]);
  });

  it("worker-REJECTED claim label (skill_claim_rejected marker) stays VISIBLE as rejected, never re-saves", async () => {
    extractClaimsMock.mockReturnValue([
      { label: "Vairavimas", normalizedLabel: "vairavimas" },
    ]);
    const result = await run(
      baseHandler({
        entryMetrics: [
          { metric_slug: "skill_claim_rejected", value_text: "Vairavimas" },
          { metric_slug: "pipeline_version", value_numeric: 2 },
        ],
      }),
      { text: "vairavau automobilį" },
    );
    expect(result.claimsSaved).toBe(0);
    expect(metricWrites("skill_claim")).toHaveLength(0);
    // Entry-scoped rejection is VISIBLE in the result — not silently gone.
    expect(result.rejected).toEqual([
      { label: "Vairavimas", reason: "user_rejected" },
    ]);
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
    extractClaimsMock.mockReturnValue([
      { label: "Programavimas", normalizedLabel: "programavimas" },
    ]);
    const result = await run(baseHandler({}), { text: "programavau sistemą" });
    expect(result.claimsSaved).toBe(1);
    expect(result.claimsSavedLabels).toEqual(["Programavimas"]);
    expect(result.cvUpdated).toBe(true);
    expect(result.candidates).toMatchObject([
      { kind: "claim", label: "Programavimas" },
    ]);
    expect(metricWrites("skill_claim")).toEqual([
      {
        entry_id: "e1",
        metric_slug: "skill_claim",
        source: "worker_input",
        value_text: "Programavimas",
      },
    ]);
    // number of skill_claim rows written equals claimsSavedLabels length
    expect(metricWrites("skill_claim")).toHaveLength(
      result.claimsSavedLabels.length,
    );
    expectSummaryConsistency(result);
  });

  it("claim idempotency: existing profile claim / entry metric never re-saves", async () => {
    extractClaimsMock.mockReturnValue([
      { label: "Programavimas", normalizedLabel: "programavimas" },
      { label: "Vairavimas", normalizedLabel: "vairavimas" },
    ]);
    const result = await run(
      baseHandler({
        claimRows: [{ normalized_label: "programavimas" }],
        entryMetrics: [
          { metric_slug: "skill_claim", value_text: "Vairavimas" },
          { metric_slug: "pipeline_version", value_numeric: 2 },
        ],
      }),
      { text: "programavau ir vairavau" },
    );
    expect(result.claimsSaved).toBe(0);
    expect(metricWrites("skill_claim")).toHaveLength(0);
    // …but both claims stay VISIBLE candidates (already-persisted ≠ hidden).
    expect(result.candidates.filter((c) => c.kind === "claim")).toHaveLength(2);
  });

  it("unresolved meaningful fragment → unresolved_fragment metric row + visible in result", async () => {
    // No lanes match anything → the whole text is one unresolved fragment.
    const result = await run(baseHandler({}), {
      text: "Žaidžiau šachmatais turnyre",
    });
    expect(result.recognition.unresolvedFragments).toHaveLength(1);
    expect(result.recognition.coverage.silentlyLostFragmentCount).toBe(0);
    expect(result.reviewNeeded).toBe(1);
    const rows = metricWrites("unresolved_fragment");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entry_id: "e1",
      source: "worker_input",
      value_text: "Žaidžiau šachmatais turnyre",
    });
    expectSummaryConsistency(result);
  });

  it("dismissed unresolved fragment is not re-inserted but stays in the result", async () => {
    const result = await run(
      baseHandler({
        entryMetrics: [
          {
            metric_slug: "unresolved_dismissed",
            value_text: "zaidziau sachmatais turnyre",
          },
          { metric_slug: "pipeline_version", value_numeric: 2 },
        ],
      }),
      { text: "Žaidžiau šachmatais turnyre" },
    );
    expect(metricWrites("unresolved_fragment")).toHaveLength(0);
    expect(result.recognition.unresolvedFragments).toHaveLength(1);
  });

  it("stamps pipeline_version=2 once (skipped when already stamped)", async () => {
    await run(baseHandler({}), { text: "Žaidžiau šachmatais" });
    expect(metricWrites("pipeline_version")).toMatchObject([
      { entry_id: "e1", value_numeric: 2, source: "worker_input" },
    ]);
    writePayloads = [];
    await run(
      baseHandler({
        entryMetrics: [{ metric_slug: "pipeline_version", value_numeric: 2 }],
      }),
      { text: "Žaidžiau šachmatais 2" },
    );
    expect(metricWrites("pipeline_version")).toHaveLength(0);
  });

  it("runs the evidence-tier reconcile and revalidates journal + profile + cv", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" },
    ]);
    await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [{ id: "s1", slug: "tiling" }],
      }),
    );
    expect(reconcileMock).toHaveBeenCalledWith(currentSupabase, "w1");
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/lt/dashboard/journal");
    expect(paths).toContain("/lt/dashboard/profile");
    expect(paths).toContain("/lt/cv");
  });

  it("revalidate:false skips revalidation (reprocess/heal-safe)", async () => {
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
        declared: [],
        linkError: { code: "42501", message: "denied" },
      }),
    );
    expect(result.status).toBe("partial");
    expect(result.added).toBe(1);
    expect(result.strengthened).toBe(0);
  });

  it("the result embeds the FULL recognition object (fragments + coverage)", async () => {
    recognizeSkillsMock.mockImplementation((text: string) =>
      text.toLowerCase().includes("plytel")
        ? [{ slug: "tiling", confidence: "high", via: "exact", matchedText: "plyteles" }]
        : [],
    );
    const result = await run(
      baseHandler({
        skills: [{ id: "s1", slug: "tiling", is_active: true }],
        declared: [],
      }),
      { text: "Klijavau plyteles. Žaidžiau šachmatais." },
    );
    expect(result.recognition.pipelineVersion).toBe(2);
    expect(result.recognition.coverage.fragmentCount).toBe(2);
    expect(result.recognition.coverage.meaningfulFragmentCount).toBe(2);
    expect(result.recognition.coverage.coveredFragmentCount).toBe(1);
    expect(result.recognition.coverage.unresolvedFragmentCount).toBe(1);
    expect(result.recognition.coverage.silentlyLostFragmentCount).toBe(0);
    expectSummaryConsistency(result);
  });

  it("HARD RULE: no write payload ever carries verified:true or manager_confirmed", async () => {
    recognizeSkillsMock.mockReturnValue([
      { slug: "a", confidence: "high", via: "exact", matchedText: "a" },
      { slug: "b", confidence: "medium", via: "synonym", matchedText: "b" },
      { slug: "c", confidence: "low", via: "fuzzy", matchedText: "c" },
    ]);
    extractClaimsMock.mockReturnValue([
      { label: "X", normalizedLabel: "x" },
    ]);
    await run(
      baseHandler({
        skills: [
          { id: "s1", slug: "a", is_active: true },
          { id: "s2", slug: "b", is_active: true },
          { id: "s3", slug: "c", is_active: true },
        ],
        declared: [{ id: "s3", slug: "c" }],
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
