import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P0-A (Codex review on #2895): a correction that keeps the WORDS keeps the
 * language they were recorded in. `supersedeJournalEntry` — the ONE web /
 * MCP correction write — labelled the stored text with the request locale,
 * so a Russian entry corrected (day or site only) from an English screen or
 * an English assistant read as English in the export and recognition.
 */

const h = vi.hoisted(() => ({
  old: { id: "old-1", superseded_by: null, deleted_at: null, original_text: "Клал плитку 6 часов", original_language: "ru" },
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: h.old, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [{ slug: "minutes" }], error: null });
      return chain;
    },
    rpc: (fn: string, params: Record<string, unknown>) => h.rpc(fn, params),
  }),
}));
vi.mock("@/lib/journal/entry-skill-retraction", () => ({ recordEntrySkillDecision: async () => true }));
vi.mock("@/lib/journal/journal-write-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/journal/journal-write-core")>()),
  runSkillPipeline: async () => ({ status: "completed" }),
}));

import { supersedeJournalEntry } from "./actions";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: "new-1", error: null });
});

describe("a correction keeps the language of unchanged words", () => {
  const base = { engagement_context_id: "ctx-1", work_date: "2026-10-28" };

  it("same words corrected from an English screen stay Russian", async () => {
    const r = await supersedeJournalEntry("old-1", form({ ...base, locale: "en", notes: "Клал плитку 6 часов" }));
    expect(r.ok).toBe(true);
    expect(h.rpc.mock.calls[0]![1]).toMatchObject({ p_original_language: "ru", p_original_text: "Клал плитку 6 часов" });
  });

  it("new words take the request locale (no other signal for them)", async () => {
    await supersedeJournalEntry("old-1", form({ ...base, locale: "en", notes: "Laid tiles 4 hours" }));
    expect(h.rpc.mock.calls[0]![1]).toMatchObject({ p_original_language: "en" });
  });

  it("the clock span and the quantity provenance ride the correction", async () => {
    await supersedeJournalEntry(
      "old-1",
      form({
        ...base,
        locale: "ru",
        notes: "Клал плитку 6 часов",
        quantity: "480",
        unit_slug: "minutes",
        quantity_source: "ai_extracted",
        work_start: "22:00",
        work_end: "06:00",
        break_minutes: "0",
        work_time_source: "ai_extracted",
      }),
    );
    const metrics = h.rpc.mock.calls[0]![1].p_metrics as { metric_slug: string; source: string }[];
    const src = (slug: string) => metrics.find((m) => m.metric_slug === slug)?.source;
    expect(src("quantity")).toBe("ai_extracted");
    expect(src("work_start")).toBe("ai_extracted");
    expect(src("work_end")).toBe("ai_extracted");
    expect(src("break_minutes")).toBe("ai_extracted");
  });
});
