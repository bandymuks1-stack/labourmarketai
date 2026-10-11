import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Decision 0024 — one memory and context architecture. These are the parts
 * implemented today; each later change must keep them (see the decision).
 */
const ROOT = resolve(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("decision 0024: memory and context", () => {
  it("is recorded and cross-linked from the agent contract", () => {
    expect(existsSync(resolve(ROOT, "docs/DECISIONS/0024-memory-and-context-architecture.md"))).toBe(true);
    expect(read("CLAUDE.md")).toContain("0024-memory-and-context-architecture.md");
  });

  it("a chat thread belongs to ONE workspace — no cross-organization restore", () => {
    const sql = read("docs/proposals/assistant-transcript-v1/20260724_assistant_transcript_v1.sql");
    expect(sql).toMatch(/organization_id uuid references public\.organizations\(id\)/);
    const t = read("apps/web/lib/assistant/transcript.ts");
    expect(t).toMatch(/scoped\.eq\("organization_id", workspaceId\) : scoped\.is\("organization_id", null\)/);
    expect(t).toMatch(/insert\(\{ owner_id: user\.id, organization_id: await threadWorkspaceId\(\) \}\)/);
    // the workspace is resolved server-side, never taken from the client
    expect(t).toContain("getWorkspaceContext()");
  });

  it("no second memory store: no vector extension or embedding column in migrations", () => {
    const dir = resolve(ROOT, "supabase/migrations");
    for (const f of readdirSync(dir)) {
      const s = readFileSync(resolve(dir, f), "utf8");
      expect(s, f).not.toMatch(/create\s+extension[^;]*\bvector\b/i);
      expect(s, f).not.toMatch(/\bvector\(\d+\)/i);
    }
  });
});
