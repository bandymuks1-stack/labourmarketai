import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * PROFESSIONAL-HISTORY CONTEXT - structural guard.
 *
 * Behaviour is proven in lib/organization-evidence/professional-history-context.test.ts;
 * this pins what must stay true of the wiring: one reading shared by every
 * surface, every locale carries the words, and the importer can never become
 * a confirmer by a code edit.
 */

const dir = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(dir, p), "utf8").replace(/\r\n/g, "\n");

const pure = read("lib/organization-evidence/professional-history-context.ts");
const reader = read("lib/organization-evidence/history-context-read.ts");
const workerRead = read("lib/organization-evidence/worker-evidence-read.ts");
const block = read("components/app/history-context-block.tsx");

function keysOf(o: unknown, prefix = ""): string[] {
  if (!o || typeof o !== "object") return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    keysOf(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("history context is one reading, not a second store", () => {
  it("the work-model read and the subject/person reads compose the SAME builder", () => {
    expect(workerRead).toMatch(/contextWithLookups\(raw, lookups\)/);
    expect(reader).toMatch(/export async function readRecordHistoryContexts/);
    expect(reader).toMatch(/buildHistoryContext\(/);
    // No table is created or written by the context path.
    for (const src of [pure, reader, workerRead]) {
      expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    }
  });

  it("the importer is never an input to the proof derivation", () => {
    const code = pure.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/imported_?by/i);
  });

  it("nothing in the context can express payment", () => {
    expect(pure).not.toMatch(/\bpaid\b|\bpayment\b.*:\s*(boolean|true|false)/i);
  });

  it("the rendering uses neutral tokens: confirmation colour stays with the standing chip", () => {
    expect(block).not.toMatch(/trust-accent|state-success|bg-\[#|text-\[#/);
    expect(block).not.toMatch(/\bdemo\b/i);
  });
});

describe("historyContext words exist in every active locale", () => {
  const en = JSON.parse(read("messages/en.json")).historyContext;
  const expected = keysOf(en).sort();
  it("English carries the full set, including all six proof concepts", () => {
    expect(expected.length).toBeGreaterThan(15);
    for (const c of [
      "SELF_DECLARED",
      "EVIDENCE_SUPPORTED",
      "EMPLOYER_CONFIRMED",
      "CLIENT_ACCEPTED",
      "SUPERVISOR_CONFIRMED",
      "INDEPENDENTLY_VERIFIED",
    ]) {
      expect(expected).toContain(`proof.${c}`);
    }
  });
  for (const locale of activeLocales) {
    it(`${locale} has the same keys, non-empty`, () => {
      const msgs = JSON.parse(read(`messages/${locale}.json`)).historyContext;
      expect(msgs, `${locale}.json has no historyContext`).toBeTruthy();
      expect(keysOf(msgs).sort()).toEqual(expected);
      for (const k of expected) {
        const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], msgs);
        expect(typeof v === "string" && v.trim().length > 0, `${locale}.${k}`).toBe(true);
      }
    });
  }
});
