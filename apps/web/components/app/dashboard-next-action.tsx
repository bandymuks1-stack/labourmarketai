import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import type { NextAction } from "@/lib/dashboard/next-action";

/**
 * The single, role-based "Next Action" block (slice
 * role-next-action-simplicity-v1). One clear primary CTA per dashboard surface:
 * where you are (eyebrow) → what to do now (title) → what's done / what's
 * waiting (body) → where to click (the one gradient CTA).
 *
 * Honest by construction: the action + href come from the pure
 * `lib/dashboard/next-action` mapping (real routes only), and the copy never
 * claims AI / automatic verification / payment / a broad confirmer role.
 */
export async function DashboardNextAction({
  action,
  counts,
}: {
  action: NextAction;
  /** Real counts for body interpolation; unused ones are ignored by next-intl. */
  counts?: { waiting?: number; confirmed?: number; pending?: number };
}) {
  const t = await getTranslations("auth.dashboard.nextAction");
  const k = action.key;
  return (
    <section
      className="card-border wow-card flex flex-col gap-3 p-6 sm:p-7"
      data-testid="dashboard-next-action"
    >
      <span className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-brand-orange">
        <span className="live-dot signal-dot" aria-hidden />
        {t("eyebrow")}
      </span>
      <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
        {t(`${k}.title`)}
      </h2>
      <p
        className="max-w-prose text-sm leading-relaxed text-text-secondary"
        data-testid="dashboard-next-action-body"
      >
        {t(`${k}.body`, {
          waiting: counts?.waiting ?? 0,
          confirmed: counts?.confirmed ?? 0,
          pending: counts?.pending ?? 0,
        })}
      </p>
      <Link
        href={action.href as "/dashboard"}
        data-testid="dashboard-next-action-cta"
        className="mt-1 inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-transform hover:-translate-y-0.5"
      >
        {t(`${k}.cta`)} →
      </Link>
    </section>
  );
}
