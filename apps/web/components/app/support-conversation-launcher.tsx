"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { Textarea } from "@/components/ui/Textarea";
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
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          recordEvent("conversation_launcher_opened");
          setOpen(true);
        }}
        data-testid="support-launcher-open"
      >
        {t("openLabel")}
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card-border flex w-full flex-col gap-3 self-stretch p-4 text-left"
      data-testid="support-launcher-form"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          {t("cancel")}
        </Button>
      </header>
      <p className="text-meta leading-relaxed text-text-secondary">
        {t("intro")}
      </p>
      <Field label={t("subjectLabel")}>
        {(control) => (
          <Input
            {...control}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={240}
            required
            placeholder={t("subjectPlaceholder")}
          />
        )}
      </Field>
      <Field label={t("bodyLabel")}>
        {(control) => (
          <Textarea
            {...control}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={10000}
            required
            placeholder={t("bodyPlaceholder")}
          />
        )}
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
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
