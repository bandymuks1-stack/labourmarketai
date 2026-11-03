import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ENTRY_SKILL_SLUGS_MAX_ENTRIES, readEntrySkillSlugs } from "./entry-skill-link-read";

function fakeClient(result: { data?: unknown; error?: unknown }, seen: { ids?: string[] } = {}) {
  return {
    from: (table: string) => {
      expect(table).toBe("journal_entry_skills");
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => {
            seen.ids = ids;
            return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
          },
        }),
      };
    },
  };
}

describe("readEntrySkillSlugs — bounded, honest", () => {
  it("groups slugs per entry, de-duplicated; entries without a link are absent", async () => {
    const out = await readEntrySkillSlugs(
      fakeClient({
        data: [
          { journal_entry_id: "e1", skills: { slug: "a" } },
          { journal_entry_id: "e1", skills: { slug: "a" } },
          { journal_entry_id: "e1", skills: { slug: "b" } },
          { journal_entry_id: "e2", skills: null },
        ],
      }),
      ["e1", "e2", "e3"],
    );
    expect(out).toEqual(new Map([["e1", ["a", "b"]]]));
  });

  it("a failed read is null (UNKNOWN), never an empty map", async () => {
    expect(await readEntrySkillSlugs(fakeClient({ error: { code: "42501" } }), ["e1"])).toBeNull();
  });

  it("no ids → an empty map without a query; the id list is capped", async () => {
    expect(await readEntrySkillSlugs({ from: () => { throw new Error("no query expected"); } }, [])).toEqual(new Map());
    const seen: { ids?: string[] } = {};
    const many = Array.from({ length: ENTRY_SKILL_SLUGS_MAX_ENTRIES + 20 }, (_, i) => `e${i}`);
    await readEntrySkillSlugs(fakeClient({ data: [] }, seen), many);
    expect(seen.ids).toHaveLength(ENTRY_SKILL_SLUGS_MAX_ENTRIES);
  });
});
