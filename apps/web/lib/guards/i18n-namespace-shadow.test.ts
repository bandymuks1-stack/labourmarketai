import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

/**
 * A NAMESPACE FILE SHADOWS THE BASE CATALOGUE — a key in the wrong file is a
 * raw key on screen.
 *
 * `lib/i18n/request.ts` builds the message tree as
 * `{ ...base, journal: journal.json, professions: professions.json, … }`.
 * The spread puts the base catalogue's top-level `journal` block in first, and
 * the per-namespace file then REPLACES it whole. A `journal.*` key that lives
 * only in `<locale>.json` therefore never reaches next-intl, which resolves
 * it to itself — the raw-message-key leak class (see
 * `raw-message-key-leak-class`): the page renders, no test fails, and a person
 * reads "journal.verification.state.self_reported" as the trust line of
 * every journal entry. That is exactly what production showed from 2026-09-07
 * (PR #1600 added the block to the base file) until 2026-09-11, while the
 * vocabulary guard passed because it read the base file too.
 *
 * THE RULE. For every namespace `request.ts` loads from its own file, the base
 * catalogue may not carry a key under that name that the namespace file does
 * not also carry. Duplicated keys are tolerated here (the namespace copy wins
 * at runtime, the base copy is dead) — a base-only key is the defect.
 */

const MESSAGES = join(__dirname, "..", "..", "messages");
const REQUEST = readFileSync(join(__dirname, "..", "i18n", "request.ts"), "utf8");

type Json = Record<string, unknown>;
const load = (rel: string): Json => JSON.parse(readFileSync(join(MESSAGES, rel), "utf8"));

function keyPaths(obj: Json, prefix = "", out: string[] = []): string[] {
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) keyPaths(v as Json, p, out);
    else out.push(p);
  }
  return out;
}

/** `messageKey: file.default` pairs derived from request.ts itself, paired
 *  with the `import(\`../../messages/${locale}/<file>.json\`)` lines — read
 *  from the source so a namespace added later is covered without editing
 *  this guard. */
function overriddenNamespaces(): Array<{ key: string; file: string }> {
  const files = [...REQUEST.matchAll(/messages\/\$\{locale\}\/([a-z-]+)\.json/g)].map((m) => m[1]!);
  const keys = [...REQUEST.matchAll(/^\s+([A-Za-z]+):\s*[A-Za-z]+\.default,?$/gm)].map((m) => m[1]!);
  expect(files.length, "request.ts namespace imports").toBeGreaterThan(0);
  expect(keys.length, "request.ts message keys").toBe(files.length);
  return files.map((file, i) => ({ key: keys[i]!, file: `${file}.json` }));
}

describe("i18n — no base-catalogue key is shadowed by a namespace file", () => {
  const namespaces = overriddenNamespaces();

  it("reads the namespaces request.ts actually overrides (journal among them)", () => {
    expect(namespaces.map((n) => n.key)).toContain("journal");
    expect(namespaces.map((n) => n.key)).toContain("productivityUnits");
  });

  for (const locale of activeLocales) {
    for (const { key, file } of namespaces) {
      it(`${locale}: every base '${key}.*' key also exists in ${locale}/${file} (or the base has none)`, () => {
        const base = load(`${locale}.json`);
        const block = base[key];
        if (!block || typeof block !== "object") return;
        const ns = new Set(keyPaths(load(`${locale}/${file}`)));
        const shadowed = keyPaths(block as Json).filter((k) => !ns.has(k));
        expect(
          shadowed,
          `${locale}.json carries '${key}.<key>' entries the runtime never loads — move them into ${locale}/${file}: ${shadowed.slice(0, 10).join(", ")}`,
        ).toEqual([]);
      });
    }
  }
});
