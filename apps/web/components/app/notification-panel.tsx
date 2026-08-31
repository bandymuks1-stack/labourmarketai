"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { MobileSheet } from "@/components/ui/MobileSheet";
import { AnchoredOverlay } from "@/components/ui/anchored-overlay";
import { cn } from "@/lib/utils";
import { RoleIcon } from "@/components/app/role-icon";

/** Authenticated-header notifications dropdown.
 *
 *  REAL derived signals (audit PR5) — the layout feeds the bell the same
 *  per-surface truths the dashboard cards use (unread threads, pending
 *  requests/bookings, responses since last seen). Each signal row LINKS the
 *  exact surface that clears it; visiting is the read event, so there is no
 *  local "mark read" for signals and the bell never claims attention that
 *  isn't real. The cross-role architecture stays wired for future stored
 *  notifications: a notification tagged for role Y while the user is in
 *  role X renders a "Switch to Y to view" CTA. */
export function NotificationPanel() {
  const t = useTranslations("auth.notifications");
  const tRole = useTranslations("auth.signup.role");
  const { notifications, activeRole, switchRole, markAllRead } = useAuth();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read_at).length;

  // Outside-click + Escape live in AnchoredOverlay (the ONE portal root,
  // owner audit P0.3): the popover renders at document.body, so the header's
  // backdrop-blur stacking context can never trap it under the map again.
  // Route change still closes it (owner smoke fix), and ✕ stays.
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("label")}
        // size-11 = 44px, the floor `account-menu.tsx` describes as the one
        // "every header control keeps" — while this button, its immediate
        // neighbour in the same cluster, measured 36x36. Measured at 375px on
        // /lt/dashboard/profile it was the only sub-floor control left in the
        // dashboard header. The icon inside is unchanged; only the hit box grew.
        className="relative inline-flex size-11 items-center justify-center rounded-md border border-ink-500 bg-ink-800 text-text-secondary hover:border-brand-blue hover:text-text-primary"
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

      {/* Desktop: a right-anchored popover through the ONE portal root; on
          phones the same content renders inside a MobileSheet instead. */}
      <AnchoredOverlay
        anchorRef={rootRef}
        open={open}
        onClose={close}
        align="right"
        className="hidden md:block"
      >
        <div
          role="dialog"
          aria-label={t("label")}
          className="max-h-[28rem] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-ink-500 bg-ink-900/95 shadow-card"
        >
          <div className="flex justify-end border-b border-ink-600 px-2 py-1.5">
            <button
              type="button"
              onClick={close}
              aria-label={t("close")}
              data-testid="notification-panel-close"
              className="rounded-md border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary hover:border-brand-blue hover:text-text-primary"
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
          />
        </div>
      </AnchoredOverlay>

      <MobileSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("label")}
        closeLabel={t("close")}
      >
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
  /** Derived signals carry a real count + the surface that clears them. */
  count?: number;
  href?: string;
  /** Stored event whose read state persists — the only kind "mark all read"
   *  may touch. Independent of `href`: a durable row can also link out. */
  durable?: boolean;
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
  chromeless?: boolean;
}) {
  // Localized notification-type labels (dead-UI repair: never the raw enum).
  const tTypes = useTranslations("auth.notifications.types");
  const tPanel = useTranslations("auth.notifications");
  return (
    <>
      {!chromeless && (
        <header className="flex items-center justify-between border-b border-ink-600 px-3 py-2">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {label}
          </p>
          {/* "Mark all read" applies only to stored notifications — derived
              signals clear by visiting their surface; faking them read would
              just be a lie the next page-load reverts.

              Keyed off `durable`, NOT off a missing href. The two were
              conflated before, which meant a stored row could only keep the
              mark-all-read control by having nowhere to go — so every durable
              notification shipped without a destination. */}
          {notifications.some((n) => n.durable) && (
            <button
              type="button"
              onClick={markAllRead}
              className="font-mono text-meta uppercase tracking-label text-brand-blue hover:text-brand-cyan"
            >
              {markAllReadLabel}
            </button>
          )}
        </header>
      )}

      {notifications.length === 0 ? (
        // F4: a real empty inbox is REAL product state, not fabricated data —
        // it renders one compact honest line, never a dev "Placeholder" chip
        // (§18 markers are for fabricated VALUES, e.g. concept cards).
        <div className="p-5 text-sm" data-testid="notification-empty-state">
          <p className="font-display font-semibold text-text-primary">
            {emptyTitle}
          </p>
          <p className="mt-1.5 text-text-secondary">{emptyBody}</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {notifications.map((n) => {
            const crossRole = activeRole !== n.role;
            const rowBody = (
              <p className="flex items-center gap-2 text-xs text-text-secondary">
                <RoleIcon role={n.role} className="h-4 w-4" />
                {/* Dead-UI repair: never print the raw type enum — map to a
                    localized label, neutral fallback for unknown types. */}
                <span className="text-text-primary">
                  {tTypes.has(n.type) ? tTypes(n.type as never) : tTypes("generic")}
                </span>
                {typeof n.count === "number" && (
                  <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-orange px-1.5 text-meta font-bold text-white tabular-nums">
                    {n.count}
                  </span>
                )}
              </p>
            );
            return (
              <li
                key={n.id}
                className={cn(
                  "border-b border-ink-600 last:border-b-0",
                  !n.read_at && "bg-ink-800/40",
                )}
              >
                {n.href ? (
                  // A derived signal IS a next action — the row navigates to
                  // the exact surface that clears it (audit PR5).
                  <Link
                    href={n.href as "/dashboard"}
                    data-testid={`notification-signal-${n.id}`}
                    className="block px-3 py-3 transition-colors hover:bg-ink-800/70"
                  >
                    {rowBody}
                  </Link>
                ) : (
                  <div className="px-3 py-3">{rowBody}</div>
                )}
                {crossRole && (
                  <button
                    type="button"
                    onClick={() => switchRole(n.role)}
                    className="mx-3 mb-3 inline-flex items-center rounded-sm border border-brand-blue/40 px-2 py-1 font-mono text-meta uppercase tracking-label text-brand-blue hover:border-brand-blue"
                  >
                    {switchRoleLabel(n.role)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Control room PR C: one footer link to the unified activity centre —
          the full cross-module view of the SAME spine signals (with filters
          and per-signal read semantics). Panel behaviour is otherwise
          unchanged; the popover already closes on route change. */}
      <footer className="border-t border-ink-600 px-3 py-2">
        <Link
          href={"/dashboard/activity" as "/dashboard"}
          data-testid="notification-panel-view-all"
          className="rounded-sm font-mono text-meta uppercase tracking-label text-brand-blue hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          {tPanel("viewAll")} →
        </Link>
      </footer>
    </>
  );
}
