"use server";

import "server-only";

import { loadWorldView } from "./world-read";
import { parseWorldRequest, type WorldViewResult } from "./world-model";

/**
 * The World's single server entrypoint for the client presentation (same thin
 * shape as `market-result-actions.ts`). Input arrives from the browser and is
 * validated before anything is read; authorization is RLS on the rows.
 * Read-only: this module and the read behind it never write.
 */
export async function loadWorldViewAction(input: unknown): Promise<WorldViewResult> {
  const request = parseWorldRequest(input);
  if (!request) return { kind: "invalid" };
  return loadWorldView(request);
}
