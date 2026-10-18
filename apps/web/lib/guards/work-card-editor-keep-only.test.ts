import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * Work-card editor — saved figures can be changed, never silently "cleared".
 *
 * `save_worker_card` coalesces every null parameter to the stored value
 * (null = keep). Production 2026-09-21: the editor offered "not stated" over a
 * saved availability, reported "Saved", and the row kept `available` — a
 * control that visually succeeds and does not persist (SEP-8). The honest
 * contract until a write path with explicit clear flags exists (RED):
 *   1. the empty choice is offered only while no status is saved;
 *   2. once anything is saved the form says an empty field keeps the value;
 *   3. that sentence exists in every ACTIVE locale.
 */
const web = join(__dirname, "..", "..");
const editor = readFileSync(join(web, "components", "app", "work-card-editor.tsx"), "utf8");

describe("work-card editor keep-only contract", () => {
  it("offers the empty availability choice only while nothing is saved", () => {
    expect(editor).toMatch(
      /values\.availabilityStatus \? null : \(\s*<option value="">\{labels\.availabilityOptionNone\}<\/option>/,
    );
  });

  it("states that an empty field keeps the saved value once anything is saved", () => {
    expect(editor).toContain('data-testid="work-card-keep-only-hint"');
    expect(editor).toContain("{labels.keepOnlyHint}");
    expect(editor).toMatch(/hasSavedFigures \?/);
  });

  it("the sentence exists in every active locale", () => {
    for (const locale of activeLocales) {
      const catalog = JSON.parse(readFileSync(join(web, "messages", `${locale}.json`), "utf8"));
      const hint = catalog?.auth?.dashboard?.workCard?.editor?.keepOnlyHint;
      expect(typeof hint, locale).toBe("string");
      expect(hint.trim().length, locale).toBeGreaterThan(20);
      expect(hint, locale).not.toContain("[EN]");
    }
  });
});
