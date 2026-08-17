import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import type { MyLeaveBalancesResult } from "@/lib/leave/balances";

/**
 * Worker-facing leave balance panel (derived read-model, v1).
 *
 * Renders ONLY where an organization configured a leave policy — an honest
 * empty state otherwise. Numbers are the org's OWN configuration; the copy
 * says plainly that balances are guidance and the manager decides — never a
 * legal claim, never a block. Nothing is stored: every number is derived at
 * render time from approved absences.
 */
export async function LeaveBalancePanel({
  data,
}: {
  data: MyLeaveBalancesResult;
}) {
  if (data.status === "not-authed") return null;
  const t = await getTranslations("absences");

  if (data.status === "needs-migration") {
    // The policies store is not applied in this environment — say nothing
    // rather than fake a number; the page's absence flow works regardless.
    return null;
  }

  return (
    <Card className="flex flex-col gap-3">
      <header className="flex flex-col gap-1" data-testid="leave-balance-panel">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("balance.title", { year: data.year })}
        </h2>
        <p className="text-meta leading-relaxed text-text-muted">
          {t("balance.advisoryNote")}
        </p>
      </header>
      {data.balances.length === 0 ? (
        <p
          className="text-sm text-text-secondary"
          data-testid="leave-balance-empty"
        >
          {t("balance.noPolicy")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="leave-balance-list">
          {data.balances.map((b) => (
            <li
              key={`${b.organizationId}-${b.absenceType}`}
              className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
              data-testid={`leave-balance-${b.absenceType}`}
            >
              <span className="text-sm text-text-primary">
                {t(`types.${b.absenceType}`)}
              </span>
              {b.organizationName ? (
                <span className="text-meta text-text-muted">
                  {b.organizationName}
                </span>
              ) : null}
              <span
                className={`ml-auto font-mono text-sm tabular-nums ${
                  b.remainingDays < 0 ? "text-state-warning" : "text-text-primary"
                }`}
              >
                {t("balance.remaining", { days: b.remainingDays })}
              </span>
              <span className="font-mono text-meta tabular-nums text-text-muted">
                {t("balance.detail", {
                  entitlement: b.entitlementDays,
                  carryover: b.carryoverDays,
                  used: b.usedDays,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
