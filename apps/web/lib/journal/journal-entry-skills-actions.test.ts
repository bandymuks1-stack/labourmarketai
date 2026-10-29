import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un-ticking a linked skill is a DISPUTE: it is recorded first, and the
 * evidence link is removed only after the record exists. A failed record must
 * leave every link in place so the same save stays retryable (Codex review on
 * #2885: deleting first made a failed dispute silently unrepeatable).
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));
vi.mock("@/lib/journal/skill-source-apply", () => ({
  applyWorkerSkillSourceReconcile: vi.fn(async () => true),
}));
const retract = vi.fn();
const decide = vi.fn(async (..._a: unknown[]) => true);
vi.mock("@/lib/journal/entry-skill-retraction", () => ({
  retractEntrySkillEvidence: (...a: unknown[]) => retract(...a),
  recordEntrySkillDecision: (...a: unknown[]) => decide(...a),
}));

let calls: string[] = [];
const LINKED = ["s-tiling", "s-flooring"];

function client() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from(table: string) {
      let op = "select";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq: () => q,
        in: () => q,
        maybeSingle: () => q,
        delete: () => {
          op = "delete";
          return q;
        },
        insert: () => {
          op = "insert";
          return q;
        },
        then(resolve: (v: unknown) => void) {
          calls.push(`${op}:${table}`);
          let data: unknown = [];
          if (table === "workers") data = { id: "w1" };
          if (table === "journal_entries") data = { id: "e1", worker_id: "w1" };
          if (table === "worker_skills") data = [...LINKED, "s-mosaic"].map((skill_id) => ({ skill_id }));
          if (table === "journal_entry_skills" && op === "select") data = LINKED.map((skill_id) => ({ skill_id }));
          if (table === "skills") data = [{ id: "s-mosaic", slug: "mosaic-tiling" }];
          resolve({ data, error: null });
        },
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));

import { setJournalEntrySkillLinks } from "./journal-entry-skills-actions";

beforeEach(() => {
  calls = [];
  retract.mockReset();
  decide.mockReset();
  decide.mockImplementation(async () => {
    calls.push("reaffirm-recorded");
    return true;
  });
});

describe("setJournalEntrySkillLinks — a removed link is a recorded dispute", () => {
  it("records the dispute BEFORE removing any link", async () => {
    retract.mockImplementation(async () => {
      calls.push("dispute-recorded");
      return { ok: true, markedSlugs: ["flooring"] };
    });
    const res = await setJournalEntrySkillLinks("e1", ["s-tiling"]);
    expect(res).toMatchObject({ ok: true });
    expect(retract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entryId: "e1", workerId: "w1", skillIds: ["s-flooring"], deleteLinks: false }),
    );
    const recordedAt = calls.indexOf("dispute-recorded");
    const deletedAt = calls.indexOf("delete:journal_entry_skills");
    expect(recordedAt).toBeGreaterThanOrEqual(0);
    expect(deletedAt).toBeGreaterThan(recordedAt);
  });

  it("a failed record removes NOTHING, so the same save can be retried", async () => {
    retract.mockResolvedValue({ ok: false, markedSlugs: [] });
    const res = await setJournalEntrySkillLinks("e1", ["s-tiling"]);
    expect(res).toMatchObject({ ok: false, code: "link_write_failed", message: "dispute_not_recorded" });
    expect(calls).not.toContain("delete:journal_entry_skills");
    expect(calls).not.toContain("insert:journal_entry_skills");
  });

  it("a partially recorded dispute also removes nothing", async () => {
    retract.mockResolvedValue({ ok: true, markedSlugs: [] });
    const res = await setJournalEntrySkillLinks("e1", ["s-tiling"]);
    expect(res).toMatchObject({ ok: false });
    expect(calls).not.toContain("delete:journal_entry_skills");
  });

  it("an explicit RE-LINK records the person's superseding decision before the link is written", async () => {
    const res = await setJournalEntrySkillLinks("e1", [...LINKED, "s-mosaic"]);
    expect(res).toMatchObject({ ok: true });
    expect(decide).toHaveBeenCalledWith(expect.anything(), "e1", "mosaic-tiling", "reaffirmed");
    expect(calls.indexOf("reaffirm-recorded")).toBeLessThan(calls.indexOf("insert:journal_entry_skills"));
  });

  it("a failed superseding decision writes no link", async () => {
    decide.mockResolvedValue(false);
    const res = await setJournalEntrySkillLinks("e1", [...LINKED, "s-mosaic"]);
    expect(res).toMatchObject({ ok: false, message: "decision_not_recorded" });
    expect(calls).not.toContain("delete:journal_entry_skills");
    expect(calls).not.toContain("insert:journal_entry_skills");
  });

  it("adding links only records no dispute", async () => {
    const res = await setJournalEntrySkillLinks("e1", LINKED);
    expect(res).toMatchObject({ ok: true });
    expect(retract).not.toHaveBeenCalled();
  });
});
