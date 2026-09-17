import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Workstream B guard — conversations stay canonical + §2-honest.
 *
 * Pins: the language column ships as an additive DRAFT migration only; the
 * send path stamps original_language but degrades (42703) until the owner
 * applies it; the translation layer NEVER fabricates a translation — a
 * 'translated' rendering exists only when the egress-gated AI runtime produced
 * text that differs from the original, and the original is always kept; entry
 * points reuse the canonical
 * openDirectConversationAction; no parallel messaging tables anywhere.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

const MIGRATION =
  "supabase/migrations/20260610190000_conversation_message_language.sql";
const ACTIONS = "lib/communication/actions.ts";
const STUB = "lib/communication/translation.ts";
const THREAD = "app/[locale]/dashboard/communication/[conversationId]/page.tsx";
const WORKBENCH = "app/[locale]/dashboard/admin/matching/page.tsx";

describe("conversations language — draft migration + honest degrade", () => {
  it("migration is additive, rollbackable, draft-headed for MCP apply", () => {
    const sql = readRepo(MIGRATION);
    expect(sql).toMatch(/DO NOT APPLY automatically/);
    expect(sql).toMatch(/apply_migration/);
    expect(sql).toMatch(/add column if not exists original_language/);
    expect(sql).toMatch(/-- ROLLBACK/);
    const code = sql.replace(/--[^\n]*/g, " ");
    expect(code).not.toMatch(/\bdrop\s+(table|column)/i);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("sendMessage stamps the author's locale and degrades on 42703", () => {
    const code = read(ACTIONS);
    expect(code).toMatch(/original_language: originalLanguage/);
    expect(code).toMatch(/42703/);
  });

  it("the translation layer never fabricates: 'translated' only from a provider's text that differs from the original, the original always kept", () => {
    const code = read(STUB);
    expect(code).toMatch(/kind: "original"/);
    expect(code).toMatch(/kind: "translated"/);
    expect(code).toMatch(/NEVER fabricates/);
    // an empty or echoed translation is refused in code, not in a comment
    expect(code).toMatch(/t\.length > 0 && t !== args\.body\.trim\(\)/);
    expect(code).toMatch(/original: args\.body/);
    // the read side reaches a provider ONLY through the egress-gated runtime — no fetch, no vendor SDK, no stored translation
    const readSide = read("lib/communication/translation-read.ts");
    expect(readSide).toMatch(/from "@\/lib\/ai\/run-agent-server"/);
    expect(readSide).toMatch(/runAiAgent\(\s*"translation_copy"/);
    expect(readSide).not.toMatch(/fetch\s*\(|deepl|googleapis|https?:\/\//i);
    expect(readSide).not.toMatch(/\.from\(|\.update\(|\.insert\(|translated_text/);
    expect(readSide).toMatch(/outcome\.status !== "suggestion"/);
    expect(readSide).toMatch(/rateLimit\(/);
  });

  it("thread renders every message in the viewer's language through the resolver, the original one tap away", () => {
    const page = read(THREAD);
    expect(page).toMatch(/resolveViewerTexts\(/);
    expect(page).toMatch(/message-lang-\$\{m\.id\}/);
    expect(page).toMatch(/message-original-\$\{m\.id\}/);
    expect(page).toMatch(/vt\.kind === "translated"/);
  });

  it("entry points reuse the canonical messaging action (no parallel path)", () => {
    const wb = read(WORKBENCH);
    expect(wb).toMatch(/matching-message-requester-/);
    expect(wb).toMatch(/openDirectConversationAction/);
    // The canonical model only — nobody writes the legacy M0 stubs.
    for (const rel of [ACTIONS, STUB, THREAD]) {
      const c = read(rel);
      expect(c, `${rel} must not touch legacy threads/messages`).not.toMatch(
        /from\("threads"\)|from\("messages"\)/,
      );
    }
  });

  it("language badge copy exists in all 10 locales", () => {
    for (const locale of ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"]) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        communication?: { originalLanguage?: string };
        admin?: { matching?: { demand?: { messageRequester?: string } } };
      };
      expect(json.communication?.originalLanguage, `${locale} originalLanguage`).toBeTruthy();
      expect(
        json.admin?.matching?.demand?.messageRequester,
        `${locale} messageRequester`,
      ).toBeTruthy();
    }
  });
});
