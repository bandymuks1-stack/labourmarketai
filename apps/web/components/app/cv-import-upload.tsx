"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * CV import — M1 SCAFFOLD ONLY. Shows the upload affordance but performs no
 * extraction and stores NOTHING (no DB writes, no upload). Per
 * PLATFORM_DOCTRINE §2.3/§3, persisting imported CV text is user-authored
 * content requiring original_text/original_language + append-only/audit — that
 * lands in M2 (see lib/cv/*). Here we only confirm the file was chosen and make
 * clear it isn't saved yet.
 */
export function CvImportUpload() {
  const t = useTranslations("skills");
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="card-border p-4">
      <label className="flex flex-col gap-2 text-sm text-text-secondary">
        {t("importPrompt")}
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => setPicked(e.target.files?.[0]?.name ?? null)}
          className="text-xs text-text-muted file:mr-3 file:rounded-md file:border file:border-ink-500 file:bg-ink-800 file:px-3 file:py-1.5 file:text-text-primary hover:file:border-brand-blue"
        />
      </label>
      <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
        {t("importComingSoon")}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
        {t("importAddManually")}
      </p>
      {picked && (
        <p className="mt-1 text-[11px] text-state-warning" role="status">
          {t("importNotSaved", { file: picked })}
        </p>
      )}
    </div>
  );
}
