import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Journal recall INTEGRITY fixes (post-#837 independent review).
 *
 * P1 — the pipeline_version stamp may be written ONLY after a fully
 *      successful run: any failed persist phase (worker_skills, links,
 *      claims, unresolved fragments, evidence reconcile) leaves the entry
 *      UNSTAMPED (stale) so lazy-heal / history-reprocess retries it, and
 *      a clean second pass completes the missing writes idempotently.
 * P2 — a worker's ambiguity decision persists as an entry-scoped
 *      `ambiguous_resolved` marker: derivation re-emits the chosen reading
 *      (via 'resolved') and never re-offers the card; a decision on one
 *      entry can never affect another.
 * P2 — CV claim rejections pair by entry_id + normalized label: a
 *      rejection on entry A must not hide the same un-rejected claim
 *      coming from entry B.
 */

const recognizeMock = vi.fn(
  (_text: string, _limit: number): {
    slug: string;
    via: "exact" | "synonym" | "fuzzy";
    confidence: "high" | "medium" | "low";
    matchedText: string;
  }[] => [],
);
vi.mock("@/lib/structuring/skill-recognition", () => ({
  recognizeSkills: (...args: [string, number]) => recognizeMock(...args),
}));

const claimsMock = vi.fn((_text: string): { label: string; ambiguous?: boolean }[] => []);
vi.mock("@/lib/profile/skill-claim-extractor", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    extractProfileSkillClaims: (...args: [string]) => claimsMock(...args),
  };
});

