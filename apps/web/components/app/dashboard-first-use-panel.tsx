import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Universal first-use panel for the worker dashboard (Phase 3 of the
 * first-working-beta sprint). Shows the 4-step path:
 *
 *   1. Tell us what you can do
 *   2. Confirm detected suggestions
 *   3. Add today's work
 *   4. Build a useful work profile over time
 *
 * Plus the three required CTAs (profile / journal / account roles). The
 * panel is universal — no construction-specific language. The dashboard
 * page hides it once the worker has both a profession and at least one
 * journal entry, so it doesn't keep nagging once someone is past the
 * "first use" moment.
 *
 * Tokens / shared components / copy come from existing infrastructure
 * (`messages/{locale}.json`, `cn`, `Link`). No hardcoded colors or strings.
 */
export async function DashboardFirstUsePanel({
  variant = "full",
}: {
  /** "full" shows steps + all CTAs; "compact" is the short call-to-action card. */
  variant?: "full" | "compact";
}) {
  const t = await getTranslations("auth.dashboard.firstUse");
  const linkCls =
    "inline-flex items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue";

  if (variant === "compact") {
    return (
      <section
        aria-labelledby="first-use-title-compact"
        className="card-border flex flex-col gap-3 p-5 sm:p-6"
      >
        <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </span>
        <h2
          id="first-use-title-compact"
          className="font-display text-lg font-semibold text-text-primary"
        >
          {t("title")}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {t("body")}
        </p>
      </section>
    );
  }

  // 5-step universal path (Phase 4 — adaptive sprint): the system helps any
  // person, not only a worker. Steps come from i18n so future phases can
  // reword without touching this component.
  const steps = [t("step1"), t("step2"), t("step3"), t("step4"), t("step5")];

  return (
    <section
      aria-labelledby="first-use-title"
      className="card-border flex flex-col gap-4 p-5 sm:p-6"
    >
      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-orange">
        <span className="live-dot signal-dot" aria-hidden />
        {t("eyebrow")}
      </span>
      <h2
        id="first-use-title"
        className="font-display text-2xl font-bold tracking-tightest text-text-primary"
      >
        {t("title")}
      </h2>
      <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
        {t("body")}
      </p>

      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((label, i) => (
          <li
            key={label}
            className="flex items-start gap-3 rounded-md border border-ink-600 bg-ink-800/50 p-3"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-brand-blue/40 bg-brand-blue/10 font-mono text-[11px] font-semibold text-brand-blue"
            >
              {i + 1}
            </span>
            <span className="text-sm leading-snug text-text-primary">
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/profile" className={cn(linkCls)}>
          {t("completeProfileCta")} →
        </Link>
        <Link href="/dashboard/journal" className={cn(linkCls)}>
          {t("addJournalCta")} →
        </Link>
        <Link href="/dashboard/account" className={cn(linkCls)}>
          {t("reviewRolesCta")} →
        </Link>
      </div>
    </section>
  );
}
