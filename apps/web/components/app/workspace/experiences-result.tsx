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

  const { counts, aboutMe, mine } = phase.view;

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
                <ExperienceCard row={r}>
                  {/* The dispute door opens only where a dispute can exist. */}
                  {r.disputeStatus === "none" ? (
                    <ExperienceDisputeForm experienceId={r.id} />
                  ) : null}
                  <ExperienceResponseForm experienceId={r.id} />
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
                <ExperienceCard row={r} testId="experience-mine-item" />
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
  children,
}: {
  row: ExperienceRow;
  testId?: string;
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
        {row.disputeStatus !== "none" ? (
          <span className="text-meta text-state-warning" data-testid="experience-dispute-marker">
            · {t(`dispute.${row.disputeStatus}`)}
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-text-secondary break-words">{row.body}</p>
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
