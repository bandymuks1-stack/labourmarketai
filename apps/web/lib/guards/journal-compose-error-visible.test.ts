import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A REFUSED SAVE SAYS WHY ON THE SCREEN IT HAPPENED (journal-reach walk R-3,
 * 2026-11-22). The detailed journal form has two stages: `compose` (text +
 * direct save) and `review`. Only the review stage drew `error`, so a direct
 * save the server refused (a future day) or a rule stopped (no context, no
 * project chosen) showed nothing — the words stayed, the reason did not.
 * Both stages now draw the same alert.
 */
const SRC = readFileSync(resolve(__dirname, "../../components/app/journal-entry-composer.tsx"), "utf8");

describe("journal composer — every stage shows a refused save", () => {
  it("the compose stage draws the error alert", () => {
    const start = SRC.indexOf('if (stage === "compose") {');
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf("\n  }\n", start);
    const compose = SRC.slice(start, end);
    expect(compose).toMatch(/\{error && \(\s*<p[\s\S]{0,200}role="alert"[\s\S]{0,80}data-testid="journal-save-error"/);
  });

  it("the review stage still draws it too", () => {
    const start = SRC.indexOf('if (stage === "compose") {');
    const afterCompose = SRC.slice(SRC.indexOf("\n  }\n", start));
    expect(afterCompose).toContain('data-testid="journal-save-error"');
  });
});
