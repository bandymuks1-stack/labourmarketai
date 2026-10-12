import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Production walk 2026-10-12 (chat continuity): turns typed before the thread
 * finished loading were never persisted, and a question and its answer
 * appended concurrently before the first conversation existed could open two
 * threads. Every transcript write now runs on ONE chain that starts with the
 * load and serialises appends.
 */
const chat = readFileSync(
  join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"),
  "utf8",
);

describe("chat transcript writes are ordered", () => {
  it("the chain starts with the thread load", () => {
    expect(chat).toMatch(/const loading = loadAssistantThread\(\);\s*transcriptRef\.current\.chain = loading\.then\(/);
  });
  it("each append waits for the previous one and reuses the thread it created", () => {
    expect(chat).toMatch(/tr\.chain = tr\.chain\s*\.then\(async \(\) => \{\s*if \(!tr\.enabled\) return;\s*const res = await appendAssistantTurn\(/);
    expect(chat).toMatch(/if \(res\.available\) tr\.conversationId = res\.conversationId;/);
  });
  it("a design preview never writes", () => {
    expect(chat).toMatch(/if \(script \|\| !text\.trim\(\)\) return;/);
  });
});
