/**
 * GUARD — the phone's "post a need" sends the country where the work is.
 *
 * Since #3225 (2026-11-15) `demand.create_draft` refuses a need without a
 * country (`country_required`: a need without one is invisible to every
 * country filter). The phone's form sent none, so EVERY need posted from the
 * app was refused — found by the isolated Android journey (#3482, run
 * 44264112126). The phone now asks for it, required, in the web chat form's
 * own words; the server resolves a typed name to ISO (`resolveCountryCode`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

describe("mobile need: the country is asked for and sent", () => {
  const screen = read("apps/mobile/src/screens/need-intake.tsx");

  it("asks for the country and refuses an empty one on the phone, before any request", () => {
    expect(screen).toContain('testID="need-country"');
    expect(screen).toMatch(/if \(c === ""\) \{\s*setFlow\(\{ kind: "writing", localError: "need\.countryRequired" \}\);\s*return;/);
  });

  it("sends it with the draft (and so with the confirm, which re-sends the draft's fields)", () => {
    expect(screen).toMatch(/description: d,\s*country: c,/);
    expect(screen).toContain('code === "country_required"');
  });

  it("the server resolves a typed name in the draft AND the confirm", () => {
    const registry = read("apps/web/lib/capabilities/registry.ts");
    expect(registry).toContain("const draft = withResolvedCountry(companyCreateDemandFields.parse(input));");
    expect(registry).toContain("const draft = withResolvedCountry(typed);");
    expect(registry).toContain("resolveCountryCode(draft.country) ?? draft.country");
  });

  it("uses the web's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const web = JSON.parse(read(`apps/web/messages/${locale}.json`));
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start));
      const pairs: [string, string][] = [
        ["need.countryLabel", web.conversation.forms.fields.demandCountry],
        ["need.countryPlaceholder", web.conversation.forms.fields.demandCountryPlaceholder],
        ["need.countryRequired", web.auth.dashboard.wow.demand.form.countryRequired],
      ];
      for (const [k, v] of pairs) expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(v)}`);
    }
  });
});
