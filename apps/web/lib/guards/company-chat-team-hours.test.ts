import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * COMPANY chat walk on production 2026-09-29: "Kiek valandų komanda dirbo šią
 * savaitę?" in the Alfa workspace answered from the OWNER's personal journal.
 * The company space answers from the organization's journal report — the SAME
 * getJournalWindowReport the reports page renders.
 */
const WEB = join(__dirname, "..", "..");
const chat = readFileSync(join(WEB, "components/app/conversation/chat/conversation-chat.tsx"), "utf8");
const flow = readFileSync(join(WEB, "lib/ai-workspace/workflows.ts"), "utf8");

describe("team hours in the company space", () => {
  it("the company identity runs the organization report, the person their own", () => {
    expect(chat).toMatch(/identity === "company" \? runOrganizationJournal\(text\) : runRecentJournal\(text\)/);
  });
  it("the organization answer is the reports page's own read, with work time", () => {
    const fn = flow.slice(
      flow.indexOf("export async function runOrganizationJournal"),
      flow.indexOf("export async function runRecentJournal"),
    );
    expect(fn).toMatch(/getJournalWindowReport\(key, undefined, \{ workTime: true \}\)/);
    expect(fn).not.toMatch(/loadOwnWorkIntelligence|getPlanning/);
  });
});
