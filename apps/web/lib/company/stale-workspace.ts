import "server-only";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getWorkspaceContext } from "@/lib/company/active-organization";
import {
  DISPLAYED_WORKSPACE_FIELD,
  STALE_CONTEXT_NOTICE,
} from "@/lib/company/organization-switch";
import { isStaleWorkspaceContext } from "@/lib/conversation/dispatch-core";
import { toActiveLocale } from "@/lib/i18n/config";

/**
 * SELECTED WORKSPACE = ACTION CONTEXT, for the server actions that write into
 * "the active organization" (#1849 residue, 2026-09-24).
 *
 * Such an action re-resolves the active workspace at execution time, so a
 * form opened in organization A and submitted after the person switched to B
 * in another tab (the pointer is shared across tabs, devices and MCP) wrote
 * into B — an organization the screen never showed. The conversation
 * dispatcher closed this for chat writes in #1849 by comparing the client's
 * `expectedWorkspaceId` with the ONE resolver; this is that SAME comparison
 * (`isStaleWorkspaceContext`, the SAME resolver, the SAME field name) for the
 * form and button writes.
 *
 * Call it FIRST in the action, before any read that picks the target and
 * outside any try/catch (a caught NEXT_REDIRECT would swallow the refusal).
 * A stale screen is refused before anything runs: the person lands on the
 * home — now rendering the workspace that IS active — with the existing
 * "your workspace changed in another window, nothing was saved" line.
 *
 * `expected` absent (an older client, a caller that does not bind, the chat
 * executors that the dispatcher already checked) → nothing to compare. The
 * value is never authority: membership still gates every write, and this can
 * only refuse, never widen.
 */
export async function refuseStaleWorkspace(expected: unknown): Promise<void> {
  if (typeof expected !== "string" || expected.length === 0 || expected.length > 64) return;
  const workspace = await getWorkspaceContext();
  if (!isStaleWorkspaceContext(expected, workspace.activeWorkspaceId)) return;
  const locale = toActiveLocale(await getLocale());
  redirect(`/${locale}/dashboard?notice=${STALE_CONTEXT_NOTICE}`);
}

/** The displayed workspace a form carried (`DISPLAYED_WORKSPACE_FIELD`). */
export function displayedWorkspaceOf(formData: FormData): string | null {
  const raw = formData.get(DISPLAYED_WORKSPACE_FIELD);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
