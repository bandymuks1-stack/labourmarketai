import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

/**
 * Owner decision V-1 (2026-11-12, variant C with a change): a publicly posted
 * need of an UNCONFIRMED company is shown to workers AND signed-out visitors
 * once the required company details are filled in and the automated security
 * and anti-spam checks pass. It carries the mark "Įmonė nepatvirtinta" (no
 * misleading verification badge); an incomplete or suspicious one waits for a
 * review. Verification stays a separate, optional, stronger trust step.
 *
 * The setup copy used to say the opposite ("shown to workers only after your
 * company is verified"). These pins keep every setup line on the rule. The
 * visibility itself is built by its own lane; this file only guards the words.
 */
const WEB = join(__dirname, "..", "..");
type Company = {
  nextActions: { noCompany: { body: string } };
  setup: {
    formSubtitle: string;
    verificationExplainer: Record<"active_unverified" | "needs_checks" | "pending_verification" | "unverified", string>;
  };
};
const company = (l: string) =>
  (JSON.parse(readFileSync(join(WEB, "messages", `${l}.json`), "utf8")) as { roleDashboards: { company: Company } })
    .roleDashboards.company;

const ONLY_AFTER_VERIFICATION =
  /only after your company is verified|tik po įmonės verifikacijos|erst nach der Verifizierung|pas na verificatie|dopiero po weryfikacji|только после верификации/i;
const UNVERIFIED_MARK = /Company not verified|Įmonė nepatvirtinta|Unternehmen nicht verifiziert|Bedrijf niet geverifieerd|Firma niezweryfikowana|Компания не подтверждена/;
const VISITORS = /visitors|lankytoj|Besucher|bezoekers|odwiedzając|посетител/i;

describe("setup copy states the V-1 visibility rule", () => {
  for (const l of activeLocales) {
    it(`${l}: no line says needs wait for verification`, () => {
      const c = company(l);
      const lines = [c.nextActions.noCompany.body, c.setup.formSubtitle, ...Object.values(c.setup.verificationExplainer)];
      for (const s of lines) expect(s, l).not.toMatch(ONLY_AFTER_VERIFICATION);
    });

    it(`${l}: first-run and unverified lines name workers and visitors, and the unverified mark`, () => {
      const c = company(l);
      const ve = c.setup.verificationExplainer;
      for (const s of [c.nextActions.noCompany.body, c.setup.formSubtitle, ve.active_unverified, ve.pending_verification, ve.unverified]) {
        expect(s, l).toMatch(UNVERIFIED_MARK);
        expect(s, l).toMatch(VISITORS);
      }
    });

    it(`${l}: a company with a failing basic check is told its needs are held`, () => {
      const ve = company(l).setup.verificationExplainer;
      expect(ve.needs_checks, l).not.toMatch(UNVERIFIED_MARK);
      expect(ve.needs_checks, l).not.toMatch(VISITORS);
    });
  }
});
