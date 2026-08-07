"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { ChatAction, ChatActionRow } from "@/components/app/conversation/chat/chat-action";
import {
  dispatchWorkerAction,
  prepareConfirmationAction,
} from "@/lib/conversation/dispatch";
import { roleContextForAction } from "@/lib/conversation/action-role-context";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import {
  loadEmployerCandidatesForChat,
  loadEmployerDemandsForChat,
} from "@/lib/conversation/employer-workspace";
import type {
  EmployerCandidateRow,
  EmployerCandidatesResult,
  EmployerDemandsResult,
} from "@/lib/conversation/employer-workspace-contract";

/**
 * THE CANDIDATES RESULT — the employer's half of the chat-first workspace.
 *
 * ─── THE HOLE THIS FILLS ────────────────────────────────────────────────────
 * Nine of the ten employer executors (`company.confirm-need`, `close-demand`,
 * `reopen-demand`, `shortlist-candidate`, `contact-worker`, `propose-booking`,
 * `assign-worker`, and the two agency ones) were fully wired server-side —
 * schema, executor, dispatcher, confirmation tier — and had NO client caller
 * whatsoever. `company.create-demand` was the only employer action the
 * conversation could reach, so an employer could describe a need in the chat
 * and then had to leave the workspace for everything that followed.
 *
 * The W4 AI workflow said so in its own source: `runFindWorkers` ends with
 * "scouting is not in the workspace yet" and deliberately returns NO chip,
 * because there was nowhere for candidates to land. This is that place.
 *
 * ─── NOT A SECOND SCOUTING SCREEN ───────────────────────────────────────────
 * Every fact rendered here comes from `runScouting` — the SAME canonical read
 * `/dashboard/company/scouting` runs, through the same thin adapter, ranked by
 * the same §19 comparator over the same RLS-scoped supply. There is no second
 * matching engine, no second shortlist store, no second pipeline enum and no
 * second visibility policy: candidates arrive already anonymized by Step 3A
 * (`toShortlistSafePreview` + `assertContactSafe`), so this component could not
 * render a name or a contact even if it tried to.
 *
 * Every WRITE goes through the ONE dispatcher (`dispatchWorkerAction`), which
 * re-checks authentication, held roles, the zod shape and — for the
 * important-tier actions — a fresh one-time confirmation token, before
 * delegating to the canonical action. This component executes nothing itself
 * and fabricates no success: a failure renders the REAL server code.
 *
 * ─── NO ROUTING ─────────────────────────────────────────────────────────────
 * Like every result body, the full screen is reached through the workspace
 * layer's `onOpenFull` callback. No `<Link>`, no router — and the demand depth
 * lives in the URL (`?result=candidates&demand=…`) through the same
 * `useResultParam` mechanism the market and experiences results use, so a
 * reload and Back both work without a modal or a second screen.
 */

const FULL_ROUTE = "/dashboard/company/scouting";

/**
 * The closed sets this surface has copy for. A status outside them renders its
 * own raw token rather than a prettier lie — the same default-closed rule the
 * pipeline derivation uses, applied to presentation.
 *
 * `customer_requests.status`: the demand lifecycle (draft → submitted →
 * closed). `booking_requests.status`: migration 20260613100100's closed set.
 */
const DEMAND_STATUSES: readonly string[] = ["draft", "submitted", "closed"];
const BOOKING_STATUSES: readonly string[] = [
  "proposed",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
];

type DemandsPhase =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: EmployerDemandsResult };

type CandidatesPhase =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: EmployerCandidatesResult };

