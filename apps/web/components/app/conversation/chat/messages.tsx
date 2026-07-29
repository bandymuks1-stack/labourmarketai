"use client";

import { Check, FileText, Languages, Clock, Building2, CircleDashed } from "lucide-react";
import { OpportunitiesShownMarker } from "@/components/app/marketplace/opportunities-shown-marker";
import { WorkerInterestButton } from "@/components/app/worker-interest-button";
import { useWorldStateOptional } from "@/components/app/world-state/world-state-provider";
import { AssistantMark } from "./assistant-identity";
import { ChatAction, ChatActionRow } from "./chat-action";
import { iconControl, iconInline } from "./icon-scale";
import type { ChatMessage, ChoiceChip, EmployerMatch, InterestLabels } from "./types";

/** Callbacks the thread wires into interactive messages. */
export type MessageHandlers = {
  onChip: (chip: ChoiceChip) => void;
  onConfirm: (messageId: string) => void;
  onCancel: (messageId: string) => void;
  /** Localized speaker names, announced per turn to assistive tech only. */
  speakers: { assistant: string; user: string };
};

/**
 * Badge colour follows the CANONICAL match status, never a flat "success".
 * A weak fit painted success-green tells the worker the opposite of what the
 * use case computed — the colour has to carry the same fact as the label.
 */
const FIT_BADGE: Record<string, string> = {
  strong: "bg-state-success/10 text-state-success",
  possible: "bg-brand-blue/10 text-brand-blue",
  weak: "bg-state-warning/10 text-state-warning",
  insufficient: "bg-ink-700 text-text-muted",
};

/**
 * One employer match, selectable (W3).
 *
 * Selecting it does NOT navigate: it writes `active_entity` into World State
 * and the Context Panel follows — "Paspaudus objektą NEATIDAROMAS NAUJAS
 * PUSLAPIS." The card keeps its own inline interest control, so a person who
 * only wants to signal interest never has to open the panel at all; the panel
 * is where the demand's full facts, requirements and next steps live.
 *
 * Outside the workspace (no World State provider) the title is plain text
 * rather than a button — a control that cannot do anything is never rendered.
 */
