import { NextResponse } from "next/server";

import { buildAssetLinks } from "@/lib/mobile/app-association";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Android Digital Asset Links — how Android verifies that
 * `https://labourmarket.ai/...` belongs to the installed app (App Links), and
 * the same document a Play TWA requires to run without a browser address bar.
 *
 * 404 UNTIL THE OWNER SETS `ANDROID_CERT_FINGERPRINTS` (comma-separated
 * SHA-256 fingerprints). With Play App Signing there are normally TWO — the
 * upload certificate and the Google-held app-signing certificate — and
 * listing only one is the usual reason verification passes in testing and
 * fails in production.
 *
 * NOT A SECRET: a fingerprint is a public hash of a certificate, not the key.
 */
export async function GET() {
  const statements = buildAssetLinks(process.env.ANDROID_CERT_FINGERPRINTS);
  if (!statements) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(statements, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
