import { beforeEach, describe, expect, it, vi } from "vitest";
import { recognizeSkills } from "./skill-recognition";
import { extractAmbiguousCandidates } from "./ambiguous-journal-candidates";
import { extractProfileSkillClaims } from "@/lib/profile/skill-claim-extractor";

/**
 * P1 RECALL REGRESSION — the production incident, verbatim (2026-07-19).
 *
 * The entry below contains 3 DIRECT skill signals (car washing, programming,
 * house cleaning) and 1 INFERABLE capability (AI-tools-assisted work). The
 * deterministic recognizer returned ONLY `programming`;
 * `capabilitySuggestions` was []. Loss stages: LEXICON + TAXONOMY coverage,
 * plus ambiguous phrasings silently dropped instead of surfacing as
 * confirmable candidates.
 *
 * This file pins the repaired contract at every stage — recognizer, ambiguous
 * extractor, claim extractor, and the full pipeline result (lists, not
 * counts). If ANY stage regresses, the incident text fails again here.
 */

const INCIDENT_TEXT =
  "Ploviau mašiną - 1 h. Kodavau programą su chat gpt ir claude code - 6h, tvarkiau namus - 2h";

const AI_TOOLS_LABEL = "Darbas su AI įrankiais (ChatGPT / Claude)";

describe("stage 1 — deterministic recognizer (lexicon + taxonomy)", () => {
  it("the incident text yields BOTH direct taxonomy skills", () => {
    const slugs = recognizeSkills(INCIDENT_TEXT).map((s) => s.slug);
    expect(slugs).toContain("programming");
    expect(slugs).toContain("vehicle-cleaning");
  });

  it("vehicle washing is verb+vehicle anchored — no bleed into repair/dishes/windows", () => {
    const slugs = (t: string) => recognizeSkills(t).map((s) => s.slug);
    expect(slugs("Remontavau mašiną")).not.toContain("vehicle-cleaning");
    expect(slugs("Ploviau indus")).not.toContain("vehicle-cleaning");
    expect(slugs("Ploviau langus")).not.toContain("vehicle-cleaning");
    // …and the direct forms all land, diacritics or not, RU/EN included.
    expect(slugs("ploviau masina")).toContain("vehicle-cleaning");
    expect(slugs("Ploviau automobilį")).toContain("vehicle-cleaning");
    expect(slugs("помыл машину клиента")).toContain("vehicle-cleaning");
    expect(slugs("did a car wash shift")).toContain("vehicle-cleaning");
  });

  it("unambiguous house-cleaning phrasings recognise cleaning-services directly", () => {
    const slugs = (t: string) => recognizeSkills(t).map((s) => s.slug);
    expect(slugs("Valiau namus po remonto")).toContain("cleaning-services");
    expect(slugs("namų valymas 3 val")).toContain("cleaning-services");
    expect(slugs("Убирал дом весь день")).toContain("cleaning-services");
    expect(slugs("house cleaning for a client")).toContain("cleaning-services");
  });
});

describe("stage 2 — ambiguous extractor (»tvarkiau namus« is NOT auto-cleaning)", () => {
  it("the incident text yields the namų-tvarkymas clarification candidate", () => {
    const out = extractAmbiguousCandidates(INCIDENT_TEXT);
    expect(out).toEqual([
      {
        label: "Namų tvarkymas / valymas",
        reason: "»tvarkiau namus« gali reikšti valymą arba remontą",
        possibleSlug: "cleaning-services",
        // Universal pipeline v2: the worker picks ONE curated reading.
        choices: [
          { slug: "cleaning-services", label: "Namų valymas" },
          { slug: "appliance-repair", label: "Namų remontas / priežiūra" },
        ],
      },
    ]);
  });

  it("the bare ambiguous phrase never becomes a direct cleaning skill", () => {
    // The deliberate honesty rule: "tvarkiau namus" alone (fixed OR cleaned)
    // must NOT be recognised as a taxonomy skill — candidate lane only.
    const slugs = recognizeSkills("tvarkiau namus").map((s) => s.slug);
    expect(slugs).not.toContain("cleaning-services");
  });

  it("diacritic-free and butas variants match; unrelated text does not", () => {
    expect(extractAmbiguousCandidates("sutvarkiau nama")).toHaveLength(1);
    expect(extractAmbiguousCandidates("tvarkiau butą po nuomos")).toHaveLength(1);
    expect(extractAmbiguousCandidates("tvarkiau dokumentus")).toHaveLength(0);
    expect(extractAmbiguousCandidates("")).toHaveLength(0);
  });
});

describe("stage 3 — claim extractor (AI-tools-assisted work is inferable)", () => {
  it("the incident text yields the AI-tools capability, unambiguous", () => {
    const claims = extractProfileSkillClaims(INCIDENT_TEXT);
    const ai = claims.find((c) => c.label === AI_TOOLS_LABEL);
    expect(ai).toBeDefined();
    expect(ai?.ambiguous).not.toBe(true);
  });

  it("each unambiguous tool mention triggers it", () => {
    for (const text of [
      "dirbau su chatgpt",
      "naudojau claude code",
      "rašiau su copilot",
    ]) {
      expect(
        extractProfileSkillClaims(text).some((c) => c.label === AI_TOOLS_LABEL),
        text,
      ).toBe(true);
    }
  });
});

