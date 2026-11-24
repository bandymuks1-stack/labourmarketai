import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PRIVACY PAGE ANSWERS FOUR QUESTIONS FIRST — AND GIVES UP NO RIGHTS TO DO IT.
 *
 * ── §9, owner walk 2026-09-27
 *
 * `/dashboard/privacy` had EIGHT always-open sections and NOT ONE disclosure, so
 * the four questions a person actually arrives with were buried among two
 * append-only audit logs:
 *
 *   · who can find me?                  → `privacy-visibility`
 *   · what can they see?                → visibility + the disclosure requests
 *   · what do I allow to be passed on?  → `privacy-partner-supply`
 *   · how do I manage my data/account?  → `privacy-export`, `privacy-deletion`
 *
 * The two LOGS — the disclosures log and the consent ledger — moved to a second
 * layer. They are the same sections with the same ids, one tap down.
 *
 * ── THE TWO RULES THIS GUARD EXISTS TO HOLD APART
 *
 * 1. SIMPLIFYING IS NOT REDUCING RIGHTS. Export and deletion are the
 *    GDPR-bearing controls and the consent toggles are the lawful basis a person
 *    manages. None of them may be collapsed, ever — that would be a rights
 *    reduction dressed as progressive disclosure. Pinned below.
 *
 * 2. A FAILED READ IS NOT AN EMPTY LOG (SEP-7). Both logs carry
 *    `open={historyFailed}`, so a ledger that could not be READ stays open and
 *    keeps its `role="status"` explanation, while a healthy one collapses. If
 *    somebody "tidies" that condition away, a person could be shown a closed,
 *    innocent-looking drawer over an audit trail the server failed to return.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");
const PAGE = "app/[locale]/dashboard/privacy/page.tsx";

describe("privacy: four questions in the first layer", () => {
  const page = read(PAGE);

  /** A testid's own element tag — what layer that section lives in. */
  const tagFor = (testId: string): string => {
    const at = page.indexOf(`data-testid="${testId}"`);
    expect(at, `${testId} must exist`).toBeGreaterThan(-1);
    const before = page.slice(0, at);
    const open = Math.max(
      before.lastIndexOf("<section"),
      before.lastIndexOf("<details"),
    );
    return page.slice(open, open + 8);
  };

  it("the rights-bearing controls are NEVER behind a disclosure", () => {
    // Export, deletion, discoverability consent and partner-supply consent.
    // Collapsing any of these is a rights reduction, not a simplification.
    for (const testId of [
      "privacy-export",
      "privacy-deletion",
      "privacy-visibility",
      "privacy-partner-supply",
    ]) {
      expect(tagFor(testId), `${testId} must stay in the first layer`).toBe(
        "<section",
      );
    }
  });

  it("the audit logs ARE in the second layer, and keep their anchors", () => {
    for (const testId of ["privacy-disclosures", "privacy-history"]) {
      expect(tagFor(testId), `${testId} should be a disclosure`).toBe("<details");
    }
    // The ids survive, so `#disclosures` / `#history` still resolve — and the
    // component that OPENS a collapsed target for a hash must be mounted for
    // each, or a deep link lands on a closed summary bar.
    for (const id of ["disclosures", "history"]) {
      expect(page, `#${id} must keep its id`).toContain(`id="${id}"`);
      expect(page, `#${id} needs a hash opener`).toContain(
        `<DetailsHashOpener targetId="${id}" />`,
      );
    }
    expect(page).toContain("details-hash-opener");
  });

  it("an unreadable log stays OPEN — a failed read is not an empty one", () => {
    // Both logs, not just one: the condition is what keeps a server failure
    // visible without the person going looking for it.
    // Comments stripped first: the JSX comment above each log quotes this very
    // expression to explain it, so a naive count reads the prose too.
    const code = page
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const opens = [...code.matchAll(/open=\{historyFailed\}/g)];
    expect(opens.length, "both logs open on failure").toBe(2);
    // And the failure explanations themselves must still be rendered.
    expect(page).toContain('data-testid="disclosures-unavailable"');
    expect(page).toContain('data-testid="history-unavailable"');
    expect(page).toMatch(/role="status"/);
  });

  it("nothing was deleted — every section the page had is still rendered", () => {
    // The §9 change was a re-layering. If a section vanished, that is a
    // capability loss and this is where it should fail.
    for (const testId of [
      "privacy-visibility",
      "privacy-partner-supply",
      "privacy-contact-requests",
      "privacy-disclosures",
      "privacy-history",
      "privacy-export",
      "privacy-deletion",
      "privacy-requests-list",
    ]) {
      expect(page, `${testId} must still exist`).toContain(
        `data-testid="${testId}"`,
      );
    }
  });
});
