import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Communication inbox contract (core-network A–E programme, area A).
 *
 * The messages list must behave like a normal inbox:
 *  1. unread first, then latest activity;
 *  2. every new item carries a clear "Naujas" mark, sender, type, time,
 *     preview and context, and the whole card is one link;
 *  3. the nav badge and the visible unread set share ONE source;
 *  4. opening a thread persists real read state; returning reflects it
 *     without a manual reload (refresh-on-focus, no simulated realtime);
 *  5. no technical/architecture explainer copy in the main hierarchy;
 *  6. no "(be temos)" — subject falls back to real context;
 *  7. support is a secondary entry below the conversation list;
 *  8. PR #743 private attachments stay intact (pinned by
 *     conversation-attachments.test.ts — not duplicated here).
 */

const webRoot = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const msg = (loc: string) =>
  JSON.parse(read(`messages/${loc}.json`)) as Record<string, never>;

const LIST_PAGE = "app/[locale]/dashboard/communication/page.tsx";
const THREAD_PAGE = "app/[locale]/dashboard/communication/[conversationId]/page.tsx";
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

describe("unread-first inbox ordering", () => {
  const src = read(LIST_PAGE);
  it("partitions unread conversations above read ones (stable within groups)", () => {
    expect(src).toMatch(/fetched\.filter\(\(c\) => unreadIds\.has\(c\.id\)\)/);
    expect(src).toMatch(/fetched\.filter\(\(c\) => !unreadIds\.has\(c\.id\)\)/);
  });
  it("unread state comes from the single shared source (badge cannot drift)", () => {
    expect(src).toMatch(/getUnreadConversationIds/);
  });
});

describe("inbox card anatomy", () => {
  const src = read(LIST_PAGE);
  it("shows the 'Naujas' mark, newest-message preview and sender", () => {
    expect(src).toMatch(/conversation-unread-/);
    expect(src).toMatch(/conversation-preview-/);
    expect(src).toMatch(/getConversationPreviews/);
    expect(src).toMatch(/preview\.byViewer/);
  });
  it("the whole card is one link to the thread", () => {
    expect(src).toMatch(/href=\{`\/dashboard\/communication\/\$\{c\.id\}`\}/);
  });
  it("attachment-only previews say so honestly (no invented text)", () => {
    expect(src).toMatch(/preview\.attachmentOnly/);
  });
});

describe("read state persists and the surface refreshes itself", () => {
  it("the thread stamps real last_read_at on open (MarkReadOnMount)", () => {
    expect(read(THREAD_PAGE)).toMatch(/MarkReadOnMount/);
  });
  it("list + thread refresh on focus — no manual reload, no fake realtime", () => {
    expect(read(LIST_PAGE)).toMatch(/RefreshOnFocus/);
    expect(read(THREAD_PAGE)).toMatch(/RefreshOnFocus/);
    const refresher = read("components/app/refresh-on-focus.tsx");
    expect(refresher).toMatch(/router\.refresh\(\)/);
    expect(refresher).toMatch(/visibilitychange/);
    // No websockets / channel simulation — honest server re-read only.
    expect(refresher).not.toMatch(/\.channel\(|postgres_changes|WebSocket/);
  });
});

describe("no '(be temos)' — real title fallback", () => {
  it("neither page references the retired unnamedThread key", () => {
    expect(read(LIST_PAGE)).not.toMatch(/unnamedThread/);
    expect(read(THREAD_PAGE)).not.toMatch(/unnamedThread/);
  });
  it("both pages fall back to counterpart name → source title → neutral label", () => {
    for (const page of [LIST_PAGE, THREAD_PAGE]) {
      const src = read(page);
      expect(src).toMatch(/counterpartyName/);
      expect(src).toMatch(/sourceTitle/);
      expect(src).toMatch(/conversationFallback/);
    }
  });
  it("no active locale carries a '(no subject)'-style value in communication", () => {
    for (const loc of ACTIVE) {
      const comm = (msg(loc) as Record<string, Record<string, unknown>>).communication;
      const blob = JSON.stringify(comm);
      expect(blob, `${loc}: '(be temos)'-style value still present`).not.toMatch(
        /\(be temos\)|\(no subject\)|\(kein Betreff\)|\(geen onderwerp\)|\(без темы\)/i,
      );
      expect(comm.conversationFallback, `${loc}: conversationFallback missing`).toBeTruthy();
    }
  });
});

describe("no technical explainer copy in the inbox hierarchy", () => {
  it("the refresh-mechanism note and feature explainers are gone from the page", () => {
    const src = read(LIST_PAGE);
    expect(src).not.toMatch(/v1Notice/);
    expect(src).not.toMatch(/FeatureNote/);
  });
  it("the retired keys are gone from every active locale", () => {
    for (const loc of ACTIVE) {
      const m = msg(loc) as Record<string, Record<string, unknown>>;
      expect(m.communication.v1Notice, `${loc} communication.v1Notice`).toBeUndefined();
      expect(m.communication.unnamedThread, `${loc} communication.unnamedThread`).toBeUndefined();
      const fn = m.featureNotes as Record<string, unknown> | undefined;
      expect(fn?.communicationInbox, `${loc} featureNotes.communicationInbox`).toBeUndefined();
      expect(fn?.feedbackLoop, `${loc} featureNotes.feedbackLoop`).toBeUndefined();
    }
  });
  it("'Originalas išsaugotas' no longer pads the attention subtitle", () => {
    for (const loc of ACTIVE) {
      const m = msg(loc) as Record<string, Record<string, Record<string, string>>>;
      const subtitle = m.instructions?.attention?.subtitle ?? "";
      expect(subtitle).not.toMatch(
        /Originalas išsaugotas|original is preserved|Original bleibt|origineel bewaard|Оригинал сохран/i,
      );
    }
  });
});

describe("support is secondary, instructions CTA stays instruction-only", () => {
  it("the support launcher renders BELOW the conversation list", () => {
    const src = read(LIST_PAGE);
    const list = src.indexOf("conversations.map");
    const launcher = src.indexOf("<SupportConversationLauncher");
    expect(list).toBeGreaterThan(-1);
    expect(launcher).toBeGreaterThan(list);
  });
  it("'view instruction' CTA lives only on the instructions block", () => {
    // The inbox cards open conversations; only AttentionInstructions renders
    // the instruction CTA.
    expect(read(LIST_PAGE)).toMatch(/AttentionInstructions/);
    expect(read(LIST_PAGE)).not.toMatch(/instructions\.attention\.cta/);
  });
});
