"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { sendMessage } from "@/lib/communication/actions";
import { recordEvent } from "@/lib/telemetry/task";

/**
 * Communication v1 composer. Plain textarea + send button.
 *
 * Honest semantics:
 *   - No "delivered" / "read" / typing-indicator fakery. The form just
 *     posts the message and revalidates the page.
 *   - No file upload in v1.
 *   - Errors render the precise server-side message (e.g. RLS denial =
 *     "you don't have access to this conversation"), not a generic blob.
 */
export function CommunicationComposer({
  conversationId,
  locale,
}: {
  conversationId: string;
  locale: string;
}) {
  const t = useTranslations("communication");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError(t("composer.emptyError"));
      return;
    }
    startTransition(async () => {
      recordEvent("communication_message_send_clicked");
      const result = await sendMessage({
        conversationId,
        body: trimmed,
        locale,
      });
      if (!result.ok) {
        setError(result.message);
        recordEvent("communication_message_send_error", {
          result_kind: result.code,
        });
        return;
      }
      recordEvent("communication_message_sent");
      setBody("");
      // The server action revalidates the path; router.refresh re-fetches
      // the server component so the new message appears without a hard
      // reload.
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card-border flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("composer.label")}
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={10000}
          required
          placeholder={t("composer.placeholder")}
          className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
          data-testid="communication-composer-input"
        />
      </label>
      {/* WAGON 5 honesty helper: users may write in their own language; the
          counterpart sees the ORIGINAL text — there is no automatic
          translation, and this line says so instead of hiding it. */}
      <p
        className="text-[11px] leading-relaxed text-text-muted"
        data-testid="communication-language-hint"
      >
        {t("composer.languageHint")}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-state-danger"
          data-testid="communication-composer-error"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] text-text-muted">
          {t("composer.charCount", { n: body.length, max: 10000 })}
        </span>
        <Button type="submit" disabled={pending || body.trim().length === 0}>
          {pending ? t("composer.sending") : t("composer.send")}
        </Button>
      </div>
    </form>
  );
}
