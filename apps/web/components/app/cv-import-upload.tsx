"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Upload } from "lucide-react";
import {
  extractCvFile,
  type CvExtractClientResult,
} from "@/lib/cv/cv-import-client";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * CV file import — REAL upload + text-extraction primitive.
 *
 * The user picks a PDF / DOCX / TXT CV; the file is sent to the auth-gated
 * `/api/cv/extract` route, which returns the raw text (no storage, no logging).
 * The extracted text is handed up via `onExtracted` so the caller can run the
 * existing deterministic skill recognition, let the user review, and save into
 * their own profile. This component stores nothing and never claims a file was
 * saved — success here means "text extracted", and imported skills remain
 * self-declared (never auto-confirmed) until real evidence exists.
 *
 * Honest failures: wrong format / too large / empty / failed each show a
 * specific message — never a fake success, never a silent drop.
 */
export function CvImportUpload({
  onExtracted,
  disabled,
}: {
  /** Called with the extracted raw CV text once a file is read successfully. */
  onExtracted: (text: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("structuring.cv");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);

  function messageFor(code: Extract<CvExtractClientResult, { ok: false }>["code"]): string {
    switch (code) {
      case "unsupported":
        return t("uploadErrorType");
      case "too-large":
        return t("uploadErrorSize");
      case "empty":
        return t("uploadErrorEmpty");
      case "unauthorized":
        return t("uploadErrorAuth");
      case "network":
      case "failed":
      default:
        return t("uploadErrorFailed");
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setPickedName(file.name);
    setBusy(true);
    // Funnel: a real CV import attempt began. Bounded surface label only —
    // NEVER the filename or any file content (Worker Launch Readiness v1).
    trackFunnel(FUNNEL_EVENTS.cvUploadStarted, { surface: "cv_import" });
    try {
      const result = await extractCvFile(file);
      if (result.ok) {
        trackFunnel(FUNNEL_EVENTS.cvUploadSucceeded, {
          surface: "cv_import",
          success: true,
        });
        onExtracted(result.text);
      } else {
        setError(messageFor(result.code));
      }
    } finally {
      setBusy(false);
      // Allow re-picking the same file (onChange won't fire otherwise).
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="cv-import-upload">
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-500 bg-ink-700 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue">
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-3.5 w-3.5" aria-hidden />
        )}
        {busy ? t("uploadExtracting") : t("uploadPick")}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          disabled={disabled || busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
          className="sr-only"
        />
      </label>

      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("uploadFormats")}
      </span>

      {pickedName && !error && (
        <span
          className="text-[11px] text-text-muted"
          data-testid="cv-import-picked"
          role="status"
        >
          {t("uploadPicked", { file: pickedName })}
        </span>
      )}

      {error && (
        <span
          className="text-[11px] text-state-danger"
          role="alert"
          data-testid="cv-import-error"
        >
          {error}
        </span>
      )}
    </div>
  );
}
