import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO INTERFACE NOISE: the "No account required" badge (owner decision 0032,
 * 2026-11-15).
 *
 * Every public function card on the landing's goal navigation carried a badge
 * saying it needed no account. It told the visitor nothing they could act on and
 * was removed with its key (`siteNav.nav.opensNow`) in every catalogue. This
 * guard keeps it from coming back under another key.
 *
 * EXACT STRINGS, WHOLE VALUES. It fails only when a catalogue value IS one of
 * the badge strings below — the exact text that was removed, per locale. A
 * sentence that says something real ("Sending the inquiry is free and needs no
 * account, only a contact e-mail") is information, not a badge, and stays
 * allowed: no broad pattern is matched inside longer text.
 */

const MESSAGES = resolve(__dirname, "../../messages");

/** The removed badge text, exactly as it stood in each catalogue. */
const REMOVED_BADGE: Readonly<Record<string, string>> = {
  lt: "Paskyros nereikia",
  en: "No account required",
  ru: "Учётная запись не нужна",
  pl: "Konto nie jest wymagane",
  de: "Kein Konto erforderlich",
  nl: "Geen account nodig",
  sv: "Inget konto krävs",
  da: "Kræver ingen konto",
  et: "Kontot ei ole vaja",
  lv: "Konts nav nepieciešams",
  no: "Krever ingen konto",
};

function values(node: unknown, prefix = "", out: [string, string][] = []): [string, string][] {
  if (typeof node === "string") out.push([prefix, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => values(v, `${prefix}.${i}`, out));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) values(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

describe("Guard: the 'No account required' badge does not return (decision 0032)", () => {
  for (const [locale, badge] of Object.entries(REMOVED_BADGE)) {
    it(`${locale}: no catalogue value is exactly "${badge}"`, () => {
      const catalogue = JSON.parse(readFileSync(resolve(MESSAGES, `${locale}.json`), "utf8"));
      const hits = values(catalogue)
        .filter(([, v]) => v.trim().toLowerCase() === badge.toLowerCase())
        .map(([k]) => k);
      expect(hits, `${locale}: badge text found at`).toEqual([]);
    });
  }

  it("the removed key is gone from every catalogue", () => {
    for (const locale of Object.keys(REMOVED_BADGE)) {
      const catalogue = JSON.parse(readFileSync(resolve(MESSAGES, `${locale}.json`), "utf8"));
      expect(catalogue.siteNav?.nav?.opensNow, locale).toBeUndefined();
    }
  });
});
