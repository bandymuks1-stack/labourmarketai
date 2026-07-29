"use client";

import { useCallback, useRef } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuthOptional } from "@/lib/auth/context";
import {
  PERSONAL_WORKSPACE_ID,
  type WorkspaceInfo,
} from "@/lib/company/organization-switch";
import { iconControl } from "./icon-scale";

/**
 * Workspace chip (real-user workflow rebuild W1) — the ALWAYS-VISIBLE active
 * work context, mounted BESIDE the conversation window (simple-shell header),
 * per the owner directive: not at the top of a module page, not on a separate
 * page. It answers, at a glance, "which work environment am I in right now?"
 * for every identity — personal space or one of the person's organizations.
 *
 * Honesty contract:
 *   - the membership list is server-resolved from the canonical
 *     engagement_contexts spine (never fabricated);
 *   - a switcher menu renders ONLY for a real multi-workspace person;
 *   - while the owner-gated active-organization migration is unapplied,
 *     switching is honestly unavailable: the menu states so instead of
 *     faking a context change.
 *
 * Accent: each org maps deterministically onto one of the EXISTING brand
 * tokens (no new palette — doctrine frontend constraints); the personal
 * workspace uses the semantic trust accent. The SAME org always gets the
 * SAME hue, everywhere the workspace context is rendered.
 */

/** Index-aligned with WORKSPACE_ACCENT_COUNT — existing brand tokens only.
 *  Exported so OTHER surfaces that label rows with a workspace context (e.g.
 *  the journal stream) render the SAME hue for the SAME organization. */
export const WORKSPACE_ACCENT_DOT = [
  "bg-brand-blue",
  "bg-brand-cyan",
  "bg-brand-violet",
  "bg-brand-purple",
  "bg-brand-orange",
] as const;
const ACCENT_DOT = WORKSPACE_ACCENT_DOT;

/** The personal workspace's semantic trust accent (shared for the same reason). */
export const WORKSPACE_PERSONAL_DOT = "bg-trust-accent";
const PERSONAL_DOT = WORKSPACE_PERSONAL_DOT;

function dotClass(w: WorkspaceInfo): string {
  return w.kind === "personal"
    ? PERSONAL_DOT
    : ACCENT_DOT[w.accentIndex % ACCENT_DOT.length];
}

export function WorkspaceChip() {
  const auth = useAuthOptional();
  const t = useTranslations("conversation.chat");
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const workspaces = auth?.workspaces ?? [];
  const activeWorkspaceId = auth?.activeWorkspaceId ?? PERSONAL_WORKSPACE_ID;
  const pointerAvailable = auth?.workspacePointerAvailable ?? false;
  const switchWorkspace = auth?.switchWorkspace;

  const onPick = useCallback(
    async (id: string) => {
      if (detailsRef.current) detailsRef.current.open = false;
      if (pointerAvailable && switchWorkspace) await switchWorkspace(id);
    },
    [pointerAvailable, switchWorkspace],
  );

  if (!auth || workspaces.length === 0) return null;

  const active =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  const nameOf = (w: WorkspaceInfo) =>
    w.kind === "personal" ? t("workspacePersonal") : w.name;

  // Single-workspace person → a pure indicator, no fake multi-tenancy chrome.
  if (workspaces.length === 1) {
    return (
      <span
        data-testid="workspace-chip"
        className="flex min-h-11 max-w-40 items-center gap-1.5 rounded-full border border-ink-500 px-2.5 text-meta font-medium text-text-secondary sm:max-w-56"
        title={t("workspaceLabel")}
      >
        <span className={`size-2 flex-none rounded-full ${dotClass(active)}`} aria-hidden />
        <span className="truncate">{nameOf(active)}</span>
      </span>
    );
  }

  return (
    <details ref={detailsRef} className="relative" data-testid="workspace-chip">
      <summary
        className="flex min-h-11 max-w-40 cursor-pointer list-none items-center gap-1.5 rounded-full border border-ink-500 px-2.5 py-1 text-meta font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary sm:max-w-56 [&::-webkit-details-marker]:hidden"
        aria-label={t("workspaceLabel")}
      >
        <span className={`size-2 flex-none rounded-full ${dotClass(active)}`} aria-hidden />
        <span className="truncate">{nameOf(active)}</span>
      </summary>
      <div
        data-testid="workspace-chip-menu"
        // z-[60]: one dropdown tier for every header menu (workspace, account,
        // notifications) — they can never interleave with each other's
        // trigger rows or sink under the map (owner audit P0.3).
        className="absolute left-0 top-full z-[60] mt-2 w-64 rounded-md border border-ink-600 bg-ink-800 p-1.5 shadow-lg"
      >
        <p className="px-2 pb-1 pt-0.5 text-meta font-semibold uppercase tracking-wide text-text-muted">
          {t("workspaceLabel")}
        </p>
        <ul className="flex flex-col gap-0.5">
          {workspaces.map((w) => {
            const isActive = w.id === active.id;
            const row = (
              <>
                <span className={`size-2 flex-none rounded-full ${dotClass(w)}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-left">{nameOf(w)}</span>
                {isActive && <Check {...iconControl()} aria-hidden className="flex-none text-brand-blue" />}
              </>
            );
            return (
              <li key={w.id}>
                {pointerAvailable ? (
                  <button
                    type="button"
                    data-testid={`workspace-option-${w.id}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => void onPick(w.id)}
                    className={`flex w-full min-h-11 items-center gap-2 rounded px-2 text-support ${
                      isActive
                        ? "bg-brand-blue/10 text-text-primary"
                        : "text-text-secondary hover:bg-ink-700 hover:text-text-primary"
                    }`}
                  >
                    {row}
                  </button>
                ) : (
                  <span
                    data-testid={`workspace-option-${w.id}`}
                    aria-current={isActive ? "true" : undefined}
                    className={`flex w-full min-h-11 items-center gap-2 rounded px-2 text-support ${
                      isActive ? "bg-brand-blue/10 text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {row}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {!pointerAvailable && (
          <p
            data-testid="workspace-switch-unavailable"
            className="mt-1 border-t border-ink-600 px-2 pb-0.5 pt-1.5 text-meta text-text-muted"
          >
            {t("workspaceSwitchSoon")}
          </p>
        )}
      </div>
    </details>
  );
}
