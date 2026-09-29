import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * Walked on production 2026-09-29 as a worker in their own space: "Kas laukia
 * vadovo patvirtinimo?" → generic fallback (it routes to the manager's
 * confirm-work queue); "Kas dar nepatvirtinta?" scored 0. Both now reach the
 * person's own confirmed-vs-recorded read.
 */
describe("a worker asking what awaits confirmation", () => {
  it("routes the unconfirmed question to the confirmed-work read", () => {
    expect(classifyIntent("Kas dar nepatvirtinta?").intent).toBe("journal-confirmed");
    expect(classifyIntent("What is not confirmed yet?").intent).toBe("journal-confirmed");
    expect(classifyIntent("Kas patvirtinta?").intent).toBe("journal-confirmed");
  }, 20_000);

  it("confirm-work answers a person from their own entries, a company from its queue", () => {
    const chat = readFileSync(join(__dirname, "..", "..", "components/app/conversation/chat/conversation-chat.tsx"), "utf8");
    const h = chat.slice(chat.indexOf("confirmWork: () => {"), chat.indexOf("moveWorker: () =>"));
    expect(h).toMatch(/if \(identity === "company"\) return startConfirmWork\(text\);/);
    expect(h).toMatch(/runWorkIntelligenceQuestion\(text, "journal-confirmed"\)/);
  });
});
