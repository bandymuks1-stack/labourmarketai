"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";

import { sendMessage } from "@/lib/communication/actions";

/**
 * QUICK REPLY (owner audit §8.1) — answer from the inbox without opening the
 * thread. It is NOT a second messaging implementation: it calls the ONE
 * canonical `sendMessage` server action the thread view calls, with the same
 * validation, the same RLS and the same rate caps.
 *
 * Honest states only: the button is disabled while empty or in flight, a
 * failure shows the action's own message, and a success collapses the box and
 * says the message was sent. Nothing is claimed before the server confirms.
 */
export function ConversationQuickReply({
  conversationId,
  locale,
}: {
  conversationId: string;
  locale: string;
}) {
  const t = useTranslations("communication.quickReply");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p
        className="text-meta text-state-success"
        data-testid={`quick-reply-sent-${conversationId}`}
      >
        {t("sent")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`quick-reply-open-${conversationId}`}
        className="w-fit rounded-full border border-ink-500 px-3 py-1 text-meta font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue"
      >
        {t("open")}
      </button>
    );
  }

  const submit = () => {
    const body = value.trim();
    if (body.length === 0 || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendMessage({ conversationId, body, locale });
      if (res.ok) {
        setValue("");
        setSent(true);
      } else {
        setError(res.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          rows={2}
          autoFocus
          placeholder={t("placeholder")}
          aria-label={t("open")}
          data-testid={`quick-reply-input-${conversationId}`}
          className="w-full resize-none rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || value.trim().length === 0}
          aria-label={t("send")}
          data-testid={`quick-reply-send-${conversationId}`}
          className="flex size-11 flex-none items-center justify-center rounded-full bg-brand-blue text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      {error ? (
        <p
          className="text-meta text-state-danger"
          data-testid={`quick-reply-error-${conversationId}`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
