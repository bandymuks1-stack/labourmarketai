import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner contract 2026-09-04 §5.5 / §12 — the document FILE by sentence.
 * After "pridėk dokumentą" records the row, the chat offers the file over the
 * SAME write the documents page uses. These pins keep it one backbone: no
 * chat-local upload, no optimistic success, no dead control when the file
 * layer does not answer, and real copy in every catalogue.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const EMBED = read("components/app/conversation/chat/document-file-embed.tsx");
const LOADER = read("lib/conversation/document-file-chat.ts");
const LABELS = read("components/app/conversation/chat/labels.ts");

const CATALOGS = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;
const KEYS = [
  "documentFileOffer",
  "documentFileChoose",
  "documentFileSubmit",
  "documentFileUploading",
  "documentFileSkip",
  "documentFileUploaded",
  "documentFileTooLarge",
  "documentFileUnsupported",
  "documentFileFailed",
] as const;

describe("document file in the chat — one backbone", () => {
  it("the embed writes through the chat entry of the ONE core, nothing else", () => {
    expect(EMBED).toMatch(/uploadWorkerDocumentFileForChatAction\(fd\)/);
    expect(EMBED).toContain('from "@/lib/documents/document-file-actions"');
    expect(EMBED).not.toMatch(/\.from\(["']/);
    expect(EMBED).not.toMatch(/\.rpc\(/);
    expect(EMBED).not.toMatch(/\.storage\b/);
    expect(EMBED).not.toMatch(/\bfetch\(/);
  });

  it("success is the core's word: onUploaded fires only on the real notice", () => {
    const idx = EMBED.indexOf("onUploaded()");
    expect(idx).toBeGreaterThan(-1);
    const before = EMBED.slice(Math.max(0, idx - 200), idx);
    expect(before).toContain('res.notice === "uploaded"');
    expect(EMBED.split("onUploaded()").length - 1).toBe(1);
  });

  it("accepts exactly the engine's file types and repeats its size limit", () => {
    expect(EMBED).toMatch(/accept=\{\(DOCUMENT_FILE_MIME_TYPES as readonly string\[\]\)\.join\(","\)\}/);
    expect(EMBED).toMatch(/picked\.size > DOCUMENT_FILE_MAX_BYTES/);
  });

  it("the chat offers the file only when the page's file layer answered for the recorded row", () => {
    expect(CHAT).toContain("loadDocumentFileTargetForChat({ typeSlug: savedSlug, country: savedCountry })");
    const offer = CHAT.indexOf("<DocumentFileEmbed");
    expect(offer).toBeGreaterThan(-1);
    const guard = CHAT.slice(Math.max(0, offer - 400), offer);
    expect(guard).toContain('if (target.kind !== "ready")');
    // the fallback is the previous behaviour, not silence
    expect(guard).toContain("finishWithReadiness();");
  });

  it("the loader asks the documents page's own reads and never a table directly", () => {
    expect(LOADER).toMatch(/^"use server";/);
    expect(LOADER).toContain("listMyDocuments()");
    expect(LOADER).toContain("getWorkerDocumentFiles([row.id])");
    expect(LOADER).not.toMatch(/\.from\(["']/);
    expect(LOADER).not.toMatch(/\.rpc\(/);
    expect(LOADER).not.toMatch(/workerId\s*[:=]\s*input/);
  });

  it("every catalogue carries real copy for the step", () => {
    const en = JSON.parse(read("messages/en.json")) as { conversation: { chat: Record<string, string> } };
    for (const k of KEYS) expect(LABELS, `labels.ts resolves ${k}`).toContain(`"${k}"`);
    for (const loc of CATALOGS) {
      const doc = JSON.parse(read(`messages/${loc}.json`)) as { conversation: { chat: Record<string, string> } };
      for (const k of KEYS) {
        const v = doc.conversation.chat[k];
        expect(typeof v, `${loc}.${k}`).toBe("string");
        expect(v.trim().length, `${loc}.${k} empty`).toBeGreaterThan(0);
        expect(v.startsWith("[EN]"), `${loc}.${k} placeholder`).toBe(false);
        if (loc !== "en" && k !== "documentFileSkip") {
          expect(v, `${loc}.${k} identical to English`).not.toBe(en.conversation.chat[k]);
        }
      }
    }
  });
});
