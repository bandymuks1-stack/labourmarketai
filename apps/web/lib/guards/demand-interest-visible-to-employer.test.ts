import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

/**
 * THE RAISED HAND MUST BE VISIBLE WHERE THE EMPLOYER ACTUALLY LANDS.
 *
 * Production evidence, 2026-08-26: five real `demand_interest_signals`, every
 * one still `interested` — none reviewed, none contacted. The data was never
 * hidden (the demand owner's own RLS policy admits it), but the ONLY surface
 * that counted it was /dashboard/company/scouting, a page the employer has to
 * know to open. The durable notification built to close that gap has emitted
 * nothing in production since it shipped, so the company hub — the surface an
 * employer does land on — said nothing at all.
 *
 * These pins keep the hub honest in both directions: a demand with people
 * waiting must SAY so, and a demand with nobody waiting must not.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("the company hub surfaces who is waiting", () => {
  it("the hub reads the pending-interest count", () => {
    const page = read("app", "[locale]", "dashboard", "company", "page.tsx");
    expect(page).toMatch(/listPendingInterestCountsForCompany/);
    // It must ride in the existing batch, not add a serial round trip to a
    // page that already reads fourteen.
    const batch = page.slice(
      page.indexOf("] = await Promise.all(["),
      page.indexOf("] as const);"),
    );
    expect(batch).toMatch(/listPendingInterestCountsForCompany\(\)/);
  });

  it("the hub passes the resolved lines to the demand read-back", () => {
    const page = read("app", "[locale]", "dashboard", "company", "page.tsx");
    expect(page).toMatch(/pendingInterest=\{pendingInterest\}/);
    // Plural resolution is a locale rule and belongs to the server, which owns
    // the catalogue — never to the component.
    expect(page).toMatch(/tReadback\("interestWaiting", \{ count \}\)/);
  });

  it("only demands with somebody waiting get a line", () => {
    const page = read("app", "[locale]", "dashboard", "company", "page.tsx");
    expect(page).toMatch(/if \(count > 0\)/);
  });

  it("the row renders the waiting line and never invents one", () => {
    const cmp = read("components", "app", "demand-requests-readback.tsx");
    expect(cmp).toMatch(/pendingInterest\?\.get\(r\.id\) \?\? null/);
    expect(cmp).toMatch(/demand-readback-interest-waiting/);
    // Rendered ONLY when a real entry exists — no zero-state chip.
    expect(cmp).toMatch(/\{waiting \? \(/);
  });
});

describe("the waiting line actually formats in every locale", () => {
  const locales = readdirSync(join(WEB, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5));

  it("covers every shipped locale", () => {
    expect(locales.length).toBeGreaterThan(1);
    for (const loc of locales) {
      const msgs = JSON.parse(read("messages", `${loc}.json`));
      expect(
        msgs?.demandReadback?.interestWaiting,
        `${loc}: demandReadback.interestWaiting missing`,
      ).toBeTruthy();
    }
  });

  /**
   * The real test. A malformed ICU plural (a missing `other` arm, a bad
   * category for the language) type-checks fine and throws at RENDER — on the
   * employer's hub, for the one message that exists to convert a raised hand.
   * So the guard formats each locale's actual message rather than asserting a
   * substring.
   */
  it.each([1, 2, 3, 5, 11, 21, 101])("formats for count=%i", (count) => {
    for (const loc of locales) {
      const messages = JSON.parse(read("messages", `${loc}.json`));
      const t = createTranslator({ locale: loc, messages });
      const out = t("demandReadback.interestWaiting", { count });
      expect(typeof out, `${loc} @ ${count}`).toBe("string");
      expect(out.length, `${loc} @ ${count} empty`).toBeGreaterThan(0);
      // next-intl surfaces a formatting failure as the echoed key path.
      expect(out, `${loc} @ ${count} failed to format`).not.toContain(
        "demandReadback.interestWaiting",
      );
      // The number must actually appear — a plural arm that drops `#` would
      // tell the employer that "people are waiting" without saying how many.
      expect(out, `${loc} @ ${count} lost the count`).toContain(String(count));
    }
  });
});
