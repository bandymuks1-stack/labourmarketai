"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { ChatAction, ChatActionRow } from "@/components/app/conversation/chat/chat-action";
import {
  dispatchWorkerAction,
  prepareConfirmationAction,
} from "@/lib/conversation/dispatch";
import { loadEngagementsForResult } from "@/lib/engagements/engagements-result";
import type {
  EngagementRow,
  EngagementsResult as EngagementsView,
} from "@/lib/engagements/engagements-result-contract";
import type { ResultContext } from "@/lib/conversation/result-registry";

/**
 * THE ENGAGEMENTS RESULT — §7.1, the surface
 * `end_company_worker_engagement_v1` never had.
 *
 * ─── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 * The RPC has been applied in production since 20260723120000 with ZERO client
 * callers. A real capability — ending a work relationship — existed and no
 * person could reach it from anywhere in the product. This is the reach.
 *
 * ─── ONE RENDERER, TWO CONTEXTS ─────────────────────────────────────────────
 * The employer and the worker see the SAME component. What differs is which of
 * the viewer's own rows are meaningful where they are standing — and that
 * choice is made SERVER-SIDE by `loadEngagementsForResult(context)`, over one
 * RLS-scoped query. This component receives rows it may already see and words
 * itself around them; it never decides visibility, and it could not widen it
 * if it tried. `viewerSide` on each row comes from the server too, and is used
 * only to pick a noun.
 *
 * ─── ONLY REAL DATA ─────────────────────────────────────────────────────────
 * Every fact here is a stored column: the canonical status, the real
 * `started_at`, and — when it exists — the STORED `ended_at`. There is no
 * duration estimate, no progress, no rating, no AI score, no payment state,
 * and no project. The engagement table has no path to a project (the W11 audit
 * established that `source_booking_id → booking_requests → customer_requests`
 * carries no `project_id` at any hop), so showing one would be inventing a
 * relationship the data does not have.
 *
 * A row whose counterparty name is unreadable says so plainly rather than
 * borrowing an id or a placeholder person.
 *
 * ─── THE OUTCOME LIVES IN THE PARENT ────────────────────────────────────────
 * The W11 regression, applied before it could happen again: a successful end
 * refreshes the list, the refresh puts the loader back into `loading`, and
 * anything held INSIDE the row would be unmounted and destroyed before anyone
 * could read it. The outcome therefore lives in `EngagementsResult` — which
 * the refresh does not unmount — so the success line is still on screen next
 * to the ended row it produced. There is a targeted test for exactly this.
 *
 * ─── NO ROUTING ─────────────────────────────────────────────────────────────
 * Like every result body: no `<Link>`, no router. The full screen is reached
 * through `onOpenFull`, which the workspace layer wires.
 */

const FULL_ROUTE = "/dashboard/projects";

type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: EngagementsView };

/** What the person is told after acting. `error: false` is the one success. */
type Outcome = { readonly text: string; readonly error: boolean };

