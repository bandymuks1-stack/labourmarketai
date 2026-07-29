import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CV_MAX_BYTES } from "@/lib/cv/cv-import-client";
import { MAX_CV_BYTES } from "@/lib/cv/extract";

/**
 * §10 CV UPLOAD — the owner visual-acceptance contract.
 *
 *   - the person is NEVER handed a byte budget ("iki 5 MB");
 *   - the system carries the size itself, and the ceiling that remains is an
 *     abuse bound no real CV reaches;
 *   - what the action costs is stated BEFORE it — no hidden LMC charge.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const UPLOAD = read("components/app/cv-import-upload.tsx");
const SERVED = ["lt", "en", "ru", "nl", "de"] as const;

type CvCopy = {
  uploadFormats?: string;
  uploadErrorSize?: string;
  uploadCostNote?: string;
};
const cvCopy = (loc: string): CvCopy => {
  const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
    structuring?: { cv?: CvCopy };
  };
  return msgs.structuring?.cv ?? {};
};

describe("§10 no byte budget is pushed onto the person", () => {
  for (const loc of SERVED) {
    it(`${loc}: the format line states formats only — no size requirement`, () => {
      const copy = cvCopy(loc);
      expect(copy.uploadFormats, `${loc}.uploadFormats`).toBeTruthy();
      // No megabyte figure, in any of the served spellings.
      expect(copy.uploadFormats ?? "").not.toMatch(/\bMB\b|\bМБ\b|megabyte/i);
      expect(copy.uploadFormats ?? "").not.toMatch(/\biki\b|\bup to\b|\bдо\b/i);
    });

    it(`${loc}: the oversize error tells the person what to DO, not a limit to obey`, () => {
      const err = cvCopy(loc).uploadErrorSize ?? "";
      expect(err, `${loc}.uploadErrorSize`).toBeTruthy();
      expect(err).not.toMatch(/\bMB\b|\bМБ\b/i);
      // It offers a real alternative rather than only refusing.
      expect(err.length).toBeGreaterThan(40);
    });

    it(`${loc}: the cost is stated in words before the action`, () => {
      const note = cvCopy(loc).uploadCostNote ?? "";
      expect(note, `${loc}.uploadCostNote`).toBeTruthy();
      // LMC is named explicitly — the person is never left guessing.
      expect(note).toMatch(/LMC/);
    });
  }

  it("the upload surface renders the cost note", () => {
    expect(UPLOAD).toContain("cv-upload-cost-note");
    expect(UPLOAD).toContain("uploadCostNote");
  });
});

describe("§10 the system carries the size, not the user", () => {
  it("the ceiling is an abuse bound no real CV reaches", () => {
    // A generous input ceiling is safe because the REAL cost drivers are
    // bounded separately (extracted-text cap + parse timeout).
    expect(MAX_CV_BYTES).toBeGreaterThanOrEqual(20 * 1024 * 1024);
    const extract = read("lib/cv/extract.ts");
    expect(extract).toMatch(/MAX_EXTRACTED_CHARS/);
    expect(extract).toMatch(/PARSE_TIMEOUT_MS/);
  });

  it("client and server ceilings can never drift apart", () => {
    expect(CV_MAX_BYTES).toBe(MAX_CV_BYTES);
  });

  it("no hidden charge: the upload path takes no payment and grants no entitlement", () => {
    // Code, not prose: the comments explain WHY there is no charge, which is
    // exactly the honesty being asserted. Match real usage instead.
    const code = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
    for (const [rel, src] of [
      ["components/app/cv-import-upload.tsx", UPLOAD],
      ["lib/cv/cv-import-client.ts", read("lib/cv/cv-import-client.ts")],
    ] as const) {
      const c = code(src);
      expect(c, rel).not.toMatch(/stripe|checkout/i);
      expect(c, rel).not.toMatch(/chargeLmc|spendLmc|debitLmc|grantEntitlement/i);
    }
  });
});
