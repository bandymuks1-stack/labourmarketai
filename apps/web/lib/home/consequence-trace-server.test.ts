import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Authorization + scope of the consequence trace loader, pinned on the
 * source (the readers it composes are each tested on their own).
 *
 * The trace is the person's OWN chain: it may only read through the
 * caller's session, never through a privileged client, never for an
 * identity passed in, and it never writes.
 */
const src = readFileSync(path.join(__dirname, "consequence-trace-server.ts"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("consequence trace loader — authorization and scope", () => {
  it("reads only through the caller's own session client", () => {
    expect(code).toContain('from "@/lib/supabase/server"');
    expect(code).not.toMatch(/createAdminClient|service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|supabase\/admin/i);
  });

  it("takes no identity argument — another person's trace has no door", () => {
    expect(code).toMatch(/loadConsequenceTrace = cache\(async \(\): Promise<ConsequenceTrace>/);
  });

  it("never writes", () => {
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(/);
  });

  it("bounds the journal read and reuses the canonical readers", () => {
    expect(code).toContain("listJournalEntries(caller, { workerId, limit: TRACE_ENTRY_WINDOW })");
    expect(code).toContain("readConfirmedWorkBySkill(");
    expect(code).toContain("readEntrySkillSlugs(");
    expect(code).toContain("loadHomeEvents()");
  });

  it("a thrown read degrades to UNKNOWN (null entries), never to an empty journal", () => {
    expect(code).toMatch(/catch \{\s*entries = null;\s*\}/);
  });
});
