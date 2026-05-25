"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  createConversation,
  sendMessage,
} from "@/lib/communication/actions";
import { recordEvent } from "@/lib/telemetry/task";

/**
 * v2 support-conversation launcher. Lets a tester open a new thread
 * with `kind='support'` + a first message body. The admin sees the
 * thread in `/dashboard/admin/support` and joins it from there.
 *
 * Honest semantics (carry-over from v1):
 *   - Not real-time. Refresh-based.
 *   - No file upload.
 *   - No external email / SMS / Telegram — the conversation lives
 *     entirely inside Supabase.
 *   - No fake "delivered" / "read" claims.
 */
export function SupportConversationLauncher({
  locale,
}: {
  locale: string;
}) {
  const t = useTranslations("communication.launcher");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setSubject("");
    setBody("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (trimmedSubject.length === 0) {
      setError(t("error.subjectRequired"));
      return;
    }
    if (trimmedBody.length === 0) {
      setError(t("error.bodyRequired"));
      return;
    }
    startTransition(async () => {
      recordEvent("conversation_started", { result_kind: "support" });
      const createRes = await createConversation({
        subject: trimmedSubject,
        kind: "support",
        locale,
      });
      if (!createRes.ok) {
        setError(createRes.message);
        recordEvent("conversation_started_error", {
          result_kind: createRes.code,
        });
        return;
      }
      const sendRes = await sendMessage({
        conversationId: createRes.data.id,
        body: trimmedBody,
        locale,
      });
      if (!sendRes.ok) {
        // The conversation exists but the first message failed —
        // route the user to it so they can retry from the composer.
        setError(sendRes.message);
        router.push(
          `/${locale}/dashboard/communication/${createRes.data.id}`,
        );
        return;
      }
      reset();
      setOpen(false);
      router.push(`/${locale}/dashboard/communication/${createRes.data.id}`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          recordEvent("conversation_launcher_opened");
          setOpen(true);
        }}
        className="rounded-md border border-brand-blue/40 px-4 py-2 text-sm font-semibold text-brand-blue hover:border-brand-blue hover:text-text-primary"
        data-testid="support-launcher-open"
      >
        {t("openLabel")}
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card-border flex flex-col gap-3 p-4"
      data-testid="support-launcher-form"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h3>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-text-primary"
        >
          {t("cancel")}
        </button>
      </header>
      <p className="text-[11px] leading-relaxed text-text-secondary">
        {t("intro")}
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("subjectLabel")}
        </span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={240}
          required
          placeholder={t("subjectPlaceholder")}
          className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("bodyLabel")}
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={10000}
          required
          placeholder={t("bodyPlaceholder")}
          className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-state-danger"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="submit"
          disabled={pending || subject.trim().length === 0 || body.trim().length === 0}
        >
          {pending ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}
