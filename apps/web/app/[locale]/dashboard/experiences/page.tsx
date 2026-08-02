import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getExperienceCounts,
  listExperiencesForViewer,
} from "@/lib/trust/experience-records";
import { ExperienceCountsBlock } from "@/components/app/experience-counts-block";
import { ExperienceResponseForm } from "@/components/app/experience-response-form";
import { ExperienceDisputeForm } from "@/components/app/experience-dispute-form";

/**
 * W6 slice 3B — the worker/employer experience surface.
 *
 * Shows the REAL state of everything the viewer may see: what they submitted
 * (in every lifecycle state) and what was published about them (with the
 * right of reply and the dispute door). The chat stays the primary work
 * surface — this is the detail projection it hands off to.
 *
 * Fails closed: with the domain migration unapplied the page renders a
 * product-level "not available in this environment" state — never a crash,
 * never a fabricated count, never a fallback to legacy review notes.
 */
export default async function ExperiencesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("experience");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/experiences`);

  const list = await listExperiencesForViewer(user.id);
  const counts = await getExperienceCounts("worker", user.id);

  const unavailable = list.state === "needs_migration" || list.state === "error";

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" data-testid="experiences-page">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("page.title")}
        </h1>
        <p className="text-basis leading-relaxed text-text-secondary">{t("page.lead")}</p>
      </header>

      {unavailable ? (
        <section
          className="rounded-md border border-border-subtle bg-surface-1/40 p-4"
          data-testid="experiences-unavailable"
          role="status"
        >
          <p className="text-basis text-text-primary">{t("page.unavailableTitle")}</p>
          <p className="text-meta leading-relaxed text-text-secondary">
            {t("page.unavailableBody")}
          </p>
        </section>
      ) : (
        <>
          {/* Count-only — about ME. Never a score. */}
          <ExperienceCountsBlock counts={counts} />

          <section className="flex flex-col gap-3" data-testid="experiences-about-me">
            <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("page.aboutMe")}
            </h2>
            {list.aboutMe.length === 0 ? (
              <p className="text-meta leading-relaxed text-text-secondary">
                {t("page.aboutMeEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {list.aboutMe.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-1/40 p-3"
                    data-testid="experience-about-me-item"
                    data-sentiment={r.sentiment}
                    data-moderation={r.moderationStatus}
                    data-dispute={r.disputeStatus}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-basis font-medium text-text-primary">
                        {t(`sentiment.${r.sentiment}`)}
                      </span>
                      <span className="text-meta text-text-muted">
                        · {t(`moderation.${r.moderationStatus}`)}
                      </span>
                      {r.disputeStatus !== "none" ? (
                        <span
                          className="text-meta text-state-warning"
                          data-testid="experience-dispute-marker"
                        >
                          · {t(`dispute.${r.disputeStatus}`)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm leading-relaxed text-text-secondary break-words">
                      {r.body}
                    </p>
                    {r.disputeStatus === "none" ? (
                      <ExperienceDisputeForm experienceId={r.id} />
                    ) : null}
                    <ExperienceResponseForm experienceId={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3" data-testid="experiences-mine">
            <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("page.mine")}
            </h2>
            {list.mine.length === 0 ? (
              <p className="text-meta leading-relaxed text-text-secondary">
                {t("page.mineEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {list.mine.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-1/40 p-3"
                    data-testid="experience-mine-item"
                    data-sentiment={r.sentiment}
                    data-moderation={r.moderationStatus}
                    data-dispute={r.disputeStatus}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-basis font-medium text-text-primary">
                        {t(`sentiment.${r.sentiment}`)}
                      </span>
                      {/* The REAL state — never a fake "published". */}
                      <span className="text-meta text-text-muted" data-testid="experience-state">
                        · {t(`moderation.${r.moderationStatus}`)}
                      </span>
                      {r.disputeStatus !== "none" ? (
                        <span className="text-meta text-state-warning">
                          · {t(`dispute.${r.disputeStatus}`)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm leading-relaxed text-text-secondary break-words">
                      {r.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Back to the ONE work surface. */}
      <Link
        href="/dashboard"
        data-testid="experiences-back-to-chat"
        className="inline-flex min-h-[2.75rem] w-fit items-center rounded-md border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
      >
        {t("page.backToChat")}
      </Link>
    </div>
  );
}
