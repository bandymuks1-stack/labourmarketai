import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Overflow guard (owner overflow fix, 2026-06-25).
 *
 * Long work-record text and long emails must WRAP, never overflow horizontally
 * or clip. The owner provided production screenshots of clipping; this pins the
 * fix so a regression fails CI instead of shipping a horizontal-scroll row.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("Mano CV work records wrap cleanly (no horizontal overflow)", () => {
  const manoCv = read("app/[locale]/dashboard/journal/page.tsx");

  it("the work-record text wraps long unbroken strings", () => {
    // The entry's original_text <p> must carry break-words (overflow-wrap) so a
    // long URL / token breaks instead of pushing the row wide.
    expect(manoCv).toMatch(
      /whitespace-pre-wrap break-words[^"]*"\s*>\s*\{?\s*\n?\s*\{e\.original_text\}/,
    );
  });

  it("the entry metric row carries break-words for long site/direction values", () => {
    expect(manoCv).toMatch(/flex flex-wrap[^"]*break-words/);
  });
});

describe("account email wraps (no overflow on mobile)", () => {
  const account = read("app/[locale]/dashboard/account/page.tsx");
  it("the email value carries break-words", () => {
    expect(account).toMatch(/break-words[^"]*"\s*>\s*\n?\s*\{profile\?\.email/);
  });
});
