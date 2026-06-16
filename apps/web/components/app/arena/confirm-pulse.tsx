import { getTranslations } from "next-intl/server";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { countReviewablePendingEntries } from "@/lib/journal/reviewable-count";
import { CountUp } from "@/components/app/today/count-up";

/**
 * ARENA confirm pulse (TASK 07 slice 2) — the S3.5 one-tap confirm queue
 * woven into the manager's arena rhythm. The count is the REAL gated
 * reviewable set (reviewable_journal_entry_ids RPC, 0 when the RPC is absent
 * or nothing waits — never fabricated). One natural next step: the quick
 * confirm queue. Zero state is honest calm, not an empty promise
 * (DESIGN_SOUL §2 — Kito žingsnio + Ramybės testai).
 */
export async function ConfirmPulse() {
  const pending = await countReviewablePendingEntries();
  const t = await getTranslations("projects.pulse");

  return (
    <section
      className="card-border glow-hover flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 p-5"
      data-testid="arena-confirm-pulse"
    >
      {pending > 0 ? (
        <>
          <span className="flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 shrink-0 text-state-warning" aria-hidden />
            <CountUp
              text={String(pending)}
              className="font-mono text-3xl font-bold tracking-tightest text-text-primary"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-semibold text-text-primary">
              {t("pendingTitle", { n: pending })}
            </span>
            <span className="block text-xs leading-relaxed text-text-secondary">
              {t("pendingBody")}
            </span>
          </span>
          <Link
            href={"/dashboard/inbox/quick" as "/dashboard"}
            data-testid="confirm-pulse-cta"
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-3 text-sm font-semibold text-ink-900 transition-transform duration-fast ease-out hover:-translate-y-0.5 sm:w-auto sm:justify-start"
          >
            {t("cta")} →
          </Link>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-5 w-5 shrink-0 text-state-success" aria-hidden />
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary">
            {t("zero")}
          </span>
          <Link
            href={"/dashboard/inbox/quick" as "/dashboard"}
            data-testid="confirm-pulse-cta"
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-ink-500 px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-ink-700 sm:w-auto sm:justify-start"
          >
            {t("zeroCta")} →
          </Link>
        </>
      )}
    </section>
  );
}
