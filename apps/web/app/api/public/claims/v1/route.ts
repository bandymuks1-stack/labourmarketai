import { NextResponse } from "next/server";

import type { ActiveLocale } from "@/lib/i18n/config";
import {
  buildPublicClaimsPayload,
  type MessageTree,
} from "@/lib/public-claims/registry";

/**
 * GET /api/public/claims/v1 — the public claims ↔ product truth contract
 * (`lm-public-claims/v1`).
 *
 * Agentai OS cites a LabourMarket.ai claim in outreach only after re-checking
 * it on the live page; this endpoint tells it WHICH visible fragments to look
 * for on WHICH page, resolved from the same message keys the pages render
 * (`lib/public-claims/registry.ts`). A RETIRED claim stays listed so the
 * consumer stops citing it.
 *
 * Public on purpose: no identity is read and nothing a person owns is in it —
 * only marketing copy that is already on public pages. No database, no
 * network: the payload is built from the bundled message catalogs.
 * `Cache-Control: public, s-maxage=300` — the copy changes only on deploy.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadMessages(locale: ActiveLocale): Promise<MessageTree> {
  // The same per-locale catalog import as lib/i18n/request.ts — the claim
  // fragments are the text the page itself renders.
  const mod = (await import(`../../../../../messages/${locale}.json`)) as {
    default: MessageTree;
  };
  return mod.default;
}

export async function GET(): Promise<NextResponse> {
  const payload = await buildPublicClaimsPayload(loadMessages);
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=300" },
  });
}
