"use server";

import "server-only";

import { loadMarketResult, type MarketResultData } from "./market-result";

/**
 * The market result's single server entrypoint, for the client ResultPanel.
 *
 * Thin on purpose (same shape as the Context Panel's `context-actions.ts`): it
 * delegates and returns. All authorization is RLS on the underlying rows.
 */
export async function loadMarketResultAction(): Promise<MarketResultData> {
  return loadMarketResult();
}
