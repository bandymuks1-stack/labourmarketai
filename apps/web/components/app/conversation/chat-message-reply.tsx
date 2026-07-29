"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

import { sendMessage } from "@/lib/communication/actions";
import type { ChatInboxThread } from "@/lib/conversation/messages-chat";

/**
 * REPLY TO A HUMAN MESSAGE FROM THE CHAT, SENT ONLY AFTER CONFIRMATION
 * (owner audit §8.1).
 *
 * The chat drafts; the person confirms; the ONE canonical `sendMessage`
 * action does the write. Two deliberate properties:
 *
 *  - the draft is the PERSON'S text, never a generated one — this platform
 *    does not put words in someone's mouth and then send them (§7);
 *  - nothing leaves until the explicit confirm step, and the confirm step
 *    shows the exact text that will be sent.
 *
 * The thread itself stays one tap away, so the full history is never hidden
 * behind this shortcut.
 */
export function ChatMessageReply({
  threads,
  locale,
}: {
  threads: readonly ChatInboxThread[];
  locale: string;
}) {
  const t = useTranslations("conversation.messages");
  return (
    <div className="flex max-w-2xl flex-col gap-3" data-testid="chat-message-reply">
      {threads.map((thread) => (
        <ThreadReply key={thread.conversationId} thread={thread} locale={locale} t={t} />
      ))}
    </div>
  );
}

function ThreadReply({
  thread,
  locale,
  t,
}: {
  thread: ChatInboxThread;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () => {
    const body = draft.trim();
    if (body.length === 0 || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendMessage({
        conversationId: thread.conversationId,
        body,
        locale,
      });
      if (res.ok) {
        setSent(true);
        setConfirming(false);
      } else {
        setError(res.message);
        setConfirming(false);
      }
    });
  };

  return (
    <div className="rounded-card border border-ink-500 bg-ink-800/40 p-3">
      <p className="font-mono text-meta uppercase tracking-label text-state-amber">
        {thread.overdue ? t("overdue") : t("awaiting")}
        {thread.waitingHours !== null
          ? ` · ${t("waiting", { hours: thread.waitingHours })}`
          : ""}
      </p>
      <p className="mt-1 text-basis text-text-primary">
        <span className="text-text-muted">
          {(thread.counterpart ?? t("someone")) + ": "}
        </span>
        {thread.preview.length > 0 ? thread.preview : t("attachmentOnly")}
      </p>

      {sent ? (
        <p
          className="mt-2 text-support text-state-success"
          data-testid={`chat-reply-sent-${thread.conversationId}`}
        >
          {t("sent")}
        </p>
      ) : confirming ? (
        // The confirm step shows the EXACT text that will be sent.
        <div className="mt-2 rounded-md border border-state-amber/40 bg-state-amber/5 p-2.5">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("confirmTitle")}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-basis text-text-primary">
            {draft.trim()}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={send}
              disabled={pending}
              data-testid={`chat-reply-confirm-${thread.conversationId}`}
              className="min-h-11 rounded-full bg-brand-blue px-4 text-support font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? t("sending") : t("confirmSend")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="min-h-11 rounded-full border border-ink-500 px-4 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              {t("editAgain")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={t("draftPlaceholder")}
            aria-label={t("draftPlaceholder")}
            data-testid={`chat-reply-input-${thread.conversationId}`}
            className="w-full resize-none rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={draft.trim().length === 0}
              data-testid={`chat-reply-review-${thread.conversationId}`}
              className="min-h-11 rounded-full border border-ink-500 px-4 text-support font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("review")}
            </button>
            <Link
              href={`/dashboard/communication/${thread.conversationId}` as "/dashboard"}
              className="min-h-11 inline-flex items-center text-support font-medium text-brand-blue hover:underline"
              data-testid={`chat-reply-open-${thread.conversationId}`}
            >
              {t("openThread")}
            </Link>
          </div>
        </div>
      )}

      {error ? (
        <p
          className="mt-2 text-support text-state-danger"
          data-testid={`chat-reply-error-${thread.conversationId}`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
