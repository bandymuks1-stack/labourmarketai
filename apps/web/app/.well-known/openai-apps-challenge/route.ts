import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shape of the token the OpenAI plugin/app portal issues: printable, no
 *  whitespace, bounded. Anything else is refused rather than echoed — this
 *  route must never become a way to serve arbitrary text from the apex. */
const TOKEN_RX = /^[A-Za-z0-9._~:-]{8,256}$/;

/** The served token, or null when unset/malformed. Exported for the test. */
export function openAiChallengeToken(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  return TOKEN_RX.test(v) ? v : null;
}

/**
 * ChatGPT app / plugin DOMAIN VERIFICATION. The submission portal fetches
 * `https://<domain>/.well-known/openai-apps-challenge` at the domain ROOT
 * (it strips any MCP sub-path) and expects the token it issued, as PLAIN
 * TEXT — not JSON, not HTML.
 *
 * 404 UNTIL THE OWNER SETS `OPENAI_APPS_CHALLENGE_TOKEN` on the production
 * deployment (the token is shown in the portal's domain step, after the
 * owner's publisher identity is verified). Same pattern as assetlinks.json and
 * apple-app-site-association: the route exists, the value is the owner's.
 *
 * NOT A SECRET: the portal publishes the expectation that anyone can read it.
 */
export async function GET() {
  const token = openAiChallengeToken(process.env.OPENAI_APPS_CHALLENGE_TOKEN);
  if (!token) return new NextResponse(null, { status: 404 });
  return new NextResponse(token, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
