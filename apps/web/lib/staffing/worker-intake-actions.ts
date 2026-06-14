/**
 * Worker intake → AI profile draft (Staffing Operating Model v1, PR2).
 *
 * Server entry: validate the intake, map it to the `worker_profile` agent input,
 * and return the AI draft as a SUGGESTION (disabled in prod until the owner sets
 * a provider; mock in tests/dev). The caller (the intake form) shows the draft
 * labelled "AI suggestion — review before saving"; nothing is auto-published and
 * no skill/document is verified.
 */
import "server-only";
import { runAiAgent } from "../ai/run-agent-server";
import type { AiAgentOutcome } from "../ai/run-agent";
import type { AiLocale } from "../ai/runtime/types";
import {
  workerIntakeSchema,
  buildWorkerProfileAgentInput,
  type WorkerIntake,
} from "./worker-intake";

export interface WorkerIntakeDraftResult {
  readonly ok: boolean;
  readonly intake?: WorkerIntake;
  readonly draft: AiAgentOutcome;
  readonly error?: string;
}

export async function draftWorkerProfileFromIntake(
  raw: unknown,
  locale: AiLocale,
): Promise<WorkerIntakeDraftResult> {
  const parsed = workerIntakeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      draft: { status: "needs_review", reason: "invalid_input", detail: parsed.error.message },
      error: parsed.error.message,
    };
  }
  const agentInput = buildWorkerProfileAgentInput(parsed.data);
  const draft = await runAiAgent("worker_profile", agentInput, { locale });
  return { ok: true, intake: parsed.data, draft };
}
