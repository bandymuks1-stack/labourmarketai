import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — the employer's company screens draw their controls with the one
 * design system (owner P0 2026-11-12, as #3279 did for teams and #3495 for the
 * agency): Button, Input, Select and Textarea from components/ui. No
 * hand-written button, select, textarea or visible input stays in these files,
 * so a phone gets the shared 44 px tap floor and focus ring. Only the controls
 * changed: no behaviour, test id, element id or copy.
 */
const WEB = join(__dirname, "..", "..");
const FILES = [
  "components/app/company-setup-form.tsx",
  "components/app/company-workers-section.tsx",
  "components/app/demand-lifecycle-controls.tsx",
  "components/app/company-interest-ack.tsx",
  // The candidate search's shortlist controls (phone pass 2026-11-18): the
  // statuses are ui/Chip ToggleChips, the note is ui/Textarea.
  "components/app/scouting-shortlist-buttons.tsx",
  // The candidate card's shared actions (phone pass 2026-11-19): request a
  // conversation, request contact details (and take the ask back), and the
  // decision on a person an agency offered. Were hand-written buttons that
  // fell below 44 px from sm up; now ui/Button with the 44 px floor.
  "components/app/request-communication-button.tsx",
  "components/app/request-contact-details-button.tsx",
  "components/app/offer-decision-buttons.tsx",
];
const code = (f: string) =>
  readFileSync(join(WEB, f), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

describe("company screens use the shared primitives", () => {
  it.each(FILES)("%s has no hand-written button, select, textarea or visible input", (f) => {
    const src = code(f);
    expect(src, `${f}: <button>`).not.toMatch(/<button\b/);
    expect(src, `${f}: <select>`).not.toMatch(/<select\b/);
    expect(src, `${f}: <textarea>`).not.toMatch(/<textarea\b/);
    expect(src.match(/<input\b(?![^>]*type="hidden")[^>]*>/g) ?? [], `${f}: visible <input>`).toEqual([]);
    expect(src).toMatch(/from "@\/components\/ui\/Button"/);
  });

  it.each(FILES)("%s keeps every action at the 44 px tap floor", (f) => {
    const buttons = code(f).match(/<Button\b(?:=>|[^>])*>/g) ?? [];
    expect(buttons.length, f).toBeGreaterThan(0);
    for (const b of buttons) expect(b, `${f}: ${b.slice(0, 80)}`).toMatch(/min-h-11/);
  });

  it("the shortlist statuses are the shared toggle chip (44 px, aria-pressed, check mark)", () => {
    const src = code("components/app/scouting-shortlist-buttons.tsx");
    expect(src).toMatch(/<ToggleChip\b/);
    expect(src).toMatch(/from "@\/components\/ui\/Chip"/);
    expect(src).toMatch(/<Textarea\b/);
  });

  it("a locked legal field keeps the shared field and dims through state variants", () => {
    const src = code("components/app/company-setup-form.tsx");
    expect(src).toMatch(/read-only:bg-ink-800 read-only:text-text-muted/);
    expect(src).toMatch(/disabled:bg-ink-800 disabled:text-text-muted/);
  });
});
