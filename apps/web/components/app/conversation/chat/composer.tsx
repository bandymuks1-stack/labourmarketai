"use client";

import { useState } from "react";
import { Paperclip, ArrowUp } from "lucide-react";

/**
 * Chat composer — the persistent bottom input of the conversation. Text box +
 * file attach + send. Sticky to the viewport bottom; the keyboard never covers
 * it (the layout keeps it in flow at the bottom of a flex column).
 */
export function Composer({
  placeholder,
  attachLabel,
  sendLabel,
  disabled = false,
  onSend,
  onAttach,
}: {
  placeholder: string;
  attachLabel: string;
  sendLabel: string;
  disabled?: boolean;
  onSend: (text: string) => void;
  /** Opens the canonical CV flow (the real uploader lives there, not here — one
   *  canonical CV file-pick surface). */
  onAttach?: () => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue("");
  }

  return (
    <div className="border-t border-ink-600 bg-ink-900/80 px-3 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        {onAttach && (
          <button
            type="button"
            onClick={() => onAttach()}
            aria-label={attachLabel}
            data-testid="composer-attach"
            className="flex size-11 flex-none items-center justify-center rounded-full border border-ink-500 text-text-secondary hover:border-brand-blue hover:text-brand-blue"
          >
            <Paperclip className="size-4" aria-hidden />
          </button>
        )}
        <textarea
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          data-testid="composer-input"
          className="max-h-40 min-h-[44px] w-full resize-none rounded-2xl border border-ink-500 bg-ink-800 px-4 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label={sendLabel}
          data-testid="composer-send"
          className="flex size-11 flex-none items-center justify-center rounded-full bg-brand-blue text-white transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
