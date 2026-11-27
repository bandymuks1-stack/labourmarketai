import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CLIENT_MESSAGE_ROOTS } from "@/lib/i18n/client-messages";
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

  it("every reader resolves a record's project through ONE rule: its own link, else its work object's", () => {
    // Owner addendum 2026-11-23: an organization's records can all carry
    // project_id NULL while their work objects carry the project. The context
    // (work model → Living CV, person page profile), the company history and
    // the project documented period read the link the same way; nothing is
    // back-filled.
    expect(pure).toMatch(/export function recordProjectId\(/);
    expect(reader).toMatch(/\.select\("id, name, project_id"\)/);
    expect(reader).toMatch(/recordProjectId\(raw, lookups\.workObjectProjects\)/);
    const companyRead = read("lib/organization-evidence/company-work-history-read.ts");
    const documented = read("lib/organization-evidence/project-documented-period.ts");
    const personRead = read("lib/organization-evidence/company-person-read.ts");
    expect(companyRead).toMatch(/recordProjectId\(r, projectOfObject\)/);
    expect(documented).toMatch(/recordProjectId\(r, projectOfObject\)/);
    expect(personRead).toMatch(/lookups\.workObjectProjects/);
    // No hand-rolled second copy of the fallback.
    for (const src of [companyRead, documented, reader]) {
      expect(src).not.toMatch(/\.projectId \?\? \(r\.workObjectId/);
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

describe("historyContext words reach the browser", () => {
  // The block renders inside client sections (the profile's organization
  // history). Without its namespace in the client pick, every label printed
  // as a raw key ("historyContext.source") on the person's own profile.
  it("the client message pick ships the historyContext namespace", () => {
    expect(CLIENT_MESSAGE_ROOTS).toContain("historyContext");
  });
});
