"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { env } from "@/lib/env";
import { useAuth } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
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

  return (
    <div className="relative">
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

      {open && (
        <div
          role="dialog"
          aria-label={t("label")}
          className="absolute right-0 z-30 mt-2 max-h-[28rem] w-80 overflow-y-auto rounded-md border border-ink-500 bg-ink-900/95 shadow-card"
        >
          <header className="flex items-center justify-between border-b border-ink-600 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("label")}
            </p>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="font-mono text-[10px] uppercase tracking-label text-brand-blue hover:text-brand-cyan"
              >
                {t("markAllRead")}
              </button>
            )}
          </header>

          {notifications.length === 0 ? (
            <div className="p-5 text-sm">
              <p className="font-display font-semibold text-text-primary">
                {t("emptyTitle")}
              </p>
              <p
                className={cn(
                  "relative mt-1.5 text-text-secondary",
                  env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === "true" &&
                    "rounded-sm outline-dashed outline-1 outline-offset-2 outline-brand-blue/40 p-1.5",
                )}
              >
                {env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === "true" && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-1 -top-3 select-none rounded-sm border border-brand-blue/40 bg-ink-800 px-1 font-mono text-[9px] uppercase tracking-label text-brand-blue"
                  >
                    Placeholder
                  </span>
                )}
                {t("emptyBody")}
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
                        {t("switchRoleCta", { role: tRole(n.role) })}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
