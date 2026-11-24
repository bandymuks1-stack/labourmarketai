import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canRequestVerification,
  type CentreDocumentRow,
} from "@/lib/documents/document-centre-model";

/**
 * Worker document verification request (2026-08-17 audit fix).
 *
 * `request_worker_document_verification` (20260613100200) is applied in
 * production and had ZERO callers — the admin review queue could never be
 * filled by a worker, so the document approval chain was broken at its
 * first link. These pins keep the new caller honest:
 *
 *   1. eligibility is the pure rule (stored `ready` + actionable
 *      verification state) — no dead buttons on pending/verified rows or
 *      unreadable axes;
 *   2. the server action calls exactly that RPC and maps every failure
 *      SQLSTATE to an honest state (incl. needs_migration — never a fake
 *      success);
 *   3. the documents page renders the button through the eligibility rule;
 *   4. every locale that carries the documentCentre namespace carries the
 *      verifyRequest labels (no raw keys on screen).
 */

const row = (over: Partial<CentreDocumentRow>): CentreDocumentRow => ({
  id: "00000000-0000-0000-0000-000000000000",
  documentTypeSlug: "a1_certificate",
  country: null,
  validUntil: null,
  storedStatus: "ready",
  derivedStatus: "ready",
  verification: "unverified",
  ...over,
});

describe("eligibility rule", () => {
  it("admits ready+unverified and ready+rejected only", () => {
    expect(canRequestVerification(row({}))).toBe(true);
    expect(canRequestVerification(row({ verification: "rejected" }))).toBe(true);
  });

  it("refuses pending, verified, unreadable axis and non-ready rows", () => {
    expect(canRequestVerification(row({ verification: "pending" }))).toBe(false);
    expect(canRequestVerification(row({ verification: "verified" }))).toBe(false);
    expect(canRequestVerification(row({ verification: null }))).toBe(false);
    expect(canRequestVerification(row({ storedStatus: "missing" }))).toBe(false);
    expect(canRequestVerification(row({ storedStatus: "blocked" }))).toBe(false);
  });

  it("still admits a ready document whose derived status is expiring", () => {
    // The RPC gates on the STORED status; a ready document inside the
    // 30-day window derives `expiring` but remains submittable.
    expect(canRequestVerification(row({ derivedStatus: "expiring" }))).toBe(true);
  });
});

const webRoot = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf-8");

describe("wiring", () => {
  it("the server action calls the applied RPC and maps failures honestly", () => {
    const src = read("lib/documents/document-actions.ts");
    expect(src).toContain('"request_worker_document_verification"');
    expect(src).toContain("needs_migration");
    // The RPC's three raise codes all have an honest mapping.
    for (const code of ['"42501"', '"P0002"', '"22023"']) {
      expect(src).toContain(code);
    }
  });

  it("the documents page renders the button through the eligibility rule", () => {
    const src = read("app/[locale]/dashboard/documents/page.tsx");
    expect(src).toContain("canRequestVerification(d)");
    expect(src).toContain("WorkerDocumentVerifyRequestButton");
    // The axis-readable gate stays in front of the eligibility rule.
    expect(src).toContain("inv.verificationAvailable && canRequestVerification(d)");
  });

  it("the button component keeps the honest degradation states", () => {
    const src = read("components/app/worker-document-verify-request-button.tsx");
    for (const state of ["sent", "not_ready", "unavailable", "error"]) {
      expect(src).toContain(`"${state}"`);
    }
  });

  it("every locale carrying documentCentre carries the verifyRequest labels", () => {
    const locales = ["en", "lt", "de", "nl", "ru"];
    for (const locale of locales) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        documentCentre?: { verifyRequest?: Record<string, string> };
      };
      const block = messages.documentCentre?.verifyRequest;
      expect(block, `${locale}.json documentCentre.verifyRequest`).toBeTruthy();
      for (const key of ["submit", "sent", "notReady", "unavailable", "error"]) {
        expect(
          typeof block?.[key],
          `${locale}.json documentCentre.verifyRequest.${key}`,
        ).toBe("string");
      }
    }
  });
});

describe("AI action boundary (same audit, gap AI-13)", () => {
  it("journal + CV AI suggestion actions authenticate and throttle", () => {
    for (const rel of [
      "lib/journal/journal-ai-suggestions-actions.ts",
      "lib/profile/cv-ai-structuring-actions.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).toContain("supabase.auth.getUser()");
      expect(src, rel).toContain("rateLimit(");
      // The unauthenticated/over-budget answer is the SAME honest `off`
      // the disabled runtime shows — never an error oracle.
      expect(src, rel).toContain('if (!user) return { status: "off" }');
    }
  });

  it("the public company-need action skips the AI draft for rate-limited callers", () => {
    const src = read("lib/staffing/company-need-form-actions.ts");
    const limitedIdx = src.indexOf('persist.code === "rate_limited"');
    const draftIdx = src.indexOf("await draftVacancyFromNeed(");
    expect(limitedIdx).toBeGreaterThan(-1);
    expect(draftIdx).toBeGreaterThan(-1);
    // The rate-limited early return sits BEFORE the model call.
    expect(limitedIdx).toBeLessThan(draftIdx);
  });
});
