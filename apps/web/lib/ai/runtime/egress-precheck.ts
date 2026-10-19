/**
 * EGRESS PRE-CHECK — can ANY provider lawfully receive this task right now?
 *
 * Audit 2026-10-16 (AI-1). A task whose sensitivity no configured provider
 * may receive — a SENSITIVE_FREE_TEXT translation with the Gemini grant
 * suspended, a PERSONAL match explanation on an anonymous surface — still
 * went through `runAiAgent`: two budget counts, two attribution lookups and
 * two ledger inserts per message, for an answer the gate was always going to
 * refuse. Callers that read many items per view (a 12-message thread) can ask
 * this first and degrade honestly with zero IO.
 *
 * The verdict is the SAME rule the chain applies (`egressPermitted` over the
 * provider profiles and the grant table), evaluated against the providers the
 * operator actually configured. It never widens anything: a `true` here only
 * means the chain MAY find a route; the chain still decides.
 *
 * Pure over its inputs. No IO.
 */
import { AI_PROVIDER_PROFILES, type AiProviderState } from "./provider-chain";
import { AI_EGRESS_GRANTS, egressPermitted, type AiEgressGrant } from "./data-egress";
import { sensitivityForTask } from "./data-sensitivity";
import type { AiTaskType } from "./task-routing";

export function taskEgressPossible(
  task: AiTaskType,
  providerStates: readonly AiProviderState[],
  grants: readonly AiEgressGrant[] = AI_EGRESS_GRANTS,
): boolean {
  const sensitivity = sensitivityForTask(task);
  for (const state of providerStates) {
    if (state.health !== "ready") continue;
    const profile = AI_PROVIDER_PROFILES.find((p) => p.id === state.id);
    if (!profile) continue;
    if (!profile.capabilities.includes(task)) continue;
    if (egressPermitted(profile, sensitivity, grants, task).permitted) return true;
  }
  return false;
}
