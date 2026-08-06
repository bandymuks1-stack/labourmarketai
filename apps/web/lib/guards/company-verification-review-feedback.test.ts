import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 GUARDS — admin company-verification review feedback (2026-08-06).
 *
 * Production bug report: clicking "Patvirtinti" appeared to do NOTHING.
 * Diagnosis on production evidence (audit_logs + API logs): the writes DID
 * land for hydrated clicks, but (a) a pre-hydration/native submit posts the
 * hidden status input's EMPTY default — the action answers `invalid` and a
 * native post renders no banner at all; (b) nothing visible marks an
 * in-flight action, so any slow/failed response reads as "nothing happened".
 *
 * Pinned here:
 *   1. DUAL-CHANNEL status delivery — every submit button carries its own
 *      `name="status" value=…` (native channel) AND the onClick hidden-input
 *      set (React 19 function-action channel, where button name/value is
 *      dropped);
 *   2. the server action reads ALL "status" entries and takes the LAST
 *      non-empty one (DOM order puts the empty hidden input first);
 *   3. a visible role=status pending indicator renders while the action is
 *      in flight;
 *   4. the outcome banner still renders for every tagged failure code.
 */

const WEB = join(__dirname, "..", "..");
const COMPONENT = readFileSync(
  join(WEB, "components", "app", "company-verification-review.tsx"),
  "utf8",
);
const ACTION = readFileSync(
  join(WEB, "lib", "admin", "company-verification-actions.ts"),
  "utf8",
);

describe("company-verification review — P0 feedback guards", () => {
  it("every review button carries its own name/value status (native channel)", () => {
    for (const status of ["verified", "unverified", "pending_verification"]) {
      const re = new RegExp(
        `name="status"\\s+value="${status}"[\\s\\S]{0,200}?onClick=\\{\\(\\) => setStatus\\("${status}"\\)\\}`,
      );
      expect(COMPONENT).toMatch(re);
    }
  });

  it("the action reads ALL status entries and takes the last non-empty", () => {
    expect(ACTION).toMatch(/formData\.getAll\("status"\)/);
    expect(ACTION).toMatch(/for \(let i = values\.length - 1; i >= 0; i -= 1\)/);
    // The old first-entry read must be gone — it resolved the EMPTY hidden
    // input on native submits.
    expect(ACTION).not.toMatch(/readStatus\(formData\.get\("status"\)\)/);
  });

  it("an in-flight action is visibly marked (role=status pending indicator)", () => {
    expect(COMPONENT).toMatch(/company-verification-pending-state-/);
    expect(COMPONENT).toMatch(/\{isPending \? \(/);
    expect(COMPONENT).toMatch(/labels\.saving/);
  });

  it("the outcome banner still renders every tagged failure code", () => {
    for (const code of ["not_admin", "invalid", "not_found", "needs_migration"]) {
      expect(COMPONENT).toContain(`case "${code}"`);
    }
  });

  it("all admin-page locales carry the saving label", () => {
    for (const loc of ["lt", "en", "de", "nl", "ru"]) {
      const messages = JSON.parse(
        readFileSync(join(WEB, "messages", `${loc}.json`), "utf8"),
      );
      expect(
        messages.admin?.companyVerification?.result?.saving,
        `${loc}.json admin.companyVerification.result.saving`,
      ).toBeTruthy();
    }
  });
});
