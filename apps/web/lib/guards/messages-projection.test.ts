import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  INBOX_OVERDUE_HOURS,
  deriveInboxPriority,
  sortByInboxPriority,
} from "@/lib/communication/inbox-priority";

/**
 * §8 MESSAGES — the owner visual-acceptance contract.
 *
 * The projection must carry sender, preview, unread, priority, thread,
 * quick reply, compose and reply-from-chat with send-after-confirmation —
 * and it must remain a PROJECTION: one canonical write path
 * (`sendMessage`), no second messaging implementation anywhere.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const PAGE = read("app/[locale]/dashboard/communication/page.tsx");
const QUICK = read("components/app/conversation-quick-reply.tsx");
const CHAT_REPLY = read("components/app/conversation/chat-message-reply.tsx");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const CHAT_READ = read("lib/conversation/messages-chat.ts");
const ROUTER = read("lib/conversation/intent-router.ts");

const NOW = Date.parse("2026-07-30T12:00:00Z");

describe("§8.1 priority is DERIVED from real thread state, never invented", () => {
  it("unread + their last word = the only act-now level", () => {
    const p = deriveInboxPriority(
      { unread: true, newestByViewer: false, newestAt: "2026-07-30T11:00:00Z" },
      NOW,
    );
    expect(p.level).toBe("awaiting_you");
    expect(p.overdue).toBe(false);
    expect(p.waitingHours).toBe(1);
  });

  it("a long-unanswered question is called overdue by REAL elapsed time", () => {
    const p = deriveInboxPriority(
      { unread: true, newestByViewer: false, newestAt: "2026-07-28T12:00:00Z" },
      NOW,
    );
    expect(p.level).toBe("awaiting_you");
    expect(p.waitingHours).toBeGreaterThanOrEqual(INBOX_OVERDUE_HOURS);
    expect(p.overdue).toBe(true);
  });

  it("your own last message never asks anything of you", () => {
    const p = deriveInboxPriority(
      { unread: false, newestByViewer: true, newestAt: "2026-07-30T11:00:00Z" },
      NOW,
    );
    expect(p.level).toBe("waiting_them");
    expect(p.overdue).toBe(false);
  });

  it("an unknown timestamp degrades to null hours, never a guessed wait", () => {
    const p = deriveInboxPriority(
      { unread: true, newestByViewer: false, newestAt: null },
      NOW,
    );
    expect(p.waitingHours).toBeNull();
    expect(p.overdue).toBe(false);
  });

  it("the longest-waiting question the counterpart asked sorts first", () => {
    type Row = { id: string; at: string; unread: boolean; mine: boolean };
    const rows: Row[] = [
      { id: "fresh", at: "2026-07-30T11:00:00Z", unread: true, mine: false },
      { id: "old", at: "2026-07-27T09:00:00Z", unread: true, mine: false },
      { id: "answered", at: "2026-07-30T11:59:00Z", unread: false, mine: true },
    ];
    const ordered = sortByInboxPriority(
      rows,
      (r) =>
        deriveInboxPriority(
          { unread: r.unread, newestByViewer: r.mine, newestAt: r.at },
          NOW,
        ),
      (r) => r.at,
    );
    expect(ordered.map((r) => r.id)).toEqual(["old", "fresh", "answered"]);
  });
});

describe("§8.1 the inbox card carries the full agreed field set", () => {
  it("sender, preview, unread, priority, type, context and thread link", () => {
    for (const marker of [
      "conversation-counterparty-",
      "conversation-preview-",
      "conversation-unread-",
      "conversation-priority-",
      "conversation-type-",
      "conversation-row-",
      "/dashboard/communication/${c.id}",
    ]) {
      expect(PAGE, marker).toContain(marker);
    }
  });

  it("priority is computed from the pure model, not re-derived inline", () => {
    expect(PAGE).toContain("deriveInboxPriority");
    expect(PAGE).toContain("sortByInboxPriority");
  });

  it("quick reply is offered exactly where a reply is expected", () => {
    expect(PAGE).toContain("ConversationQuickReply");
    expect(PAGE).toMatch(/priority\.level === "awaiting_you" \?/);
  });
});

describe("§8.1 ONE write path — quick reply and chat reply reuse sendMessage", () => {
  it("quick reply calls the canonical action and claims nothing early", () => {
    expect(QUICK).toMatch(/from "@\/lib\/communication\/actions"/);
    expect(QUICK).toMatch(/sendMessage\(\{/);
    // Success is only claimed after the action says ok.
    expect(QUICK).toMatch(/if \(res\.ok\)/);
    // No second insert path.
    expect(QUICK).not.toMatch(/\.from\(\s*"conversation_messages"/);
    expect(QUICK).not.toMatch(/\.insert\(/);
  });

  it("the chat reply SENDS ONLY AFTER an explicit confirmation of the exact text", () => {
    expect(CHAT_REPLY).toMatch(/from "@\/lib\/communication\/actions"/);
    expect(CHAT_REPLY).toMatch(/sendMessage\(\{/);
    // A confirm gate exists and the confirm view renders the draft itself.
    expect(CHAT_REPLY).toMatch(/confirming/);
    expect(CHAT_REPLY).toMatch(/confirmTitle/);
    expect(CHAT_REPLY).toMatch(/\{draft\.trim\(\)\}/);
    // send() is reachable only from the confirm button.
    const confirmBlock = CHAT_REPLY.slice(CHAT_REPLY.indexOf("confirmTitle"));
    expect(confirmBlock).toMatch(/onClick=\{send\}/);
    expect(CHAT_REPLY).not.toMatch(/onClick=\{send\}[\s\S]{0,200}review/);
  });

  it("the drafted text is the PERSON'S — the chat never generates the reply", () => {
    // The draft state starts empty and is only ever set from the textarea.
    expect(CHAT_REPLY).toMatch(/useState\(""\)/);
    expect(CHAT_REPLY).toMatch(/onChange=\{\(e\) => setDraft\(e\.target\.value\)\}/);
  });

  it("the full thread stays one tap away from the shortcut", () => {
    expect(CHAT_REPLY).toMatch(/\/dashboard\/communication\/\$\{thread\.conversationId\}/);
  });
});

describe("§8.1 messages are a CONVERSATION projection", () => {
  it("the chat can read the inbox through the SAME scoped reads", () => {
    for (const marker of [
      "getUnreadConversationIds",
      "getConversationPreviews",
      "readCounterpartIdentities",
      "deriveInboxPriority",
    ]) {
      expect(CHAT_READ, marker).toContain(marker);
    }
    // Read-only: the projection never writes.
    expect(CHAT_READ).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it("only the threads that genuinely await the person reach the chat", () => {
    expect(CHAT_READ).toMatch(/level === "awaiting_you"/);
    expect(CHAT_READ).toMatch(/CHAT_THREAD_LIMIT/);
  });

  it("asking for messages in words opens the projection, not a dead hint", () => {
    expect(ROUTER).toMatch(/intent: "messages-view"/);
    // G2: routing is registry-dispatched — `messages-view` resolves to the
    // component's `messages` handler, which opens the real projection.
    expect(CHAT).toMatch(/messages: \(\) => startMessages\(\)/);
    expect(CHAT).toContain("ChatMessageReply");
  });

  it("an empty or blocked inbox states itself and still offers the real surface", () => {
    expect(CHAT_READ).toMatch(/kind: "empty"/);
    expect(CHAT_READ).toMatch(/kind: "blocked"/);
    expect(CHAT).toMatch(/link:\/dashboard\/communication/);
  });
});
