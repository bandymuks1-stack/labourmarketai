"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  addRole as addRoleAction,
  switchActiveRole as switchActiveRoleAction,
  type Role,
} from "@/lib/auth/actions";
import {
  clearActiveOrganization as clearActiveOrganizationAction,
  switchActiveOrganization as switchActiveOrganizationAction,
} from "@/lib/company/organization-actions";
import {
  PERSONAL_WORKSPACE_ID,
  type SwitchableOrganization,
  type WorkspaceInfo,
} from "@/lib/company/organization-switch";

export type Notification = {
  id: string;
  role: Role;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  /** Derived-signal notifications (audit PR5): a REAL count from an existing
   *  per-surface model (unread threads, pending requests/bookings, responses
   *  since last seen). They clear by VISITING the surface (`href`), never by
   *  a local "mark read" — the bell only ever states what is actually true. */
  count?: number;
  href?: string;
};

type AuthState = {
  user: { id: string; email: string | null } | null;
  profile: { full_name: string | null; email: string | null } | null;
  activeRole: Role | null;
  roles: Role[];
  /**
   * Server-resolved admin flag. True iff `profiles.active_role === 'admin'`
   * for the current user — orthogonal to the `roles` / `activeRole`
   * workspace catalogue (worker/company/agency/customer). The header
   * role switcher uses this to render an explicit Admin badge instead
   * of falling back to a user-facing role chip (the prior bug — admin
   * fell through `ROLES.has(...)` in `dashboard/layout.tsx` and showed
   * up as DARBUOTOJAS). Server-side admin pages still enforce their
   * own gate via `requireSuperadmin`; this flag is purely a display
   * signal.
   */
  isAdmin: boolean;
  /** Display-only: admin chose to hide admin chrome on normal surfaces (Fix D). */
  adminUiHidden?: boolean;
  /**
   * Display-only: the active company/organization's name, resolved server-side
   * ONLY when the active workspace is the company identity (else null). Lets the
   * header truthfully show WHICH company is active so workspace switching is
   * unambiguous. Never a fabricated name — null when no company row exists yet.
   */
  activeOrgName?: string | null;
  /**
   * Multi-company switching (company architecture v1): the organizations the
   * profile can act as (server-resolved, RLS-scoped, membership-validated)
   * and the server-stored active org id. Empty / single-entry list → no
   * switcher is rendered (honest single-company case). Populated ONLY when
   * the owner-gated active-organization migration is applied — otherwise the
   * server passes an empty list and the header keeps today's behaviour.
   */
  organizations?: SwitchableOrganization[];
  activeOrganizationId?: string | null;
  /**
   * Workspace context (real-user workflow rebuild W1): the ACTIVE WORK CONTEXT
   * for EVERY identity — the personal space plus every organization the person
   * owns, manages or works for (server-resolved from the canonical
   * engagement_contexts spine). Display + orientation only: it never fabricates
   * a membership, and switching persists server-side via the same
   * active-organization pointer (honestly unavailable until the owner-gated
   * migration is applied).
   */
  workspaces?: WorkspaceInfo[];
  /** PERSONAL_WORKSPACE_ID or a membership-validated org id. */
  activeWorkspaceId?: string | null;
  /** False → the workspace chip is an indicator only (no switch offered). */
  workspacePointerAvailable?: boolean;
  notifications: Notification[];
};