export function CandidatesResult({
  demandId,
  locale,
  onSelectDemand,
  onBack,
  onOpenFull,
}: {
  /** Which demand the panel is showing, or null for the demand list. */
  demandId: string | null;
  /** Passed to the dispatcher so the canonical actions revalidate the caller's
   *  own locale path — the same value every other conversation write uses. */
  locale: string;
  /** Drill into one demand — pushes, so Back returns to the list. */
  onSelectDemand: (requestId: string) => void;
  /** Step back up to the demand list. */
  onBack: () => void;
  /** The existing scouting screen — kept reachable from every state. */
  onOpenFull: (route: string) => void;
}) {
  return demandId === null ? (
    <DemandPicker onSelectDemand={onSelectDemand} onOpenFull={onOpenFull} />
  ) : (
    <CandidateList
      demandId={demandId}
      locale={locale}
      onBack={onBack}
      onOpenFull={onOpenFull}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Depth 0 — which need are we hiring for?
// ═══════════════════════════════════════════════════════════════════════════

function DemandPicker({
  onSelectDemand,
  onOpenFull,
}: {
  onSelectDemand: (requestId: string) => void;
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const [phase, setPhase] = useState<DemandsPhase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    loadEmployerDemandsForChat()
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        // A thrown read is never rendered as "you have no needs".
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (phase.kind === "loading") return <Pending testId="candidates-loading" />;
  if (phase.kind === "error") {
    return (
      <Failed
        testId="candidates-error"
        text={t("candidatesError")}
        retryLabel={t("retry")}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }

  const { view } = phase;

  // Standing in a personal space is a different fact from having no needs, and
  // it is fixed by a different act (switch workspace vs describe a need).
  if (view.kind === "no-company-context") {
    return (
      <Explained
        testId="candidates-no-company"
        text={t("candidatesNoCompany")}
        openLabel={t("openFull")}
        onOpenFull={() => onOpenFull(FULL_ROUTE)}
      />
    );
  }
  if (view.kind === "blocked") {
    return (
      <Explained
        testId="candidates-blocked"
        text={t("candidatesBlocked")}
        openLabel={t("openFull")}
        onOpenFull={() => onOpenFull(FULL_ROUTE)}
      />
    );
  }
  if (view.kind === "empty") {
    return (
      <Explained
        testId="candidates-no-demands"
        text={t("candidatesNoDemands")}
        openLabel={t("openFull")}
        onOpenFull={() => onOpenFull(FULL_ROUTE)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="candidates-demand-picker">
      <p className="text-basis text-text-secondary">{t("candidatesPickDemand")}</p>
      <ul className="flex flex-col divide-y divide-border/40">
        {view.demands.map((d) => (
          <li key={d.requestId}>
            <button
              type="button"
              onClick={() => onSelectDemand(d.requestId)}
              data-testid={`candidates-demand-${d.requestId}`}
              className="flex min-h-11 w-full flex-col items-start gap-0.5 py-2 text-left hover:bg-ink-800/40"
            >
              <span className="text-basis font-semibold text-text-primary">
                {d.title}
              </span>
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {/* The REAL row status, localized — never a state we invented.
                    An unknown status renders its own token rather than a
                    prettier lie. */}
                {DEMAND_STATUSES.includes(d.status)
                  ? t(`demandStatus.${d.status}` as "demandStatus.draft")
                  : d.status}
                {d.structured ? "" : ` · ${t("candidatesUnstructuredBadge")}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <OpenFull label={t("openFull")} onOpenFull={() => onOpenFull(FULL_ROUTE)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Depth 1 — who can do this work, and what happens next
// ═══════════════════════════════════════════════════════════════════════════

function CandidateList({
  demandId,
  locale,
  onBack,
  onOpenFull,
}: {
  demandId: string;
  locale: string;
  onBack: () => void;
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const [phase, setPhase] = useState<CandidatesPhase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    loadEmployerCandidatesForChat(demandId)
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [demandId, attempt]);

  const back = (
    <button
      type="button"
      onClick={onBack}
      data-testid="candidates-back"
      className="self-start text-support font-semibold text-brand-blue hover:underline"
    >
      {t("candidatesBackToDemands")}
    </button>
  );

  if (phase.kind === "loading") {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Pending testId="candidates-loading" />
      </div>
    );
  }
  if (phase.kind === "error") {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Failed
          testId="candidates-error"
          text={t("candidatesError")}
          retryLabel={t("retry")}
          onRetry={reload}
        />
      </div>
    );
  }

  const { view } = phase;

  // Five distinct failures, five distinct sentences. None of them is an empty
  // candidate list, because "nobody matched" is a claim about people.
  if (
    view.kind === "not-found" ||
    view.kind === "needs-migration" ||
    view.kind === "error" ||
    view.kind === "no-company-context" ||
    view.kind === "blocked"
  ) {
    const text =
      view.kind === "not-found"
        ? t("candidatesNotFound")
        : view.kind === "needs-migration"
          ? t("candidatesNeedsMigration")
          : view.kind === "error"
            ? t("candidatesError")
            : view.kind === "no-company-context"
              ? t("candidatesNoCompany")
              : t("candidatesBlocked");
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Explained
          testId={`candidates-${view.kind}`}
          text={text}
          openLabel={t("openFull")}
          onOpenFull={() => onOpenFull(FULL_ROUTE)}
        />
      </div>
    );
  }

  if (view.kind === "not-structured") {
    return (
      <div className="flex flex-col gap-3" data-testid="candidates-not-structured">
        {back}
        <DemandHeader title={view.demand.title} status={view.demand.status} />
        {/* NOT "no candidates": there is nothing to match against yet. */}
        <p className="text-basis text-text-secondary">{t("candidatesNotStructured")}</p>
        <DemandActions demand={view.demand} locale={locale} onDone={reload} />
        <OpenFull label={t("openFull")} onOpenFull={() => onOpenFull(FULL_ROUTE)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="candidates-view">
      {back}
      <DemandHeader title={view.demand.title} status={view.demand.status} />
      <DemandActions demand={view.demand} locale={locale} onDone={reload} />

      {/* W10 slice 3 — an employer reading a short list is entitled to know
          whether the platform actually looked at everyone. */}
      {view.retrievalCapped && (
        <p className="text-meta text-state-amber" data-testid="candidates-retrieval-capped">
          {t("candidatesRetrievalCapped")}
        </p>
      )}

      {view.candidates.length === 0 ? (
        <p className="text-basis text-text-secondary" data-testid="candidates-empty">
          {t("candidatesEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40">
          {view.candidates.map((c) => (
            <li key={c.workerId} className="py-3">
              <CandidateCard
                candidate={c}
                requestId={view.demand.requestId}
                locale={locale}
                onDone={reload}
              />
            </li>
          ))}
        </ul>
      )}

      {view.capped && (
        <p className="text-meta text-text-muted" data-testid="candidates-capped">
          {t("candidatesCapped", {
            shown: view.candidates.length,
            total: view.total,
          })}
        </p>
      )}

      <OpenFull label={t("openFull")} onOpenFull={() => onOpenFull(FULL_ROUTE)} />
    </div>
  );
}

function DemandHeader({ title, status }: { title: string; status: string }) {
  const t = useTranslations("conversation.results");
  return (
    <div className="flex flex-col gap-0.5" data-testid="candidates-demand-header">
      <span className="font-display text-card-title font-semibold text-text-primary">
        {title}
      </span>
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {DEMAND_STATUSES.includes(status)
          ? t(`demandStatus.${status}` as "demandStatus.draft")
          : status}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The need's own lifecycle — §19 confirm, close, reopen
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The three demand-lifecycle executors, offered only where the canonical layer
 * would actually do something:
 *
 *   confirm  only when the requirement set was RECOGNIZED or EXPANDED — an
 *            already human-structured need has nothing to confirm, and the
 *            canonical action answers `nothing-to-confirm` rather than
 *            pretending. Offering the button there would be a control that
 *            cannot work.
 *   close    only from `submitted` (the transition `canCloseFrom` allows).
 *   reopen   only from `closed`.
 *
 * There is deliberately NO "publish": worker-board visibility is RLS/RPC
 * driven behind the verified-company gate, so a publish switch would claim a
 * state transition the platform does not have.
 */
function DemandActions({
  demand,
  locale,
  onDone,
}: {
  demand: { requestId: string; status: string; needSource: string | null };
  locale: string;
  onDone: () => void;
}) {
  const t = useTranslations("conversation.results");
  const confirmable =
    demand.needSource === "recognized_from_text" ||
    demand.needSource === "profession_expanded";
  const closable = demand.status === "submitted";
  const reopenable = demand.status === "closed";

  if (!confirmable && !closable && !reopenable) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="candidates-demand-actions">
      <ChatActionRow>
        {confirmable && (
          <ActionButton
            locale={locale}
            actionId="company.confirm-need"
            input={{ requestId: demand.requestId }}
            label={t("actionConfirmNeed")}
            tone="primary"
            testId="candidates-confirm-need"
            onDone={onDone}
          />
        )}
        {closable && (
          <ActionButton
            locale={locale}
            actionId="company.close-demand"
            input={{ requestId: demand.requestId }}
            label={t("actionCloseDemand")}
            tone="secondary"
            testId="candidates-close-demand"
            onDone={onDone}
          />
        )}
        {reopenable && (
          <ActionButton
            locale={locale}
            actionId="company.reopen-demand"
            input={{ requestId: demand.requestId }}
            label={t("actionReopenDemand")}
            tone="secondary"
            testId="candidates-reopen-demand"
            onDone={onDone}
          />
        )}
      </ChatActionRow>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// One candidate
// ═══════════════════════════════════════════════════════════════════════════

function CandidateCard({
  candidate,
  requestId,
  locale,
  onDone,
}: {
  candidate: EmployerCandidateRow;
  requestId: string;
  locale: string;
  onDone: () => void;
}) {
  const t = useTranslations("conversation.results");
  const tStage = useTranslations("candidatePipeline.stage");
  const [open, setOpen] = useState(false);
  const [booking, setBooking] = useState(false);

  return (
    <div className="flex flex-col gap-2" data-testid={`candidate-${candidate.workerId}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`candidate-open-${candidate.workerId}`}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-basis font-semibold text-text-primary">
            {t("candidateLabel", { token: candidate.label })}
          </span>
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`candidateMatch.${candidate.matchStatus}`)}
            {candidate.coveragePct !== null
              ? ` · ${t("candidateCoverage", { pct: candidate.coveragePct })}`
              : ""}
          </span>
        </span>
        {/* The DERIVED pipeline stage (P4) — the honest answer to "where is
            this person in my process", including the booking state. */}
        <span
          className="shrink-0 rounded-full border border-ink-500 px-2 py-0.5 text-meta text-text-secondary"
          data-testid={`candidate-stage-${candidate.workerId}`}
        >
          {tStage(candidate.pipelineStage)}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 rounded-control border border-ink-600 p-3">
          <dl className="flex flex-col gap-1 text-support">
            <Row label={t("fieldCountry")} value={candidate.country ?? t("notStated")} />
            <Row
              label={t("candidateConfirmedLabel")}
              value={String(candidate.confirmedCount)}
            />
            {candidate.bookingStatus && (
              <Row
                label={t("candidateBookingLabel")}
                value={
                  BOOKING_STATUSES.includes(candidate.bookingStatus)
                    ? t(
                        `bookingStatus.${candidate.bookingStatus}` as "bookingStatus.proposed",
                      )
                    : candidate.bookingStatus
                }
              />
            )}
            {candidate.shortlistNote && (
              <Row label={t("candidateNoteLabel")} value={candidate.shortlistNote} />
            )}
          </dl>

          {/* A hard criterion failed. Stated as a fact, never softened into a
              lower score — a weighted total can never restore eligibility. */}
          {!candidate.eligible && (
            <p className="text-meta text-state-amber" data-testid="candidate-not-eligible">
              {t("candidateNotEligible")}
            </p>
          )}

          {candidate.gaps.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-meta text-text-muted">
              {candidate.gaps.map((g) => (
                <li key={g}>— {t(`candidateGap.${g}`)}</li>
              ))}
            </ul>
          )}

          <ChatActionRow>
            <ActionButton
              locale={locale}
              actionId="company.shortlist-candidate"
              input={{ requestId, workerId: candidate.workerId, status: "interested" }}
              label={t("actionShortlist")}
              tone="secondary"
              testId={`candidate-shortlist-${candidate.workerId}`}
              onDone={onDone}
            />
            {/* Owner rule 6: communication and booking may start only when the
                worker's own availability allows it. The control is not
                rendered as a disabled tease — the reason is said. */}
            {candidate.canContact ? (
              <>
                <ActionButton
                  locale={locale}
                  actionId="company.contact-worker"
                  input={{ requestId, workerId: candidate.workerId }}
                  label={t("actionContact")}
                  tone="primary"
                  testId={`candidate-contact-${candidate.workerId}`}
                  onDone={onDone}
                />
                <ChatAction
                  tone="secondary"
                  testId={`candidate-book-open-${candidate.workerId}`}
                  onClick={() => setBooking((v) => !v)}
                >
                  {t("actionProposeBooking")}
                </ChatAction>
              </>
            ) : null}
          </ChatActionRow>

          {!candidate.canContact && (
            <p className="text-meta text-text-muted" data-testid="candidate-cannot-contact">
              {t("candidateCannotContact")}
            </p>
          )}

          {booking && candidate.canContact && (
            <BookingProposal
              requestId={requestId}
              workerId={candidate.workerId}
              locale={locale}
              onDone={() => {
                setBooking(false);
                onDone();
              }}
              onCancel={() => setBooking(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The booking proposal — three optional fields and one dispatch.
 *
 * Every field is optional because the canonical schema says so; the panel does
 * not invent a stricter contract than the action it calls, and it does not
 * invent a default date either. What it never does is send: `proposeBooking`
 * writes an in-app booking row, and nothing in this workspace mails anyone.
 */
function BookingProposal({
  requestId,
  workerId,
  locale,
  onDone,
  onCancel,
}: {
  requestId: string;
  workerId: string;
  locale: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("conversation.results");
  const tUi = useTranslations("conversation.forms.ui");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const inputCls =
    "min-h-11 w-full rounded-control border border-ink-500 bg-ink-800 px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  return (
    <div
      className="flex flex-col gap-2 rounded-control border border-ink-600 p-3"
      data-testid={`candidate-booking-form-${workerId}`}
    >
      <label className="flex flex-col gap-1 text-meta text-text-muted">
        {t("bookingStart")}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          data-testid="candidate-booking-start"
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-meta text-text-muted">
        {t("bookingEnd")}
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          data-testid="candidate-booking-end"
          aria-describedby="candidate-booking-end-hint"
          className={inputCls}
        />
        {/* W7 P2-1: an empty end date is NOT an open-ended booking, and until
            now nothing said so. The double-booking guard
            (`booking_atomic_double_booking_v1.sql`) computes the conflict band
            as `daterange(start_date, coalesce(expected_end_date, start_date))`
            — with no end it collapses to the START DAY, so the worker is
            protected against a clashing booking on day one and on no other
            day. Leaving this blank therefore reserves a single day; it does
            not hold the worker indefinitely. Saying that here costs nothing
            and stops an employer believing they hold a worker they do not.
            Making genuinely open-ended bookings conflict-safe is a schema
            change and stays owner-gated — see
            `docs/audits/W7_CLOSURE_AUDIT.md` §3. */}
        <span
          id="candidate-booking-end-hint"
          className="text-meta leading-snug text-text-muted"
          data-testid="candidate-booking-end-hint"
        >
          {t("bookingEndHint")}
        </span>
      </label>
      <label className="flex flex-col gap-1 text-meta text-text-muted">
        {t("bookingNote")}
        <input
          type="text"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid="candidate-booking-note"
          className={inputCls}
        />
      </label>
      <ChatActionRow>
        <ActionButton
          locale={locale}
          actionId="company.propose-booking"
          input={{
            requestId,
            workerId,
            // Empty stays absent: the schema's nullable fields mean "not
            // stated", and an empty string is not a date.
            startDate: startDate.trim() || null,
            expectedEndDate: endDate.trim() || null,
            note: note.trim() || null,
          }}
          label={t("actionProposeBooking")}
          tone="primary"
          testId={`candidate-booking-submit-${workerId}`}
          onDone={onDone}
        />
        <ChatAction tone="secondary" onClick={onCancel}>
          {tUi("cancel")}
        </ChatAction>
      </ChatActionRow>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The ONE way this surface writes anything
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single conversation action, executed through the canonical dispatcher.
 *
 * IMPORTANT/STRONG tiers mint a fresh one-time confirmation token first
 * (`prepareConfirmationAction`), exactly as the inline form and the worker
 * booking card do — the dispatcher refuses the write without one, and a stale
 * or replayed token is rejected server-side.
 *
 * THE RESULT IS THE SERVER'S. A failure renders the real code (including the
 * honest `nothing_to_confirm` and `reason_required` states the employer
 * canonical layer returns); nothing here reports a success the server did not.
 */
function ActionButton({
  actionId,
  input,
  label,
  tone,
  testId,
  locale,
  onDone,
}: {
  actionId: string;
  input: Record<string, unknown>;
  label: string;
  tone: "primary" | "secondary";
  testId: string;
  locale: string;
  onDone: () => void;
}) {
  const t = useTranslations("conversation.results");
  const tUi = useTranslations("conversation.forms.ui");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The registry's confirmation tier decides this, not the caller's opinion:
  // these three are the `important_write` employer actions.
  const needsToken =
    actionId === "company.confirm-need" ||
    actionId === "company.contact-worker" ||
    actionId === "company.propose-booking";

  const run = useCallback(() => {
    setError(null);
    start(async () => {
      let confirmationToken: string | undefined;
      if (needsToken) {
        const prep = await prepareConfirmationAction(actionId, input);
        if (!prep.ok) {
          setError(
            prep.code === "invalid" ? tUi("errorInvalid") : tUi("errorGeneric"),
          );
          return;
        }
        confirmationToken = prep.token;
      }
      const res = await dispatchWorkerAction(actionId, input, {
        locale,
        confirmationToken,
      });
      if (res.ok) {
        trackFunnel(FUNNEL_EVENTS.companyDemandActionClicked, {
          surface: "conversation",
          role_context: roleContextForAction(actionId),
          success: true,
        });
        setDone(true);
        onDone();
        return;
      }
      setError(
        res.code === "invalid"
          ? tUi("errorInvalid")
          : res.code === "needs_migration"
            ? tUi("errorNeedsMigration")
            : res.code === "conflict"
              ? tUi("errorConflict")
              : res.code === "nothing_to_confirm"
                ? t("actionNothingToConfirm")
                : res.code === "reason_required"
                  ? t("actionReasonRequired")
                  : res.code === "not_authorized"
                    ? t("actionNotAuthorized")
                    : tUi("errorGeneric"),
      );
    });
  }, [actionId, input, locale, needsToken, onDone, t, tUi]);

  return (
    <span className="flex flex-col gap-1">
      <ChatAction
        tone={tone}
        loading={pending}
        disabled={pending || done}
        testId={testId}
        onClick={run}
      >
        {pending ? tUi("working") : done ? tUi("saved") : label}
      </ChatAction>
      {error && (
        <span
          role="alert"
          className="text-meta text-state-danger"
          data-testid={`${testId}-error`}
        >
          {error}
        </span>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Small shared pieces (presentation only)
// ═══════════════════════════════════════════════════════════════════════════

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}

function Pending({ testId }: { testId: string }) {
  const t = useTranslations("conversation.results");
  return (
    <p className="text-basis text-text-muted" data-testid={testId} aria-busy="true">
      {t("pendingInline")}
    </p>
  );
}

function Failed({
  testId,
  text,
  retryLabel,
  onRetry,
}: {
  testId: string;
  text: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-basis text-text-secondary">{text}</p>
      <ChatActionRow>
        <ChatAction tone="secondary" testId={`${testId}-retry`} onClick={onRetry}>
          {retryLabel}
        </ChatAction>
      </ChatActionRow>
    </div>
  );
}

function Explained({
  testId,
  text,
  openLabel,
  onOpenFull,
}: {
  testId: string;
  text: string;
  openLabel: string;
  onOpenFull: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-basis text-text-secondary">{text}</p>
      <OpenFull label={openLabel} onOpenFull={onOpenFull} />
    </div>
  );
}

function OpenFull({ label, onOpenFull }: { label: string; onOpenFull: () => void }) {
  return (
    <ChatActionRow>
      <ChatAction tone="secondary" testId="candidates-open-full" onClick={onOpenFull}>
        {label}
      </ChatAction>
    </ChatActionRow>
  );
}