// ── stage 4 — full pipeline: ≥3 direct signals + ≥1 inferred candidate reach
//    the RESULT (lists, not counts; nothing silently dropped) ───────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/journal/skill-source-apply", () => ({
  applyWorkerSkillSourceReconcile: vi.fn(async () => {}),
}));

type Call = { method: string; args: unknown[] };
let writePayloads: { table: string; rows: unknown }[] = [];

const SKILL_ROWS = [
  { id: "s-prog", slug: "programming", is_active: true },
  { id: "s-wash", slug: "vehicle-cleaning", is_active: true },
  { id: "s-clean", slug: "cleaning-services", is_active: true },
];

function makeSupabase(user: { id: string } | null) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from(table: string) {
      const calls: Call[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const m of ["select", "eq", "in", "order", "limit", "maybeSingle", "single", "update"]) {
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
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const wrote = calls.some((c) => c.method === "insert" || c.method === "upsert");
        let data: unknown = null;
        switch (table) {
          case "workers":
            data = { id: "w1" };
            break;
          case "journal_entries":
            data = { id: "e1", worker_id: "w1" };
            break;
          case "skills": {
            // Return only the rows the pipeline asked for (the .in(slugs) arg).
            const inCall = calls.find((c) => c.method === "in");
            const asked = (inCall?.args?.[1] as string[]) ?? [];
            data = SKILL_ROWS.filter((r) => asked.includes(r.slug));
            break;
          }
          case "worker_skills":
            data = wrote ? null : []; // worker owns nothing yet
            break;
          case "journal_entry_skills":
            data = wrote ? null : [];
            break;
          case "profile_skill_claims":
            data = [];
            break;
          case "journal_entry_metrics":
            data = wrote ? null : [];
            break;
          default:
            data = null;
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
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

beforeEach(() => {
  writePayloads = [];
  currentSupabase = makeSupabase({ id: "user-1" });
});

describe("stage 4 — pipeline result carries EVERY incident signal", () => {
  it("added ⊇ 2 taxonomy skills; candidates carry ambiguous + claim; nothing dropped", async () => {
    const result = await processJournalEntrySkills({
      entryId: "e1",
      text: INCIDENT_TEXT,
      locale: "lt",
      revalidate: false,
    });

    expect(result.status).toBe("completed");

    // Direct taxonomy skills auto-added (strong recognitions, undeclared).
    const addedSlugs = result.addedSkills.map((s) => s.slug);
    expect(addedSlugs).toContain("programming");
    expect(addedSlugs).toContain("vehicle-cleaning");
    expect(result.added).toBeGreaterThanOrEqual(2);

    // The ambiguous house phrase is a confirmable candidate — never auto-added.
    const ambiguous = result.candidates.filter((c) => c.kind === "ambiguous");
    expect(ambiguous).toMatchObject([
      {
        kind: "ambiguous",
        label: "Namų tvarkymas / valymas",
        slug: "cleaning-services",
        reason: "»tvarkiau namus« gali reikšti valymą arba remontą",
        // v2: the candidate carries its curated choices + fragment provenance.
        choices: [
          { slug: "cleaning-services", label: "Namų valymas" },
          { slug: "appliance-repair", label: "Namų remontas / priežiūra" },
        ],
      },
    ]);
    expect(ambiguous[0].fragmentIds?.length).toBeGreaterThan(0);

    // v2 coverage invariant on the incident text: 3 meaningful fragments,
    // all covered, zero unresolved, ZERO silent loss.
    expect(result.recognition.coverage).toEqual({
      fragmentCount: 3,
      meaningfulFragmentCount: 3,
      coveredFragmentCount: 3,
      unresolvedFragmentCount: 0,
      silentlyLostFragmentCount: 0,
    });

    // The inferred AI-tools capability landed as a claim candidate.
    const claims = result.candidates.filter((c) => c.kind === "claim");
    expect(claims.some((c) => c.label === AI_TOOLS_LABEL)).toBe(true);

    // TOTAL: ≥3 direct-skill signals + ≥1 inferred candidate reach the result.
    const totalSignals =
      result.addedSkills.length +
      result.strengthenedSkills.length +
      result.candidates.length;
    expect(totalSignals).toBeGreaterThanOrEqual(4);

    // Nothing silently dropped: no rejections in the incident run.
    expect(result.rejected).toEqual([]);

    // Honesty: cleaning-services was NEVER written to worker_skills; every
    // worker_skills payload is verified:false + self_declared + yellow.
    const skillWrites = writePayloads.filter((w) => w.table === "worker_skills");
    const writtenIds = skillWrites.flatMap((w) =>
      (w.rows as { skill_id: string }[]).map((r) => r.skill_id),
    );
    expect(writtenIds).not.toContain("s-clean");
    for (const w of skillWrites) {
      for (const row of w.rows as Record<string, unknown>[]) {
        expect(row.verified).toBe(false);
        expect(row.source).toBe("self_declared");
        expect(row.confidence_bin).toBe("yellow");
      }
    }

    // The ambiguity went through the EXISTING clarification lane.
    const clar = writePayloads.find(
      (w) => w.table === "skill_candidate_clarifications",
    );
    expect(clar).toBeDefined();
  });
});
