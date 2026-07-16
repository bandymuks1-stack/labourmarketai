import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Compact home v1 (owner directive 2026-07-16): the dashboard's first screen
 * carries ONLY the essentials — greeting, real pending actions, the status
 * strip and the "Veiksmai" module grid. Everything informational (the hub
 * snapshot, the demand readback, market context, secondary entry points)
 * folds into this ONE native <details> block, closed by default.
 *
 * Honesty rules unchanged: nothing is removed, every demoted section still
 * server-renders with its real data inside the details content — this
 * component owns presentation only (a summary row + a chevron), never data.
 * Native <details> means it works with zero client JS.
 *
 * Anchored deep-link targets (#work-card, #demand-intake) must NEVER be
 * placed inside this block — fragment navigation cannot reliably open a
 * closed <details> in every browser. The page keeps those sections outside.
 */
export async function DashboardMoreSection({ children }: { children: ReactNode }) {
  const t = await getTranslations("auth.dashboard.moreSection");
  return (
    <details
      data-testid="dashboard-more-section"
      className="group rounded-xl border border-border-subtle bg-ink-800/10"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-ink-800/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-sm font-semibold text-text-primary">
            {t("title")}
          </span>
          <span className="text-xs text-text-muted">{t("hint")}</span>
        </span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180"
          strokeWidth={2}
        />
      </summary>
      <div className="flex flex-col gap-6 border-t border-border-subtle p-4 sm:p-5">
        {children}
      </div>
    </details>
  );
}
