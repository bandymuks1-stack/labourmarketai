import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getCoreNavItems, CANONICAL_HOME } from "@/lib/config/navigation";

/**
 * "My space" wears the assistant's mark (owner P0 2026-11-23: the AI assistant
 * clearly visible and reachable; CAROUSEL_NAVIGATION_SPEC OD-2 (a), step N3).
 * The conversation home IS the assistant, so the one header's item that leads
 * there carries the mark every assistant turn shows — no seventh control (the
 * phone header has 6 px to spare at 320 px).
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("My space carries the assistant mark", () => {
  it("the core item that leads to the conversation home uses the assistant icon key", () => {
    const home = getCoreNavItems().find((i) => i.href === CANONICAL_HOME);
    expect(home, "a core item leads to the conversation home").toBeDefined();
    expect(home!.iconKey).toBe("assistant");
  });

  it("the assistant icon key renders the assistant's own mark, not a second drawing", () => {
    expect(read("components/app/nav-icons.ts")).toMatch(/assistant: AssistantNavIcon,/);
    const icon = read("components/app/assistant-nav-icon.tsx");
    expect(icon).toMatch(/<AssistantMark size="sm"/);
    expect(icon).not.toMatch(/<svg|<img/);
  });

  it("the header renders every nav icon through NAV_ICONS, so all its surfaces get the mark", () => {
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header).toMatch(/NAV_ICONS\[item\.iconKey\]/);
  });
});
