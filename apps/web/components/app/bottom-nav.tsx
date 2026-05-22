"use client";

import { FileText, Home, IdCard, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

// P1.2 (beta hardening): Discover/Search were empty "coming in Mx" dead-ends.
// Replaced with the real, useful surfaces (Profile = work identity, Journal =
// proof) the cockpit already links to — no dead-end nav before beta.
const TABS = [
  { key: "overview", href: "/dashboard", Icon: Home },
  { key: "profile", href: "/dashboard/profile", Icon: IdCard },
  { key: "journal", href: "/dashboard/journal", Icon: FileText },
  { key: "account", href: "/dashboard/account", Icon: User },
] as const;

/** Mobile-only (<768px) bottom tab bar — the primary nav on phones, where the
 *  horizontal DashboardTabs would overflow. Mirrors the same four sections and
 *  active-state logic; hidden on tablet/desktop (`md:hidden`). Honours the iOS
 *  home-indicator inset via `env(safe-area-inset-bottom)`. */
export function BottomNav() {
  const t = useTranslations("auth.dashboard.tabs");
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-600/60 bg-ink-900/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ key, href, Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-tight transition-colors",
                  active
                    ? "text-brand-orange"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                <Icon aria-hidden className="h-5 w-5" strokeWidth={2} />
                <span className="leading-none">{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
