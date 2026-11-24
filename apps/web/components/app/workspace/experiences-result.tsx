"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ExperienceCountsBlock } from "@/components/app/experience-counts-block";
import { ExperienceDisputeForm } from "@/components/app/experience-dispute-form";
import { ExperienceResponseForm } from "@/components/app/experience-response-form";
import { ExperienceSubmitForm } from "@/components/app/experience-submit-form";
import {
  loadExperiencesResultAction,
  type ExperiencesResultView,
} from "@/lib/trust/experience-result-actions";
import { loadExperienceSubmitContextAction } from "@/lib/trust/experience-entry-actions";
import type { ExperienceSubmitContext } from "@/lib/trust/experience-entry";
import type { ExperienceRow } from "@/lib/trust/experience-records";

/**
 * THE EXPERIENCES RESULT — W6 slice 3, the canonical home of the experience
 * domain.
 *
 * It replaces `/dashboard/experiences`, which existed for exactly one commit
 * before the Product Gate refused it (A-09, undeclared surface). The refusal
 * was right: the workspace is chat-first, and an answer the person asked for
 * belongs in the result panel at `?result=experiences` — the same mechanism
 * the Player Card, the calendar and the market result already use. The screen
 * was deleted rather than declared, so no second dashboard was created.
 *
 * WHAT IT SHOWS, and nothing else:
 *   - the count-only block (published positive / published negative, disputed
 *     marked) through the ONE shared renderer;
 *   - what was published ABOUT the viewer, each row carrying its real
 *     moderation and dispute state, with the right of reply and the dispute
 *     door;
 *   - what the viewer SUBMITTED, in its real lifecycle state — a row awaiting
 *     moderation says so and is never dressed up as published.
 *
 * NO SCORE, NO STARS, NO TIER. There is no number here that is not a count of
 * real published rows, and no sentence that turns those counts into a verdict
 * about a person. Evidence, skills, confidence bins and learning signals are
 * not inputs to anything on this surface.
 *
 * THE STATES ARE DISTINCT ON PURPOSE. Not signed in, domain unavailable, read
 * failed and genuinely empty are four different answers, and a result panel is
 * the one place a person is actively waiting for one — so none of them is
 * allowed to collapse into a blank list.
 *
 * NO ROUTING, like every other result body: no `<Link>`, no router. The forms
 * are the existing client forms calling the existing RPC-backed server
 * actions; this component adds no write path of its own.
 */

type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "loaded"; readonly view: ExperiencesResultView };

export function ExperiencesResult({
  interactionToken = null,
  onBack,
}: {
  /** Slice 3D: the submit depth. Null = the list. */
  interactionToken?: string | null;
  onBack?: () => void;
} = {}) {
  // THE SUBMIT DEPTH IS A DIFFERENT QUESTION, so it is a different render —
  // not a form spliced into the list. A person who arrived here from one
  // finished interaction is answering about THAT interaction and nothing else.
  if (interactionToken) {
    return <ExperienceSubmitDepth token={interactionToken} onBack={onBack} />;
  }
  return <ExperiencesList />;
}

