/**
 * AI run audit — SERVER store (Internal LLM Agents v1, PR4).
 *
 * Append-only write of one `ai_runs` row via the service-role client. Best
 * effort + honest: if the table is not applied yet (42P01) it returns
 * `degraded` rather than throwing, so an agent run is never blocked by a missing
 * migration — but the caller can surface "audit unavailable" honestly. Never
 * stores raw input/output (only hashes via buildAiRunRow) and never a secret.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAiRunRow, type AiRunRecord } from "./ai-run-row";

export interface AiRunWriteResult {
  readonly ok: boolean;
  /** True when the ai_runs table is not applied yet (migration pending). */
  readonly degraded?: boolean;
}

// The ai_runs table is RED/owner-applied, so it is not yet in the generated
// Supabase types — same pattern as the billing service-role store.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export async function recordAiRun(rec: AiRunRecord): Promise<AiRunWriteResult> {
  try {
    const { error } = await admin().from("ai_runs").insert(buildAiRunRow(rec));
    if (error) {
      if (error.code === "42P01") return { ok: false, degraded: true };
      return { ok: false };
    }
    return { ok: true };
  } catch {
    // Missing service-role config or any IO failure: never block the run.
    return { ok: false };
  }
}
