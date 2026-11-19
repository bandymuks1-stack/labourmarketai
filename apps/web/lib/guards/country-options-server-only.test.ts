import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — UX gaps 2026-11-18, A-5. `countryOptionsForLocale` builds country
 * names and their order with Intl, whose data differs between Node and the
 * browser. Called during a client component's render it produced option text
 * that did not match the server HTML, and React threw #418 (hydration text
 * mismatch) on the agency's /partners page with a connected client. The list
 * is built on the server and passed down as a prop — as every other country
 * picker already did. No "use client" file may import it as a value.
 */
const WEB = join(__dirname, "..", "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n === ".next" || n.startsWith(".")) return [];
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Client files that still build the list themselves, each with why it cannot
 *  meet the server HTML. A new entry needs the same proof. */
const CLIENT_BUILT: Record<string, string> = {
  "components/app/onboarding-wizard.tsx": "uses the server-built list first; the call is only a fallback",
  "components/app/demand-location-capture.tsx": "the list renders only after the open tap (useState false)",
  "components/app/demand-advanced-sections.tsx": "step 2 of the need form, drawn after the person moves on",
  "components/app/demand-request-button.tsx": "UNVERIFIED: built on every render; check its server HTML before relying on it",
};

describe("country options are built on the server", () => {
  it("no other client component imports countryOptionsForLocale", () => {
    const offenders = [...files(join(WEB, "app")), ...files(join(WEB, "components"))]
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return /^\s*["']use client["']/.test(src) && /import\s*\{[^}]*\bcountryOptionsForLocale\b[^}]*\}\s*from/.test(src);
      })
      .map((f) => relative(WEB, f).split("\\").join("/"))
      .filter((f) => !(f in CLIENT_BUILT));
    expect(offenders).toEqual([]);
    expect(Object.keys(CLIENT_BUILT)).not.toContain("components/app/agency-delegation-panel.tsx");
  });

  it("the partners page hands the delegation panel its list", () => {
    const page = readFileSync(join(WEB, "app/[locale]/dashboard/company/partners/page.tsx"), "utf8");
    expect(page).toMatch(/countryOptions=\{countryOptionsForLocale\(locale\)\}/);
  });
});
