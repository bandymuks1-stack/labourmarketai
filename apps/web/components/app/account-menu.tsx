"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/lib/utils";
import {
  IdCard,
  Wrench,
  FolderKanban,
  ClipboardList,
  User,
  LogOut,
  type LucideIcon,
} from "lucide-react";

/**
 * Authenticated-header account dropdown. Surfaces the two controls that
 * MUST be reachable from every dashboard page without first navigating
 * to the account tab:
 *
 *   1. "Mano paskyra" / Account  — link to /dashboard/account
 *   2. "Atsijungti"  / Sign out  — form POST to /[locale]/auth/logout
 *
 * Logout is a real HTML form submit (not a fetch) so it survives a
 * non-JS render path and triggers the route handler's redirect cleanly.
 * The dropdown closes on outside-click and Escape. No profile / role /
 * skill / company mutation happens here — logout only calls signOut.
 */
export function AccountMenu() {
  const t = useTranslations("auth.dashboard");
  const locale = useLocale();
  const { user, profile, activeRole } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Secondary reachability for the routes that are NOT primary nav tabs (the
  // primary nav is intentionally capped at 4 to avoid mobile crowding). Role-
  // gated: a worker reaches their card + instructions; a manager reaches
  // projects + instructions. Additive — never replaces the account link/logout.
  const isManager = activeRole === "company" || activeRole === "agency";
  const featureLinks: { href: string; label: string; icon: LucideIcon; testid: string }[] = [
    ...(activeRole === "worker"
      ? [
          { href: "/dashboard/player-card", label: t("menuLinks.playerCard"), icon: IdCard, testid: "account-menu-player-card-link" },
          { href: "/dashboard/profile#candidate-skills", label: t("menuLinks.skills"), icon: Wrench, testid: "account-menu-skills-link" },
        ]
      : []),
    ...(isManager
      ? [{ href: "/dashboard/projects", label: t("menuLinks.projects"), icon: FolderKanban, testid: "account-menu-projects-link" }]
      : []),
    { href: "/dashboard/instructions", label: t("menuLinks.instructions"), icon: ClipboardList, testid: "account-menu-instructions-link" },
  ];

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const displayName = profile?.full_name?.trim() || profile?.email || user?.email || "";
  const initial = (displayName || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("tabs.account")}
        data-testid="account-menu-trigger"
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-500 bg-ink-800 text-sm font-semibold text-text-primary hover:border-brand-blue",
          open && "border-brand-blue",
        )}
      >
        <span aria-hidden>{initial}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-1.5rem)] rounded-md border border-ink-500 bg-ink-900/95 p-2 shadow-card"
        >
          {displayName && (
            <p className="truncate px-2 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
              {displayName}
            </p>
          )}
          {featureLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              data-testid={l.testid}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-text-primary hover:bg-ink-700"
            >
              <l.icon className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
              {l.label}
            </Link>
          ))}
          <Link
            href="/dashboard/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            data-testid="account-menu-account-link"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-text-primary hover:bg-ink-700"
          >
            <User className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
            {t("tabs.account")}
          </Link>
          <form
            action={`/${locale}/auth/logout`}
            method="post"
            className="mt-1"
          >
            <button
              type="submit"
              role="menuitem"
              data-testid="account-menu-signout"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-state-danger hover:bg-state-danger/10"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t("account.logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
