import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Wording guard (production-trust-bugs-p0, issue C).
 *
 * Owner production finding: user-facing copy called the readiness/market
 * readout a "thermometer" ("Termometras" / "Thermometer" / "Термометр"), which
 * misreads as a temperature/health gauge. It was reworded to the honest
 * "market signal" / "Rinkos signalas" / "Рыночный сигнал". This guard keeps the
 * thermometer wording out of the user-facing message catalogue for the enforced
 * locales (en/lt/ru). It scans the rendered i18n strings only — the doctrine
 * quote in docs/PLATFORM_DOCTRINE.md is explanatory prose, not UI copy, and is
 * intentionally untouched.
 */

const MESSAGES = join(__dirname, "..", "..", "messages");
const LOCALES = ["en", "lt", "ru"];
const FORBIDDEN = /termometr|thermomet|термометр/i;

function messageFilesFor(locale: string): string[] {
  const files = [join(MESSAGES, `${locale}.json`)];
  const dir = join(MESSAGES, locale);
  try {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".json")) files.push(join(dir, name));
    }
  } catch {
    // no namespace dir for this locale — base file only
  }
  return files;
}

describe("no thermometer wording in user-facing copy (en/lt/ru)", () => {
  for (const locale of LOCALES) {
    for (const file of messageFilesFor(locale)) {
      it(`${file.slice(file.indexOf("messages"))} is free of thermometer wording`, () => {
        const text = readFileSync(file, "utf8");
        const hit = text.match(FORBIDDEN);
        expect(hit, `forbidden wording found: ${hit?.[0]}`).toBeNull();
      });
    }
  }
});