const ambiguousMock = vi.fn(
  (_text: string): {
    label: string;
    reason: string;
    possibleSlug: string;
    choices: { slug: string; label: string }[];
  }[] => [],
);
vi.mock("@/lib/structuring/ambiguous-journal-candidates", () => ({
  extractAmbiguousCandidates: (...args: [string]) => ambiguousMock(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── Chainable supabase mock (same contract as skill-pipeline.test.ts) ─────
type Call = { method: string; args: unknown[] };
type TableResponse = { data?: unknown; error?: unknown };
type Handler = (table: string, calls: Call[]) => TableResponse;

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
        "delete",
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
import {
  deriveJournalRecognition,
  JOURNAL_PIPELINE_VERSION,
} from "@/lib/journal/journal-recognition";
import { parseAmbiguousResolvedMarker } from "@/lib/journal/skill-pipeline";
import { selectJournalClaimLabels } from "@/lib/cv-export/verified-cv";

const ENTRY = "e1000000-0000-0000-0000-000000000001";
const WORKER = "w1000000-0000-0000-0000-000000000001";
const USER = { id: "u1000000-0000-0000-0000-000000000001" };
const SKILL_ID = "s1000000-0000-0000-0000-000000000001";

/** Baseline handler: worker row, own entry, active skill, empty markers.
 *  `failPhase` flips exactly one persist phase into an error. */
function baseHandler(failPhase?:
  | "worker_skills_upsert"
  | "links_upsert"
  | "claims_insert"
  | "unresolved_insert"
  | "reconcile_update"
): Handler {
  return (table, calls) => {
    const last = calls[calls.length - 1];
    const has = (m: string) => calls.some((c) => c.method === m);
    if (table === "workers") return { data: { id: WORKER } };
    if (table === "journal_entries")
      return { data: { id: ENTRY, worker_id: WORKER } };
    if (table === "skills")
      return { data: [{ id: SKILL_ID, slug: "tiling", is_active: true }] };
    if (table === "worker_skills") {
      if (has("upsert"))
        return failPhase === "worker_skills_upsert"
          ? { error: { code: "XX000", message: "injected" } }
          : {};
      if (has("update"))
        return failPhase === "reconcile_update"
          ? { error: { code: "XX000", message: "injected" } }
          : {};
      return { data: [] }; // owned-set + reconcile reads
    }
    if (table === "journal_entry_skills") {
      if (has("upsert"))
        return failPhase === "links_upsert"
          ? { error: { code: "XX000", message: "injected" } }
          : {};
      return { data: [] };
    }
    if (table === "journal_entry_metrics") {
      if (has("insert")) {
        const rows = (last?.args?.[0] ?? []) as { metric_slug?: string }[];
        const slug = Array.isArray(rows) ? rows[0]?.metric_slug : undefined;
        if (slug === "skill_claim" && failPhase === "claims_insert")
          return { error: { code: "XX000", message: "injected" } };
        if (slug === "unresolved_fragment" && failPhase === "unresolved_insert")
          return { error: { code: "XX000", message: "injected" } };
        return {};
      }
      return { data: [] };
    }
    if (table === "profile_skill_claims") return { data: [] };
    if (table === "skill_candidate_clarifications") return { data: [] };
    return { data: [] };
  };
}

function stampPayloads() {
  return writePayloads.filter(
    (p) =>
      p.table === "journal_entry_metrics" &&
      Array.isArray(p.rows) &&
      (p.rows as { metric_slug?: string }[]).some(
        (r) => r.metric_slug === "pipeline_version",
      ),
  );
}

beforeEach(() => {
  writePayloads = [];
  recognizeMock.mockReset().mockReturnValue([]);
  claimsMock.mockReset().mockReturnValue([]);
  ambiguousMock.mockReset().mockReturnValue([]);
});

describe("P1 — pipeline_version stamps ONLY after a fully successful run", () => {
  const CASES: [string, Parameters<typeof baseHandler>[0], () => void][] = [
    ["worker_skills upsert fails", "worker_skills_upsert", () =>
      recognizeMock.mockReturnValue([
        { slug: "tiling", via: "exact", confidence: "high", matchedText: "x" },
      ])],
    ["links upsert fails", "links_upsert", () =>
      recognizeMock.mockReturnValue([
        { slug: "tiling", via: "exact", confidence: "high", matchedText: "x" },
      ])],
    ["claims insert fails", "claims_insert", () =>
      claimsMock.mockReturnValue([{ label: "Testinė kompetencija" }])],
    ["unresolved insert fails", "unresolved_insert", () => {
      /* no lanes match → unresolved fallback persists */
    }],
    ["evidence reconcile fails", "reconcile_update", () => {
      // reconcile must UPDATE something: worker owns a linked skill whose
      // source diverges — reads return a divergent row.
      recognizeMock.mockReturnValue([
        { slug: "tiling", via: "exact", confidence: "high", matchedText: "x" },
      ]);
    }],
  ];

  for (const [name, phase, arrange] of CASES) {
    it(`${name} → NO version stamp + status not completed`, async () => {
      arrange();
      let handler = baseHandler(phase);
      if (phase === "reconcile_update") {
        const inner = baseHandler(phase);
        handler = (table, calls) => {
          if (table === "worker_skills" && calls.some((c) => c.method === "select")) {
            // divergent source so reconcile issues an update
            return {
              data: [
                { skill_id: SKILL_ID, source: "self_declared", verified: false },
              ],
            };
          }
          if (table === "journal_entry_skills" && !calls.some((c) => c.method === "upsert")) {
            return { data: [{ skill_id: SKILL_ID }] };
          }
          return inner(table, calls);
        };
      }
      currentSupabase = makeSupabase(handler, USER);
      const res = await processJournalEntrySkills({
        entryId: ENTRY,
        text: "dirbau darbus",
        locale: "lt",
        revalidate: false,
      });
      expect(res.status).not.toBe("completed");
      expect(stampPayloads()).toEqual([]);
    });
  }

  it("clean run stamps exactly once; clean RETRY after failure completes idempotently", async () => {
    recognizeMock.mockReturnValue([
      { slug: "tiling", via: "exact", confidence: "high", matchedText: "x" },
    ]);
    // First: failure → no stamp.
    currentSupabase = makeSupabase(baseHandler("links_upsert"), USER);
    const first = await processJournalEntrySkills({
      entryId: ENTRY,
      text: "klojau plyteles",
      locale: "lt",
      revalidate: false,
    });
    expect(first.status).not.toBe("completed");
    expect(stampPayloads()).toEqual([]);

    // Retry: everything succeeds → stamp written once, adds idempotent.
    writePayloads = [];
    currentSupabase = makeSupabase(baseHandler(), USER);
    const second = await processJournalEntrySkills({
      entryId: ENTRY,
      text: "klojau plyteles",
      locale: "lt",
      revalidate: false,
    });
    expect(second.status).toBe("completed");
    expect(stampPayloads()).toHaveLength(1);
  });
});

describe("P2 — ambiguous resolution markers", () => {
  const AMB = {
    label: "Namų tvarkymas / valymas",
    reason: "gali reikšti valymą arba remontą",
    possibleSlug: "cleaning-services",
    choices: [
      { slug: "cleaning-services", label: "Namų valymas" },
      { slug: "appliance-repair", label: "Namų remontas / priežiūra" },
    ],
  };

  it("marker round-trips through the parser", () => {
    const parsed = parseAmbiguousResolvedMarker(
      "namų tvarkymas / valymas=>cleaning-services",
    );
    expect(parsed).toEqual({
      normalizedLabel: "namų tvarkymas / valymas",
      slug: "cleaning-services",
    });
    expect(parseAmbiguousResolvedMarker("garbage")).toBeNull();
  });

  it("a resolution suppresses the card and emits the chosen reading (via resolved)", () => {
    ambiguousMock.mockReturnValue([AMB]);
    const resolved = deriveJournalRecognition("tvarkiau namus", {
      declaredSlugs: new Set(["cleaning-services"]),
      entryRejections: { slugs: new Set(), claimLabels: new Set() },
      entryResolutions: new Map([
        ["namų tvarkymas / valymas", "cleaning-services"],
      ]),
    });
    expect(resolved.candidates.filter((c) => c.kind === "ambiguous")).toEqual([]);
    const rec = resolved.recognizedSkills.find(
      (r) => r.slug === "cleaning-services",
    );
    expect(rec?.via).toBe("resolved");
    expect(resolved.coverage.unresolvedFragmentCount).toBe(0);
    expect(resolved.coverage.silentlyLostFragmentCount).toBe(0);
  });

  it("a decision on one entry never affects another (no resolutions → card re-offered)", () => {
    ambiguousMock.mockReturnValue([AMB]);
    const other = deriveJournalRecognition("tvarkiau namus", {
      declaredSlugs: new Set(["cleaning-services"]),
      entryRejections: { slugs: new Set(), claimLabels: new Set() },
      // second entry: NO resolutions
    });
    expect(
      other.candidates.filter((c) => c.kind === "ambiguous"),
    ).toHaveLength(1);
  });

  it("SEAM: a persisted ambiguous_resolved marker suppresses the card through processJournalEntrySkills itself", async () => {
    // Independent-review blocker regression: the wiring from
    // loadEntryRecognitionInputs → deriveJournalRecognition must be
    // exercised through the REAL pipeline, not only the pure function.
    ambiguousMock.mockReturnValue([AMB]);
    const inner = baseHandler();
    const handler: Handler = (table, calls) => {
      if (
        table === "journal_entry_metrics" &&
        !calls.some((c) => c.method === "insert")
      ) {
        return {
          data: [
            {
              metric_slug: "ambiguous_resolved",
              value_text: "namų tvarkymas / valymas=>cleaning-services",
              value_numeric: JOURNAL_PIPELINE_VERSION,
            },
          ],
        };
      }
      if (table === "skills")
        return {
          data: [
            { id: SKILL_ID, slug: "cleaning-services", is_active: true },
          ],
        };
      return inner(table, calls);
    };
    currentSupabase = makeSupabase(handler, USER);
    const res = await processJournalEntrySkills({
      entryId: ENTRY,
      text: "tvarkiau namus",
      locale: "lt",
      revalidate: false,
    });
    // Card NOT re-offered; the chosen reading came back as recognized.
    expect(
      res.recognition.candidates.filter((c) => c.kind === "ambiguous"),
    ).toEqual([]);
    expect(
      res.recognition.recognizedSkills.find(
        (r) => r.slug === "cleaning-services",
      )?.via,
    ).toBe("resolved");
    // The answered clarification row is NOT resurrected.
    expect(
      writePayloads.filter(
        (p) => p.table === "skill_candidate_clarifications",
      ),
    ).toEqual([]);
  });

  it("SEAM: failed marker/input read → failed run, NO stamp, no writes on empty assumptions", async () => {
    ambiguousMock.mockReturnValue([AMB]);
    const inner = baseHandler();
    const handler: Handler = (table, calls) => {
      if (
        table === "journal_entry_metrics" &&
        !calls.some((c) => c.method === "insert")
      ) {
        return { error: { code: "XX000", message: "injected read failure" } };
      }
      return inner(table, calls);
    };
    currentSupabase = makeSupabase(handler, USER);
    const res = await processJournalEntrySkills({
      entryId: ENTRY,
      text: "tvarkiau namus",
      locale: "lt",
      revalidate: false,
    });
    expect(res.status).toBe("failed");
    expect(stampPayloads()).toEqual([]);
    expect(
      writePayloads.filter((p) =>
        ["worker_skills", "journal_entry_skills"].includes(p.table),
      ),
    ).toEqual([]);
  });
});

describe("P2 — CV claim rejection pairs by entry_id + normalized label", () => {
  it("rejection on entry A does not hide the same claim from entry B", () => {
    const labels = selectJournalClaimLabels(
      [
        { entry_id: "A", metric_slug: "skill_claim", value_text: "Darbas su AI įrankiais" },
        { entry_id: "A", metric_slug: "skill_claim_rejected", value_text: "Darbas su AI įrankiais" },
        { entry_id: "B", metric_slug: "skill_claim", value_text: "Darbas su AI įrankiais" },
      ],
      new Set(),
    );
    expect(labels).toEqual(["Darbas su AI įrankiais"]);
  });

  it("rejection hides the label when it exists ONLY on the rejected entry", () => {
    const labels = selectJournalClaimLabels(
      [
        { entry_id: "A", metric_slug: "skill_claim", value_text: "Darbas su AI įrankiais" },
        { entry_id: "A", metric_slug: "skill_claim_rejected", value_text: "Darbas su AI įrankiais" },
      ],
      new Set(),
    );
    expect(labels).toEqual([]);
  });

  it("profile-level claims still dedupe and casing/whitespace normalize", () => {
    const labels = selectJournalClaimLabels(
      [
        { entry_id: "A", metric_slug: "skill_claim", value_text: "  Darbas   su AI įrankiais " },
        { entry_id: "B", metric_slug: "skill_claim", value_text: "darbas su ai įrankiais" },
      ],
      new Set(["darbas su ai įrankiais"]),
    );
    expect(labels).toEqual([]);
  });
});
