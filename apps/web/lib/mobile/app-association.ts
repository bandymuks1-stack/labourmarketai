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

/**
 * THE PATHS THE NATIVE APP CAN ACTUALLY OPEN — and therefore the ONLY paths
 * either association document may claim.
 *
 * This is `apps/mobile/app/`'s route table, read as URL paths: `index.tsx`
 * is `/`, `sign-in.tsx` is `/sign-in`, and the `(shell)` group's screens are
 * reachable without the group segment. It is NOT the web's route table.
 *
 * WHY NOT `/*`. Until 2026-09-20 the Apple document claimed every path and
 * the Android intent filter claimed the whole host. The native app has eight
 * screens; the web has some forty locale-prefixed routes
 * (`/lt/dashboard/journal`, `/jobs/<id>`, …) that the app does not have. The
 * moment the owner set `APPLE_TEAM_ID` / `ANDROID_CERT_FINGERPRINTS`, every
 * shared web link on a phone with the app installed would have opened the
 * app and landed on `+not-found` — a working association that breaks every
 * real link. A claim is a promise to handle; this list is exactly what is
 * handled.
 *
 * NOT A MAPPING. A web URL such as `/lt/dashboard/journal` is not rewritten
 * to `/journal` here or in the app (no `+native-intent.tsx`): the web's
 * routes are locale-prefixed and named differently (`/lt/auth/login` vs
 * `/sign-in`), so there is no clean 1:1 rule, and a partial one would open
 * the app for some links and the browser for others. Widen this list only
 * when the app gains the screen — the guard reads the route directory and
 * refuses a path with no file behind it.
 *
 * Both documents are derived from the same constant so the two halves cannot
 * disagree; `lib/guards/app-association.test.ts` pins `app.json` to it too.
 */
export const NATIVE_APP_PATHS: readonly string[] = [
  "/",
  "/sign-in",
  "/register",
  "/today",
  "/journal",
  "/log-work",
  "/profile",
  "/settings",
];

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
 * The component list claims EXACTLY `NATIVE_APP_PATHS` — each as an exact
 * match, no wildcard. Any other `https://labourmarket.ai/...` link keeps
 * opening in the browser, which is where that route exists.
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
          components: NATIVE_APP_PATHS.map((path) => ({
            "/": path,
            comment: `A screen the native app has (${path}).`,
          })),
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
