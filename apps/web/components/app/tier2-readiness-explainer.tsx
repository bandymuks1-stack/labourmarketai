import { getTranslations } from "next-intl/server";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";

// Tier-2 readiness explainer. PURE COPY component — no DB read, no
// server action, no Supabase call, no Tier-2 schema reference at
// runtime. Renders the documented "what manual activation will ask
// for" preview so prospective pilot organisations know what to
// prepare BEFORE the SR-3 onboarding UI (which depends on the SR-1
// migration) is live. The CTA reuses the existing waitlist modal
// with a distinct source tag so the owner can identify Tier-2
// readiness intent in the waitlist inbox.
export async function Tier2ReadinessExplainer({
  source,
  testId = "tier2-readiness-explainer",
}: {
  source: string;
  testId?: string;
}) {
  const t = await getTranslations("tier2Readiness");
  const requirements = t.raw("requirements") as string[];
  return (
    <section
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      className="card-border flex flex-col gap-4 p-5"
    >
      <span className="self-start rounded-sm border border-state-warning/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-warning">
        {t("badge")}
      </span>
      <h2
        id={`${testId}-title`}
        className="font-display text-lg font-semibold text-text-primary"
      >
        {t("title")}
      </h2>
      <p className="text-sm leading-relaxed text-text-secondary">{t("body")}</p>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("requirementsTitle")}
        </p>
        <ul className="mt-2 flex flex-col gap-2 text-sm text-text-secondary">
          {requirements.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">
        {t("reviewNote")}
      </p>
      <p className="text-xs leading-relaxed text-text-muted">
        {t("notWritingNote")}
      </p>
      <div className="mt-1">
        <WaitlistModal
          trigger={t("ctaLabel")}
          source={source}
          triggerClassName="inline-flex items-center justify-center rounded-md border border-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:border-brand-blue/80"
        />
      </div>
    </section>
  );
}
