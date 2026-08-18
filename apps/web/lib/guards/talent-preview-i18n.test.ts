import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { locales } from "@/lib/i18n/config";

/**
 * TALENT PREVIEW — LOCALIZATION REGRESSION GUARD.
 *
 * `docs/audits/localization-truth-2026-08-18.md` §3 found the talent preview
 * surface rendering English prose for every locale, two English `aria-label`s
 * that a non-English screen reader could not use, and — the actual defect —
 * a job-card approval fallback hardcoded as the literal
 * `"owner-approved laukia"`: English and Lithuanian in one string, shown to
 * RU, NL and DE readers alike.
 *
 * The page is superadmin-gated, so this was never a public-facing bug. It is
 * guarded anyway because <JobDemandCard/> is a reusable presentational card:
 * the next surface that renders it must supply a localised label rather than
 * inherit a hardcoded one, and the type now forces that.
 */

const MESSAGES = resolve(__dirname, "../../messages");
const PAGE = resolve(__dirname, "../../app/[locale]/dashboard/talent/page.tsx");
const CARD = resolve(
  __dirname,
  "../../components/visual/job-demand-card.tsx",
);

function catalogue(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(MESSAGES, `${locale}.json`), "utf8"));
}

function flatten(node: unknown, prefix = "", out: Record<string, string> = {}) {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (typeof node === "string") {
    out[prefix] = node;
  }
  return out;
}

/** Strips block and line comments so an explanatory comment mentioning the
 *  old literal never satisfies — or trips — a source assertion. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const REQUIRED_KEYS = [
  "talentPreview.previewSuffix",
  "talentPreview.intro",
  "talentPreview.badge",
  "talentPreview.workers.title",
  "talentPreview.workers.description",
  "talentPreview.workers.listLabel",
  "talentPreview.jobs.title",
  "talentPreview.jobs.description",
  "talentPreview.jobs.listLabel",
  "talentPreview.jobs.awaitingOwnerApproval",
  "talentPreview.footer",
] as const;

describe("talent preview i18n", () => {
  it("every one of the 11 catalogue files carries the full talentPreview block", () => {
    // Doctrine §2.4: new keys land in all 11 files in the same PR, including
    // the 6 codes that are present-but-not-active.
    for (const locale of locales) {
      const flat = flatten(catalogue(locale));
      const missing = REQUIRED_KEYS.filter((k) => !flat[k]?.trim());
      expect(missing, `${locale}.json is missing talentPreview keys`).toEqual([]);
    }
  });

  it("no catalogue reintroduces the mixed English/Lithuanian approval literal", () => {
    for (const locale of locales) {
      expect(
        flatten(catalogue(locale))["talentPreview.jobs.awaitingOwnerApproval"],
        `${locale} reintroduced the mixed-language literal`,
      ).not.toContain("owner-approved");
    }
  });

  it("the job demand card takes its approval fallback from the caller", () => {
    const source = code(CARD);
    expect(
      source,
      "the card hardcodes an approval label again — it must stay presentational",
    ).not.toContain("owner-approved laukia");
    expect(source).toContain("awaitingApprovalLabel");
  });

  it("the talent page renders no hardcoded aria-label", () => {
    // The two list containers were `aria-label="Sample worker cards"` /
    // `"Sample job demand cards"` — English for every reader.
    expect(code(PAGE)).not.toMatch(/aria-label="/);
  });
});
