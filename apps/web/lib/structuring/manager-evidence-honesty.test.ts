import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 1 — manager/reviewer evidence provenance honesty guard.
 *
 * Manager leadership activity is surfaced as "system-evidenced activity"
 * (Įrodyta sistemos veikla) computed from the manager's own recorded review
 * actions. It must NEVER be presented as an external verification: no
 * "Verified manager", no "Patvirtintas vadovas", no "automatiškai patvirtinta".
 */

const root = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const UI_FILES = [
  "components/app/manager-evidence-card.tsx",
  "messages/lt.json",
  "messages/en.json",
];

const FORBIDDEN = [
  /verified manager/i,
  /patvirtintas vadovas/i,
  /automati[šs]kai patvirtinta/i,
  /verified by ai/i,
  /auto[- ]?verified/i,
];

describe("manager evidence card — no false external-verification language", () => {
  for (const file of UI_FILES) {
    const src = read(file);
    for (const pattern of FORBIDDEN) {
      it(`${file} does not contain ${pattern}`, () => {
        // messages files carry many namespaces — scope the check to the
        // managerEvidence block for the JSON files.
        let scoped = src;
        if (file.endsWith(".json")) {
          const j = JSON.parse(src) as { managerEvidence?: Record<string, string> };
          scoped = JSON.stringify(j.managerEvidence ?? {});
        } else {
          // Strip JS comments — the source intentionally NAMES the forbidden
          // phrases in its doc comment to document that it must not render them.
          scoped = src
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\n]*/g, "");
        }
        expect(scoped).not.toMatch(pattern);
      });
    }
  }

  it("card frames activity as system-evidenced, not externally confirmed", () => {
    const card = read("components/app/manager-evidence-card.tsx");
    expect(card).toMatch(/t\("systemEvidenced"\)/);
    expect(card).toMatch(/t\("distinctionNote"\)/);
  });

  for (const locale of ["lt", "en"] as const) {
    it(`${locale} managerEvidence namespace has the honesty keys`, () => {
      const j = JSON.parse(read(`messages/${locale}.json`)) as {
        managerEvidence?: Record<string, string>;
      };
      const ns = j.managerEvidence ?? {};
      for (const k of [
        "title",
        "systemEvidenced",
        "description",
        "entriesReviewed",
        "confirmations",
        "correctionsRequested",
        "lastActivity",
        "distinctionNote",
      ]) {
        expect(ns[k], `${locale} managerEvidence.${k}`).toBeTruthy();
      }
    });
  }
});
