/**
 * Company need → AI vacancy draft (Staffing Operating Model v1, PR4).
 *
 * Server entry: validate the need, map it to the `company_need` agent input, and
 * return a normalized vacancy draft as a SUGGESTION (disabled in prod until a
 * provider; mock in dev). The caller shows it "AI suggestion — review before
 * publishing"; nothing is published automatically and no pay is invented.
 */
import "server-only";
import { runAiAgent } from "../ai/run-agent-server";
import type { AiAgentOutcome } from "../ai/run-agent";
import type { AiLocale } from "../ai/runtime/types";
import {
  companyNeedSchema,
  buildCompanyNeedAgentInput,
  type CompanyNeed,
} from "./company-need";

export interface CompanyNeedDraftResult {
  readonly ok: boolean;
  readonly need?: CompanyNeed;
  readonly draft: AiAgentOutcome;
  readonly error?: string;
}

export async function draftVacancyFromNeed(
  raw: unknown,
  locale: AiLocale,
): Promise<CompanyNeedDraftResult> {
  const parsed = companyNeedSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      draft: { status: "needs_review", reason: "invalid_input", detail: parsed.error.message },
      error: parsed.error.message,
    };
  }
  const agentInput = buildCompanyNeedAgentInput(parsed.data);
  const draft = await runAiAgent("company_need", agentInput, { locale });
  return { ok: true, need: parsed.data, draft };
}
