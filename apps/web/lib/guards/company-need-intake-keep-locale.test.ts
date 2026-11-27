import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { locales } from "@/lib/i18n/config";

/**
 * COMPANY-NEED INTAKE KEEPS THE VISITOR'S LANGUAGE (20261110140000).
 *
 * The production walk of 2026-11-10 stored a German inquiry with locale 'lt':
 * `submit_company_need_public_v1` kept only lt/en/ru. The fix widens that one
 * closed set to the app's UI locales and changes nothing else. These checks pin:
 *   - the SQL set is exactly `locales` from lib/i18n/config.ts, so the two can
 *     never drift apart again;
 *   - the definition is byte-identical to the previous one (20260922130000,
 *     which matches production) except that single line, so no bound, grant
 *     or SECURITY DEFINER setting moves with it;
 *   - the rollback is the previous definition, verbatim;
 *   - the server action really sends the routed locale.
 * The behaviour itself (de/nl/pl kept, unknown/empty/NULL -> 'lt') was run on
 * a local PG16 cluster; the PR body has the output.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const NAME = "20261110140000_company_need_intake_keep_locale_v1";
const PREVIOUS = "20260922130000_company_need_intake_country_registry_v1";

const norm = (s: string): string => s.replace(/\r\n/g, "\n");
const read = (...p: string[]): string => norm(readFileSync(join(REPO, ...p), "utf8"));
/** The statement itself, from `create or replace function` to the end. */
const statement = (sql: string): string => {
  const i = sql.indexOf("create or replace function public.submit_company_need_public_v1(");
  expect(i, "function statement not found").toBeGreaterThan(-1);
  return sql.slice(i);
};

const forward = read("supabase", "migrations", `${NAME}.sql`);
const down = read("supabase", "rollbacks", `${NAME}.down.sql`);
const previous = read("supabase", "migrations", `${PREVIOUS}.sql`);

const OLD_LINE = "  if v_locale not in ('lt','en','ru') then v_locale := 'lt'; end if;";
const localeLine = (sql: string): string =>
  /^ {2}if v_locale not in \(([^)]*)\) then v_locale := 'lt'; end if;$/m.exec(sql)?.[0] ?? "";
const localeSet = (sql: string): string[] =>
  (/^ {2}if v_locale not in \(([^)]*)\)/m.exec(sql)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""));

describe("the intake RPC keeps every UI locale", () => {
  it("its closed locale set is exactly lib/i18n/config.ts `locales`", () => {
    expect(localeSet(forward)).toEqual([...locales]);
  });

  it("every active advert language (de, nl, pl) is in it, and the fallback is still 'lt'", () => {
    for (const l of ["de", "nl", "pl", "lt", "en", "ru", "sv"]) expect(localeSet(forward)).toContain(l);
    expect(statement(forward)).toContain(
      "v_locale  text := lower(coalesce(nullif(btrim(coalesce(p_locale, '')), ''), 'lt'));",
    );
  });

  it("changes nothing but that one line of the previous (production) definition", () => {
    expect(statement(previous)).toContain(OLD_LINE);
    expect(statement(forward).replace(localeLine(forward), OLD_LINE)).toBe(statement(previous));
  });

  it("changes no grant, policy or ownership", () => {
    const code = forward.replace(/--.*$/gm, "").toLowerCase();
    for (const word of ["grant ", "revoke ", "policy", "owner to", "alter function"]) {
      expect(code, `migration contains "${word}"`).not.toContain(word);
    }
    expect(statement(forward)).toMatch(/\n security definer\n set search_path to 'public'\n/);
  });

  it("rolls back to the previous definition, verbatim", () => {
    expect(statement(down)).toBe(statement(previous));
  });
});

describe("the form sends the routed locale", () => {
  it("company-need-form-actions passes the request locale to the intake", () => {
    const action = norm(readFileSync(join(WEB, "lib", "staffing", "company-need-form-actions.ts"), "utf8"));
    expect(action).toContain("const rawLocale = await getLocale();");
    expect(action).toMatch(/persistPublicCompanyNeed\(\{\s*locale: rawLocale,/);
  });
});
