import { NextResponse } from "next/server";

import { buildPrivacyExport } from "@/lib/privacy/export-data";

/**
 * GET — download the caller's OWN data as a JSON file (privacy
 * self-service v1). Every read is an RLS-scoped query as the signed-in
 * user (see lib/privacy/export-data.ts) — no service role, no admin path,
 * nothing about other users. Unauthenticated → 401 (the page linking here
 * is itself auth-gated, so this is a defensive edge, not a flow).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await buildPrivacyExport();
  if (result.kind === "not-authed") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const day = result.bundle.generatedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(result.bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="labourmarket-ai-my-data-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
