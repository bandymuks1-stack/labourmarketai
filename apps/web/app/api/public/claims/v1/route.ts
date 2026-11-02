import { NextResponse } from "next/server";

import { PRICING_READINESS_STATE } from "@/lib/billing/readiness";
import type { ActiveLocale } from "@/lib/i18n/config";
import { getPlans } from "@/lib/marketing/plans";
import {
  PUBLIC_CLAIMS,
  buildPublicClaimsPayload,
  type MessageTree,
  type PageData,
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
 * only marketing copy that is already on public pages, built from the bundled
 * message catalogs plus the public plan price `/pricing` itself reads
 * (`public_plans_v1`, the anon-safe catalogue RPC).
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

/**
 * The values `/pricing` renders from data, read the way `PricingTable` reads
 * them: `plans.price_eur_monthly` via `getPlans()`, shown only while the plan
 * table is owner-confirmed. A failed read or an unconfirmed table means the
 * page shows no price, so the claim cites none either.
 */
async function loadPageData(): Promise<PageData> {
  if (PRICING_READINESS_STATE !== "owner_confirmed") return { businessPlanPriceEur: null };
  const rows = await getPlans();
  const price = rows?.find((r) => r.slug === "business")?.price_eur_monthly;
  // A €0 card renders `priceFree`, not `pricePerMonth` — not this fragment.
  return { businessPlanPriceEur: typeof price === "number" && price > 0 ? price : null };
}

export async function GET(): Promise<NextResponse> {
  const payload = await buildPublicClaimsPayload(
    loadMessages,
    new Date(),
    PUBLIC_CLAIMS,
    await loadPageData(),
  );
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=300" },
  });
}
