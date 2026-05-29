"use client";

import { useState } from "react";

import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  recordCustomerRequestAttachmentAction,
  removeCustomerRequestAttachmentAction,
} from "@/lib/buyer/request-attachment-actions";
import {
  computeExtractionReadiness,
  type ExtractionReadiness,
} from "@/lib/buyer/attachment-readiness";

/**
 * Buyer request attachment uploader (Stage 2 attachments PR 1).
 *
 * Pure metadata-only Level 1 flow (sprint §4.D.1):
 *   1. Validate file size + MIME client-side.
 *   2. Mint a UUID for the attachment.
 *   3. Upload to the private 'customer-request-attachments' bucket
 *      at path '<profile_id>/<request_id>/<attachment_id>/<safeName>'.
 *   4. Call the server action which calls register_customer_request_
 *      attachment RPC to insert the metadata row.
 *   5. revalidatePath → list re-renders.
 *
 * Honest fallback wording: when analysis_status='not_started' (the
 * default), the row prints the literal sprint-mandated phrase:
 *   "Failas pridėtas. Automatinis nuskaitymas dar neįjungtas —
 *    administratorius peržiūrės rankiniu būdu."
 *
 * Forbidden phrasing (sprint §4.D, §10):
 *   - "AI suprato"
 *   - "automatiškai patikrinta"
 *   - "garantuotai tinkamiausias"
 *   - "patvirtinta"
 *   - "verified"
 * None of these strings appear in this file.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
] as const;

type Allowed = (typeof ALLOWED)[number];

function isAllowed(mime: string): mime is Allowed {
  return (ALLOWED as readonly string[]).includes(mime);
}

function safeFileName(name: string): string {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (trimmed.length === 0) return "file";
  return trimmed.slice(0, 200);
}

export interface BuyerRequestAttachmentUploaderLabels {
  readonly addButton: string;
  readonly uploadingLabel: string;
  readonly successLabel: string;
  readonly errorTooLarge: string;
  readonly errorBadType: string;
  readonly errorNeedsMigration: string;
  readonly errorGeneric: string;
  readonly removeLabel: string;
  readonly removingLabel: string;
  readonly sizeHelp: string;
  readonly allowedHelp: string;
}

export interface AttachmentListItem {
  readonly id: string;
  readonly requestId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly analysisStatus: string;
  readonly createdAt: string;
}

interface UploaderProps {
  readonly requestId: string;
  readonly attachments: readonly AttachmentListItem[];
  readonly analysisFallbackLine: string;
  readonly labels: BuyerRequestAttachmentUploaderLabels;
  /**
   * Per-MIME extraction-readiness copy (PR C). Deterministic foundation
   * only — explains what future reader a file type would need; never
   * claims extraction has run.
   */
  readonly extractionReadinessLabels: Record<ExtractionReadiness, string>;
}

export function BuyerRequestAttachmentUploader({
  requestId,
  attachments,
  analysisFallbackLine,
  labels,
  extractionReadinessLabels,
}: UploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorText(null);
    setSuccessText(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size <= 0 || file.size > MAX_BYTES) {
      setErrorText(labels.errorTooLarge);
      return;
    }
    if (!isAllowed(file.type)) {
      setErrorText(labels.errorBadType);
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        setErrorText(labels.errorGeneric);
        return;
      }
      const profileId = userData.user.id;
      const attachmentId = crypto.randomUUID();
      const path = `${profileId}/${requestId}/${attachmentId}/${safeFileName(
        file.name,
      )}`;

      const { error: uploadError } = await supabase.storage
        .from("customer-request-attachments")
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) {
        const msg = uploadError.message ?? "";
        if (/bucket/i.test(msg) && /not found/i.test(msg)) {
          setErrorText(labels.errorNeedsMigration);
        } else {
          setErrorText(labels.errorGeneric);
        }
        return;
      }

      const res = await recordCustomerRequestAttachmentAction({
        attachmentId,
        requestId,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        storagePath: path,
      });
      if (!res.ok) {
        if (res.code === "needs_migration") {
          setErrorText(labels.errorNeedsMigration);
        } else {
          setErrorText(res.message ?? labels.errorGeneric);
        }
        return;
      }
      setSuccessText(labels.successLabel);
    } catch {
      setErrorText(labels.errorGeneric);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove(id: string) {
    setErrorText(null);
    setSuccessText(null);
    setRemovingId(id);
    try {
      const res = await removeCustomerRequestAttachmentAction(id);
      if (!res.ok) {
        setErrorText(labels.errorGeneric);
      }
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`buyer-request-attachment-uploader-${requestId}`}
    >
      <ul className="flex flex-col gap-1" data-testid="buyer-request-attachment-list">
        {attachments.map((a) => (
          <li
            key={a.id}
            className="rounded-md border border-ink-700 px-2 py-1 text-xs"
            data-testid={`buyer-request-attachment-${a.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-primary">{a.fileName}</span>
              <span className="font-mono text-[10px] text-text-muted">
                {Math.round(a.fileSizeBytes / 1024)} KB
              </span>
            </div>
            <p className="text-[11px] text-text-muted">{a.mimeType}</p>
            {a.analysisStatus === "not_started" ? (
              <p
                className="text-[11px] text-state-warning"
                data-testid="buyer-request-attachment-analysis-fallback"
              >
                {analysisFallbackLine}
              </p>
            ) : null}
            <p
              className="text-[11px] text-text-muted"
              data-testid="buyer-request-attachment-readiness"
            >
              {extractionReadinessLabels[computeExtractionReadiness(a.mimeType)]}
            </p>
            <button
              type="button"
              onClick={() => handleRemove(a.id)}
              disabled={removingId === a.id}
              className="mt-1 text-[11px] text-brand-blue hover:underline disabled:opacity-50"
              data-testid={`buyer-request-attachment-remove-${a.id}`}
            >
              {removingId === a.id ? labels.removingLabel : labels.removeLabel}
            </button>
          </li>
        ))}
      </ul>

      <label
        className="inline-flex cursor-pointer items-center gap-2 self-start rounded-md border border-border-default bg-surface-1 px-3 py-1.5 text-xs text-text-primary hover:border-brand-blue"
        data-testid={`buyer-request-attachment-add-${requestId}`}
      >
        <input
          type="file"
          accept={ALLOWED.join(",")}
          className="hidden"
          onChange={handleChange}
          disabled={isUploading}
        />
        {isUploading ? labels.uploadingLabel : labels.addButton}
      </label>

      <p className="text-[11px] text-text-muted">{labels.sizeHelp}</p>
      <p className="text-[11px] text-text-muted">{labels.allowedHelp}</p>

      {errorText ? (
        <p
          className="rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-[11px] text-state-warning"
          role="status"
          data-testid="buyer-request-attachment-error"
        >
          {errorText}
        </p>
      ) : null}
      {successText ? (
        <p
          className="rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-[11px] text-state-success"
          role="status"
          data-testid="buyer-request-attachment-success"
        >
          {successText}
        </p>
      ) : null}
    </div>
  );
}
