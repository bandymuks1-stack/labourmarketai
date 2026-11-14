import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * P0 CHAT PRIVACY (owner 2026-11-11): an old link to a thread the person was
 * removed from must not open an empty shell. The thread page checks the
 * reader's OWN participant row (the one row a removed person still sees) and
 * sends them to the inbox with an honest "no longer available" notice — no
 * subject, participants or messages. Anyone else keeps the plain 404.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const THREAD = read("app/[locale]/dashboard/communication/[conversationId]/page.tsx");
const INBOX = read("app/[locale]/dashboard/communication/page.tsx");

describe("a removed participant's old thread link", () => {
  it("redirects to the inbox notice before any thread data is read", () => {
    const miss = THREAD.indexOf("if (!convRes.data) {");
    const redirectAt = THREAD.indexOf("communication?notice=unavailable");
    const messagesAt = THREAD.indexOf('.from("conversation_messages")');
    expect(miss).toBeGreaterThan(-1);
    expect(redirectAt).toBeGreaterThan(miss);
    expect(redirectAt).toBeLessThan(messagesAt);
    // Decided by the reader's own row and its revoked_at, nothing else.
    const block = THREAD.slice(miss, redirectAt);
    expect(block).toContain('.eq("profile_id", user.id)');
    expect(block).toContain("revoked_at");
    expect(THREAD.slice(redirectAt, messagesAt)).toContain("notFound()");
  });

  it("the inbox renders the notice from translated copy", () => {
    expect(INBOX).toContain('notice === "unavailable"');
    expect(INBOX).toContain('t("noLongerAvailable.title")');
    expect(INBOX).toContain('t("noLongerAvailable.body")');
  });

  it.each(activeLocales)("%s carries the notice copy", (locale) => {
    const messages = JSON.parse(read(`messages/${locale}.json`)) as {
      communication?: { noLongerAvailable?: { title?: string; body?: string } };
    };
    const n = messages.communication?.noLongerAvailable;
    expect(n?.title?.trim()).toBeTruthy();
    expect(n?.body?.trim()).toBeTruthy();
  });
});
