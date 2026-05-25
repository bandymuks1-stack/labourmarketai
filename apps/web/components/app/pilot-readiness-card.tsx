import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

/**
 * Pilot readiness / tester info card. Surfaces honestly inside the
 * authenticated dashboard tree so testers know:
 *   - this is a pilot (not the finished product);
 *   - what to do with confusing copy (link to the floating widget that's
 *     already mounted in the layout);
 *   - where the internal Conversations route is;
 *   - what telemetry is collected (privacy note pointing to the policy doc).
 *
 * Server component — no client JS, no telemetry hook from here. Just a
 * compact, calm informational panel.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function PilotReadinessCard({ locale }: { locale: string }) {
  // The locale prop isn't used directly — getTranslations infers from
  // the request context — but keeping it on the signature documents
  // that this is a locale-aware component and lets future locale-scoped
  // links flow through without a signature change.
  const t = await getTranslations("pilotReadiness");
  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="pilot-readiness-card"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-label text-state-warning">
          {t("badge")}
        </span>
      </header>
      <p className="text-xs leading-relaxed text-text-secondary">
        {t("body")}
      </p>
      <div className="flex flex-wrap gap-3 text-[11px]">
        <Link
          href="/dashboard/communication"
          className="rounded-md border border-brand-blue/40 px-3 py-1.5 text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("links.communication")}
        </Link>
        <span className="font-mono text-text-muted">
          {t("feedbackHint")}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-text-muted">
        {t("telemetryNote")}
      </p>
    </section>
  );
}
