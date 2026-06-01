import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * LT ↔ EN i18n parity. LT and EN are the two fully-served locales; every
 * user-facing change must land in both with the SAME key structure and no
 * empty/placeholder values, so EN never drifts weaker than LT (or vice versa).
 * (The other locale files are intentionally partial and are not checked here.)
 */

const messages = join(__dirname, "..", "..", "messages");

type Json = Record<string, unknown>;
const load = (rel: string): Json => JSON.parse(readFileSync(join(messages, rel), "utf8"));

function keyPaths(obj: Json, prefix = "", out: string[] = []): string[] {
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    out.push(p);
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) keyPaths(v as Json, p, out);
  }
  return out;
}

function emptyValues(obj: Json, prefix = "", out: string[] = []): string[] {
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (typeof v === "string") {
      if (v.trim() === "") out.push(p);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      emptyValues(v as Json, p, out);
    }
  }
  return out;
}

// Base files + every per-namespace file present under messages/lt/.
const PAIRS = [
  ["lt.json", "en.json"],
  ...readdirSync(join(messages, "lt"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [`lt/${f}`, `en/${f}`] as const),
];

describe("LT and EN message files have identical key structure", () => {
  for (const [ltFile, enFile] of PAIRS) {
    it(`${ltFile} ↔ ${enFile}: same keys`, () => {
      const lt = new Set(keyPaths(load(ltFile)));
      const en = new Set(keyPaths(load(enFile)));
      const ltOnly = [...lt].filter((k) => !en.has(k));
      const enOnly = [...en].filter((k) => !lt.has(k));
      expect(ltOnly, `keys missing from EN: ${ltOnly.slice(0, 20).join(", ")}`).toHaveLength(0);
      expect(enOnly, `keys missing from LT: ${enOnly.slice(0, 20).join(", ")}`).toHaveLength(0);
    });
  }
});

describe("LT and EN have no empty/placeholder string values", () => {
  for (const [ltFile, enFile] of PAIRS) {
    for (const file of [ltFile, enFile]) {
      it(`${file}: no empty string values`, () => {
        const empties = emptyValues(load(file));
        expect(empties, `empty values: ${empties.join(", ")}`).toHaveLength(0);
      });
    }
  }
});
