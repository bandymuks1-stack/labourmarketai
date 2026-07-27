"use client";

import { useState } from "react";
import type { TranscriptMessage } from "@/lib/assistant/transcript";

export type HistoryLabels = {
  title: string;
  /** e.g. "{count} žinučių" already resolved by the caller. */
  countLabel: string;
  show: string;
  showMore: string;
  speakerAssistant: string;
  speakerYou: string;
};

const PAGE = 10;

/**
 * Collapsed earlier-conversation block (ChatGPT-style history model, phase 1).
 *
 * The restored transcript tail is NOT dumped into the stream — the active
 * conversation stays on top of a single collapsed row. Expanding reveals the
 * most recent messages first and pages backwards in chunks, so a long history
 * loads in parts. Self-contained: expansion never mutates the live thread.
 */
export function HistoryBlock({
  messages,
  labels,
}: {
  messages: TranscriptMessage[];
  labels: HistoryLabels;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);

  if (messages.length === 0) return null;
  const visible = open ? messages.slice(Math.max(0, messages.length - shown)) : [];
  const hasMore = open && shown < messages.length;

  return (
    <section
      data-testid="chat-history-block"
      className="rounded-xl border border-ink-600 bg-surface-1 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-support text-text-secondary">{labels.title}</div>
          <div className="text-meta text-text-muted">{labels.countLabel}</div>
        </div>
        {!open && (
          <button
            type="button"
            className="shrink-0 rounded-lg border border-ink-600 px-3 py-1.5 text-support text-text-primary hover:bg-ink-700"
            onClick={() => setOpen(true)}
          >
            {labels.show}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-ink-600 pt-3">
          {hasMore && (
            <button
              type="button"
              className="w-full rounded-lg border border-ink-600 px-3 py-1.5 text-support text-text-secondary hover:bg-ink-700"
              onClick={() => setShown((n) => n + PAGE)}
            >
              {labels.showMore}
            </button>
          )}
          {visible.map((m) => (
            <div key={m.seq} className="text-body">
              <span className="text-text-muted">
                {m.role === "user" ? labels.speakerYou : labels.speakerAssistant}:
              </span>{" "}
              <span className="whitespace-pre-line text-text-secondary">{m.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
