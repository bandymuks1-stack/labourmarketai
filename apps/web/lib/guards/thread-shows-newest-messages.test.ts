import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** A thread past 500 messages never showed its newest ones (ordered oldest
 *  first with the limit). The page reads the NEWEST 500 and shows them in
 *  time order (audit 2026-10-20). */
const page = readFileSync(
  resolve(__dirname, "..", "..", "app", "[locale]", "dashboard", "communication", "[conversationId]", "page.tsx"),
  "utf8",
);

describe("a long thread shows its newest messages", () => {
  it("reads newest first with a stable tie-breaker, then reverses for display", () => {
    expect(page).toMatch(/\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)\s*\.limit\(500\)/);
    expect(page).toMatch(/\[\.\.\.\(messagesRes\.data \?\? \[\]\)\]\.reverse\(\)/);
  });
});
