import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Universal Journal Recall — SERVER TRUST BOUNDARY tests.
 *
 * The actions must re-derive recognition from the STORED entry text and
 * verify every submitted candidate by membership + pipeline version. These
 * tests run the REAL fragmenter/derivation/lexicons (no recognition mocks)
 * against a mocked supabase, so the trust checks are exercised end-to-end:
 *   • arbitrary active-slug injection → candidate_not_found + ZERO writes;
 *   • a candidate that exists on ANOTHER entry → candidate_not_found;
 *   • another worker's entry → entry_not_found;
 *   • stale pipelineVersion → candidate_not_found;
 *   • altered kind/label → candidate_not_found;
 *   • claim rejections are ENTRY-scoped (A's marker never hides B's claim);
 *   • no write payload ever carries verified:true / manager_confirmed.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "lt"),
  getTranslations: vi.fn(async () => (slug: string) => slug),
}));
const reconcileMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/journal/skill-source-apply", () => ({
  applyWorkerSkillSourceReconcile: (...args: unknown[]) =>
    reconcileMock(...args),
}));

// ── Mock supabase with a tiny per-entry world ──────────────────────────────
type Call = { method: string; args: unknown[] };
let writePayloads: { table: string; rows: unknown }[] = [];
let deletes: { table: string; calls: Call[] }[] = [];

/** World state the handler serves. */
const WORLD = {
  userId: "user-1",
  workerId: "w1",
  entries: new Map<
    string,
    { worker_id: string; original_text: string; deleted_at?: string | null; superseded_by?: string | null }
  >(),
  /** journal_entry_metrics rows per entry. */
  metrics: new Map<
    string,
    { metric_slug: string; value_text?: string | null; value_numeric?: number | null }[]
  >(),
  skills: [
    { id: "s-tiling", slug: "tiling", is_active: true },
    { id: "s-clean", slug: "cleaning-services", is_active: true },
    { id: "s-repair", slug: "appliance-repair", is_active: true },
    { id: "s-prog", slug: "programming", is_active: true },
  ],
};

