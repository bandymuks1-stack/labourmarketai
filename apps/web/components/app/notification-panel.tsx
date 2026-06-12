"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { env } from "@/lib/env";
import { useAuth } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import { MobileSheet } from "@/components/ui/MobileSheet";
import { usePopoverDismiss } from "@/lib/hooks/use-popover-dismiss";
import { cn } from "@/lib/utils";

const ROLE_ICON: Record<Role, string> = {
  worker: "🔨",
  company: "🏗️",
  agency: "🤝",
  customer: "🛒",
};

/** Authenticated-header notifications dropdown. Empty state today (no
 *  notifications table yet — schema sketched in DATA_MODEL.md as M2). The
 *  cross-role architecture is wired: a notification tagged for role Y while
 *  the user is in role X renders a "Switch to Y to view" CTA that calls
 *  the same switchRole as the RoleSwitcher. */
export function NotificationPanel() {
  const t = useTranslations("auth.notifications");
  const tRole = useTranslations("auth.signup.role");
  const { notifications, activeRole, switchRole, markAllRead } = useAuth();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read_at).length;

  // Owner smoke fix: the desktop popover used to stay open across page
  // navigation and had no close affordance. Now it closes on route change,
  // outside click, Escape — and renders an explicit ✕ button.
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, close, rootRef);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("label")}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-500 bg-ink-800 text-text-secondary hover:border-brand-blue hover:text-text-primary"
      >
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span
          aria-hidden
          className={cn(
            "absolute right-1.5 top-1.5 h-2 w-2 rounded-full",
            unread > 0 ? "bg-state-live" : "bg-ink-500",
          )}
        />
      </button>

      {/* Desktop: keep a right-anchored popover; on phones it would cover the
          hero, so we render the same content inside a MobileSheet instead. */}
      {open && (
        <div
          role="dialog"
          aria-label={t("label")}
          className="absolute right-0 z-30 mt-2 hidden max-h-[28rem] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-ink-500 bg-ink-900/95 shadow-card md:block"
        >
          <div className="flex justify-end border-b border-ink-600 px-2 py-1.5">
            <button
              type="button"
              onClick={close}
              aria-label={t("close")}
              data-testid="notification-panel-close"
              className="rounded-md border border-ink-500 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              ✕
            </button>
          </div>
          <NotificationsBody
            label={t("label")}
            emptyTitle={t("emptyTitle")}
            emptyBody={t("emptyBody")}
            markAllReadLabel={t("markAllRead")}
            switchRoleLabel={(role) => t("switchRoleCta", { role: tRole(role) })}
            notifications={notifications}
            activeRole={activeRole}
            switchRole={switchRole}
            markAllRead={markAllRead}
            placeholderMarker={env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === "true"}
          />
        </div>
      )}

      <MobileSheet open={open} onClose={() => setOpen(false)} title={t("label")}>
        <NotificationsBody
          label={t("label")}
          emptyTitle={t("emptyTitle")}
          emptyBody={t("emptyBody")}
          markAllReadLabel={t("markAllRead")}
          switchRoleLabel={(role) => t("switchRoleCta", { role: tRole(role) })}
          notifications={notifications}
          activeRole={activeRole}
          switchRole={switchRole}
          markAllRead={markAllRead}
          placeholderMarker={env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === "true"}
          chromeless
        />
      </MobileSheet>
    </div>
  );
}

type Notif = {
  id: string;
  role: Role;
  type: string;
  read_at: string | null;
};

/** Body shared between the desktop popover and the mobile sheet. `chromeless`
 *  hides the redundant header bar when wrapped inside MobileSheet (which has
 *  its own title row already). */
function NotificationsBody({
  label,
  emptyTitle,
  emptyBody,
  markAllReadLabel,
  switchRoleLabel,
  notifications,
  activeRole,
  switchRole,
  markAllRead,
  placeholderMarker,
  chromeless = false,
}: {
  label: string;
  emptyTitle: string;
  emptyBody: string;
  markAllReadLabel: string;
  switchRoleLabel: (role: Role) => string;
  notifications: Notif[];
  activeRole: Role | null;
  switchRole: (r: Role) => void;
  markAllRead: () => void;
  placeholderMarker: boolean;
  chromeless?: boolean;
}) {
  return (
    <>
      {!chromeless && (
        <header className="flex items-center justify-between border-b border-ink-600 px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {label}
          </p>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="font-mono text-[10px] uppercase tracking-label text-brand-blue hover:text-brand-cyan"
            >
              {markAllReadLabel}
            </button>
          )}
        </header>
      )}

      {notifications.length === 0 ? (
        <div className="p-5 text-sm">
          <p className="font-display font-semibold text-text-primary">
            {emptyTitle}
          </p>
          <p
            className={cn(
              "relative mt-1.5 text-text-secondary",
              placeholderMarker &&
                "rounded-sm outline-dashed outline-1 outline-offset-2 outline-brand-blue/40 p-1.5",
            )}
          >
            {placeholderMarker && (
              <span
                aria-hidden
                className="pointer-events-none absolute -right-1 -top-3 select-none rounded-sm border border-brand-blue/40 bg-ink-800 px-1 font-mono text-[10px] uppercase tracking-label text-brand-blue"
              >
                Placeholder
              </span>
            )}
            {emptyBody}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {notifications.map((n) => {
            const crossRole = activeRole !== n.role;
            return (
              <li
                key={n.id}
                className={cn(
                  "border-b border-ink-600 px-3 py-3 last:border-b-0",
                  !n.read_at && "bg-ink-800/40",
                )}
              >
                <p className="flex items-center gap-2 text-xs text-text-secondary">
                  <span aria-hidden>{ROLE_ICON[n.role]}</span>
                  <span className="text-text-primary">{n.type}</span>
                </p>
                {crossRole && (
                  <button
                    type="button"
                    onClick={() => switchRole(n.role)}
                    className="mt-2 inline-flex items-center rounded-sm border border-brand-blue/40 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-brand-blue hover:border-brand-blue"
                  >
                    {switchRoleLabel(n.role)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