type AuthContextValue = AuthState & {
  /** Nav badges derived from the streamed notification spine (P0 perf):
   *  empty until the SpineStream hydrates — badges appear as soon as the
   *  derived signals resolve, without gating the shell's TTFB. */
  badges: Partial<Record<string, number>>;
  switchRole: (role: Role) => Promise<void>;
  addRole: (role: Role) => Promise<void>;
  /** Switch the ACTIVE organization (server-side pointer, then refresh). */
  switchOrganization: (organizationId: string) => Promise<void>;
  /** Switch the ACTIVE workspace — PERSONAL_WORKSPACE_ID clears the pointer,
   *  an org id delegates to switchOrganization. Server-validated, honest
   *  no-op on failure. */
  switchWorkspace: (workspaceId: string) => Promise<void>;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  /** Streamed-spine hydration hook (SpineHydrator only). */
  applySpine: (
    notifications: Notification[],
    badges: Partial<Record<string, number>>,
  ) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initial,
  children,
}: {
  /** `notifications` may be omitted: the notification spine STREAMS in after
   *  first paint (P0 perf — the spine no longer gates TTFB) and hydrates the
   *  context via `applySpine`. The bell is never permanently empty: the
   *  SpineStream server component always renders inside the auth shell and
   *  pushes the real derived signals as soon as they resolve. */
  initial: Omit<AuthState, "notifications"> & {
    notifications?: Notification[];
  };
  children: ReactNode;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(
    initial.notifications ?? [],
  );
  const [badges, setBadges] = useState<
    Partial<Record<string, number>>
  >({});

  const switchRole = useCallback(
    async (role: Role) => {
      await switchActiveRoleAction(role);
      router.refresh();
    },
    [router],
  );

  const addRole = useCallback(
    async (role: Role) => {
      await addRoleAction(role);
      router.refresh();
    },
    [router],
  );

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      // Membership is validated server-side (action + DB trigger); a failed
      // switch simply leaves the current org active — nothing is faked.
      const result = await switchActiveOrganizationAction(organizationId);
      if (result.ok) router.refresh();
    },
    [router],
  );

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const result =
        workspaceId === PERSONAL_WORKSPACE_ID
          ? await clearActiveOrganizationAction()
          : await switchActiveOrganizationAction(workspaceId);
      if (result.ok) router.refresh();
    },
    [router],
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((cur) =>
      cur.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
  }, []);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((cur) => cur.map((n) => ({ ...n, read_at: now })));
  }, []);

  /** Streamed-spine hydration (P0 perf): the SpineStream server component
   *  resolves the derived signals AFTER first paint and pushes them here —
   *  same single spine source, no TTFB gate. Replaces the list wholesale
   *  (server truth wins; per-navigation semantics identical to the old
   *  blocking read). */
  const applySpine = useCallback(
    (next: Notification[], nextBadges: Partial<Record<string, number>>) => {
      setNotifications(next);
      setBadges(nextBadges);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: initial.user,
      profile: initial.profile,
      activeRole: initial.activeRole,
      roles: initial.roles,
      isAdmin: initial.isAdmin,
      adminUiHidden: initial.adminUiHidden ?? false,
      activeOrgName: initial.activeOrgName ?? null,
      organizations: initial.organizations ?? [],
      activeOrganizationId: initial.activeOrganizationId ?? null,
      workspaces: initial.workspaces ?? [],
      activeWorkspaceId: initial.activeWorkspaceId ?? null,
      workspacePointerAvailable: initial.workspacePointerAvailable ?? false,
      notifications,
      badges,
      switchRole,
      addRole,
      switchOrganization,
      switchWorkspace,
      markAsRead,
      markAllRead,
      applySpine,
    }),
    [
      initial.user,
      initial.profile,
      initial.activeRole,
      initial.roles,
      initial.isAdmin,
      initial.adminUiHidden,
      initial.activeOrgName,
      initial.organizations,
      initial.activeOrganizationId,
      initial.workspaces,
      initial.activeWorkspaceId,
      initial.workspacePointerAvailable,
      notifications,
      badges,
      switchRole,
      addRole,
      switchOrganization,
      switchWorkspace,
      markAsRead,
      markAllRead,
      applySpine,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

/**
 * Non-throwing variant: returns null when rendered outside an `<AuthProvider>`.
 * Used by surfaces that must render in BOTH the authenticated app (real auth
 * context) and provider-less contexts such as the dev-only design gallery
 * preview (`/design/conversation`), which renders the conversation shell to
 * capture screenshots without a Supabase session.
 */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