function makeSupabase() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: WORLD.userId } } })) },
    from(table: string) {
      const calls: Call[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const m of ["select", "eq", "in", "order", "limit", "maybeSingle", "single"]) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ method: m, args });
          return builder;
        };
      }
      builder.delete = (...args: unknown[]) => {
        calls.push({ method: "delete", args });
        deletes.push({ table, calls });
        return builder;
      };
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
        const eqArg = (col: string) =>
          calls.find((c) => c.method === "eq" && c.args[0] === col)?.args[1];
        const wrote = calls.some(
          (c) => c.method === "insert" || c.method === "upsert",
        );
        let data: unknown = null;
        switch (table) {
          case "workers":
            data = { id: WORLD.workerId };
            break;
          case "journal_entries": {
            const id = eqArg("id") as string;
            const e = WORLD.entries.get(id);
            data = e
              ? {
                  id,
                  worker_id: e.worker_id,
                  original_text: e.original_text,
                  deleted_at: e.deleted_at ?? null,
                  superseded_by: e.superseded_by ?? null,
                }
              : null;
            break;
          }
          case "journal_entry_metrics": {
            if (wrote) {
              data = null;
              break;
            }
            const id = eqArg("entry_id") as string;
            data = WORLD.metrics.get(id) ?? [];
            break;
          }
          case "worker_skills":
            data = wrote ? null : calls.some((c) => c.method === "maybeSingle") ? null : [];
            break;
          case "skills": {
            const slug = eqArg("slug") as string | undefined;
            data = slug
              ? (WORLD.skills.find((s) => s.slug === slug) ?? null)
              : WORLD.skills;
            break;
          }
          default:
            data = wrote ? null : [];
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

import {
  confirmJournalSkillCandidate,
  confirmJournalAmbiguousChoice,
  rejectJournalSkillCandidate,
  rejectJournalAmbiguousCandidate,
  rejectJournalClaimCandidate,
  nameUnresolvedFragment,
  dismissUnresolvedFragment,
} from "@/lib/journal/skill-pipeline-actions";
import { JOURNAL_PIPELINE_VERSION } from "@/lib/journal/journal-recognition";

const V = JOURNAL_PIPELINE_VERSION;

beforeEach(() => {
  writePayloads = [];
  deletes = [];
  reconcileMock.mockClear();
  WORLD.entries.clear();
  WORLD.metrics.clear();
  // Entry A: the incident text (ambiguous + claim + recognitions).
  WORLD.entries.set("e-A", {
    worker_id: "w1",
    original_text:
      "Ploviau mašiną - 1 h. Kodavau programą su chat gpt ir claude code - 6h, tvarkiau namus - 2h",
  });
  // Entry B: same claim-bearing text, no rejection markers.
  WORLD.entries.set("e-B", {
    worker_id: "w1",
    original_text: "Kodavau programą su chat gpt",
  });
  // Entry C: unresolved-only text.
  WORLD.entries.set("e-C", {
    worker_id: "w1",
    original_text: "Žaidžiau šachmatais turnyre",
  });
  // Entry X: someone else's entry.
  WORLD.entries.set("e-X", {
    worker_id: "SOMEONE-ELSE",
    original_text: "Klijavau plyteles",
  });
  currentSupabase = makeSupabase();
});

const signalWrites = () =>
  writePayloads.filter((w) =>
    ["worker_skills", "journal_entry_skills"].includes(w.table),
  );

describe("trust boundary — membership + version", () => {
  it("arbitrary ACTIVE slug injection → candidate_not_found, zero writes", async () => {
    // `tiling` is real + active, but the derivation of e-A never produced it
    // as a fuzzy candidate — the server must refuse it.
    const res = await confirmJournalSkillCandidate("e-A", "tiling", V);
    expect(res).toEqual({ ok: false, code: "candidate_not_found" });
    expect(writePayloads).toHaveLength(0);
  });

  it("a candidate from ANOTHER entry is refused on this one", async () => {
    // e-A derives the ambiguous 'Namų tvarkymas / valymas'; e-B does not.
    const res = await confirmJournalAmbiguousChoice(
      "e-B",
      "Namų tvarkymas / valymas",
      "cleaning-services",
      V,
    );
    expect(res).toEqual({ ok: false, code: "candidate_not_found" });
    expect(writePayloads).toHaveLength(0);
  });

  it("another worker's entry → entry_not_found, zero writes", async () => {
    const res = await confirmJournalAmbiguousChoice(
      "e-X",
      "whatever",
      "tiling",
      V,
    );
    expect(res).toEqual({ ok: false, code: "entry_not_found" });
    expect(writePayloads).toHaveLength(0);
  });

  it("stale pipelineVersion → candidate_not_found, zero writes (all actions)", async () => {
    const stale = V - 1;
    expect(
      await confirmJournalSkillCandidate("e-A", "programming", stale),
    ).toEqual({ ok: false, code: "candidate_not_found" });
    expect(
      await confirmJournalAmbiguousChoice(
        "e-A",
        "Namų tvarkymas / valymas",
        "cleaning-services",
        stale,
      ),
    ).toEqual({ ok: false, code: "candidate_not_found" });
    expect(
      await rejectJournalClaimCandidate(
        "e-A",
        "Darbas su AI įrankiais (ChatGPT / Claude)",
        stale,
      ),
    ).toEqual({ ok: false, code: "candidate_not_found" });
    expect(
      await dismissUnresolvedFragment("e-C", "zaidziau sachmatais turnyre", stale),
    ).toEqual({ ok: false, code: "candidate_not_found" });
    expect(
      await nameUnresolvedFragment(
        "e-C",
        "zaidziau sachmatais turnyre",
        { type: "skill", slug: "tiling" },
        stale,
      ),
    ).toEqual({ ok: false, code: "candidate_not_found" });
    expect(writePayloads).toHaveLength(0);
  });

  it("altered label/kind is refused (claim label not derived on the entry)", async () => {
    const res = await rejectJournalClaimCandidate("e-A", "Fake Label", V);
    expect(res).toEqual({ ok: false, code: "candidate_not_found" });
    expect(writePayloads).toHaveLength(0);
  });

  it("ambiguous choice must be one of the candidate's CHOICES", async () => {
    // programming is active but NOT a curated choice of the ambiguity.
    const res = await confirmJournalAmbiguousChoice(
      "e-A",
      "Namų tvarkymas / valymas",
      "programming",
      V,
    );
    expect(res).toEqual({ ok: false, code: "candidate_not_found" });
    expect(writePayloads).toHaveLength(0);
  });
});

describe("legitimate flows — honest writes only", () => {
  it("valid ambiguous choice adds the skill honestly + links + closes the clarification", async () => {
    const res = await confirmJournalAmbiguousChoice(
      "e-A",
      "Namų tvarkymas / valymas",
      "appliance-repair",
      V,
    );
    expect(res).toEqual({ ok: true, added: true });
    const skillWrite = writePayloads.find((w) => w.table === "worker_skills");
    expect(skillWrite?.rows).toEqual([
      {
        worker_id: "w1",
        skill_id: "s-repair",
        verified: false,
        source: "self_declared",
        confidence_bin: "yellow",
      },
    ]);
    const linkWrite = writePayloads.find(
      (w) => w.table === "journal_entry_skills",
    );
    // PR-C: a worker-confirmed candidate stamps provenance 'confirmed'.
    expect(linkWrite?.rows).toEqual([
      {
        journal_entry_id: "e-A",
        worker_id: "w1",
        skill_id: "s-repair",
        provenance: "confirmed",
      },
    ]);
    expect(
      deletes.some((d) => d.table === "skill_candidate_clarifications"),
    ).toBe(true);
    expect(reconcileMock).toHaveBeenCalled();
  });

  it("valid claim rejection appends the ENTRY-scoped marker", async () => {
    const res = await rejectJournalClaimCandidate(
      "e-A",
      "Darbas su AI įrankiais (ChatGPT / Claude)",
      V,
    );
    expect(res).toEqual({ ok: true });
    const marker = writePayloads.find(
      (w) => w.table === "journal_entry_metrics",
    );
    expect(marker?.rows).toMatchObject([
      {
        entry_id: "e-A",
        metric_slug: "skill_claim_rejected",
        source: "worker_input",
      },
    ]);
  });

  it("valid skill rejection of a RECOGNISED slug appends skill_rejected", async () => {
    const res = await rejectJournalSkillCandidate("e-A", "programming", V);
    expect(res).toEqual({ ok: true });
    expect(
      writePayloads.find((w) => w.table === "journal_entry_metrics")?.rows,
    ).toMatchObject([
      { entry_id: "e-A", metric_slug: "skill_rejected", value_text: "programming" },
    ]);
  });

  it("valid ambiguous outright-rejection appends the marker + closes the clarification", async () => {
    const res = await rejectJournalAmbiguousCandidate(
      "e-A",
      "Namų tvarkymas / valymas",
      V,
    );
    expect(res).toEqual({ ok: true });
    expect(
      writePayloads.find((w) => w.table === "journal_entry_metrics")?.rows,
    ).toMatchObject([{ metric_slug: "skill_claim_rejected" }]);
    expect(
      deletes.some((d) => d.table === "skill_candidate_clarifications"),
    ).toBe(true);
  });

  it("naming an unresolved fragment as a taxonomy skill validates active + membership", async () => {
    const res = await nameUnresolvedFragment(
      "e-C",
      "zaidziau sachmatais turnyre",
      { type: "skill", slug: "tiling" },
      V,
    );
    expect(res).toEqual({ ok: true, added: true });
    expect(signalWrites().length).toBeGreaterThan(0);
    // resolution marker so reprocess stops re-inserting the unresolved row
    expect(
      writePayloads
        .filter((w) => w.table === "journal_entry_metrics")
        .flatMap((w) => w.rows as { metric_slug: string }[])
        .map((r) => r.metric_slug),
    ).toContain("unresolved_dismissed");
  });

  it("naming an unresolved fragment as a CLAIM caps the label at 120 chars", async () => {
    const long = "x".repeat(121);
    const res = await nameUnresolvedFragment(
      "e-C",
      "zaidziau sachmatais turnyre",
      { type: "claim", label: long },
      V,
    );
    expect(res).toEqual({ ok: false, code: "candidate_not_found" });
    expect(writePayloads).toHaveLength(0);

    const ok = await nameUnresolvedFragment(
      "e-C",
      "zaidziau sachmatais turnyre",
      { type: "claim", label: "Šachmatų treniravimas" },
      V,
    );
    expect(ok).toEqual({ ok: true, added: true });
    expect(
      writePayloads.some((w) => w.table === "profile_skill_claims"),
    ).toBe(true);
    // provenance skill_claim metric on the ENTRY
    expect(
      writePayloads
        .filter((w) => w.table === "journal_entry_metrics")
        .flatMap((w) => w.rows as { metric_slug: string }[])
        .map((r) => r.metric_slug),
    ).toContain("skill_claim");
  });

  it("naming a fragment that is NOT unresolved on this entry is refused", async () => {
    const res = await nameUnresolvedFragment(
      "e-A",
      "zaidziau sachmatais turnyre",
      { type: "skill", slug: "tiling" },
      V,
    );
    expect(res).toEqual({ ok: false, code: "candidate_not_found" });
    expect(writePayloads).toHaveLength(0);
  });
});

describe("entry-scoped rejection isolation", () => {
  it("a claim label rejected on entry A still surfaces from entry B", async () => {
    // Entry A carries the rejection marker for the AI-tools claim.
    WORLD.metrics.set("e-A", [
      {
        metric_slug: "skill_claim_rejected",
        value_text: "Darbas su AI įrankiais (ChatGPT / Claude)",
      },
    ]);
    // On entry A the claim is no longer a members claim → reject again refuses
    // (it is already rejected → not in claims list) …
    const again = await rejectJournalClaimCandidate(
      "e-A",
      "Darbas su AI įrankiais (ChatGPT / Claude)",
      V,
    );
    expect(again).toEqual({ ok: false, code: "candidate_not_found" });
    // …but on entry B the SAME label is still a live claim (entry-scoped!).
    const onB = await rejectJournalClaimCandidate(
      "e-B",
      "Darbas su AI įrankiais (ChatGPT / Claude)",
      V,
    );
    expect(onB).toEqual({ ok: true });
  });
});

describe("HARD RULE — no fake verification anywhere", () => {
  it("no write payload ever carries verified:true or manager_confirmed", async () => {
    await confirmJournalAmbiguousChoice(
      "e-A",
      "Namų tvarkymas / valymas",
      "cleaning-services",
      V,
    );
    await nameUnresolvedFragment(
      "e-C",
      "zaidziau sachmatais turnyre",
      { type: "skill", slug: "tiling" },
      V,
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
