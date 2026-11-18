import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const CHAT = readFileSync(
  join(WEB, "components", "app", "conversation", "chat", "conversation-chat.tsx"),
  "utf8",
);
const PAGE = readFileSync(join(WEB, "app", "[locale]", "dashboard", "page.tsx"), "utf8");

describe("a request that needed another workspace survives the switch", () => {
  it("the dashboard remounts the chat on a workspace switch (why in-memory continuation is not enough)", () => {
    expect(PAGE).toMatch(/conversationKey = `\$\{rootWorkspace\.activeWorkspaceId\}:\$\{identity\}`/);
    expect(PAGE).toMatch(/<ConversationChat\s+key=\{conversationKey\}/);
  });

  it("the sentence is handed over through session storage, one-shot, and re-run by the NEW instance only", () => {
    expect(CHAT).toContain('CONTINUE_AFTER_SWITCH_KEY = "lm.chat.continueAfterSwitch"');
    // written before the switch, bound to the target workspace
    expect(CHAT).toMatch(/setItem\(\s*CONTINUE_AFTER_SWITCH_KEY/);
    // consumed once, only by a chat born in the target workspace, with a TTL
    expect(CHAT).toMatch(/parsed\.ws !== mountedWorkspaceRef\.current/);
    expect(CHAT).toMatch(/Date\.now\(\) - parsed\.at < 120_000/);
    expect(CHAT).toMatch(/removeItem\(CONTINUE_AFTER_SWITCH_KEY\)/);
    // it goes back through the ONE router
    expect(CHAT).toMatch(/handleSend\(parsed\.say\)/);
  });

  it("the partner request is what the personal-space chips carry across", () => {
    expect(CHAT).toMatch(/performContextSwitch\(target, pendingPartnersSentenceRef\.current \|\| undefined\)/);
  });
});

describe("personal acts are not company acts", () => {
  it("cv, profile and logwork chips in a company workspace offer the personal space instead of running", () => {
    expect(CHAT).toMatch(
      /identity === "company" && \(chip\.id === "logwork" \|\| chip\.id === "cv" \|\| chip\.id === "profile"\)/,
    );
    expect(CHAT).toMatch(/t\("personalOnlyInCompany"\)/);
  });
});
