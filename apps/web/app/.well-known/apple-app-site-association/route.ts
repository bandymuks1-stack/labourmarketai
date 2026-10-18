import { NextResponse } from "next/server";

import { buildAppleAppSiteAssociation } from "@/lib/mobile/app-association";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apple App Site Association — how iOS learns that `https://labourmarket.ai/...`
 * belongs to the installed app (Universal Links).
 *
 * SERVED WITHOUT A FILE EXTENSION AND AS `application/json`, both required by
 * Apple. Next's route handler gives us the extensionless path for free; the
 * content type is set explicitly because the default for a bare path is not
 * guaranteed to be what Apple's fetcher accepts.
 *
 * 404 UNTIL THE OWNER SETS `APPLE_TEAM_ID`. See `lib/mobile/app-association.ts`
 * for why a placeholder is worse than absence: Apple caches a failed
 * association, so a wrong document keeps links broken after the right value
 * arrives. A 404 is the honest "this site claims no app" and costs nothing.
 *
 * NOT A SECRET: every published app's Team ID is readable in its own
 * association file. It lives in env because it is deployment identity.
 */
export async function GET() {
  const doc = buildAppleAppSiteAssociation(process.env.APPLE_TEAM_ID);
  if (!doc) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(doc, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
