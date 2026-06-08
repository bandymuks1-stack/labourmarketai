"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * CV input panel (text-first onboarding). The worker can either UPLOAD a file
 * (PDF / DOCX — passed up as ArrayBuffer for the caller to handle) or paste
 * the CV text. The pasted text is fed to the rule-based parser; the upload
 * path defers to the caller (M2 will text-extract server-side per PLATFORM
 * doctrine §7.2 / DOCTRINE.md). We do not store the file from this component.
 */
export function CvInputPanel({
  className,
  onPasteSubmit,
  onFile,
  pasting,
}: {
  className?: string;
  onPasteSubmit: (text: string) => void;
  onFile?: (file: File) => void;
  pasting?: boolean;
}) {
  const t = useTranslations("structuring.cv");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const canSubmit = pasted.trim().length > 0 && !pasting;

  return (
    <section
      className={cn(
        "card-border flex flex-col gap-3 p-5 sm:p-6",
        className,
      )}
      aria-labelledby={`${id}-title`}
    >
      <h2
        id={`${id}-title`}
        className="font-display text-lg font-semibold text-text-primary"
      >
        {t("title")}
      </h2>
      <p className="text-xs leading-relaxed text-text-secondary">
        {t("helper")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/50 p-3">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("uploadLabel")}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && onFile) onFile(f);
            }}
            className="text-xs text-text-secondary file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-ink-500 file:bg-ink-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-text-primary hover:file:border-brand-blue"
          />
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("uploadComingSoon")}
          </span>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/50 p-3">
          <label
            htmlFor={`${id}-paste`}
            className="font-mono text-[10px] uppercase tracking-label text-text-muted"
          >
            {t("pasteLabel")}
          </label>
          <textarea
            id={`${id}-paste`}
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t("pastePlaceholder")}
            className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => onPasteSubmit(pasted)}
            disabled={!canSubmit}
          >
            {t("pasteSubmit")}
          </Button>
        </div>
      </div>

      {/* Evidence library framing — what each kind of evidence helps show, so a
          document is collected for a benefit, not as file admin. Benefit-first,
          honest: file upload is being prepared (see uploadComingSoon above). */}
      <div
        className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-3"
        data-testid="cv-evidence-types"
      >
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("evidenceTitle")}
        </span>
        <ul className="flex flex-col gap-0.5 text-xs leading-relaxed text-text-secondary">
          <li>{t("evidenceCv")}</li>
          <li>{t("evidenceCerts")}</li>
          <li>{t("evidencePhotos")}</li>
          <li>{t("evidenceRecs")}</li>
          <li>{t("evidenceLegal")}</li>
        </ul>
      </div>
      <p
        className="text-[11px] leading-relaxed text-text-muted"
        data-testid="cv-privacy-note"
      >
        {t("privacyNote")}
      </p>
    </section>
  );
}
