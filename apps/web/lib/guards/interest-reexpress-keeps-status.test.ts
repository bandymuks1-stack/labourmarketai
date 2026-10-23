import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAYING "I'M INTERESTED" AGAIN NEVER UNDOES THE COMPANY'S ANSWER
 * (audit 2026-10-20). The chat and MCP paths re-express freely; the old
 * unconditional upsert reset status to 'interested' and the note to null on a
 * row the company had marked reviewed / contacted.
 */
const src = readFileSync(resolve(__dirname, "..", "opportunities", "interest.ts"), "utf8");

describe("re-expressing interest keeps a standing row's status and note", () => {
  it("reads the worker's own row first", () => {
    expect(src).toMatch(/\.select\("id, status"\)\s*\.eq\("worker_id", ctx\.workerId\)\s*\.eq\("request_id", input\.requestId\)/);
  });
  it("a standing row (not withdrawn) is updated WITHOUT status, and keeps its note unless a new one is given", () => {
    expect(src).toMatch(/existing\.status !== "withdrawn"/);
    const update = src.slice(src.indexOf("? await asAny(supabase)"), src.indexOf(": await asAny(supabase)"));
    expect(update).toMatch(/\.update\(\{\s*match_snapshot: snapshot,\s*\.\.\.\(note \? \{ note \} : \{\}\),/);
    expect(update).not.toMatch(/status:/);
  });
  it("only a missing or withdrawn row is (re)opened as interested", () => {
    const open = src.slice(src.indexOf(": await asAny(supabase)"));
    expect(open).toMatch(/\.upsert\(\s*\{[\s\S]*?status: "interested"/);
  });
});
