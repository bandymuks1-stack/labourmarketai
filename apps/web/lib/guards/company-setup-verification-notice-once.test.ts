import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The verification notice is said ONCE on /dashboard/start/company, never zero
 * times (decision 0032; R2 review on #3786). The page shows the existing
 * company's status card (with its explainer) only for `company && !firstSetup`;
 * the form shows its own notice on create AND on the first setup of the shell
 * row sign-up makes, where no card is shown.
 */
const WEB = join(__dirname, "..", "..");
const FORM = readFileSync(join(WEB, "components/app/company-setup-form.tsx"), "utf8");
const PAGE = readFileSync(join(WEB, "app/[locale]/dashboard/start/company/page.tsx"), "utf8");

describe("company setup states verification exactly once", () => {
  it("the page's status card is shown only for a set-up company", () => {
    expect(PAGE).toMatch(/const firstSetup = company !== null && isShellRow\(company\);/);
    expect(PAGE).toMatch(/\{company && !firstSetup \? \(/);
    expect(PAGE).toMatch(/data-testid="company-start-verification-explainer"/);
    expect(PAGE).toMatch(/firstSetup=\{firstSetup\}/);
  });

  it("the form's notice shows on create and on the first setup (the shell row), i.e. exactly where the card is not", () => {
    expect(FORM).toMatch(/const showCreateFrame = existing === null \|\| firstSetup;/);
    const at = FORM.indexOf('data-testid="company-setup-verification-notice"');
    expect(at).toBeGreaterThan(-1);
    expect(FORM.slice(Math.max(0, at - 400), at)).toMatch(/\{showCreateFrame \? \(/);
  });
});
