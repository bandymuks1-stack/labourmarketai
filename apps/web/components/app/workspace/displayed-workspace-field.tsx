"use client";

import { useAuthOptional } from "@/lib/auth/context";
import { DISPLAYED_WORKSPACE_FIELD } from "@/lib/company/organization-switch";

/**
 * The workspace this screen DISPLAYS — the value the shell rendered with, the
 * same one the chat sends to the dispatcher (`inline-action-form`,
 * `candidates-result`). A switch in THIS tab refreshes it; a switch elsewhere
 * leaves it on the old workspace, which is exactly what lets the server
 * refuse a stale write (`refuseStaleWorkspace`). Undefined outside the
 * dashboard shell (no binding → the server compares nothing).
 */
export function useDisplayedWorkspaceId(): string | undefined {
  return useAuthOptional()?.activeWorkspaceId ?? undefined;
}

/** A form's copy of {@link useDisplayedWorkspaceId}, as a hidden field. */
export function DisplayedWorkspaceField() {
  const workspaceId = useDisplayedWorkspaceId();
  if (!workspaceId) return null;
  return <input type="hidden" name={DISPLAYED_WORKSPACE_FIELD} value={workspaceId} />;
}
