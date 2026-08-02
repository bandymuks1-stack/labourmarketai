import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { listModerationQueue, listDisputeQueue } from "@/lib/trust/experience-records";
import { ExperienceModerationItem } from "@/components/app/experience-moderation-item";
import { ExperienceDisputeItem } from "@/components/app/experience-dispute-item";

/**
 * W6 slice 3B — the moderator queue, inside the EXISTING admin architecture
 * (no second admin dashboard).
 *
 * Server-side gate: requireSuperadmin(locale) is the FIRST awaited call — a
 * client-side role name is never permission. The RPCs re-check `is_admin()`
 * independently, so this page cannot become the only gate.
 *
 * Moderation and disputes are rendered as SEPARATE queues because they are
 * separate dimensions: a published record can sit in the dispute queue while
 * its moderation state stays `published`.
 */
export default async function ExperienceModerationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireSuperadmin(locale);
  setRequestLocale(locale);
  const t = await getTranslations("experience");

  const queue = await listModerationQueue();
  const disputes = await listDisputeQueue();
  const unavailable = queue.state !== "list";

  return (
    <div className="flex flex-col gap-6" data-testid="experience-moderation-page">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("moderation.title")}
        </h1>
        <p className="text-basis leading-relaxed text-text-secondary">
          {t("moderation.lead")}
        </p>
      </header>

      {unavailable ? (
        <section
          className="rounded-md border border-border-subtle bg-surface-1/40 p-4"
          data-testid="experience-moderation-unavailable"
          data-readiness={queue.state}
          role="status"
        >
          {/* Admin/diagnostic surface: a controlled readiness CODE is allowed
              here (never raw SQL, never DB internals). */}
          <p className="text-basis text-text-primary">{t("moderation.unavailable")}</p>
          <p className="font-mono text-meta text-text-muted">
            readiness: {queue.state}
          </p>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3" data-testid="experience-moderation-queue">
            <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("moderation.queueTitle")}
            </h2>
            {queue.aboutMe.length === 0 ? (
              <p className="text-meta leading-relaxed text-text-secondary">
                {t("moderation.queueEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {queue.aboutMe.map((r) => (
                  <li key={r.id}>
                    <ExperienceModerationItem
                      id={r.id}
                      sentiment={r.sentiment}
                      body={r.body}
                      moderationStatus={r.moderationStatus}
                      disputeStatus={r.disputeStatus}
                      interactionKind={r.interactionKind}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3" data-testid="experience-dispute-queue">
            <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("moderation.disputeQueueTitle")}
            </h2>
            {disputes.state !== "list" || disputes.aboutMe.length === 0 ? (
              <p className="text-meta leading-relaxed text-text-secondary">
                {t("moderation.disputeQueueEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {disputes.aboutMe.map((r) => (
                  <li key={r.id}>
                    <ExperienceDisputeItem
                      id={r.id}
                      sentiment={r.sentiment}
                      body={r.body}
                      moderationStatus={r.moderationStatus}
                      disputeStatus={r.disputeStatus}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
