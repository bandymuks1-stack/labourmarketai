import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { readHeldRoles } from "@/lib/auth/held-roles";
import type { Role } from "@/lib/auth/actions";
import {
  getWorkspaceContext,
  readSessionWorkspacePointer,
} from "@/lib/company/active-organization";
import {
  classifyDurablePointer,
  decideDashboardRole,
} from "@/lib/auth/dashboard-role-decision";
import {
  PERSONAL_WORKSPACE_ID,
  actingRoleForWorkspace,
} from "@/lib/company/organization-switch";
import { getPlanning } from "@/lib/planning/planning";
import { visibleRange } from "@/lib/planning/planning-model";
import { baseIdentityForRole } from "@/lib/config/roles";

/**
 * WHAT THE AI KNOWS RIGHT NOW (W4).
 *
 * The owner's list, in order: current workspace · current entity · current
 * company · current project · current conversation · current Work Journal ·
 * current permissions.
 *
 * Every field is resolved from a CANONICAL read — the workspace resolver
 * (`engagement_contexts` spine + the active-organization pointer), the session
 * profile, the held-roles table, and the Time Engine projection. This module
 * runs no query of its own beyond those, names no table, and derives nothing
 * the platform has not already decided.
 *
 * ── UNKNOWN IS A VALUE ────────────────────────────────────────────────────
 * Every fact is nullable and every null means "not known", never "none". An
 * assistant that says "you have no company" when the org read failed is worse
 * than one that says it does not know: the first is a confident lie about the
 * person's own working life. `permissionsKnown` exists for exactly this reason
 * — the roles reader fails closed, and the caller must be able to tell an empty
 * role set from an unread one.
 *
 * The ACTIVE ENTITY and the CONVERSATION SUBJECT are NOT read here: they live
 * in World State on the client (W3), so the caller passes them in. That is the
 * point of World State — one place holds the selection, and the server does not
 * keep a second copy that could disagree.
 */

export interface AiWorkspaceContext {
  /** Current workspace: personal space, or the organization in focus. */
  readonly workspace: {
    readonly id: string;
    readonly name: string | null;
    readonly kind: "personal" | "organization";
    /** How the person relates to it (owner / member …), when known. */
    readonly relationship: string | null;
  } | null;
  /** Current company — the active workspace when it is an organization. */
  readonly company: { readonly id: string; readonly name: string | null } | null;
  /**
   * Current project: the ONE project band covering today that the person is
   * assigned to. Several candidates ⇒ null — the same exactly-one rule the
   * journal's auto-link uses, because ambiguity must be asked about, not
   * guessed.
   */
  readonly project: {
    readonly id: string;
    readonly title: string | null;
    readonly status: string;
  } | null;
  /** Current Work Journal state: the person's most recent real entry. */
  readonly journal: {
    readonly lastEntryDay: string | null;
    readonly entriesInWindow: number;
  } | null;
  /** Current permissions — the roles actually held. */
  readonly roles: readonly Role[];
  /** False when the role read did not answer. Never treat as "no roles". */
  readonly permissionsKnown: boolean;
  /** Which side of the market the person is acting as right now. */
  readonly identity: "person" | "company" | null;
  /** True when a worker profile exists (most worker workflows need one). */
  readonly hasWorkerProfile: boolean;
}

/**
 * Resolve the context. Request-cached: several workflows in one turn share one
 * resolution rather than each re-reading the workspace.
 */
