import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

import { LEGAL_TEXT_KEY_PREFIXES, MOBILE_LEGAL_TEXT_KEYS, isLegalTextKey } from "./legal-text-keys";

/**
 * LEGAL TEXTS STAY AS WRITTEN (owner decision on #3388, 2026-11-16).
 *
 * The formal-address change rewrote thousands of strings and, with them, some
 * legal-page and consent texts in Lithuanian, Dutch and Polish. Legal texts
 * change only on purpose, in a PR made for that legal change. So each legal
 * text, in every web catalog and in the mobile app, is pinned by a hash of its
 * exact wording. A copy, tone or register pass that touches one fails here and
 * says which.
 *
 * To change a legal text deliberately: change it, then update
 * `legal-texts-baseline.json` in the same PR and say so in the PR text.
 */

const WEB = join(__dirname, "..", "..");
const MESSAGES = join(WEB, "messages");
const MOBILE_CATALOG = join(WEB, "..", "mobile", "src", "i18n", "messages.ts");
const BASELINE = JSON.parse(readFileSync(join(__dirname, "legal-texts-baseline.json"), "utf8")) as {
  web: Record<string, Record<string, string>>;
  mobile: Record<string, Record<string, string>>;
};

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function flat(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "string") out[prefix] = node;
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

/** Every legal text of one web catalog, key → hash of the exact wording. */
function webLegal(file: string): Record<string, string> {
  const strings = flat(JSON.parse(readFileSync(join(MESSAGES, file), "utf8")));
  return Object.fromEntries(
    Object.entries(strings)
      .filter(([key]) => isLegalTextKey(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, sha(value)]),
  );
}

/** The mobile catalogs: `const en = {` then `const lt: Catalogue = {` and so on. */
function mobileLegal(): Record<string, Record<string, string>> {
  const source = readFileSync(MOBILE_CATALOG, "utf8");
  const starts = [...source.matchAll(/^const ([a-z]{2})(?:: Catalogue)? = \{/gm)];
  const out: Record<string, Record<string, string>> = {};
  starts.forEach((m, i) => {
    const body = source.slice(m.index, starts[i + 1]?.index ?? source.length);
    const texts: Record<string, string> = {};
    for (const key of MOBILE_LEGAL_TEXT_KEYS) {
      const found = body.match(new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*("(?:[^"\\\\]|\\\\.)*")`));
      if (found) texts[key] = sha(JSON.parse(found[1]) as string);
    }
    out[m[1]] = texts;
  });
  return out;
}

const webFiles = readdirSync(MESSAGES).filter((f) => f.endsWith(".json")).sort();

describe("legal texts stay as written (owner decision on #3388, 2026-11-16)", () => {
  for (const file of webFiles) {
    it(`web ${file}: every legal text is the pinned wording`, () => {
      const current = webLegal(file);
      const pinned = BASELINE.web[file] ?? {};
      const changed = Object.keys({ ...pinned, ...current }).filter((k) => pinned[k] !== current[k]);
      expect(
        changed,
        `Legal text changed in ${file}: ${changed.join(", ")}. Legal texts change only in a PR made for that legal change, which updates legal-texts-baseline.json and says so.`,
      ).toEqual([]);
    });
  }

  it("mobile: the sign-up acceptance is the pinned wording in every language", () => {
    const current = mobileLegal();
    expect(Object.keys(current).length, "the mobile catalogs were found").toBeGreaterThanOrEqual(7);
    expect(current, "Legal text changed in the mobile app (auth.register.legal).").toEqual(BASELINE.mobile);
  });

  it("the pin covers every catalog; each active locale has all of its legal texts", () => {
    expect(Object.keys(BASELINE.web).sort()).toEqual(webFiles);
    for (const file of webFiles) {
      expect(Object.keys(BASELINE.web[file]).length, `${file} has legal texts`).toBeGreaterThan(0);
    }
    for (const locale of activeLocales) {
      const keys = Object.keys(BASELINE.web[`${locale}.json`]);
      for (const prefix of LEGAL_TEXT_KEY_PREFIXES) {
        expect(keys.some((k) => k === prefix || k.startsWith(`${prefix}.`)), `${locale} has ${prefix}`).toBe(true);
      }
    }
  });

  it("only legal keys are pinned (a legal prefix never matches a look-alike namespace)", () => {
    expect(isLegalTextKey("legal.terms.title")).toBe(true);
    expect(isLegalTextKey("consent.control.granted")).toBe(true);
    expect(isLegalTextKey("auth.legalNotice.signup")).toBe(true);
    expect(isLegalTextKey("legalEntity.name")).toBe(false);
    expect(isLegalTextKey("privacyConsent.status.visible")).toBe(false);
    expect(isLegalTextKey("auth.legalNoticeExtra")).toBe(false);
  });
});

