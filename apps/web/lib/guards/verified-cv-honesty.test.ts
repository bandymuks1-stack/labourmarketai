import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cvSkillTier,
  groupCvSkillTiers,
} from "../cv-export/skill-tiers";

/**
 * Guard: Verified CV export honesty (S3.5).
 *
 *   1. The tier classifier puts a skill under the CONFIRMED label ONLY when
 *      `verified === true` — even `source = 'manager_confirmed'` alone is
 *      under-stated as evidence, never rendered as confirmed.
 *   2. The confirmed-proof query carries the confirmer's ROLE only — never a
 *      name/email/id (default-closed; no consent flow exists yet).
 *   3. The cvExport copy exists in ALL 10 locales (§2.4), the three tier
 *      labels are distinct, and the non-confirmed tier labels never read as
 *      a confirmation claim. The footer "check on the platform" line exists
 *      and carries NO public link (no public proof page exists).
 *   4. "PDF generation" sanity for the two canonical locales: every key the
 *      CV sheet renders resolves to a non-empty string in LT + EN.
 */

const APP_ROOT = join(__dirname, "..", "..");
const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl"] as const;

function baseMessages(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cvNs(locale: string): any {
  return baseMessages(locale)["cvExport"];
}

describe("Guard: CV skill tiers — confirmed requires verified === true", () => {
  it("verified=true is the ONLY way into the confirmed tier", () => {
    expect(cvSkillTier({ slug: "a", verified: true })).toBe("confirmed");
    expect(
      cvSkillTier({ slug: "a", verified: true, source: "self_declared" }),
    ).toBe("confirmed");
  });

  it("manager_confirmed provenance WITHOUT the verified flag is under-stated as evidence", () => {
    expect(
      cvSkillTier({ slug: "a", verified: false, source: "manager_confirmed" }),
    ).toBe("evidence");
    expect(
      cvSkillTier({ slug: "a", source: "manager_confirmed" }),
    ).not.toBe("confirmed");
  });

  it("journal backing is evidence, never confirmed", () => {
    expect(cvSkillTier({ slug: "a", journalSupported: true })).toBe("evidence");
    expect(cvSkillTier({ slug: "a", source: "work_journal" })).toBe("evidence");
  });

  it("a plain self-declared skill stays declared", () => {
    expect(cvSkillTier({ slug: "a" })).toBe("declared");
    expect(cvSkillTier({ slug: "a", verified: false, source: "self_declared" })).toBe(
      "declared",
    );
    expect(cvSkillTier({ slug: "a", verified: null })).toBe("declared");
  });

  it("grouping preserves every skill exactly once, in its honest tier", () => {
    const tiers = groupCvSkillTiers([
      { slug: "s1", verified: true, source: "manager_confirmed" },
      { slug: "s2", verified: false, source: "manager_confirmed" },
      { slug: "s3", journalSupported: true },
      { slug: "s4" },
    ]);
    expect(tiers.confirmed).toEqual(["s1"]);
    expect(tiers.evidence).toEqual(["s2", "s3"]);
    expect(tiers.declared).toEqual(["s4"]);
  });
});

describe("Guard: confirmed-proof rows are role-only (no confirmer identity)", () => {
  const src = readFileSync(
    join(APP_ROOT, "lib", "cv-export", "verified-cv.ts"),
    "utf8",
  );

  it("queries journal_entry_confirmations with confirmer_role and never selects an identity", () => {
    const confIdx = src.indexOf('journal_entry_confirmations');
    expect(confIdx).toBeGreaterThan(-1);
    // The select() that follows the confirmations table reference.
    const selectMatch = src
      .slice(confIdx)
      .match(/\.select\(\s*"([^"]*)"\s*\)/);
    expect(selectMatch, "confirmations .select() not found").toBeTruthy();
    const columns = selectMatch![1];
    expect(columns).toContain("confirmer_role");
    expect(columns).not.toMatch(/confirmer_id|full_name|email|profiles/);
  });
});

describe("Guard: cvExport copy is present + honest in all 10 locales", () => {
  const RENDERED_KEYS = [
    "pageTitle",
    "exportButton",
    "print",
    "back",
    "primary",
    "skills",
    "skillsEmpty",
    "tiers.confirmed",
    "tiers.evidence",
    "tiers.declared",
    "tierHints.confirmed",
    "tierHints.evidence",
    "tierHints.declared",
    "summary.verifiedSkills",
    "summary.managerConfirmations",
    "summary.journalEntries",
    "proofTitle",
    "proofDate",
    "proofProject",
    "proofRole",
    "proofEmpty",
    "generatedAt",
    "verifyNote",
    "notWorker",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (obj: any, path: string) =>
    path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

  for (const locale of LOCALES) {
    it(`${locale}: every rendered cvExport key exists and is non-empty`, () => {
      const ns = cvNs(locale);
      expect(ns, `cvExport namespace missing in ${locale}.json`).toBeTruthy();
      for (const key of RENDERED_KEYS) {
        const value = get(ns, key);
        expect(
          typeof value === "string" && value.trim().length > 0,
          `cvExport.${key} missing/empty in ${locale}.json`,
        ).toBe(true);
      }
    });

    it(`${locale}: the three tier labels are visually/verbally distinct`, () => {
      const ns = cvNs(locale);
      const labels = [ns.tiers.confirmed, ns.tiers.evidence, ns.tiers.declared];
      expect(new Set(labels).size).toBe(3);
    });

    it(`${locale}: the verify note names no public link (none exists)`, () => {
      expect(cvNs(locale).verifyNote).not.toMatch(/https?:\/\/|www\./i);
    });
  }

  it("LT: pinned honest tier labels (consistent with the platform ladder)", () => {
    const ns = cvNs("lt");
    expect(ns.tiers.confirmed).toBe("Patvirtinta vadovo");
    expect(ns.tiers.declared).toBe("Paties nurodyta");
    // Non-confirmed tier LABELS never carry the confirmation stem.
    expect(ns.tiers.declared).not.toMatch(/patvirtin/i);
    expect(ns.tiers.evidence).not.toMatch(/patvirtin/i);
  });

  it("EN: pinned honest tier labels", () => {
    const ns = cvNs("en");
    expect(ns.tiers.confirmed).toBe("Manager-confirmed");
    expect(ns.tiers.declared).toBe("Self-declared");
    expect(ns.tiers.declared).not.toMatch(/verified|confirmed by/i);
    expect(ns.tiers.evidence).not.toMatch(/verif|confirm/i);
  });

  // The "PDF" is the browser's print of the CV sheet — rendering sanity for
  // the two canonical locales is the LT/EN generation test (no PDF service).
  it("LT + EN: the CV sheet's full label set renders non-empty (print path)", () => {
    for (const locale of ["lt", "en"]) {
      const ns = cvNs(locale);
      const sheet = [
        ns.pageTitle,
        ns.tiers.confirmed,
        ns.tiers.evidence,
        ns.tiers.declared,
        ns.summary.verifiedSkills,
        ns.proofTitle,
        ns.generatedAt,
        ns.verifyNote,
      ].join("\n");
      expect(sheet.split("\n").every((s: string) => s.trim().length > 0)).toBe(true);
    }
  });
});

describe("Guard: CV page stays print-only export (no public route, no PDF dep)", () => {
  const page = readFileSync(
    join(APP_ROOT, "app", "[locale]", "cv", "page.tsx"),
    "utf8",
  );
  const pkg = JSON.parse(readFileSync(join(APP_ROOT, "package.json"), "utf8"));

  it("the CV page is auth-gated (redirects unauthenticated viewers)", () => {
    expect(page).toContain("not_authenticated");
    expect(page).toContain("redirect(");
  });

  it("no heavy PDF dependency was added (browser print only)", () => {
    const deps = Object.keys({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    }).join(",");
    expect(deps).not.toMatch(/jspdf|react-pdf|pdfkit|puppeteer|playwright-pdf|pdfmake/i);
    expect(page).toContain("PrintButton");
  });
});
