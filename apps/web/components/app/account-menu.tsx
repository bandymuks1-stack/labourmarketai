"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/lib/utils";
import { User, LogOut, Shield, Sun, Moon, type LucideIcon } from "lucide-react";

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
  const { user, profile, isAdmin, adminUiHidden } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // First-use UX (2026-07-04): the light/dark toggle used to live ONLY deep in
  // /dashboard/account, so new users never discovered it. This mirrors the
  // exact storage contract of <ThemeToggle/> (dataset.theme + localStorage
  // "theme"; the no-flash bootstrap in the root layout replays it) — same
  // mechanism, one more surface, no redesign.
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setThemeState(current === "light" ? "light" : "dark");
  }, []);
  const nextTheme: "dark" | "light" = theme === "light" ? "dark" : "light";
  function toggleTheme() {
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem("theme", nextTheme);
    } catch {
      /* private mode — toggle still works for the session */
    }
    setThemeState(nextTheme);
  }

  // UTILITY-ONLY dropdown (IA cleanup): the name menu carries only account
  // utilities — Admin (gated) + Account + Logout. Product areas were REMOVED
  // from here so they are not hidden in the user-name menu:
  //   - Skills      → lives on the Profile surface (#candidate-skills).
  //   - Projects    → reachable from the company / project-operations context.
  //   - Instructions→ reachable from the attention-instructions / ops surfaces.
  //   - Bookings    → no primary-IA home yet → documented RED (needs-IA), route
  //                   stays valid (no dead link), just not surfaced here.
  // (See docs/owner-input/contact-message-demand-cleanup-p0-audit.md §A.)
  const featureLinks: { href: string; label: string; icon: LucideIcon; testid: string }[] = [
    // Admin — gated; kept OFF the mobile bottom nav to avoid crowding it.
    ...(isAdmin && !adminUiHidden
      ? [{ href: "/dashboard/admin", label: t("tabs.admin"), icon: Shield, testid: "account-menu-admin-link" }]
      : []),
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
          <button
            type="button"
            role="menuitem"
            onClick={toggleTheme}
            data-testid="account-menu-theme-toggle"
            aria-label={`${t("account.theme.appearance")}: ${nextTheme === "dark" ? t("account.theme.toDark") : t("account.theme.toLight")}`}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-text-primary hover:bg-ink-700"
          >
            {nextTheme === "dark" ? (
              <Moon className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
            ) : (
              <Sun className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
            )}
            {nextTheme === "dark" ? t("account.theme.toDark") : t("account.theme.toLight")}
          </button>
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
