"use client";

import { useTranslations } from "next-intl";

import { ExperienceDisputeItem } from "@/components/app/experience-dispute-item";
import { ExperienceModerationItem } from "@/components/app/experience-moderation-item";
import type { ExperienceListState } from "@/lib/trust/experience-records";

/**
 * W6 slice 3 — the experience moderator queue, as a BAND on the EXISTING
 * `/dashboard/admin` control room.
 *
 * WHY A BAND AND NOT A PAGE. Slice 3B put this at
 * `/dashboard/admin/experience-moderation` and the Product Gate refused it
 * (A-09, undeclared surface). The control room already models exactly this
 * shape: band 1 overview KPIs, band 2 ACTION QUEUES — the live operational
 * signals that need a decision — and band 3 grouped navigation. A queue of
 * items awaiting a moderator decision is a band-2 action queue, the same slot
 * `FollowUpQueuePanel` and `SalesIntakePanel` occupy. It needed a home, not a
 * route.
 *
 * TWO QUEUES, NOT ONE LIST, because moderation and disputes are separate
 * dimensions: a record can be sitting in the dispute queue while its
 * moderation state is `published`, and merging them would invent a single
 * lifecycle the domain deliberately does not have.
 *
 * AUTHORIZATION IS NEVER THIS COMPONENT. `/dashboard/admin` is gated by
 * `requireSuperadmin` in its layout and again in its page, and every write
 * these items trigger goes through an RPC that re-checks `is_admin()` itself.
 * Rendering is not permission.
 *
 * Pre-apply (the owner-gated domain migration is not applied) the panel shows
 * an honest unavailable state — never an empty queue, which would read as
 * "nothing needs moderating".
 */
export function ExperienceModerationPanel({
  queue,
  disputes,
}: {
  queue: ExperienceListState;
  disputes: ExperienceListState;
}) {
  const t = useTranslations("experience");

  const unavailable = queue.state !== "list";

  return (
    <section className="flex flex-col gap-3" data-testid="admin-experience-moderation">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("panel.title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("panel.help")}</p>
      </div>

      {unavailable ? (
        <div
          className="rounded-md border border-border-subtle bg-surface-1/40 p-4"
          data-testid="experience-moderation-unavailable"
          data-readiness={queue.state}
          role="status"
        >
          {/* Admin/diagnostic surface: a controlled readiness CODE is allowed
              here (never raw SQL, never DB internals). */}
          <p className="text-basis text-text-primary">{t("moderation.unavailable")}</p>
          <p className="font-mono text-meta text-text-muted">readiness: {queue.state}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3" data-testid="experience-moderation-queue">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("moderation.queueTitle")}
            </h3>
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
          </div>

          <div className="flex flex-col gap-3" data-testid="experience-dispute-queue">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("moderation.disputeQueueTitle")}
            </h3>
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
          </div>
        </>
      )}
    </section>
  );
}
