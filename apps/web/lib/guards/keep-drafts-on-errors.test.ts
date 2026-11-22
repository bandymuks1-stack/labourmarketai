/**
 * GUARD — owner P0 2026-11-22: no lost drafts or entries on errors.
 *
 *   - the tab draft store keeps typed words for their owner only, 30 minutes,
 *     and every sign-out removes all of them;
 *   - the full journal composer keeps its started entry until it is saved;
 *   - the worklog readback never loses the entry to a thrown action, and an
 *     expired session says "sign in", not "try again";
 *   - the public company-need form puts back what was typed after a refused
 *     send (React resets an action form after every send);
 *   - the mobile journal, need and message composers keep unsent words across
 *     a sign-in again, for the same person only, and sign-out removes them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TAB_DRAFT_PREFIX,
  TAB_DRAFT_TTL_MS,
  clearAllTabDrafts,
  readTabDraft,
  writeTabDraft,
} from "@/lib/drafts/tab-draft";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    m,
  };
}

describe("the tab draft store", () => {
  it("restores only for the same owner, within 30 minutes", () => {
    const s = memoryStore();
    writeTabDraft("x", "u1:w1", { text: "laid 40 m2 of tiles" }, s, 1_000);
    expect(readTabDraft("x", "u1:w1", s, 2_000)).toEqual({ text: "laid 40 m2 of tiles" });
    expect(readTabDraft("x", "u2:w1", s, 2_000), "another person never sees it").toBeNull();
    writeTabDraft("x", "u1:w1", { text: "again" }, s, 1_000);
    expect(readTabDraft("x", "u1:w1", s, 1_000 + TAB_DRAFT_TTL_MS + 1), "expired").toBeNull();
  });

  it("an empty draft removes itself, and sign-out removes every draft", () => {
    const s = memoryStore();
    writeTabDraft("a", "o", { text: "one" }, s);
    writeTabDraft("b", "o", { text: "two" }, s);
    writeTabDraft("a", "o", { text: "  " }, s);
    expect(s.m.has(`${TAB_DRAFT_PREFIX}a`)).toBe(false);
    s.setItem("other-key", "kept");
    clearAllTabDrafts(s);
    expect([...s.m.keys()]).toEqual(["other-key"]);
  });

  it("every sign-out clears the tab drafts", () => {
    const src = read("components/app/intake-draft-sign-out-clear.tsx");
    expect(src.match(/clearAllTabDrafts\(\);/g)?.length).toBe(2);
  });
});

describe("surfaces keep what was typed", () => {
  it("the full journal composer keeps its started entry until saved", () => {
    const src = read("components/app/journal-entry-composer.tsx");
    expect(src).toContain("readTabDraft(JOURNAL_COMPOSER_DRAFT, draftOwner)");
    expect(src).toContain("writeTabDraft(JOURNAL_COMPOSER_DRAFT, draftOwner, { text: e.target.value })");
    expect(src).toContain("clearTabDraft(JOURNAL_COMPOSER_DRAFT);");
    expect(read("app/[locale]/dashboard/journal/page.tsx")).toContain(
      "draftOwner={quickRecordDraftOwner(user.id, activeOrganizationId)}",
    );
  });

  it("the worklog readback catches a thrown action and names an expired session", () => {
    const src = read("components/app/conversation/worker-worklog-flow.tsx");
    expect(src.match(/\} catch \{\n\s+(?:\/\/[^\n]*\n\s+)?setPhase\(\{ kind: "error", message: labels\.errorGeneric \}\);/g)?.length).toBe(2);
    expect(src.match(/failureCode\((?:prep|res)\) === "auth" \? labels\.notAuthed/g)?.length).toBe(2);
  });

  it("the public company-need form puts back what was typed after a refused send", () => {
    const src = read("components/app/company-need-form.tsx");
    expect(src).toContain("if (!state || state.ok !== false) return;");
    expect(src).toContain("queueMicrotask(refill);");
    expect(src).toContain("typedRef.current = form");
  });
});

describe("mobile composers keep unsent words", () => {
  const MOBILE = resolve(WEB, "../mobile/src");
  const readM = (p: string) => readFileSync(resolve(MOBILE, p), "utf8");

  it("the draft store is owner-bound, time-limited and cleared on sign-out", () => {
    const src = readM("drafts.ts");
    expect(src).toContain("k.owner !== owner");
    expect(src).toContain("const TTL_MS = 12 * 60 * 60 * 1000;");
    expect(readM("auth-context.tsx")).toMatch(/clearStoredSession\(sessionStore\);\n[^\n]*\n\s+clearAllDrafts\(\);/);
  });

  it("each composer restores its draft and clears it once sent", () => {
    for (const [file, surface] of [
      ["screens/journal-composer.tsx", '"journal-composer"'],
      ["screens/need-intake.tsx", '"need-intake"'],
      ["screens/message-composer.tsx", "`message:${conversationId}`"],
    ] as const) {
      const src = readM(file);
      expect(src, file).toContain(`useKeptDraft(${surface}`);
      expect(src, file).toContain("kept.clear();");
    }
  });
});
