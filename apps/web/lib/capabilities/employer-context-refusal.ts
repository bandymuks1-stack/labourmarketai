import type { ExecResult } from "@/lib/conversation/executor-contract";

/** Employer-context refusal → an honest capability failure. `context.switch`
 *  is named because it is the caller's own way out of the personal space. */
export function demandContextRefusal(reason: string): ExecResult {
  if (reason === "personal-workspace") {
    return {
      ok: false,
      code: "personal_workspace",
      message:
        "The caller is acting in their personal space. A structured need belongs to an organization — switch with context.switch first.",
    };
  }
  if (reason === "no-organization") {
    return {
      ok: false,
      code: "no_organization",
      message: "This account belongs to no organization, so it cannot create a demand.",
    };
  }
  if (reason === "needs-migration") {
    return {
      ok: false,
      code: "needs_migration",
      message: "The organization store is not enabled on this environment.",
    };
  }
  return {
    ok: false,
    code: "no_company_context",
    message:
      "No employer company resolves for this caller right now (workspace not company-bound, membership missing, or the read failed).",
  };
}
