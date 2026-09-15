import { describe, expect, it } from "vitest";

import {
  ANDROID_PACKAGE,
  IOS_BUNDLE_ID,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  normalizeFingerprint,
} from "@/lib/mobile/app-association";

/**
 * WHAT THIS PROTECTS — that the two deep-link association documents are
 * either CORRECT or ABSENT, and never confidently wrong.
 *
 * THE ASYMMETRY THAT MAKES THIS WORTH GUARDING. Apple and Google fetch these
 * documents and CACHE THE RESULT, including the failure. A file served with a
 * placeholder Team ID or a mistyped fingerprint does not fail loudly at
 * publish time — it poisons the association for as long as the cache holds,
 * and it keeps failing after the correct value is finally set. So "serve
 * nothing" is strictly safer than "serve something plausible", and every
 * assertion below is pointed at the same thing: a bad input must produce
 * `null`, never a document.
 *
 * These are pure functions, so this guard EXECUTES them over real inputs
 * rather than reading the route files as text.
 */

describe("Apple App Site Association", () => {
  it("builds the document when a real Team ID is set", () => {
    const doc = buildAppleAppSiteAssociation("ABCDE12345");
    expect(doc?.applinks.details[0].appIDs).toEqual([`ABCDE12345.${IOS_BUNDLE_ID}`]);
  });

  it("uppercases a Team ID pasted in lower case", () => {
    // Apple prints it uppercase; people paste from anywhere.
    expect(buildAppleAppSiteAssociation("abcde12345")?.applinks.details[0].appIDs).toEqual([
      `ABCDE12345.${IOS_BUNDLE_ID}`,
    ]);
  });

  it("refuses to build without a Team ID", () => {
    for (const v of [undefined, null, "", "   "]) {
      expect(buildAppleAppSiteAssociation(v)).toBeNull();
    }
  });

  it("refuses a placeholder or malformed Team ID rather than serving it", () => {
    // The dangerous inputs: things that LOOK configured. Each of these,
    // served, is a cached failed association.
    for (const v of [
      "TEAMID", // too short
      "YOUR_TEAM_ID", // the value a copied template leaves behind
      "ABCDE123456", // 11 chars
      "ABCDE-1234", // punctuation
      "abcde 12345", // embedded space
    ]) {
      expect(buildAppleAppSiteAssociation(v), `${v} must not produce a document`).toBeNull();
    }
  });

  it("binds to OUR bundle id and nothing else", () => {
    expect(IOS_BUNDLE_ID).toBe("ai.labourmarket.app");
  });
});

describe("Android asset links", () => {
  const FP = "A".repeat(64);
  const COLONED = (FP.match(/.{2}/g) as string[]).join(":");

  it("builds a statement from a colon-separated fingerprint", () => {
    const s = buildAssetLinks(COLONED);
    expect(s?.[0].target.package_name).toBe(ANDROID_PACKAGE);
    expect(s?.[0].target.sha256_cert_fingerprints).toEqual([COLONED]);
    expect(s?.[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
  });

  it("accepts the forms a person actually pastes", () => {
    // Play Console renders fingerprints lower case; some tools drop colons.
    for (const v of [COLONED.toLowerCase(), FP, FP.toLowerCase(), `  ${COLONED}  `]) {
      expect(buildAssetLinks(v)?.[0].target.sha256_cert_fingerprints).toEqual([COLONED]);
    }
  });

  it("carries BOTH certificates when both are given", () => {
    // With Play App Signing the upload certificate and the Google-held
    // app-signing certificate differ. Listing one is the usual reason app
    // links verify in internal testing and fail in production.
    const second = (("B".repeat(64)).match(/.{2}/g) as string[]).join(":");
    const s = buildAssetLinks(`${COLONED},${second}`);
    expect(s?.[0].target.sha256_cert_fingerprints).toEqual([COLONED, second]);
  });

  it("de-duplicates a fingerprint listed twice", () => {
    expect(buildAssetLinks(`${COLONED},${COLONED.toLowerCase()}`)?.[0].target.sha256_cert_fingerprints)
      .toEqual([COLONED]);
  });

  it("refuses to build with nothing configured", () => {
    for (const v of [undefined, null, "", "  ", ","]) {
      expect(buildAssetLinks(v)).toBeNull();
    }
  });

  it("DROPS a malformed fingerprint rather than repairing it", () => {
    // A "helpfully" padded or truncated hash is a wrong hash, and a wrong
    // hash is indistinguishable from an attacker's app claiming our domain
    // as far as the failure mode goes: verification silently never succeeds.
    for (const v of [
      "A".repeat(63), // one nibble short
      "A".repeat(65),
      "G".repeat(64), // not hex
      "YOUR_SHA256_FINGERPRINT",
      COLONED.slice(0, -1),
    ]) {
      expect(buildAssetLinks(v), `${v.slice(0, 24)}… must not produce a statement`).toBeNull();
    }
  });

  it("keeps a good fingerprint when a bad one sits beside it", () => {
    const s = buildAssetLinks(`not-a-hash,${COLONED}`);
    expect(s?.[0].target.sha256_cert_fingerprints).toEqual([COLONED]);
  });

  it("normalizeFingerprint returns null rather than a repaired value", () => {
    expect(normalizeFingerprint("nope")).toBeNull();
    expect(normalizeFingerprint(COLONED)).toBe(COLONED);
  });

  it("binds to OUR package and nothing else", () => {
    expect(ANDROID_PACKAGE).toBe("ai.labourmarket.app");
  });
});
