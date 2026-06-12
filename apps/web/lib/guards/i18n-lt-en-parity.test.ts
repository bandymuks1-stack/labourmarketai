import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * LT ↔ EN ↔ RU i18n parity. LT and EN are the two fully-served locales and
 * RU is ACTIVE from 2026-06-12 (workers on the first real sites operate
 * primarily in Russian — doctrine §2.4 amendment); every user-facing change
 * must land in all three with the SAME key structure and no empty /
 * placeholder values, so no active locale drifts weaker than another.
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

// Base files + every per-namespace file present under messages/lt/, paired
// against every other ACTIVE locale (en + ru) — active locales must be
// full-parity or routed pages leak MISSING_MESSAGE (the 2026-05-28 P0).
const NAMESPACE_FILES = readdirSync(join(messages, "lt")).filter((f) => f.endsWith(".json"));
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["lt.json", "en.json"],
  ["lt.json", "ru.json"],
  ...NAMESPACE_FILES.flatMap((f) => [
    [`lt/${f}`, `en/${f}`] as const,
    [`lt/${f}`, `ru/${f}`] as const,
  ]),
];

describe("active-locale message files (LT/EN/RU) have identical key structure", () => {
  for (const [ltFile, otherFile] of PAIRS) {
    it(`${ltFile} ↔ ${otherFile}: same keys`, () => {
      const lt = new Set(keyPaths(load(ltFile)));
      const other = new Set(keyPaths(load(otherFile)));
      const ltOnly = [...lt].filter((k) => !other.has(k));
      const otherOnly = [...other].filter((k) => !lt.has(k));
      expect(ltOnly, `keys missing from ${otherFile}: ${ltOnly.slice(0, 20).join(", ")}`).toHaveLength(0);
      expect(otherOnly, `keys missing from ${ltFile}: ${otherOnly.slice(0, 20).join(", ")}`).toHaveLength(0);
    });
  }
});

describe("active locales have no empty/placeholder string values", () => {
  const FILES = [
    "lt.json",
    "en.json",
    "ru.json",
    ...NAMESPACE_FILES.flatMap((f) => [`lt/${f}`, `en/${f}`, `ru/${f}`]),
  ];
  for (const file of FILES) {
    it(`${file}: no empty string values`, () => {
      const empties = emptyValues(load(file));
      expect(empties, `empty values: ${empties.join(", ")}`).toHaveLength(0);
    });
  }
});