export const loadAiWorkspaceContext = cache(
  async (): Promise<AiWorkspaceContext> => {
    const session = await getSessionProfile();
    if (!session.user) {
      return {
        workspace: null,
        company: null,
        project: null,
        journal: null,
        roles: [],
        permissionsKnown: false,
        identity: null,
        hasWorkerProfile: false,
      };
    }

    const supabase = await createClient();
    const storedRole = (session.profile?.active_role as Role | null) ?? null;

    const [roles, workspaceCtx, workerRow] = await Promise.all([
      readHeldRoles(supabase, session.user.id),
      // The ONE request-scoped resolution the chip renders.
      getWorkspaceContext(),
      supabase.from("workers").select("id").eq("profile_id", session.user.id).maybeSingle(),
    ]);

    const active = workspaceCtx.workspaces.find(
      (w) => w.id === workspaceCtx.activeWorkspaceId,
    );

    // THE ACTING IDENTITY — the SAME derivation the dashboard page hands the
    // chat (owner program 2026-09-23, lane A d3): the person's relationship to
    // the ACTIVE organization workspace over the roles they really hold
    // (`actingRoleForWorkspace`), and where no held role fits, the page's own
    // fallback (`decideDashboardRole`: the stored role when the profile was
    // read, else the person's durable pointer, else UNKNOWN). It used to be
    // `active_role` alone, so the chat could greet an employee of someone
    // else's company as a person while this context told the model it was
    // acting as that company — two identities for one screen.
    const orgWorkspaces = workspaceCtx.workspaces.filter((w) => w.kind === "organization");
    const activeOrgWorkspace =
      orgWorkspaces.find((w) => w.id === workspaceCtx.activeWorkspaceId) ?? null;
    const fallback = decideDashboardRole({
      profileRead: session.profileRead,
      activeRole: storedRole,
      pointer:
        session.profileRead === "failed"
          ? classifyDurablePointer(
              await readSessionWorkspacePointer(session.user.id),
              orgWorkspaces.map((w) => w.id),
            )
          : null,
    });
    const actingRole: Role | null =
      actingRoleForWorkspace(activeOrgWorkspace, [...roles.roles]) ??
      (fallback.kind === "role" ? fallback.role : null);
    const identity = actingRole ? (baseIdentityForRole(actingRole) ?? "person") : null;
    const workspace = active
      ? {
          id: active.id,
          // The personal workspace deliberately carries an empty name — the
          // client owns that label. Null here, never an invented one.
          name: active.name.trim() === "" ? null : active.name,
          kind: active.kind,
          relationship: active.relationship ?? null,
        }
      : null;

    const company =
      workspace && workspace.kind === "organization" && workspace.id !== PERSONAL_WORKSPACE_ID
        ? { id: workspace.id, name: workspace.name }
        : null;

    const { project, journal } = await readWorkContext();

    return {
      workspace,
      company,
      project,
      journal,
      roles: [...roles.roles],
      // The READER now answers this, not a proxy for it (#1314). It used to be
      // `roles.size > 0`, which called a person who genuinely holds no roles
      // "unknown" and could only tell a failed read apart from a real empty by
      // accident. `known` is false exactly when the read did not answer.
      permissionsKnown: roles.known,
      identity,
      hasWorkerProfile: Boolean(workerRow.data?.id),
    };
  },
);

/**
 * Project + journal, from the canonical Time Engine projection.
 *
 * The projection already unifies eight sources under the caller's own RLS, so
 * asking it is cheaper AND more honest than reaching into `projects` and
 * `journal_entries` directly: whatever the calendar shows, the AI sees.
 */
async function readWorkContext(): Promise<
  Pick<AiWorkspaceContext, "project" | "journal">
> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const range = visibleRange("agenda", todayIso);
  const planning = await getPlanning({ rangeStart: range.start, rangeEnd: range.end });
  if (planning.status !== "ok") return { project: null, journal: null };

  const assignedToday = planning.items.filter(
    (it) =>
      it.sourceType === "project" &&
      it.roleContext === "assigned" &&
      it.startDate !== null &&
      it.startDate <= todayIso &&
      (it.endDate === null || it.endDate >= todayIso),
  );
  // Exactly-one rule: two active projects is ambiguity, and a guess here would
  // attach a person's words to the wrong project.
  const project =
    assignedToday.length === 1
      ? {
          id: assignedToday[0].sourceId,
          title: assignedToday[0].label,
          status: assignedToday[0].status,
        }
      : null;

  const journalItems = planning.items.filter((it) => it.sourceType === "journal");
  const days = journalItems
    .map((it) => it.startDate)
    .filter((d): d is string => d !== null)
    .sort();

  return {
    project,
    journal: {
      lastEntryDay: days.length > 0 ? days[days.length - 1] : null,
      entriesInWindow: journalItems.length,
    },
  };
}
