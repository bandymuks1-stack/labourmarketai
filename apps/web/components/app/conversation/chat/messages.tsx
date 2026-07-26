"use client";

import { Check, FileText, Sparkles, Languages, Clock, Building2, CircleDashed } from "lucide-react";
import { OpportunitiesShownMarker } from "@/components/app/marketplace/opportunities-shown-marker";
import { WorkerInterestButton } from "@/components/app/worker-interest-button";
import type { ChatMessage, ChoiceChip } from "./types";

/** Callbacks the thread wires into interactive messages. */
export type MessageHandlers = {
  onChip: (chip: ChoiceChip) => void;
  onConfirm: (messageId: string) => void;
  onCancel: (messageId: string) => void;
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

function Avatar() {
  return (
    <span className="mt-0.5 flex size-7 flex-none items-center justify-center rounded-full bg-brand-blue/15 text-brand-blue">
      <Sparkles className="size-3.5" aria-hidden />
    </span>
  );
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
          className="min-h-9 rounded-full border border-ink-500 bg-ink-800 px-3 text-xs font-medium text-text-primary hover:border-brand-blue hover:text-brand-blue"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function ChatMessageView({ m, h }: { m: ChatMessage; h: MessageHandlers }) {
  // ── user text — right-aligned bubble ────────────────────────────────────
  if (m.role === "user" && m.kind === "text") {
    return (
      <div className="flex justify-end" data-testid="msg-user">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-blue/15 px-4 py-2.5 text-sm text-text-primary">
          {m.text}
        </div>
      </div>
    );
  }

  // ── user file bubble ─────────────────────────────────────────────────────
  if (m.role === "user" && m.kind === "file") {
    return (
      <div className="flex justify-end" data-testid="msg-file">
        <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-br-sm border border-ink-500 bg-ink-800 px-4 py-2.5 text-sm text-text-primary">
          <FileText className="size-4 flex-none text-text-muted" aria-hidden />
          <span className="truncate">{m.fileName}</span>
          {m.status === "read" && <Check className="size-4 flex-none text-state-success" aria-hidden />}
        </div>
      </div>
    );
  }

  // ── system result / error — subtle centered line ─────────────────────────
  if (m.role === "system" && m.kind === "result") {
    return (
      <div className="flex items-center gap-2 px-1 text-xs" data-testid="msg-result">
        <Check className={`size-3.5 flex-none ${m.ok ? "text-state-success" : "text-state-danger"}`} aria-hidden />
        <span className={m.ok ? "text-state-success" : "text-state-danger"}>{m.text}</span>
      </div>
    );
  }
  if (m.role === "system" && m.kind === "error") {
    return (
      <div className="rounded-lg border border-state-danger/30 bg-state-danger/5 px-3 py-2 text-xs text-state-danger" role="alert" data-testid="msg-error">
        {m.text}
      </div>
    );
  }

  // ── assistant text (with optional chips) ─────────────────────────────────
  if (m.role === "assistant" && m.kind === "text") {
    return (
      <div className="flex gap-2" data-testid="msg-assistant">
        <Avatar />
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-tl-sm bg-surface-1/70 px-4 py-2.5 text-sm leading-relaxed text-text-primary">
            {m.text}
          </div>
          {m.chips && m.chips.length > 0 && <Chips chips={m.chips} onChip={h.onChip} />}
        </div>
      </div>
    );
  }

  // ── assistant structured question ────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "question") {
    return (
      <div className="flex gap-2" data-testid="msg-question">
        <Avatar />
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-tl-sm bg-surface-1/70 px-4 py-2.5 text-sm text-text-primary">
            {m.text}
          </div>
          <Chips chips={m.chips} onChip={h.onChip} />
        </div>
      </div>
    );
  }

  // ── confirmation card in stream ──────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "confirmation") {
    return (
      <div className="flex gap-2" data-testid="msg-confirmation">
        <Avatar />
        <div className={`max-w-[92%] flex-1 rounded-2xl rounded-tl-sm border p-4 ${m.strong ? "border-state-warning/40 bg-state-warning/5" : "border-ink-500 bg-surface-1/70"}`}>
          <p className="text-sm font-semibold text-text-primary">{m.title}</p>
          {m.confirmedText ? (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-state-success">
              <Check className="size-3.5" aria-hidden /> {m.confirmedText}
            </p>
          ) : (
            <>
              {m.body && <p className="mt-1 text-xs leading-relaxed text-text-secondary">{m.body}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => h.onConfirm(m.id)} data-testid="msg-confirm-yes" className="min-h-10 rounded-md border border-brand-blue/50 bg-brand-blue/10 px-4 text-xs font-semibold text-brand-blue hover:bg-brand-blue/20">
                  {m.confirmLabel}
                </button>
                <button type="button" onClick={() => h.onCancel(m.id)} className="min-h-10 rounded-md border border-ink-500 px-4 text-xs font-medium text-text-secondary hover:bg-ink-700">
                  {m.cancelLabel}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── work-log preview card ────────────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "worklog") {
    const d = m.draft;
    return (
      <div className="flex gap-2" data-testid="msg-worklog">
        <Avatar />
        <div className="max-w-[92%] flex-1 rounded-2xl rounded-tl-sm border border-ink-500 bg-surface-1/70 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Clock className="size-4 text-brand-blue" aria-hidden /> {m.title}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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
                <span key={s} className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] text-text-secondary">{s}</span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => h.onConfirm(m.id)} data-testid="msg-worklog-save" className="min-h-10 rounded-md border border-brand-blue/50 bg-brand-blue/10 px-4 text-xs font-semibold text-brand-blue hover:bg-brand-blue/20">{m.confirmLabel}</button>
            <button type="button" onClick={() => h.onCancel(m.id)} className="min-h-10 rounded-md border border-ink-500 px-4 text-xs font-medium text-text-secondary hover:bg-ink-700">{m.cancelLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── employer match card ──────────────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "employer-match") {
    return (
      <div className="flex gap-2" data-testid="msg-employer-match">
        <Avatar />
        <div className="max-w-[92%] flex-1">
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
          <div className="rounded-2xl rounded-tl-sm bg-surface-1/70 px-4 py-2.5 text-sm text-text-primary">{m.intro}</div>
          <div className="mt-2 flex flex-col gap-2">
            {m.matches.map((e) => (
              <div key={e.id} className="rounded-xl border border-ink-500 bg-ink-800/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                    <Building2 className="size-4 text-brand-blue" aria-hidden /> {e.name}
                  </span>
                  <span
                    data-fit-status={e.fitStatus}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${FIT_BADGE[e.fitStatus] ?? FIT_BADGE.insufficient}`}
                  >
                    {e.fitLabel}
                  </span>
                </div>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {e.reasons.map((r, i) => (
                    // Neutral bullets: these are FACTS about the demand (the
                    // §19 basis, its location, its role) — a green tick would
                    // read as "you meet this", which the basis may deny.
                    <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                      <span className="mt-1.5 size-1 flex-none rounded-full bg-text-muted" aria-hidden /> {r}
                    </li>
                  ))}
                </ul>
                {/* The match must be ACTIONABLE, not a read-only card. This is
                    the SAME canonical control the opportunities board renders —
                    one interest state machine, one write path, one honest scope
                    note. Rendered only when the owner-gated interest table
                    exists (labels present); otherwise the card stays read-only
                    rather than showing a button that cannot work. */}
                {m.interestLabels && m.locale ? (
                  <div className="mt-2.5 border-t border-ink-600 pt-2.5">
                    <WorkerInterestButton
                      locale={m.locale}
                      requestId={e.id}
                      initialStatus={e.interestStatus}
                      labels={m.interestLabels}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
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
      <div className="flex gap-2" data-testid="msg-profile-summary">
        <Avatar />
        <div className="max-w-[92%] flex-1">
          <div className="rounded-2xl rounded-tl-sm border border-ink-500 bg-surface-1/70 p-4">
            <p className="text-sm leading-relaxed text-text-primary">{m.intro}</p>
            {m.done.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1" data-testid="profile-summary-done">
                {m.done.map((d) => (
                  <li key={d} className="flex items-start gap-1.5 text-xs text-text-secondary">
                    <Check className="mt-0.5 size-3.5 flex-none text-state-success" aria-hidden /> {d}
                  </li>
                ))}
              </ul>
            )}
            {m.missing.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1" data-testid="profile-summary-missing">
                {m.missing.map((d) => (
                  <li key={d} className="flex items-start gap-1.5 text-xs text-text-muted">
                    <CircleDashed className="mt-0.5 size-3.5 flex-none text-state-warning" aria-hidden /> {d}
                  </li>
                ))}
              </ul>
            )}
            {m.lastActivity && (
              <p className="mt-3 flex items-center gap-1.5 border-t border-ink-600 pt-2.5 text-[11px] text-text-muted" data-testid="profile-summary-last">
                <Clock className="size-3 flex-none" aria-hidden /> {m.lastActivity}
              </p>
            )}
          </div>
          {m.chips && m.chips.length > 0 && <Chips chips={m.chips} onChip={h.onChip} />}
        </div>
      </div>
    );
  }

  // ── translation preview card ─────────────────────────────────────────────
  if (m.role === "assistant" && m.kind === "translation") {
    return (
      <div className="flex gap-2" data-testid="msg-translation">
        <Avatar />
        <div className="max-w-[92%] flex-1 rounded-2xl rounded-tl-sm border border-ink-500 bg-surface-1/70 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Languages className="size-4 text-brand-blue" aria-hidden /> {m.recipient} · {m.channelLabel}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">{m.originalLabel}</p>
              <p className="text-sm text-text-primary">{m.original}</p>
            </div>
            <div className="rounded-md border border-ink-600 bg-ink-800/60 p-2">
              <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">{m.translatedLabel}</p>
              <p className="text-sm text-text-primary">{m.translated}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => h.onConfirm(m.id)} data-testid="msg-translation-send" className="min-h-10 rounded-md border border-brand-blue/50 bg-brand-blue/10 px-4 text-xs font-semibold text-brand-blue hover:bg-brand-blue/20">{m.confirmLabel}</button>
            <button type="button" onClick={() => h.onCancel(m.id)} className="min-h-10 rounded-md border border-ink-500 px-4 text-xs font-medium text-text-secondary hover:bg-ink-700">{m.cancelLabel}</button>
          </div>
        </div>
      </div>
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
    <div className="flex gap-2" data-testid="chat-typing">
      <Avatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-surface-1/70 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-pulse rounded-full bg-text-muted" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}
