import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

/**
 * Admin-context banner (production-trust-bugs-p0, issue D).
 *
 * Owner production finding: when an operator is inside the admin subtree it was
 * not visibly clear they were in a different (elevated) mode, and there was no
 * obvious way back to their own space. This banner renders at the top of every
 * `/[locale]/dashboard/admin/*` page so the active mode is unambiguous and a
 * one-click exit to the normal dashboard is always present. It REMOVES no admin
 * access — it only labels the active mode and offers a clear return path.
 *
 * Pure presentational server component (no schema / RLS / auth changes). The
 * admin gate stays in `layout.tsx` (`requireSuperadmin`).
 */
export async function AdminContextBanner() {
  const t = await getTranslations("admin.mode");
  return (
    <div
      data-testid="admin-context-banner"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand-orange/50 bg-brand-orange/10 px-3 py-2"
    >
      <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand-orange">
        <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <span>{t("active")}</span>
      </span>
      <Link
        href="/dashboard"
        data-testid="admin-context-exit"
        className="inline-flex shrink-0 items-center rounded-md border border-brand-orange/40 px-2.5 py-1 text-xs font-medium text-brand-orange transition-colors hover:bg-brand-orange/15 hover:text-text-primary"
      >
        ← {t("exit")}
      </Link>
    </div>
  );
}
