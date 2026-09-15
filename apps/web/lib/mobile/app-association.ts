/**
 * DEEP-LINK ASSOCIATION — the two documents that turn `https://labourmarket.ai/...`
 * links into openings of the native app, instead of a browser tab beside it.
 *
 * Pure. No IO, no framework. The route handlers serve what these functions
 * build so the SHAPE is unit-testable without a server.
 *
 * ── WHY THESE ARE ENV-DRIVEN AND 404 WHEN UNSET ──────────────────────────
 *
 * Both documents embed an identifier this repository cannot possess:
 *
 *   · Apple needs `<TeamID>.<BundleID>`. The bundle id is ours
 *     (`ai.labourmarket.app`); the Team ID belongs to an Apple Developer
 *     Program membership, which is an owner gate.
 *   · Google needs the SHA-256 fingerprint of the certificate that SIGNS the
 *     shipped app. With Play App Signing that is the fingerprint Google
 *     itself holds, readable only from the Play Console — an owner gate.
 *
 * A placeholder would be worse than nothing in a way that is easy to
 * underestimate. Apple and Google FETCH AND CACHE these files, and a
 * malformed or wrong-identifier document is cached as a failed association:
 * the association then stays broken after the real value arrives, for as long
 * as the cache holds. So an unset identifier answers 404 — "this site does
 * not claim an app" — which is the truthful statement and the one that costs
 * nothing to correct later.
 *
 * THE OWNER ACTION IS ONE ENVIRONMENT VARIABLE EACH. No code change, no
 * deploy of new logic: set the value and the document starts answering.
 *
 * NEITHER VALUE IS A SECRET. An Apple Team ID appears in every app's own
 * association file, and a signing-certificate FINGERPRINT is a public hash
 * (it is not the key). They live in env because they are deployment
 * identity, not because they are confidential.
 */

/** Ours, and fixed — it is `apps/mobile/app.json`'s `ios.bundleIdentifier`. */
export const IOS_BUNDLE_ID = "ai.labourmarket.app";

/** Ours, and fixed — `apps/mobile/app.json`'s `android.package`. */
export const ANDROID_PACKAGE = "ai.labourmarket.app";

/** An Apple Team ID is 10 uppercase alphanumerics. */
const TEAM_ID_RE = /^[A-Z0-9]{10}$/;

/** A SHA-256 fingerprint: 32 uppercase hex byte pairs, colon-separated. */
const FINGERPRINT_RE = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

/**
 * Normalize a fingerprint as a person will paste it — Play Console shows them
 * lowercase, some tools omit the colons. Anything that is not 64 hex digits
 * after cleaning is REJECTED rather than repaired: a silently "fixed"
 * fingerprint that is wrong produces exactly the cached-failure above.
 */
export function normalizeFingerprint(raw: string): string | null {
  const hex = raw.trim().replace(/:/g, "").toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(hex)) return null;
  const pairs = hex.match(/.{2}/g);
  if (!pairs) return null;
  const out = pairs.join(":");
  return FINGERPRINT_RE.test(out) ? out : null;
}

export type AppleAppSiteAssociation = {
  readonly applinks: {
    readonly details: ReadonlyArray<{
      readonly appIDs: readonly string[];
      readonly components: ReadonlyArray<Record<string, unknown>>;
    }>;
  };
};

/**
 * Build the Apple App Site Association document, or `null` when the Team ID
 * is absent or malformed.
 *
 * The component list claims EVERY path. That is deliberate and correct here:
 * this product's deep links are ordinary product routes, and a person
 * following any link to their own work should land in the app they installed.
 */
export function buildAppleAppSiteAssociation(
  teamId: string | undefined | null,
): AppleAppSiteAssociation | null {
  const id = (teamId ?? "").trim().toUpperCase();
  if (!TEAM_ID_RE.test(id)) return null;
  return {
    applinks: {
      details: [
        {
          appIDs: [`${id}.${IOS_BUNDLE_ID}`],
          components: [{ "/": "/*", comment: "All product routes open in the app." }],
        },
      ],
    },
  };
}

export type AssetLinksStatement = {
  readonly relation: readonly string[];
  readonly target: {
    readonly namespace: "android_app";
    readonly package_name: string;
    readonly sha256_cert_fingerprints: readonly string[];
  };
};

/**
 * Build the Android Digital Asset Links statement list, or `null` when no
 * usable fingerprint is configured.
 *
 * MORE THAN ONE FINGERPRINT IS NORMAL AND SUPPORTED (comma-separated): with
 * Play App Signing the upload certificate and the Google-held app-signing
 * certificate differ, and internal-testing builds may carry a third. Listing
 * only one is the common reason app links verify in testing and fail in
 * production.
 */
export function buildAssetLinks(
  fingerprints: string | undefined | null,
): readonly AssetLinksStatement[] | null {
  const parsed = (fingerprints ?? "")
    .split(",")
    .map((f) => normalizeFingerprint(f))
    .filter((f): f is string => f !== null);
  if (parsed.length === 0) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: [...new Set(parsed)],
      },
    },
  ];
}
