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

export type Notification = {
  id: string;
  role: Role;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
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
  notifications: Notification[];
};

type AuthContextValue = AuthState & {
  switchRole: (role: Role) => Promise<void>;
  addRole: (role: Role) => Promise<void>;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initial,
  children,
}: {
  initial: AuthState;
  children: ReactNode;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(
    initial.notifications,
  );

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

  const value = useMemo<AuthContextValue>(
    () => ({
      user: initial.user,
      profile: initial.profile,
      activeRole: initial.activeRole,
      roles: initial.roles,
      isAdmin: initial.isAdmin,
      notifications,
      switchRole,
      addRole,
      markAsRead,
      markAllRead,
    }),
    [
      initial.user,
      initial.profile,
      initial.activeRole,
      initial.roles,
      initial.isAdmin,
      notifications,
      switchRole,
      addRole,
      markAsRead,
      markAllRead,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
