import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Raw-key-leak guard (production-trust-bugs-p0, issue A).
 *
 * The `journal` namespace is loaded from messages/{locale}/journal.json and
 * FULLY OVERRIDES the base messages/{locale}.json journal block (see
 * lib/i18n/request.ts — object spread, not deep-merge). Owner production
 * finding: `journal.cvBridge` / `journal.cvBridgeLink` rendered as raw keys
 * because those strings existed only in the base file, not the namespace file.
 *
 * This guard asserts every locale's journal namespace file carries real
 * cvBridge + cvBridgeLink values, so the raw key can never surface again.
 */

const MESSAGES = join(__dirname, "..", "..", "messages");
// "fi" joined the taxonomy-locale set 2026-07-04 (PR3B).
const LOCALES = ["en", "lt", "ru", "da", "de", "et", "fi", "lv", "nl", "no", "pl", "sv"];
const REQUIRED = ["cvBridge", "cvBridgeLink"] as const;

describe("journal namespace exposes cvBridge keys in every locale", () => {
  for (const locale of LOCALES) {
    it(`${locale}/journal.json has real cvBridge + cvBridgeLink`, () => {
      const raw = readFileSync(join(MESSAGES, locale, "journal.json"), "utf8");
      const json = JSON.parse(raw) as Record<string, unknown>;
      for (const key of REQUIRED) {
        const value = json[key];
        expect(typeof value, `${locale} ${key} missing`).toBe("string");
        const str = value as string;
        expect(str.trim().length, `${locale} ${key} empty`).toBeGreaterThan(0);
        // Must not be the literal i18n key (the exact production bug symptom).
        expect(str).not.toBe(`journal.${key}`);
        expect(str).not.toBe(key);
      }
    });
  }
});
