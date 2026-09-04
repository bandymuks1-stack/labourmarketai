import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/**
 * Prod walk 2026-09-04 on a phone viewport: after "Priskirti darbuotoją" the
 * question "Kas turėtų jame dirbti?" and its chips landed in the thread UNDER
 * the open bottom sheet and could not be tapped. The sheet now yields when
 * the thread asks something while it still shows the SAME selection/result;
 * a new selection or result still opens it. Desktop ignores `expanded`.
 */
describe("on a phone the bottom sheet yields to a question the thread just asked", () => {
  it("the chat stamps the moment a message with chips is posted and hands it to the panel", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toContain("if (chips && chips.length > 0) setChipsPostedAt(Date.now());");
    expect(chat).toContain("chipsPostedAt={chipsPostedAt}");
  });

  it("the panel collapses only when the key it showed is unchanged — never against a fresh selection or result", () => {
    const panel = read("components/app/world-state/context-panel.tsx");
    expect(panel).toContain("chipsPostedAt = null,");
    expect(panel).toContain("const yieldKeyRef = useRef<string>(`${result ?? \"\"}|${selectionKey}`);");
    expect(panel).toContain("if (chipsPostedAt && yieldKeyRef.current === key) setExpanded(false);");
    expect(panel).toContain("}, [chipsPostedAt, result, selectionKey]);");
    // The opening rule stays: a selection or a result still opens the sheet.
    expect(panel).toContain('if (panel.mode === "entity" || showsResult) setExpanded(true);');
  });
});