export function EngagementsResult({
  context,
  locale,
  onOpenFull,
}: {
  /** Where the person is standing. Passed to the SERVER reader, which decides
   *  which of the viewer's own rows are meaningful here. */
  context: ResultContext;
  locale: string;
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** See the header note — this MUST NOT live inside a row. */
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // A different context is a different question — never carry an answer over.
  useEffect(() => {
    setOutcome(null);
  }, [context]);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    // `project` is not one of this result's contexts (the registry says so),
    // but the prop type admits it, so it is narrowed here rather than passed
    // through as a half-understood value.
    loadEngagementsForResult(context === "organization" ? "organization" : "personal")
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [context, attempt]);

  const message = outcome ? (
    <p
      role="status"
      className={`text-meta ${outcome.error ? "text-state-danger" : "text-state-success"}`}
      data-testid="engagements-message"
    >
      {outcome.text}
    </p>
  ) : null;

  if (phase.kind === "loading") {
    return (
      <div className="flex flex-col gap-3">
        {/* The outcome outlives the reload it triggered — that is the point. */}
        {message}
        <p
          className="text-basis text-text-muted"
          data-testid="engagements-loading"
          aria-busy="true"
        >
          {t("pendingInline")}
        </p>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="flex flex-col gap-3" data-testid="engagements-error">
        {message}
        <p className="text-basis text-text-secondary">{t("engagementsError")}</p>
        <ChatActionRow>
          <ChatAction tone="secondary" testId="engagements-retry" onClick={reload}>
            {t("retry")}
          </ChatAction>
        </ChatActionRow>
      </div>
    );
  }

  const { view } = phase;

  // The three ways there can be nothing to show are three DIFFERENT truths and
  // stay three different sentences. A failed read is never rendered as "you
  // have none" — that would be a claim about the person's work, made because a
  // query failed.
  if (view.kind !== "engagements") {
    const text =
      view.kind === "needs-migration"
        ? t("engagementsNeedsMigration")
        : view.kind === "blocked"
          ? t("engagementsBlocked")
          : context === "organization"
            ? t("engagementsEmptyCompany")
            : t("engagementsEmptyWorker");
    return (
      <div className="flex flex-col gap-3" data-testid={`engagements-${view.kind}`}>
        {message}
        <p className="text-basis text-text-secondary">{text}</p>
        <OpenFull label={t("openFull")} onOpenFull={() => onOpenFull(FULL_ROUTE)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="engagements-list">
      {message}
      <ul className="flex flex-col divide-y divide-border/40">
        {view.rows.map((row) => (
          <li key={row.engagementId}>
            <EngagementRowView
              row={row}
              locale={locale}
              onDone={reload}
              onOutcome={setOutcome}
            />
          </li>
        ))}
      </ul>
      <OpenFull label={t("openFull")} onOpenFull={() => onOpenFull(FULL_ROUTE)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// One engagement
// ═══════════════════════════════════════════════════════════════════════════

function EngagementRowView({
  row,
  locale,
  onDone,
  onOutcome,
}: {
  row: EngagementRow;
  locale: string;
  onDone: () => void;
  /** Reported UP — a successful end unmounts this component. */
  onOutcome: (outcome: Outcome | null) => void;
}) {
  const t = useTranslations("conversation.results");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const ended = row.status === "ended";

  const run = useCallback(() => {
    onOutcome(null);
    start(async () => {
      /**
       * STRONG TIER: a fresh, single-use, engagement-bound token first. The
       * dispatcher refuses the write without one, and rejects a stale or
       * replayed one server-side (`stale_confirmation`) — the id in the
       * button grants nothing on its own.
       */
      const prep = await prepareConfirmationAction("engagement.end", {
        engagementId: row.engagementId,
      });
      if (!prep.ok) {
        setConfirming(false);
        onOutcome({
          text: prep.code === "invalid" ? t("engagementsUnavailable") : t("engagementsError"),
          error: true,
        });
        return;
      }

      const res = await dispatchWorkerAction(
        "engagement.end",
        { engagementId: row.engagementId },
        { locale, confirmationToken: prep.token },
      );
      setConfirming(false);

      if (res.ok) {
        // The SERVER's timestamp, never a locally invented one.
        const at = typeof res.data?.endedAt === "string" ? res.data.endedAt : null;
        onOutcome({
          text: at ? t("engagementsEndedAt", { date: at.slice(0, 10) }) : t("engagementsEnded"),
          error: false,
        });
        onDone();
        return;
      }

      if (res.code === "already_ended") {
        // NEUTRAL, not an error, and NOT a second write. The list is still
        // refreshed so the stored state and the sentence agree.
        onOutcome({
          text: res.existing
            ? t("engagementsAlreadyEndedAt", { date: res.existing.slice(0, 10) })
            : t("engagementsAlreadyEnded"),
          error: false,
        });
        onDone();
        return;
      }

      onOutcome({
        text:
          res.code === "not_found"
            ? t("engagementsUnavailable")
            : res.code === "conflict"
              ? t("engagementsConflict")
              : res.code === "needs_migration"
                ? t("engagementsNeedsMigration")
                : res.code === "stale_confirmation" || res.code === "confirmation_invalid"
                  ? t("engagementsStaleConfirmation")
                  : t("engagementsError"),
        error: true,
      });
    });
  }, [locale, onDone, onOutcome, row.engagementId, t]);

  return (
    <div className="flex flex-col gap-2 py-2" data-testid={`engagement-${row.engagementId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-basis font-semibold text-text-primary">
          {/* An unreadable counterparty is stated, never replaced by an id. */}
          {row.counterpartyName ?? t("engagementsUnknownParty")}
        </span>
        <span
          className="font-mono text-meta uppercase tracking-label text-text-muted"
          data-testid={`engagement-status-${row.engagementId}`}
          data-status={row.status}
        >
          {ended ? t("engagementsStatusEnded") : t("engagementsStatusActive")}
        </span>
      </div>

      <dl className="flex flex-col gap-1 text-support">
        <Row label={t("engagementsStarted")} value={row.startedAt.slice(0, 10)} />
        {/* Only the STORED value. An ended row without one shows no date
            rather than a guessed one. */}
        {ended && row.endedAt && (
          <Row
            label={t("engagementsEndedOn")}
            value={row.endedAt.slice(0, 10)}
            testId={`engagement-ended-at-${row.engagementId}`}
          />
        )}
      </dl>

      {/* THE CTA EXISTS ONLY ON AN ACTIVE ROW. An ended engagement has nothing
          left to do, and offering a control the server would refuse is the
          fake-control class this product forbids. */}
      {!ended &&
        (confirming ? (
          <div
            className="flex flex-col gap-2 rounded-control border border-state-warning/40 bg-state-warning/5 p-3"
            data-testid={`engagement-confirm-${row.engagementId}`}
          >
            <p className="text-support font-semibold text-text-primary">
              {t("engagementsEndTitle")}
            </p>
            {/* Exactly what becomes true — AND the six things that do not, so
                nobody expects a deletion, a completed project, a lost
                membership, an experience record or a payment. */}
            <p className="text-meta leading-relaxed text-text-secondary">
              {t("engagementsEndBody")}
            </p>
            <ChatActionRow>
              <ChatAction
                tone="primary"
                loading={pending}
                testId={`engagement-end-confirm-${row.engagementId}`}
                onClick={run}
              >
                {pending ? t("engagementsWorking") : t("engagementsEndCta")}
              </ChatAction>
              <ChatAction
                tone="secondary"
                disabled={pending}
                testId={`engagement-end-cancel-${row.engagementId}`}
                // CANCEL WRITES NOTHING. No token was minted, no dispatch was
                // made; the row is exactly as it was.
                onClick={() => setConfirming(false)}
              >
                {t("engagementsCancel")}
              </ChatAction>
            </ChatActionRow>
          </div>
        ) : (
          <ChatActionRow>
            <ChatAction
              tone="secondary"
              disabled={pending}
              testId={`engagement-end-${row.engagementId}`}
              onClick={() => setConfirming(true)}
            >
              {t("engagementsEndAction")}
            </ChatAction>
          </ChatActionRow>
        ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared presentation pieces
// ═══════════════════════════════════════════════════════════════════════════

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function OpenFull({ label, onOpenFull }: { label: string; onOpenFull: () => void }) {
  return (
    <ChatActionRow>
      <ChatAction tone="secondary" testId="engagements-open-full" onClick={onOpenFull}>
        {label}
      </ChatAction>
    </ChatActionRow>
  );
}
