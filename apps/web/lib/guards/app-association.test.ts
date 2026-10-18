import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ANDROID_PACKAGE,
  IOS_BUNDLE_ID,
  NATIVE_APP_PATHS,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  normalizeFingerprint,
} from "@/lib/mobile/app-association";

const REPO = resolve(__dirname, "../../../..");
const NATIVE_HOSTS = ["labourmarket.ai", "www.labourmarket.ai"];

/**
 * The native route table as URL paths, from the files that define it.
 * expo-router: `index.tsx` is `/`, `name.tsx` is `/name`, a `(group)`
 * directory adds no segment, and `_layout` / `+not-found` / `+native-intent`
 * are not destinations.
 */
function nativeRoutePaths(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const seg = /^\(.*\)$/.test(entry.name) ? prefix : `${prefix}/${entry.name}`;
      out.push(...nativeRoutePaths(join(dir, entry.name), seg));
      continue;
    }
    const m = /^(.+)\.tsx$/.exec(entry.name);
    if (!m) continue;
    const name = m[1];
    if (name.startsWith("_") || name.startsWith("+")) continue;
    out.push(name === "index" ? prefix || "/" : `${prefix}/${name}`);
  }
  return out;
}

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

/**
 * THE CLAIM IS EXACTLY THE NATIVE ROUTE TABLE — on both sides.
 *
 * Until 2026-09-20 the Apple document claimed `/*` and the Android intent
 * filter claimed the whole host. Nothing failed, because both documents 404
 * until the owner sets the identifiers — and that is exactly why it was
 * dangerous: the first day the association worked, every shared web link
 * (`/lt/dashboard/journal`, `/jobs/<id>`) on a phone with the app installed
 * would have opened the app and landed on `+not-found`. A claim is a promise
 * to handle. So the claimed paths are pinned to the files that can handle
 * them, and the two halves are pinned to each other, because either one
 * drifting alone is a link that opens the wrong thing.
 */
describe("deep-link claim — exactly the screens the app has", () => {
  const routes = nativeRoutePaths(resolve(REPO, "apps/mobile/app")).sort();

  it("NATIVE_APP_PATHS is the route table under apps/mobile/app, no more and no less", () => {
    expect([...NATIVE_APP_PATHS].sort()).toEqual(routes);
    // Sanity: the table this pin was written against. A shrink here is a
    // removed screen and must be a deliberate change on both sides.
    expect(routes).toEqual(
      ["/", "/journal", "/log-work", "/profile", "/register", "/settings", "/sign-in", "/today"],
    );
  });

  it("the Apple document claims those paths exactly — no wildcard, no prefix", () => {
    const doc = buildAppleAppSiteAssociation("ABCDE12345");
    const claimed = doc?.applinks.details[0].components.map((c) => c["/"]) ?? [];
    expect(claimed).toEqual([...NATIVE_APP_PATHS]);
    for (const p of claimed) {
      expect(String(p), `${String(p)} widens the claim beyond a screen the app has`).not.toMatch(/[*?]/);
    }
  });

  it("the Android intent filter claims host × those paths exactly, each entry path-qualified", () => {
    const app = JSON.parse(readFileSync(resolve(REPO, "apps/mobile/app.json"), "utf8")).expo;
    const filters = (app.android.intentFilters ?? []) as {
      data?: { scheme?: string; host?: string; path?: string; pathPrefix?: string; pathPattern?: string }[];
    }[];
    const pairs: string[] = [];
    for (const f of filters) {
      for (const d of f.data ?? []) {
        // A data element with a host and no `path` claims EVERY path on that
        // host, and `pathPrefix: "/"` or a pattern is the same claim spelled
        // differently. Only an exact path is a claim this app can keep.
        expect(d.pathPrefix, `pathPrefix on ${d.host} claims paths the app does not have`).toBeUndefined();
        expect(d.pathPattern, `pathPattern on ${d.host} claims paths the app does not have`).toBeUndefined();
        expect(typeof d.path, `${d.host} is claimed with no path — that is the whole host`).toBe("string");
        pairs.push(`${d.host} ${d.path}`);
      }
    }
    const expected = NATIVE_HOSTS.flatMap((h) => NATIVE_APP_PATHS.map((p) => `${h} ${p}`));
    expect(pairs.sort()).toEqual(expected.sort());
    // The iOS half claims the same two hosts; the AASA served there carries
    // the same paths (asserted above), so both platforms agree.
    for (const h of NATIVE_HOSTS) expect(app.ios.associatedDomains).toContain(`applinks:${h}`);
  });
});