function ExperiencesList() {
  const t = useTranslations("experience");
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  // Bumping this re-runs the read — that is the whole of RETRY.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    loadExperiencesResultAction()
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        // A thrown action is never rendered as emptiness: "we could not read"
        // and "there is nothing" are different answers.
        if (!cancelled) setPhase({ kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (phase.kind === "loading") {
    return (
      <p
        className="text-basis text-text-muted"
        data-testid="experiences-result-loading"
        role="status"
      >
        {t("result.loading")}
      </p>
    );
  }

  if (phase.kind === "failed" || phase.view.kind === "error") {
    return (
      <div className="flex flex-col gap-3" data-testid="experiences-result-error">
        <p role="alert" className="text-basis text-text-primary">
          {t("result.error")}
        </p>
        <RetryButton onClick={retry} label={t("result.retry")} />
      </div>
    );
  }

  if (phase.view.kind === "not-authenticated") {
    return (
      <p
        className="text-basis text-text-secondary"
        data-testid="experiences-result-signin"
        role="status"
      >
        {t("result.signIn")}
      </p>
    );
  }

  if (phase.view.kind === "unavailable") {
    // Product-level unavailability — the owner-gated domain migration is not
    // applied here. No SQL text, no migration jargon, no fabricated counts.
    return (
      <section
        className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-1/40 p-3"
        data-testid="experiences-result-unavailable"
        role="status"
      >
        <p className="text-basis text-text-primary">{t("page.unavailableTitle")}</p>
        <p className="text-meta leading-relaxed text-text-secondary">
          {t("page.unavailableBody")}
        </p>
      </section>
    );
  }

  const { counts, aboutMe, mine, responsesRead } = phase.view;

  return (
    <div className="flex flex-col gap-5" data-testid="experiences-result">
      {/* Said in words on every render: an experience is one person's account,
          not a fact about anyone's professional ability. */}
      <p className="text-meta leading-relaxed text-text-secondary">{t("page.lead")}</p>

      {/* Count-only — about ME. Never a score. */}
      <ExperienceCountsBlock counts={counts} />

      <section className="flex flex-col gap-3" data-testid="experiences-about-me">
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("page.aboutMe")}
        </h3>
        {aboutMe.length === 0 ? (
          <p className="text-meta leading-relaxed text-text-secondary">
            {t("page.aboutMeEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {aboutMe.map((r) => (
              <li key={r.id}>
                <ExperienceCard row={r} responsesRead={responsesRead}>
                  {/* The dispute door opens only where a dispute can exist. */}
                  {r.disputeStatus === "none" ? (
                    <ExperienceDisputeForm experienceId={r.id} />
                  ) : null}
                  {/* One reply per experience, by schema. Offering the form
                      again once a reply exists is a door that can only fail —
                      the RPC answers `response_exists`. It stays open while
                      replies are UNREADABLE, because a form that might work is
                      better than silently removing the right of reply. */}
                  {r.response === null ? (
                    <ExperienceResponseForm experienceId={r.id} />
                  ) : null}
                </ExperienceCard>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" data-testid="experiences-mine">
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("page.mine")}
        </h3>
        {mine.length === 0 ? (
          <p className="text-meta leading-relaxed text-text-secondary">
            {t("page.mineEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {mine.map((r) => (
              <li key={r.id}>
                {/* No reply and no dispute door on my OWN submission: both
                    belong to the person it is about. */}
                <ExperienceCard
                  row={r}
                  testId="experience-mine-item"
                  responsesRead={responsesRead}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * THE SUBMIT DEPTH — `?result=experiences&interaction=<kind>:<uuid>`.
 *
 * The form mounts if and ONLY if the server says this viewer may describe this
 * interaction. The token in the URL is a REQUEST, never a permission: the
 * loader re-reads the canonical interaction row, confirms the viewer is one of
 * its two real parties, confirms it is finished by the pure contract's own
 * predicate, RESOLVES THE SUBJECT from the row, and checks whether this author
 * already described it. Only then does a form exist.
 *
 * A forged `subject`/`interaction` pair is not merely rejected here — it
 * cannot be expressed. The client never sends a subject at all; it names an
 * interaction, and the server decides who that interaction was with.
 *
 * The four ways there is no form are four different sentences, because they
 * mean four different things to the person: not finished yet, not something
 * you can describe, you already described it, and the domain is unavailable
 * here. None of them is a technical error message, and none is a fake success.
 */
function ExperienceSubmitDepth({
  token,
  onBack,
}: {
  token: string;
  onBack?: () => void;
}) {
  const t = useTranslations("experience");
  const [ctx, setCtx] = useState<ExperienceSubmitContext | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCtx(null);
    setFailed(false);
    loadExperienceSubmitContextAction(token)
      .then((c) => {
        if (!cancelled) setCtx(c);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const back = onBack ? (
    <button
      type="button"
      onClick={onBack}
      data-testid="experience-submit-back"
      className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
    >
      {t("entry.backToExperiences")}
    </button>
  ) : null;

  if (failed) {
    return (
      <div className="flex flex-col gap-3" data-testid="experience-submit-error">
        <p role="alert" className="text-basis text-text-primary">
          {t("result.error")}
        </p>
        {back}
      </div>
    );
  }

  if (ctx === null) {
    return (
      <p
        className="text-basis text-text-muted"
        data-testid="experience-submit-loading"
        role="status"
      >
        {t("result.loading")}
      </p>
    );
  }

  if (ctx.state === "not_authenticated") {
    return (
      <p className="text-basis text-text-secondary" data-testid="experiences-result-signin" role="status">
        {t("result.signIn")}
      </p>
    );
  }

  if (ctx.state === "unavailable") {
    return (
      <section
        className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-1/40 p-3"
        data-testid="experiences-result-unavailable"
        role="status"
      >
        <p className="text-basis text-text-primary">{t("page.unavailableTitle")}</p>
        <p className="text-meta leading-relaxed text-text-secondary">
          {t("page.unavailableBody")}
        </p>
      </section>
    );
  }

  if (ctx.state === "error") {
    return (
      <div className="flex flex-col gap-3" data-testid="experience-submit-error">
        <p role="alert" className="text-basis text-text-primary">
          {t("result.error")}
        </p>
        {back}
      </div>
    );
  }

  if (ctx.state === "already_submitted") {
    // NO second form. One interaction, one record — and the person is told
    // the record exists rather than being allowed to write a second one and
    // discover the duplicate only after pressing send.
    return (
      <div className="flex flex-col gap-3" data-testid="experience-submit-duplicate">
        <p className="text-basis text-text-primary" role="status">
          {t("entry.alreadySubmitted")}
        </p>
        <p className="text-meta leading-relaxed text-text-secondary">
          {t("entry.alreadySubmittedHint")}
        </p>
        {back}
      </div>
    );
  }

  if (ctx.state === "not_eligible") {
    return (
      <div className="flex flex-col gap-3" data-testid={`experience-submit-blocked-${ctx.reason}`}>
        <p className="text-basis text-text-primary" role="status">
          {ctx.reason === "not_yet" ? t("entry.notYet") : t("entry.notAvailable")}
        </p>
        <p className="text-meta leading-relaxed text-text-secondary">
          {t("entry.blockedHint")}
        </p>
        {back}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="experience-submit-depth">
      <p className="text-meta leading-relaxed text-text-secondary">
        {t("entry.groundedIn", {
          interaction: t(`interaction.${ctx.kind}`),
          context: ctx.contextLabel ?? t("entry.noContextLabel"),
        })}
      </p>
      {/* Subject and interaction come from the SERVER's resolution, not from
          anything the client chose. The RPC re-derives them anyway. */}
      <ExperienceSubmitForm
        subjectType={ctx.subjectType}
        subjectId={ctx.subjectId}
        interactionKind={ctx.kind}
        interactionId={ctx.interactionId}
        subjectLabel={ctx.contextLabel ?? t(`interaction.${ctx.kind}`)}
      />
      {back}
    </div>
  );
}

/**
 * One row, in its REAL state. The moderation state and the dispute state are
 * rendered as SEPARATE facts because they are separate dimensions: a published
 * record under dispute stays published and says both things at once.
 */
function ExperienceCard({
  row,
  testId = "experience-about-me-item",
  responsesRead,
  children,
}: {
  row: ExperienceRow;
  testId?: string;
  /** Whether replies could be READ. False = nothing is known about replies
   *  here, which is not the same as there being none. */
  responsesRead: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("experience");
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-1/40 p-3"
      data-testid={testId}
      data-sentiment={row.sentiment}
      data-moderation={row.moderationStatus}
      data-dispute={row.disputeStatus}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-basis font-medium text-text-primary">
          {t(`sentiment.${row.sentiment}`)}
        </span>
        <span className="text-meta text-text-muted" data-testid="experience-state">
          · {t(`moderation.${row.moderationStatus}`)}
        </span>
        {/* WHO this is about — a person subject and an organization subject
            are different facts and are named as such (the W6 author/subject
            model). */}
        <span className="text-meta text-text-muted" data-testid="experience-subject-type">
          · {t(`subject.${row.subjectType}`)}
        </span>
        {/* Org authorship is shown only when the row actually records it —
            null means the author-side migration is not applied here, and an
            unknown is omitted, never guessed. */}
        {row.authorSide === "organization" ? (
          <span className="text-meta text-text-muted" data-testid="experience-author-side">
            · {t("authorSide.organization")}
          </span>
        ) : null}
        {row.disputeStatus !== "none" ? (
          <span className="text-meta text-state-warning" data-testid="experience-dispute-marker">
            · {t(`dispute.${row.disputeStatus}`)}
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-text-secondary break-words">{row.body}</p>

      {/* THE RIGHT OF REPLY, RENDERED.
          A reply is shown to the person who WROTE it in every state, and to the
          author of the experience only once it is PUBLISHED. That second
          condition is enforced here rather than left to RLS, because the v1
          select policy's third branch compares the unqualified
          `moderation_status` inside a subquery over `experience_records` — so
          Postgres resolves it to the RECORD's status, and the policy hands the
          experience's author a reply that is still submitted, in moderation, or
          rejected. Correcting the policy is a schema change and belongs at the
          human gate; until then this surface does not disclose what moderation
          has not released. Recorded on EVID-6.
          `experience_responses` shipped with a schema, an RPC and a form, and
          no reader: a person could reply and nobody — including them — ever saw
          it again. The reply carries its own moderation state, because a
          submitted reply and a published one are different facts to both
          sides. When replies could not be read at all, the card says so instead
          of leaving an absence that reads as "no reply". */}
      {row.response !== null && (row.response.moderationStatus === "published" || !row.isAuthor) ? (
        <div
          className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-2/40 p-2"
          data-testid="experience-response"
          data-response-moderation={row.response.moderationStatus}
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-meta font-medium text-text-primary">
              {t("response.heading")}
            </span>
            <span className="text-meta text-text-muted">
              · {t(`moderation.${row.response.moderationStatus}`)}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary break-words">
            {row.response.body}
          </p>
          {row.response.moderationStatus !== "published" ? (
            <p className="text-meta text-text-muted" data-testid="experience-response-not-public">
              {t("response.notPublicYet")}
            </p>
          ) : null}
        </div>
      ) : !responsesRead ? (
        <p className="text-meta text-text-muted" data-testid="experience-response-unknown">
          {t("response.unreadable")}
        </p>
      ) : null}

      {children}
    </div>
  );
}

function RetryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="experiences-result-retry"
      className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
    >
      {label}
    </button>
  );
}
