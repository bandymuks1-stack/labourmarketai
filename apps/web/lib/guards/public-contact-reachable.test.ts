import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PRIVACY_CONTACT_EMAIL, PLATFORM_OPERATOR } from "@/lib/legal/entity-identity";

/**
 * Beta foundation audit M11 — "get in touch with us" must be possible.
 *
 * THE DEFECT. Public legal copy (`legal.requestContact`, `legal.preparing.
 * contact`) instructs the reader to contact the operator, and the public site
 * offered no channel to do it: the footer's `footer.contact` label existed in
 * every locale and was rendered nowhere, and /legal/legal-notice printed the
 * addresses as unclickable text. A visitor told to get in touch had to
 * hand-copy an address off a legal page.
 *
 * WHAT THIS PINS. That the already-published addresses stay REACHABLE, and
 * that the reachable address is the canonical one from entity-identity —
 * never a second address invented in markup. It does not pin styling.
 */

const WEB = join(__dirname, "..", "..");
const FOOTER = readFileSync(
  join(WEB, "components", "layouts", "site-footer.tsx"),
  "utf8",
);
const LEGAL_NOTICE = readFileSync(
  join(WEB, "app", "[locale]", "(marketing)", "legal", "legal-notice", "page.tsx"),
  "utf8",
);

describe("the public site offers a contact channel at all", () => {
  it("the footer renders a mailto for the canonical privacy contact", () => {
    expect(FOOTER).toContain('data-testid="footer-contact"');
    expect(FOOTER).toMatch(/href=\{`mailto:\$\{PRIVACY_CONTACT_EMAIL\}`\}/);
  });

  it("the footer uses the contact label that already exists in every locale", () => {
    expect(FOOTER).toContain('t("contact")');
  });

  it("NEGATIVE CONTROL: no hardcoded address may appear in the markup", () => {
    // A literal address in a component is how two sources of truth start.
    for (const src of [FOOTER, LEGAL_NOTICE]) {
      expect(src).not.toContain(PRIVACY_CONTACT_EMAIL);
      expect(src).not.toContain(PLATFORM_OPERATOR.businessEmail);
    }
  });

  it("the legal notice makes both published addresses actionable", () => {
    // Both address rows must go through the mailto helper, not the plain one.
    expect(LEGAL_NOTICE).toMatch(/mailRow\(\s*t\("email"\)/);
    expect(LEGAL_NOTICE).toMatch(/mailRow\(\s*\n?\s*t\("businessEmail"\)/);
    expect(LEGAL_NOTICE).toMatch(/href=\{`mailto:\$\{address\}`\}/);
    // …and the helper must carry the testids the browser proof asserts on.
    expect(LEGAL_NOTICE).toContain('"legal-notice-email"');
    expect(LEGAL_NOTICE).toContain('"legal-notice-business-email"');
  });

  it("NEGATIVE CONTROL: neither address falls back to the plain text row", () => {
    // `row(t("email") …)` is exactly the pre-fix state this guard exists to
    // stop returning; if someone reverts the helper, this fails.
    expect(LEGAL_NOTICE).not.toMatch(/[^l]row\(t\("email"\)/);
    expect(LEGAL_NOTICE).not.toMatch(/[^l]row\(t\("businessEmail"\)/);
  });

  it("the actionable rows keep the 44px mobile touch floor", () => {
    expect(LEGAL_NOTICE).toMatch(/mailRow[\s\S]*min-h-11/);
  });

  it("the contact label is really translated in every active locale", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const messages = JSON.parse(
        readFileSync(join(WEB, "messages", `${locale}.json`), "utf8"),
      );
      const value = messages.footer?.contact;
      expect(value, `${locale}.footer.contact`).toBeTruthy();
      expect(value, `${locale} must not be an [EN] placeholder`).not.toContain("[EN]");
    }
  });
});
