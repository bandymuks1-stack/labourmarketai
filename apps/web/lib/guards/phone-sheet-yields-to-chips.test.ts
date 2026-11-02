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
    // `shown` (not the raw `chips`) is the row that actually reached the
    // thread after the anti-loop filter dropped anything already refused —
    // stamping the raw row would mark a question that was never asked.
    expect(chat).toContain("if (shown && shown.length > 0) {");
    expect(chat).toContain("setChipsPostedAt(Date.now());");
    expect(chat).toContain("chipsPostedAt={chipsPostedAt}");
  });

  it("the opening brief stamps ITS OWN moment — it asks with chips, but it is not an answer", () => {
    // Owner §20 (2026-09-23): on a phone a pending invitation auto-opens the
    // sheet over the home, and the brief's chips must win over it. But the
    // brief is not a question about what the sheet shows: while it shared
    // `chipsPostedAt`, it also collapsed a RESULT the person had just asked to
    // see by URL (account menu "player card", a project deep link) — on a
    // phone that result never appeared (QA 2026-10-16, W11 "mobile-375").
    // The brief therefore stamps a separate moment.
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    const opener = chat.slice(chat.indexOf("const openedWithStateRef = useRef(false);"));
    const block = opener.slice(0, opener.indexOf("/* the greeting stands on its own"));
    expect(block).toMatch(/chips: brief\.chips,\s*\}\);[\s\S]*?if \(brief\.chips\.length > 0\) setBriefChipsPostedAt\(Date\.now\(\)\);/);
    // Negative controls: a brief with NO chips must not stamp, and the brief
    // never stamps the ANSWER moment the same-key yield reacts to.
    expect(block).not.toMatch(/\n\s*setBriefChipsPostedAt\(Date\.now\(\)\);/);
    expect(block).not.toMatch(/setChipsPostedAt\(/);
    expect(chat).toContain("briefChipsPostedAt={briefChipsPostedAt}");
  });

  it("the brief collapses only a sheet nobody asked for — never a requested result or selection", () => {
    const panel = read("components/app/world-state/context-panel.tsx");
    expect(panel).toContain("briefChipsPostedAt = null,");
    expect(panel).toMatch(
      /if \(briefChipsPostedAt && !showsResult && panel\.mode !== "entity"\) setExpanded\(false\);/,
    );
  });

  it("a pending invitation never re-opens the sheet over chips already posted — the order cannot decide (review P2 on #1856)", () => {
    const panel = read("components/app/world-state/context-panel.tsx");
    // Brief-first: the chips stamp exists when the invitation read lands, so
    // the auto-open stands down; invitation-first: it opens, and the brief's
    // stamp then yields it. Both orders end collapsed under the question.
    expect(panel).toMatch(
      /if \(work\?\.invitations && !chipsPostedAt && !briefChipsPostedAt\) setExpanded\(true\);\s*\}, \[work, chipsPostedAt, briefChipsPostedAt\]\);/,
    );
    // NEGATIVE CONTROL: the unguarded auto-open is gone.
    expect(panel).not.toMatch(/if \(work\?\.invitations\) setExpanded\(true\);/);
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
