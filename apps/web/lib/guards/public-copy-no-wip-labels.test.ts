import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

/**
 * PUBLIC COPY CARRIES NO WORK-IN-PROGRESS LABELS (owner P0 2026-11-10,
 * SEO/AEO/GEO + acquisition).
 *
 * A production scan of the public pages in the six active languages found the
 * public intake form ending in "AI draft not generated yet — the assistant is
 * not enabled", and the inquiry button promising a "vacancy draft" the form
 * never makes. A visitor from a search result reads a bare status label as an
 * unfinished site.
 *
 * No value in the namespaces that public (signed-out) pages render may carry a
 * work-in-progress label ("AI draft", "pending review", "TODO", "lorem",
 * "[EN]" …). Saying honestly that the assistant prepares a draft the person
 * reviews is fine; a bare label is not.
 *
 * English left inside a translated catalog is the i18n-untranslated ratchet's
 * job (lib/guards/i18n-untranslated-ratchet.test.ts), not this file's.
 */
const MESSAGES = join(__dirname, "..", "..", "messages");

const PUBLIC_NAMESPACES = [
  "landing",
  "pages",
  "pricing",
  "planBoundary",
  "companyNeed",
  "workerIntake",
  "matchPreview",
  "footer",
] as const;

const WIP_LABEL =
  /\bAI draft\b|\bpending review\b|\bawaiting review\b|\bTODO\b|\bTBD\b|\blorem\b|\[EN\]|\bplaceholder\b|AI juodraštis|KI-Entwurf|AI-concept|Szkic AI|Черновик ИИ/i;

function strings(node: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof node === "string") out.push([path, node]);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) strings(v, `${path}.${k}`, out);
  return out;
}

describe("public pages carry no work-in-progress labels", () => {
  it("the pattern catches the labels found on production and lets honest wording through", () => {
    for (const bad of [
      "AI draft not generated yet — the assistant is not enabled. Your details are not saved.",
      "KI-Entwurf noch nicht erstellt — der Assistent ist nicht aktiviert.",
      "Pending review",
      "[EN] Live demand,",
    ])
      expect(bad, bad).toMatch(WIP_LABEL);
    for (const fine of [
      "We turn it into a clean vacancy draft you review.",
      "2. AI prepares a draft",
      "For example: welders in Luxembourg",
    ])
      expect(fine, fine).not.toMatch(WIP_LABEL);
  });

  for (const locale of activeLocales) {
    it(`${locale}: no label in public namespaces`, () => {
      const messages = JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8"));
      const offenders = PUBLIC_NAMESPACES.flatMap((ns) =>
        strings(messages[ns], ns, [])
          .filter(([, value]) => WIP_LABEL.test(value))
          .map(([key, value]) => `${key} = ${JSON.stringify(value)}`),
      );
      expect(offenders).toEqual([]);
    });
  }
});
