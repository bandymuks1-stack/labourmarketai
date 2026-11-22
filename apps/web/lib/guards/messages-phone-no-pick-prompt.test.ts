import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MESSAGES ON A PHONE (design audit 2026-11-22): under the conversation list
 * the pane said "Pick a conversation in the list" with a large icon — a prompt
 * that points at a list BESIDE it, which exists only from lg. On a phone the
 * pane keeps the support door and the privacy line, compactly.
 */
const page = readFileSync(join(__dirname, "..", "..", "app/[locale]/dashboard/communication/page.tsx"), "utf8");

describe("the messages pane on a phone", () => {
  it("shows the pick prompt and its icon from lg only", () => {
    expect(page).toMatch(/<p className="hidden text-sm text-text-secondary lg:block" data-testid="communication-pane-pick">/);
    expect(page).toMatch(/className="hidden h-8 w-8 text-text-muted lg:block"/);
  });
  it("keeps the support door and the privacy line at every width", () => {
    expect(page).toContain("<SupportConversationLauncher locale={locale} />");
    expect(page).toMatch(/<p className="max-w-sm text-meta text-text-muted">\{t\("footnote"\)\}<\/p>/);
  });
});
