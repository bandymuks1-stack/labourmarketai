import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 10 — mobile real-use polish v3.
 *
 * User-generated text (journal entries, evidence snippets, worker names that
 * fall back to long emails) must not force horizontal scroll on a phone. These
 * guards pin the overflow-safe wrapping on the surfaces this train added.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("inbox entry — long user text wraps, no horizontal overflow", () => {
  const src = read("components/app/journal-inbox-entry.tsx");
  it("journal text preserves newlines and breaks long words", () => {
    expect(src).toMatch(/whitespace-pre-wrap break-words[^"]*">\s*\{?\s*entry\.originalText|originalText[\s\S]{0,40}whitespace-pre-wrap break-words/);
  });
  it("evidence phrase breaks long words", () => {
    expect(src).toMatch(/evidenceLabel[\s\S]{0,80}break-words|break-words[\s\S]{0,80}evidenceLabel/);
  });
});

describe("new cards — worker names break instead of overflowing", () => {
  it("readiness summary name span uses break-words", () => {
    expect(read("components/app/worker-readiness-summary.tsx")).toMatch(/break-words[^"]*">\s*\{?\s*r\.workerName|workerName[\s\S]{0,40}break-words/);
  });
  it("review report worker heading uses break-words", () => {
    expect(read("app/[locale]/dashboard/inbox/report/page.tsx")).toMatch(/break-words[\s\S]{0,140}workerName/);
  });
});

describe("action rows stay wrap-friendly (no cramped fixed row)", () => {
  it("inbox idle action buttons use flex-wrap", () => {
    const src = read("components/app/journal-inbox-entry.tsx");
    expect(src).toMatch(/mode === "idle"[\s\S]{0,120}flex flex-wrap/);
  });
});