function EmployerMatchCard({
  match,
  locale,
  interestLabels,
}: {
  match: EmployerMatch;
  locale?: string;
  interestLabels: InterestLabels | null;
}) {
  const world = useWorldStateOptional();
  const selected =
    world?.state.activeEntity?.type === "job" && world.state.activeEntity.id === match.id;

  const title = (
    <span className="flex min-w-0 items-center gap-2 font-display text-card-title font-semibold text-text-primary">
      <Building2 {...iconControl("flex-none text-brand-blue")} aria-hidden />
      <span className="truncate">{match.name}</span>
    </span>
  );

  return (
    <div
      data-testid="chat-employer-match-card"
      data-selected={selected ? "true" : undefined}
      className={`rounded-card border bg-ink-800/60 p-3.5 ${
        selected ? "border-brand-blue" : "border-ink-500"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        {world ? (
          <button
            type="button"
            onClick={() => world.openEntity({ type: "job", id: match.id })}
            data-testid="chat-employer-match-open"
            aria-pressed={selected}
            className="flex min-w-0 items-center rounded-sm text-left hover:text-brand-blue"
          >
            {title}
          </button>
        ) : (
          title
        )}
        <span
          data-fit-status={match.fitStatus}
          className={`flex-none rounded-full px-2.5 py-0.5 text-meta font-semibold ${FIT_BADGE[match.fitStatus] ?? FIT_BADGE.insufficient}`}
        >
          {match.fitLabel}
        </span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {match.reasons.map((r, i) => (
          // Neutral bullets: these are FACTS about the demand (the §19 basis,
          // its location, its role) — a green tick would read as "you meet
          // this", which the basis may deny.
          <li key={i} className="flex items-start gap-2 text-basis text-text-secondary">
            <span className="mt-1.5 size-1 flex-none rounded-full bg-text-muted" aria-hidden /> {r}
          </li>
        ))}
      </ul>
      {/* The match must be ACTIONABLE, not a read-only card. This is the SAME
          canonical control the opportunities board renders — one interest state
          machine, one write path, one honest scope note. Rendered only when the
          owner-gated interest table exists (labels present); otherwise the card
          stays read-only rather than showing a button that cannot work. */}
      {interestLabels && locale ? (
        <div className="mt-2.5 border-t border-ink-600 pt-2.5">
          <WorkerInterestButton
            locale={locale}
            requestId={match.id}
            initialStatus={match.interestStatus}
            labels={interestLabels}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Who is speaking. The same product mark in every assistant turn. */
function Avatar() {
  return <AssistantMark className="mt-0.5" />;
}

function Chips({ chips, onChip }: { chips: ChoiceChip[]; onChip: (c: ChoiceChip) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChip(c)}
          data-testid={`chat-chip-${c.id}`}
          data-recommended={c.recommended ? "true" : undefined}
          className={`ua-press min-h-11 rounded-full px-4 text-support font-medium ${
            c.recommended
              ? // The ONE solid choice, and only when the server named a real gap.
                "bg-brand-blue font-semibold text-white shadow-cta-glow hover:bg-brand-blue/90"
              : "border border-ink-500 bg-ink-800 text-text-primary hover:border-brand-blue hover:text-brand-blue"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Profile growth — the fix for the one DESIGN_SOUL test the audit found
 * FAILING ("profilis atrodo kaip auganti gyvybė, ne kaip forma").
 *
 * It was a flat list where confirming something changed one icon's colour.
 * Now the saved checkpoints visibly accumulate into a five-segment bar.
 *
 * HONEST BY CONSTRUCTION:
 *   • the counts are the SERVER's (`stepsDone` / `stepsTotal`) — this renders
 *     them and never counts the arrays, so the bar cannot disagree with the
 *     read model;
 *   • no percentage is shown or computed (the player-card contract forbids one);
 *   • no streak, points, level, badge, confetti or sound;
 *   • a segment carries THREE signals — fill, shape (solid vs dashed outline)
 *     and the adjacent named lists — so colour is never the only indicator;
 *   • `role="progressbar"` with `aria-valuetext` gives a screen reader the real
 *     "4 of 5", not a decorative graphic;
 *   • the bar is deliberately NOT animated: the card is rebuilt on every turn,
 *     so animating here would celebrate on every render rather than on a real
 *     status change. The one-shot `ua-confirmed` stays where a change actually
 *     happens — the save confirmation.
 */
function ProfileGrowth({
  done,
  total,
  label,
  ariaLabel,
}: {
  done: number;
  total: number;
  label: string;
  ariaLabel: string;
}) {
  return (
    <div
      className="mt-3 flex items-center gap-3"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={ariaLabel}
      data-testid="profile-growth"
      data-done={done}
      data-total={total}
    >
      <span className="flex flex-1 gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            data-filled={i < done ? "true" : "false"}
            className={`h-1.5 flex-1 rounded-full ${
              i < done
                ? "bg-trust-accent"
                : "border border-dashed border-ink-500 bg-transparent"
            }`}
          />
        ))}
      </span>
      <span className="flex-none font-mono text-meta tabular-nums text-text-secondary">
        {label}
      </span>
    </div>
  );
}

/**
 * An assistant turn: who is speaking, then whatever they are saying.
 *
 * Repeated verbatim in seven branches before this. Extracted because the
 * duplication was purely STRUCTURAL — identical markup, no per-variant
 * behaviour — so one place now decides avatar placement and the gutter.
 * Deliberately NOT given a `variant` prop: what differs between turns is the
 * BODY, and hiding that behind a flag is how a component becomes unreadable.
 */
function AssistantTurn({
  testId,
  speaker,
  children,
}: {
  testId: string;
  /** The assistant's name, announced once per turn to assistive tech. The
   *  avatar mark is `aria-hidden` (it is decoration), so without this a screen
   *  reader cannot tell an assistant turn from the user's own. */
  speaker: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5" data-testid={testId}>
      <Avatar />
      <span className="sr-only">{speaker}</span>
      {children}
    </div>
  );
}

/** The measure every assistant turn shares — a readable column that structured
 *  cards may fill completely. */
const TURN_WIDTH = "min-w-0 max-w-[46rem] flex-1";

/**
 * A structured result rendered as an OBJECT rather than as speech: the bordered
 * card the confirmation, work-log, translation and profile-summary turns share.
 *
 * `tone` is the only variation, and it is semantic (a caution surface for an
 * irreversible confirmation) rather than a style switch.
 */
function CardBody({
  tone = "neutral",
  title,
  icon,
  children,
}: {
  tone?: "neutral" | "caution";
  /** Rendered as the card's `<h3>` in the display face. Omit for a card whose
   *  first line is already prose (the profile summary). */
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${TURN_WIDTH} rounded-card border p-4 ${
        tone === "caution"
          ? "border-state-warning/40 bg-state-warning/5"
          : "border-ink-500 bg-surface-1/70"
      }`}
    >
      {title !== undefined && (
        <h3 className="flex items-center gap-1.5 font-display text-card-title font-semibold text-text-primary">
          {icon}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

export function ChatMessageView({
  m,
  h,
  isLast = true,
}: {
  m: ChatMessage;
  h: MessageHandlers;
  /** Chip rows render only on the NEWEST message (owner ruling 2026-07-29,
   *  W2): earlier answers keep their text, their buttons collapse — the
   *  thread never accumulates a persistent button wall. */
  isLast?: boolean;
}) {
  // ── the opening turn — the screen's one real heading ─────────────────────
  // 22px on phones / 28px from `sm:` up, display face, no bubble. This is the
  // page title, so it is an <h1>: the conversation carried ZERO headings
  // before, leaving screen readers without a document outline and sighted
  // users without any type scale at all.
  if (m.role === "assistant" && m.kind === "greeting") {
    return (
      <div className="flex flex-col gap-4" data-testid="msg-greeting">
        {/* Who is speaking, stated once. The same mark every assistant turn
            wears, so the stream and the header are visibly one identity. */}
        <p className="flex items-center gap-2 text-meta font-medium uppercase tracking-label text-text-muted">
          <AssistantMark size="sm" />
          {m.assistantName}
        </p>
        <h1 className="max-w-[30ch] text-balance font-display text-title font-bold text-text-primary sm:text-title-lg">
          {m.text}
        </h1>
        {isLast && m.chips && m.chips.length > 0 && <Chips chips={m.chips} onChip={h.onChip} />}
      </div>
    );
  }

  // ── user text — right-aligned bubble ────────────────────────────────────
  if (m.role === "user" && m.kind === "text") {
    return (
      <div className="flex justify-end" data-testid="msg-user">
        <span className="sr-only">{h.speakers.user}</span>
        <div className="max-w-[85%] rounded-bubble rounded-br-md bg-brand-blue/15 px-4 py-2.5 text-body text-text-primary">
          {m.text}
        </div>
      </div>
    );
  }

  // ── user file bubble ─────────────────────────────────────────────────────
  if (m.role === "user" && m.kind === "file") {
    return (
      <div className="flex justify-end" data-testid="msg-file">
        <span className="sr-only">{h.speakers.user}</span>
        <div className="flex max-w-[85%] items-center gap-2 rounded-bubble rounded-br-md border border-ink-500 bg-ink-800 px-4 py-2.5 text-body text-text-primary">
          <FileText {...iconInline("flex-none text-text-muted")} aria-hidden />
          <span className="truncate">{m.fileName}</span>
          {m.status === "read" && <Check {...iconInline("flex-none text-state-success")} aria-hidden />}
        </div>
      </div>
    );
  }

  // ── system result / error — subtle centered line ─────────────────────────
  if (m.role === "system" && m.kind === "result") {
    return (
      <div className="ua-confirmed flex items-center gap-2 px-1 text-basis" data-testid="msg-result">
        <Check {...iconInline(`flex-none ${m.ok ? "text-state-success" : "text-state-danger"}`)} aria-hidden />
        <span className={m.ok ? "text-state-success" : "text-state-danger"}>{m.text}</span>
      </div>
    );
  }
  if (m.role === "system" && m.kind === "error") {
    return (
      <div className="rounded-card border border-state-danger/30 bg-state-danger/5 px-3 py-2 text-support text-state-danger" role="alert" data-testid="msg-error">
        {m.text}
      </div>
    );
  }

  // ── assistant text (with optional chips) ─────────────────────────────────
  if (m.role === "assistant" && m.kind === "text") {
    return (
      <AssistantTurn testId="msg-assistant" speaker={h.speakers.assistant}>
        <div className="min-w-0 max-w-[46rem] pt-0.5">
          {/* pre-line: structured server readbacks (criteria, summaries) send
              real newlines; collapsing them would mash facts into one line. */}
          <div className="whitespace-pre-line text-body text-text-primary">{m.text}</div>
          {isLast && m.chips && m.chips.length > 0 && <Chips chips={m.chips} onChip={h.onChip} />}
        </div>
      </AssistantTurn>
    );
  }

  // ── assistant structured question ────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "question") {
    return (
      <AssistantTurn testId="msg-question" speaker={h.speakers.assistant}>
        <div className="min-w-0 max-w-[46rem] pt-0.5">
          <div className="text-body text-text-primary">{m.text}</div>
          {isLast && <Chips chips={m.chips} onChip={h.onChip} />}
        </div>
      </AssistantTurn>
    );
  }

  // ── confirmation card in stream ──────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "confirmation") {
    return (
      <AssistantTurn testId="msg-confirmation" speaker={h.speakers.assistant}>
        <CardBody tone={m.strong ? "caution" : "neutral"} title={m.title}>
          {m.confirmedText ? (
            <p className="ua-confirmed mt-1.5 flex items-center gap-1.5 text-support font-semibold text-state-success">
              <Check {...iconInline()} aria-hidden /> {m.confirmedText}
            </p>
          ) : (
            <>
              {m.body && <p className="mt-1.5 text-support text-text-secondary">{m.body}</p>}
              <ChatActionRow>
                {/* One solid primary; the cancel is a ghost so it cannot read
                    as an equally-weighted choice. A `strong` (irreversible)
                    confirmation is still the recommended path — it is the
                    warning-tinted CARD that carries the caution, not a
                    de-emphasised button the user then cannot find. */}
                <ChatAction tone="primary" testId="msg-confirm-yes" onClick={() => h.onConfirm(m.id)}>
                  {m.confirmLabel}
                </ChatAction>
                <ChatAction tone="secondary" onClick={() => h.onCancel(m.id)}>
                  {m.cancelLabel}
                </ChatAction>
              </ChatActionRow>
            </>
          )}
        </CardBody>
      </AssistantTurn>
    );
  }

  // ── work-log preview card ────────────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "worklog") {
    const d = m.draft;
    return (
      <AssistantTurn testId="msg-worklog" speaker={h.speakers.assistant}>
        <CardBody
          title={m.title}
          icon={<Clock {...iconControl("flex-none text-brand-blue")} aria-hidden />}
        >
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-basis">
            <Row k={m.fieldLabels.date} v={d.date} />
            <Row k={m.fieldLabels.time} v={`${d.start}–${d.end}`} />
            <Row k={m.fieldLabels.break} v={`${d.breakMinutes} min`} />
            <Row k={m.fieldLabels.hours} v={d.hoursLabel} />
            {d.task && <Row k={m.fieldLabels.task} v={d.task} />}
            {d.project && <Row k={m.fieldLabels.site} v={d.project} />}
          </dl>
          {d.skills && d.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {d.skills.map((s) => (
                <span key={s} className="rounded-full bg-ink-700 px-2.5 py-0.5 text-meta text-text-secondary">{s}</span>
              ))}
            </div>
          )}
          <ChatActionRow>
            <ChatAction tone="primary" testId="msg-worklog-save" onClick={() => h.onConfirm(m.id)}>
              {m.confirmLabel}
            </ChatAction>
            <ChatAction tone="secondary" onClick={() => h.onCancel(m.id)}>
              {m.cancelLabel}
            </ChatAction>
          </ChatActionRow>
        </CardBody>
      </AssistantTurn>
    );
  }

  // ── employer match card ──────────────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "employer-match") {
    return (
      <AssistantTurn testId="msg-employer-match" speaker={h.speakers.assistant}>
        <div className={TURN_WIDTH}>
          {/* Rendering IS the read event (canonical decision §10). The cards
              below are exactly what the human sees, so exactly these real
              demand ids are reported — never the wider set the board loaded.
              An empty `matches` renders no card and mounts no marker. */}
          {m.matches.length > 0 && (
            <OpportunitiesShownMarker
              surface="conversation"
              requestIds={m.matches.map((match) => match.id)}
            />
          )}
          <div className="text-body text-text-primary">{m.intro}</div>
          <div className="mt-2 flex flex-col gap-2">
            {m.matches.map((e) => (
              <EmployerMatchCard
                key={e.id}
                match={e}
                locale={m.locale}
                interestLabels={m.interestLabels ?? null}
              />
            ))}
          </div>
        </div>
      </AssistantTurn>
    );
  }

  // ── profile summary card ─────────────────────────────────────────────────
  // Server-derived from the worker's OWN canonical rows (the same read model
  // the Phase B conversation shell uses). Concrete facts only: what is saved,
  // what is still missing, and the real last activity. No fabricated signal —
  // and the chips below are the existing profile actions, so "what's missing"
  // is one tap from being fixed.
  if (m.role === "assistant" && m.kind === "profile-summary") {
    return (
      <AssistantTurn testId="msg-profile-summary" speaker={h.speakers.assistant}>
        <div className={TURN_WIDTH}>
          <div className="rounded-card border border-ink-500 bg-surface-1/70 p-4">
            <p className="text-body text-text-primary">{m.intro}</p>
            <ProfileGrowth
              done={m.stepsDone}
              total={m.stepsTotal}
              label={m.progressLabel}
              ariaLabel={m.progressAriaLabel}
            />
            {m.done.length > 0 && (
              <p className="mt-3.5 font-mono text-meta uppercase tracking-label text-text-muted">
                {m.doneWord}
              </p>
            )}
            {m.done.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1" data-testid="profile-summary-done">
                {m.done.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-support text-text-secondary">
                    <Check {...iconInline("mt-0.5 flex-none text-state-success")} aria-hidden /> {d}
                  </li>
                ))}
              </ul>
            )}
            {m.missing.length > 0 && (
              <p className="mt-3 font-mono text-meta uppercase tracking-label text-text-muted">
                {m.missingWord}
              </p>
            )}
            {m.missing.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1" data-testid="profile-summary-missing">
                {m.missing.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-support text-text-muted">
                    <CircleDashed {...iconInline("mt-0.5 flex-none text-state-warning")} aria-hidden /> {d}
                  </li>
                ))}
              </ul>
            )}
            {m.lastActivity && (
              <p className="mt-3.5 flex items-center gap-1.5 border-t border-ink-600 pt-3 text-meta text-text-muted" data-testid="profile-summary-last">
                <Clock {...iconInline("flex-none")} aria-hidden /> {m.lastActivity}
              </p>
            )}
          </div>
          {isLast && m.chips && m.chips.length > 0 && <Chips chips={m.chips} onChip={h.onChip} />}
        </div>
      </AssistantTurn>
    );
  }

  // ── translation preview card ─────────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "translation") {
    return (
      <AssistantTurn testId="msg-translation" speaker={h.speakers.assistant}>
        <CardBody
          title={`${m.recipient} · ${m.channelLabel}`}
          icon={<Languages {...iconControl("flex-none text-brand-blue")} aria-hidden />}
        >
          <div className="mt-2 flex flex-col gap-2">
            <div>
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">{m.originalLabel}</p>
              <p className="text-body text-text-primary">{m.original}</p>
            </div>
            <div className="rounded-control border border-ink-600 bg-ink-800/60 p-2.5">
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">{m.translatedLabel}</p>
              <p className="text-body text-text-primary">{m.translated}</p>
            </div>
          </div>
          <ChatActionRow>
            <ChatAction tone="primary" testId="msg-translation-send" onClick={() => h.onConfirm(m.id)}>
              {m.confirmLabel}
            </ChatAction>
            <ChatAction tone="secondary" onClick={() => h.onCancel(m.id)}>
              {m.cancelLabel}
            </ChatAction>
          </ChatActionRow>
        </CardBody>
      </AssistantTurn>
    );
  }

  return null;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-text-muted">{k}</dt>
      <dd className="text-right font-medium text-text-primary">{v}</dd>
    </>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-2.5" role="status" aria-live="polite" data-testid="chat-typing">
      <Avatar />
      <div className="flex items-center gap-1 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="ua-dot size-1.5 rounded-full bg-text-muted"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
