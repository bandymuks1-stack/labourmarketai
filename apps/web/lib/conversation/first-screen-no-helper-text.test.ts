/**
 * THE FIRST SCREEN NAMES THE CONTEXT AND LISTS NOTHING (owner order
 * 2026-11-24, decision 0034). An organization space opened with "You are
 * acting for {company}. Here I can help with {list}." and the calendar answer
 * carried "Here I can help log work time or review offers." — helper text,
 * not an answer. The context is named ("You are acting as: …"); an answer is
 * the answer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const PAGE = readFileSync(join(WEB, "app", "[locale]", "dashboard", "page.tsx"), "utf8");
const CHAT = readFileSync(join(WEB, "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");

describe("the chat's first screen and answers carry no helper text", () => {
  it("the organization space is named, not described", () => {
    const line = PAGE.slice(PAGE.indexOf("const workspaceContextLine ="), PAGE.indexOf("const workspaceContextLine =") + 300);
    expect(line).toContain('tChat("workspaceActingAs"');
    expect(line).not.toContain("workspaceIntro");
  });

  it("the calendar answer is the plan itself, with no hint appended", () => {
    expect(CHAT).not.toContain("${res.text}\\n\\n${labels.calendarHint}");
  });

  it.each(["en", "lt", "pl", "de", "nl", "ru", "sv", "da", "et", "lv", "no"])("%s calendarHint is one sentence", (l) => {
    const hint = JSON.parse(readFileSync(join(WEB, "messages", `${l}.json`), "utf8")).conversation.chat.calendarHint as string;
    expect(hint.replace(/^\[EN\] /, "").split(/[.!?]\s/).length, hint).toBe(1);
  });
});
