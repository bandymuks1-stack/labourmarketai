import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE E-MAIL CHECK ON THE HOME SAYS ONE THING (owner decisions 0032 and 0034,
 * 2026-11-24). It keeps its security statement — invitations to an address
 * are shown only to whoever can open that mailbox — and drops the reassurance
 * that followed ("Everything else in your account works as it is …").
 * Locales without the key fall back and carry nothing to trim.
 */
const LOCALES = ["de", "en", "lt", "nl", "pl", "ru", "sv"] as const;
const body = (loc: string): string =>
  (JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${loc}.json`), "utf8")) as {
    network: { incoming: { verify: { body: string } } };
  }).network.incoming.verify.body;

describe("verify-email prompt body: the security statement only", () => {
  for (const loc of LOCALES) {
    it(`${loc}: one sentence, no reassurance`, () => {
      const text = body(loc);
      expect(text.length).toBeGreaterThan(40);
      expect(text).not.toMatch(/Everything else|Alles andere|Visa kita|Al het andere|Wszystko inne|Всё остальное|Allt annat/);
      expect(text.trim().endsWith(".")).toBe(true);
    });
  }
});
