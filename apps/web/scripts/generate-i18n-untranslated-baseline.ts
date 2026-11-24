import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "../lib/i18n/config";

/**
 * Regenerate the untranslated-string baseline.
 *
 * Run this when you have PAID DOWN debt (translated strings), never to make a
 * failing guard pass. The guard's whole point is that a key which BECOMES
 * identical to English fails even if the total count did not rise — see
 * `lib/guards/i18n-untranslated-ratchet.test.ts`.
 *
 * Usage: pnpm -F web exec tsx scripts/generate-i18n-untranslated-baseline.ts
 */
const webRoot = join(__dirname, "..");
const MESSAGES = join(webRoot, "messages");

type Catalogue = Record<string, string>;

function flatten(node: unknown, prefix = "", out: Catalogue = {}): Catalogue {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (typeof node === "string") {
    out[prefix] = node;
  }
  return out;
}

const load = (locale: string): Catalogue =>
  flatten(JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8")));

const english = load("en");
const baseline: Record<string, string[]> = {};

for (const locale of activeLocales.filter((l) => l !== "en")) {
  const catalogue = load(locale);
  baseline[locale] = Object.keys(english)
    .filter((k) => english[k]!.trim().length > 0 && catalogue[k] === english[k])
    .sort((a, b) => a.localeCompare(b));
}

const target = join(webRoot, "lib", "guards", "i18n-untranslated-baseline.json");
writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(
  Object.entries(baseline)
    .map(([l, keys]) => `${l}=${keys.length}`)
    .join("  "),
);
