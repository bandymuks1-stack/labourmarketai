import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import type { Role } from "@/lib/auth/actions";

/**
 * Reachable entry points for the work-journal review chain (slice
 * sales-core-nonstop-v1 reachability fix). The chain surfaces
 * (/dashboard/company, /dashboard/agency, /dashboard/inbox, /dashboard/journal)
 * exist but were NOT linked from the logged-in /dashboard — the primary nav
 * only carries Overview / Profile / Journal / Account. This card makes the
 * chain navigable from the dashboard with role-aware next actions. Real links
 * only (no disabled placeholders, no fake state).
 */
export async function DashboardChainActions({ role }: { role: Role }) {
  const t = await getTranslations("auth.dashboard.chainActions");

  type Action = { href: string; label: string; desc: string; testId: string };
  let actions: Action[] = [];

  if (role === "company" || role === "agency") {
    const ws = role === "company" ? "/dashboard/company" : "/dashboard/agency";
    actions = [
      {
        href: ws,
        label: t("inviteWorker"),
        desc: t("inviteWorkerDesc"),
        testId: "chain-action-invite",
      },
      {
        href: ws,
        label: t("enableReview"),
        desc: t("enableReviewDesc"),
        testId: "chain-action-enable-review",
      },
      {
        href: "/dashboard/inbox",
        label: t("reviewEntries"),
        desc: t("reviewEntriesDesc"),
        testId: "chain-action-review-inbox",
      },
    ];
  } else if (role === "worker") {
    actions = [
      {
        href: "/dashboard/journal",
        label: t("workJournal"),
        desc: t("workJournalDesc"),
        testId: "chain-action-journal",
      },
    ];
  }

  if (actions.length === 0) return null;

  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="dashboard-chain-actions"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("subtitle")}</p>
      </header>
      <ul className="grid gap-2 sm:grid-cols-3">
        {actions.map((a) => (
          <li key={a.testId}>
            <Link
              href={a.href as "/dashboard"}
              data-testid={a.testId}
              className="flex h-full flex-col gap-1 rounded-md border border-ink-700 bg-surface-1 p-3 transition-colors hover:border-brand-blue"
            >
              <span className="text-sm font-semibold text-text-primary">
                {a.label} →
              </span>
              <span className="text-[11px] leading-relaxed text-text-muted">
                {a.desc}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
