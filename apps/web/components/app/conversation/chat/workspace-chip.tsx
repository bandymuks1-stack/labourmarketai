"use client";

import { useCallback, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuthOptional } from "@/lib/auth/context";
import {
  PERSONAL_WORKSPACE_ID,
  workspaceDisplayLabels,
  workspaceRelationshipLabel,
  isUnnamedOrganizationLabel,
  type WorkspaceInfo,
} from "@/lib/company/organization-switch";
import { AnchoredOverlay } from "@/components/ui/anchored-overlay";
import { Link } from "@/lib/i18n/navigation";
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
 *   - switching is REAL for every session (owner audit P0.1): the pick goes
 *     through the membership-validated server actions, which set the
 *     server-side session pointer (httpOnly cookie) and, once the owner-gated
 *     migration lands, the durable DB pointer too. No "not enabled yet"
 *     production text exists any more.
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
  const tRel = useTranslations("relationshipTypes");
  const tSwitcher = useTranslations("auth.roleSwitcher");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  /** The last pick the server refused — named in the menu, never silent. */
  const [failedId, setFailedId] = useState<string | null>(null);

  const workspaces = auth?.workspaces ?? [];
  const activeWorkspaceId = auth?.activeWorkspaceId ?? PERSONAL_WORKSPACE_ID;
  const switchWorkspace = auth?.switchWorkspace;
  const pendingId = auth?.pendingWorkspaceId ?? null;

  // The menu STAYS OPEN while the one server call runs: it shows which row is
  // switching, and on a refusal it says so in place. It used to close on the
  // click and discard the answer, so a refused switch looked exactly like a
  // click that did nothing. On success the conversation — and this chip, which
  // lives in its header — remounts for the new workspace.
  const onPick = useCallback(
    async (id: string) => {
      if (!switchWorkspace) return;
      setFailedId(null);
      let accepted = false;
      try {
        accepted = await switchWorkspace(id);
      } catch {
        accepted = false;
      }
      if (accepted) setOpen(false);
      else setFailedId(id);
    },
    [switchWorkspace],
  );

  if (!auth || workspaces.length === 0) return null;

  const active =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  // Unnamed organizations → a phrase that SAYS the name is missing, never a
  // dash row and never the SAME row twice (owner audit defects A/B).
  // TYPE-AWARE, and every phrase says the name is missing (owner walk
  // 2026-09-07). The previous single "Įmonės erdvė" + positional suffix
  // rendered as "Įmonės erdvė 1 / 2" beside a real registered company name,
  // which reads as two more real companies. See workspaceDisplayLabels.
  const unnamedOrganization = {
    company: t("workspaceUnnamedCompany"),
    agency: t("workspaceUnnamedAgency"),
    team: t("workspaceUnnamedTeam"),
    other: t("workspaceUnnamed"),
  } as const;
  const labelById = workspaceDisplayLabels(workspaces, {
    personal: t("workspacePersonal"),
    unnamedOrganization,
  });
  const nameOf = (w: WorkspaceInfo) => labelById.get(w.id) ?? w.name;
  /** Does this row show a "no name stored" phrase rather than a real name? */
  const unnamed = (w: WorkspaceInfo) =>
    w.kind === "organization" &&
    isUnnamedOrganizationLabel(nameOf(w), unnamedOrganization);
  /**
   * WHOSE workspace this is, for every row the person does not own. Two
   * organizations can read "Įmonė be pavadinimo"; the owner's own and someone
   * else's company where they are only an employee must not look the same —
   * the relationship was resolved all along and simply never shown.
   */
  const relationshipOf = (w: WorkspaceInfo): string | null =>
    w.kind === "organization" && w.relationship !== "owner"
      ? workspaceRelationshipLabel(w, {
          owner: tRel("owner"),
          manager: tRel("manager"),
          employee: tRel("employee"),
          other: t("workspaceRelationshipMember"),
        })
      : null;
  /** The chip's own full statement of the acting context (tooltip + a11y). */
  const titleOf = (w: WorkspaceInfo) =>
    [nameOf(w), relationshipOf(w)].filter(Boolean).join(" · ");
  /**
   * THE COMPLETION ACTION, offered only to someone who can actually take it:
   * the owner (or governance admin) of an organization that has no stored name
   * AND is bound to a company — `saveCompanySetup` writes the company, so an
   * unbound organization has nowhere to put a name, and the link was a dead
   * end there.
   */
  const canNameIt = (w: WorkspaceInfo) =>
    unnamed(w) &&
    w.companyBound === true &&
    (w.relationship === "owner" || w.governanceRole === "admin");

  // `min-w-0` on the chip root (both variants below) is what lets `truncate`
  // actually fire. Without it the chip's default `min-width: auto` floors it at
  // its content width, so at 375px it measured 100..255 while the header's
  // search control started at 219 — 36px of the active workspace name rendered
  // UNDERNEATH the search button. The wrapper in the header already had
  // `min-w-0`; a flex item only shrinks if it carries it too.
  //
  // Single-workspace person → a pure indicator, no fake multi-tenancy chrome.
  if (workspaces.length === 1) {
    return (
      <span
        data-testid="workspace-chip"
        className="flex min-h-11 min-w-0 max-w-40 items-center gap-1.5 rounded-full border border-ink-500 px-2.5 text-meta font-medium text-text-secondary sm:max-w-56"
        title={`${t("workspaceLabel")}: ${titleOf(active)}`}
      >
        <span className={`size-2 flex-none rounded-full ${dotClass(active)}`} aria-hidden />
        <span className="truncate">{nameOf(active)}</span>
      </span>
    );
  }

  const pending = pendingId !== null;

  return (
    // `min-w-0` here as well as on the button: this wrapper is the element the
    // header's flex row measures, and its default `min-width: auto` floors it
    // at the button's content width — so the button could never actually use
    // the `truncate` it carries.
    <div className="relative min-w-0" data-testid="workspace-chip">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${t("workspaceLabel")}: ${titleOf(active)}`}
        aria-busy={pending || undefined}
        title={titleOf(active)}
        data-relationship={active.kind === "organization" ? (active.relationship ?? "other") : undefined}
        className="flex min-h-11 min-w-0 max-w-40 cursor-pointer items-center gap-1.5 rounded-full border border-ink-500 px-2.5 py-1 text-meta font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary sm:max-w-56"
      >
        <span className={`size-2 flex-none rounded-full ${dotClass(active)}`} aria-hidden />
        <span className="truncate">{pending ? tSwitcher("switching") : nameOf(active)}</span>
        <ChevronDown {...iconControl("flex-none")} aria-hidden />
      </button>
      {/* The ONE portal root (owner audit P0.3): the menu renders at
          document.body, above every stacking context — never under the map. */}
      <AnchoredOverlay
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        align="left"
      >
        <div
          data-testid="workspace-chip-menu"
          aria-busy={pending || undefined}
          className="w-64 max-w-[calc(100vw-2rem)] rounded-md border border-ink-600 bg-ink-800 p-1.5 shadow-lg"
        >
        <p className="px-2 pb-1 pt-0.5 text-meta font-semibold uppercase tracking-wide text-text-muted">
          {t("workspaceLabel")}
        </p>
        <ul className="flex flex-col gap-0.5">
          {workspaces.map((w) => {
            const isActive = w.id === active.id;
            const isPending = pendingId === w.id;
            const relationship = relationshipOf(w);
            return (
              <li key={w.id}>
                <button
                  type="button"
                  data-testid={`workspace-option-${w.id}`}
                  aria-current={isActive ? "true" : undefined}
                  aria-busy={isPending || undefined}
                  disabled={pending}
                  title={titleOf(w)}
                  onClick={() => {
                    // A pick is `switchWorkspace(id)` below, and it never
                    // rejects — the promise is handled, not discarded.
                    void onPick(w.id).catch(() => setFailedId(w.id));
                  }}
                  className={`flex w-full min-h-11 items-center gap-2 rounded px-2 text-support disabled:cursor-wait ${
                    isActive
                      ? "bg-brand-blue/10 text-text-primary"
                      : "text-text-secondary hover:bg-ink-700 hover:text-text-primary"
                  }`}
                >
                  <span className={`size-2 flex-none rounded-full ${dotClass(w)}`} aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    {/* An organization whose name was never provided reads as a
                        STATE, not as a name (owner walk 2026-09-07): the phrase
                        already says so, and the italic + muted treatment stops it
                        looking like a company called that in a list beside real
                        registered names. */}
                    <span
                      className={`truncate ${unnamed(w) ? "italic text-text-muted" : ""}`}
                      data-unnamed-organization={unnamed(w) ? "yes" : undefined}
                    >
                      {nameOf(w)}
                    </span>
                    {relationship && (
                      <span
                        className="truncate text-meta text-text-muted"
                        data-testid={`workspace-relationship-${w.id}`}
                      >
                        {relationship}
                      </span>
                    )}
                  </span>
                  {isPending ? (
                    <span className="flex-none text-meta text-text-muted" role="status">
                      {tSwitcher("switching")}
                    </span>
                  ) : (
                    isActive && <Check {...iconControl()} aria-hidden className="flex-none text-brand-blue" />
                  )}
                </button>
                {/* THE COMPLETION ACTION, offered only to someone who can
                    actually take it (`canNameIt`). `saveCompanySetup` already
                    rejects a name shorter than two characters, so this closes
                    the loop the legacy backfill left open instead of only
                    describing it; `?org=` names WHICH organization. */}
                {canNameIt(w) && (
                  <Link
                    href={`/dashboard/start/company?org=${encodeURIComponent(w.id)}`}
                    data-testid={`workspace-name-this-${w.id}`}
                    className="mx-2 mb-1 block truncate text-meta text-brand-blue underline-offset-4 hover:underline"
                  >
                    {t("workspaceNameThis")}
                  </Link>
                )}
                {failedId === w.id && !pending && (
                  <p
                    role="status"
                    data-testid="workspace-switch-failed"
                    className="mx-2 mb-1 text-meta text-state-warning"
                  >
                    {t("switchContextFailed")}
                  </p>
                )}
              </li>
            );
          })}
          </ul>
        </div>
      </AnchoredOverlay>
    </div>
  );
}
