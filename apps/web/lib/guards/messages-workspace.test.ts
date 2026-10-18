import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * MESSAGES IS A WORKSPACE, EVEN WHEN EMPTY (owner production walk
 * 2026-09-28: the empty page was a big heading, an explanation, two stacked
 * CTAs and a privacy note over empty space — "not a credible communication
 * workspace").
 *
 * Pinned: the conversations column and the conversation pane are ONE frame;
 * the empty state, the load error and the list are all states INSIDE the
 * conversations column; the pane never fakes a composer.
 */
const web = join(__dirname, "..", "..");
const page = readFileSync(join(web, "app/[locale]/dashboard/communication/page.tsx"), "utf8");

const at = (needle: string) => {
  const i = page.indexOf(needle);
  expect(i, needle).toBeGreaterThan(-1);
  return i;
};

describe("the messages page is one workspace frame", () => {
  it("the workspace holds the conversations column, then the conversation pane", () => {
    const frame = at('data-testid="communication-workspace"');
    const list = at('data-testid="communication-list-pane"');
    const pane = at('data-testid="communication-thread-pane"');
    expect(frame).toBeLessThan(list);
    expect(list).toBeLessThan(pane);
  });

  it("empty, failed and listed states all live inside the conversations column", () => {
    const list = at('data-testid="communication-list-pane"');
    const pane = at('data-testid="communication-thread-pane"');
    for (const state of [
      'data-testid="communication-load-error"',
      'data-testid="communication-empty"',
      "Conversations.map(renderConversation)",
    ]) {
      const i = at(state);
      expect(i, state).toBeGreaterThan(list);
      expect(i, state).toBeLessThan(pane);
    }
  });

  it("the pane carries support and the privacy line, and never a composer", () => {
    const pane = page.slice(at('data-testid="communication-thread-pane"'));
    expect(pane).toMatch(/<SupportConversationLauncher/);
    expect(pane).toMatch(/t\("footnote"\)/);
    expect(page).not.toMatch(/<CommunicationComposer/);
  });

  it("no explanatory subtitle above the workspace", () => {
    expect(page).not.toMatch(/t\("subtitle"\)/);
  });
});
