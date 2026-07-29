"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Paperclip, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { sendMessage } from "@/lib/communication/actions";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  CONVERSATION_ATTACHMENT_ALLOWED_MIME,
  CONVERSATION_ATTACHMENT_BUCKET,
  CONVERSATION_ATTACHMENT_MAX_BYTES,
  CONVERSATION_ATTACHMENTS_PER_MESSAGE_MAX,
  canSendMessage,
  conversationAttachmentPath,
  isAllowedConversationAttachmentMime,
  isImageAttachmentMime,
} from "@/lib/communication/attachment-model";
import {
  compressImageFile,
  isCompressibleImage,
} from "@/lib/browser/image-compress";
import { recordEvent } from "@/lib/telemetry/task";

/**
 * Communication composer (v2 — real photo/file attachments, user-journey
 * repair v1).
 *
 * Honest semantics:
 *   - No "delivered" / "read" / typing-indicator fakery. The form posts the
 *     message and revalidates the page.
 *   - Attachments are a COMPLETE flow: pick (camera/photo picker on mobile
 *     via accept + image/*), client-side validate, compress images, upload
 *     to the PRIVATE participant-scoped bucket, preview, remove, retry —
 *     then send registers the metadata server-side. Never a decorative
 *     button: every state (uploading / uploaded / failed) is visible and
 *     recoverable.
 *   - A failed upload or send NEVER clears the typed text.
 *   - Errors render the precise server-side message (e.g. RLS denial =
 *     "you don't have access to this conversation"), not a generic blob.
 */

type TrayAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  status: "uploading" | "uploaded" | "failed";
  /** Object URL for image previews (revoked on remove/unmount). */
  previewUrl: string | null;
  /** Kept for retry after a failed upload. */
  file: File;
  errorText: string | null;
};

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
  const [notice, setNotice] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<TrayAttachment[]>([]);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<TrayAttachment[]>([]);
  attachmentsRef.current = attachments;

  // Revoke preview object URLs on unmount only (previews stay valid for the
  // whole composer session; individual removes revoke their own URL).
  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
    };
  }, []);

  const uploadedCount = attachments.filter((a) => a.status === "uploaded").length;
  const uploadingCount = attachments.filter((a) => a.status === "uploading").length;
  const failedCount = attachments.filter((a) => a.status === "failed").length;
  const sendable = canSendMessage({
    bodyLength: body.trim().length,
    uploadedCount,
    uploadingCount,
    failedCount,
  });

  function updateAttachment(id: string, patch: Partial<TrayAttachment>) {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function uploadOne(att: TrayAttachment) {
    const supabase = createBrowserSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from(CONVERSATION_ATTACHMENT_BUCKET)
      .upload(att.storagePath, att.file, {
        cacheControl: "3600",
        contentType: att.mimeType,
        upsert: true, // retry over a half-written object is safe (same path)
      });
    if (uploadError) {
      const msg = uploadError.message ?? "";
      updateAttachment(att.id, {
        status: "failed",
        errorText:
          /bucket/i.test(msg) && /not found/i.test(msg)
            ? t("composer.attachments.errorNeedsSetup")
            : t("composer.attachments.errorUpload"),
      });
      recordEvent("communication_attachment_upload_failed");
      return;
    }
    updateAttachment(att.id, { status: "uploaded", errorText: null });
    recordEvent("communication_attachment_uploaded");
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setNotice(null);
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    const room = CONVERSATION_ATTACHMENTS_PER_MESSAGE_MAX - attachments.length;
    if (picked.length > room) {
      setError(t("composer.attachments.errorTooMany"));
      if (room <= 0) return;
    }

    const supabase = createBrowserSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const uploaderId = userData?.user?.id;
    if (!uploaderId) {
      setError(t("composer.attachments.errorUpload"));
      return;
    }

    for (const raw of picked.slice(0, Math.max(0, room))) {
      // Compress ordinary phone photos client-side (also normalizes exotic
      // camera formats toward the allowlist); non-images pass through.
      let file = raw;
      try {
        if (isCompressibleImage(raw)) file = (await compressImageFile(raw)).file;
      } catch {
        // Compression is an optimization — fall back to the original file.
      }
      if (!isAllowedConversationAttachmentMime(file.type)) {
        setError(t("composer.attachments.errorBadType"));
        continue;
      }
      if (file.size <= 0 || file.size > CONVERSATION_ATTACHMENT_MAX_BYTES) {
        setError(t("composer.attachments.errorTooLarge"));
        continue;
      }
      const attachmentId = crypto.randomUUID();
      const att: TrayAttachment = {
        id: attachmentId,
        fileName: raw.name || "file",
        mimeType: file.type,
        sizeBytes: file.size,
        storagePath: conversationAttachmentPath({
          conversationId,
          uploaderId,
          attachmentId,
          fileName: raw.name || "file",
        }),
        status: "uploading",
        previewUrl: isImageAttachmentMime(file.type) ? URL.createObjectURL(file) : null,
        file,
        errorText: null,
      };
      setAttachments((prev) => [...prev, att]);
      void uploadOne(att);
    }
  }

  async function onRemove(att: TrayAttachment) {
    setError(null);
    if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    if (att.status === "uploaded") {
      // Best-effort blob cleanup (uploader-only storage DELETE policy) —
      // avoids orphan uploads when the user changes their mind pre-send.
      const supabase = createBrowserSupabaseClient();
      await supabase.storage
        .from(CONVERSATION_ATTACHMENT_BUCKET)
        .remove([att.storagePath]);
    }
  }

  function onRetry(att: TrayAttachment) {
    setError(null);
    updateAttachment(att.id, { status: "uploading", errorText: null });
    void uploadOne(att);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const trimmed = body.trim();
    if (uploadingCount > 0) {
      setError(t("composer.attachments.blockedWhileUploading"));
      return;
    }
    if (failedCount > 0) {
      setError(t("composer.attachments.blockedFailed"));
      return;
    }
    if (trimmed.length === 0 && uploadedCount === 0) {
      setError(t("composer.emptyError"));
      return;
    }
    const uploaded = attachments.filter((a) => a.status === "uploaded");
    startTransition(async () => {
      recordEvent("communication_message_send_clicked");
      const result = await sendMessage({
        conversationId,
        body: trimmed,
        locale,
        attachments: uploaded.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          storagePath: a.storagePath,
        })),
      });
      if (!result.ok) {
        // The typed text AND the uploaded tray stay intact — the user can
        // retry the send without redoing anything.
        setError(result.message);
        recordEvent("communication_message_send_error", {
          result_kind: result.code,
        });
        return;
      }
      recordEvent("communication_message_sent");
      if (result.data.attachmentsFailed > 0) {
        // Message went out but some attachments did not register — say so
        // honestly instead of pretending everything attached.
        setNotice(t("composer.attachments.partialFailure"));
      }
      for (const a of attachments) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      setAttachments([]);
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
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("composer.label")}
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={10000}
          placeholder={t("composer.placeholder")}
          className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
          data-testid="communication-composer-input"
        />
      </label>

      {/* Attachment tray — previews BEFORE sending, each with remove/retry. */}
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="communication-attachment-tray">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex max-w-full items-center gap-2 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5"
              data-testid={`communication-attachment-${a.status}`}
            >
              {a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.previewUrl}
                  alt={a.fileName}
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <Paperclip className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="max-w-[10rem] truncate text-xs text-text-primary">
                  {a.fileName}
                </span>
                <span className="text-meta text-text-muted">
                  {a.status === "uploading"
                    ? t("composer.attachments.uploading")
                    : a.status === "failed"
                      ? (a.errorText ?? t("composer.attachments.errorUpload"))
                      : `${Math.max(1, Math.round(a.sizeBytes / 1024))} KB`}
                </span>
              </span>
              {a.status === "failed" && (
                <button
                  type="button"
                  onClick={() => onRetry(a)}
                  aria-label={t("composer.attachments.retry")}
                  className="rounded p-1.5 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid={`communication-attachment-retry-${a.id}`}
                >
                  <RotateCw className="h-4 w-4" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(a)}
                aria-label={t("composer.attachments.remove")}
                className="rounded p-1.5 text-text-secondary hover:text-state-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid={`communication-attachment-remove-${a.id}`}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* WAGON 5 honesty helper: users may write in their own language; the
          counterpart sees the ORIGINAL text — there is no automatic
          translation, and this line says so instead of hiding it. */}
      <p
        className="text-meta leading-relaxed text-text-muted"
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
      {notice && (
        <p
          role="status"
          className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs text-state-warning"
          data-testid="communication-composer-notice"
        >
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Real file input: images (incl. mobile camera/photo picker via
              image/*) + PDF/TXT. Hidden input, visible labelled button. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={`${CONVERSATION_ATTACHMENT_ALLOWED_MIME.join(",")},image/*`}
            className="hidden"
            onChange={onPick}
            data-testid="communication-attachment-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending || attachments.length >= CONVERSATION_ATTACHMENTS_PER_MESSAGE_MAX}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink-500 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
            data-testid="communication-attachment-add"
          >
            <Paperclip className="h-4 w-4" aria-hidden />
            {t("composer.attachments.addButton")}
          </button>
          <span className="font-mono text-meta text-text-muted">
            {t("composer.charCount", { n: body.length, max: 10000 })}
          </span>
        </div>
        <Button type="submit" disabled={pending || !sendable}>
          {pending ? t("composer.sending") : t("composer.send")}
        </Button>
      </div>
      <p className="text-meta leading-relaxed text-text-muted">
        {t("composer.attachments.help")}
      </p>
    </form>
  );
}
