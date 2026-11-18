import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * German speaks to the reader in the formal Sie, everywhere (owner order
 * 2026-11-10, employer acquisition LU / DE-speaking markets). The DE catalog
 * had drifted into a mix — the landing said "Sie" in one line and "deine
 * nächste Chance" in the next. This pins the formal register: no informal
 * second-person pronoun may address the reader in any German string.
 *
 * First-person lines (the user or the assistant speaking: "Ich suche Arbeit",
 * "Zeig mir Kandidaten") are not address and are not matched — the pattern
 * looks only for du / dich / dir / dein* / euch / euer.
 */
const web = join(__dirname, "..", "..");
const FILES = ["messages/de.json", "messages/de/journal.json"];
const INFORMAL = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|euch|euer|eure|euren|eurem|eurer)\b/i;

function strings(node: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof node === "string") out.push([path, node]);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}

describe("German addresses the reader formally (Sie)", () => {
  for (const file of FILES) {
    it(`${file} has no informal du / dein / euch address`, () => {
      const catalog = JSON.parse(readFileSync(join(web, file), "utf8"));
      const informal = strings(catalog, "", [])
        .filter(([, v]) => INFORMAL.test(v))
        .map(([k]) => k);
      expect(informal).toEqual([]);
    });
  }
});
