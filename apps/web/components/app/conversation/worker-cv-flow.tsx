"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CvImportUpload } from "@/components/app/cv-import-upload";
import { CvImportSectionReview } from "@/components/app/cv-import-section-review";
import { parseCvSections, hasAnyProposal, type CvSectionProposals } from "@/lib/cv/structured-parse";

/**
 * Conversation-first CV flow (Phase B). Composes the EXISTING, tested pieces:
 *   1. `CvImportUpload` — real file upload → `/api/cv/extract` (MIME + size
 *      guarded; no filename/content in telemetry; nothing stored).
 *   2. `parseCvSections` — a DETERMINISTIC parser (no LLM; works with AI OFF)
 *      turning the extracted text into reviewable section proposals.
 *   3. `CvImportSectionReview` — the existing review UI that persists each
 *      confirmed item through the canonical `confirmCv*` server actions with
 *      conflict handling (§7.1). The user confirms all / part / edits / rejects.
 *
 * CV text + file content are treated as UNTRUSTED DATA, never instructions.
 * If parsing yields nothing, the flow degrades honestly to a manual-entry hint.
 */
export function WorkerCvFlow({ onClose }: { onClose: () => void }) {
  const t = useTranslations("conversation.cv");
  const [proposals, setProposals] = useState<CvSectionProposals | null>(null);
  const [parsedEmpty, setParsedEmpty] = useState(false);

  function onExtracted(text: string) {
    const p = parseCvSections(text);
    if (hasAnyProposal(p)) {
      setProposals(p);
      setParsedEmpty(false);
    } else {
      setProposals(null);
      setParsedEmpty(true);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 px-4 py-3"
      data-testid="conversation-cv-flow"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-card-title font-semibold text-text-primary">{t("title")}</h3>
        <button
          type="button"
          onClick={onClose}
          className="ua-press -mr-2 inline-flex min-h-11 items-center rounded-control px-2 text-support font-medium text-text-muted hover:text-text-secondary"
        >
          {t("close")}
        </button>
      </div>
      <p className="text-support leading-relaxed text-text-secondary">{t("intro")}</p>

      <CvImportUpload onExtracted={onExtracted} />

      {parsedEmpty && (
        <p className="text-support text-text-muted" role="status" data-testid="conversation-cv-empty">
          {t("noneFound")}
        </p>
      )}

      {proposals && (
        <div data-testid="conversation-cv-review" aria-live="polite">
          <CvImportSectionReview proposals={proposals} />
        </div>
      )}
    </div>
  );
}
