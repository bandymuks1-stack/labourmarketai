import "server-only";

import { readRequestHost } from "@/lib/config/request-host";
import { getAiProviderStates } from "./runtime/config";
import { taskEgressPossible } from "./runtime/egress-precheck";
import type { AiTaskType } from "./runtime/task-routing";

/**
 * Server boundary of the egress pre-check (audit 2026-10-16, AI-1): the pure
 * rule in `runtime/egress-precheck.ts` evaluated against the providers the
 * operator actually configured for THIS request. Call sites that read many
 * items per view ask this before `runAiAgent` and degrade honestly with zero
 * ledger IO when no provider may receive the task. Tests mock this module.
 */
export async function aiTaskServableNow(task: AiTaskType): Promise<boolean> {
  const ctx = { requestHost: await readRequestHost() };
  return taskEgressPossible(task, getAiProviderStates(ctx));
}
