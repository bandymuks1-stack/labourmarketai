"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CvImportUpload } from "@/components/app/cv-import-upload";
import { CvImportSectionReview } from "@/components/app/cv-import-section-review";
import { DetectedSuggestionCard } from "@/components/app/detected-suggestion-card";
import { DetectedSuggestionList } from "@/components/app/detected-suggestion-list";
import { useCvImportProposals } from "@/components/app/use-cv-import-proposals";
import { Button } from "@/components/ui/Button";
import { hasAnyProposal } from "@/lib/cv/structured-parse";
import { CV_ACCEPTED_EXTENSIONS } from "@/lib/cv/cv-import-client";
import { useAttachSink, type RegisterAttachSink } from "@/components/app/conversation/attach-sink";

/** The CV reader's own format contract — the paperclip hands over nothing else. */
function isCvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return CV_ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Conversation-first CV flow (Phase B). Composes the EXISTING, tested pieces:
 *   1. `CvImportUpload` — real file upload → `/api/cv/extract` (MIME + size
 *      guarded; no filename/content in telemetry; nothing stored).
 *   2. `useCvImportProposals` — THE SAME proposal state the profile's
 *      text-first flow uses (CV-18 / G-10, decision 0023): skill claims read
 *      from the CV's own words (`extractProfileSkillClaims`), the
 *      deterministic section parser (`parseCvSections`, works with AI OFF),
 *      and the optional AI run (labelled, identical confirm). This flow used
 *      to run the section parser only, so a CV imported here proposed no
 *      skill at all.
 *   3. The confirm step: each claim is a `DetectedSuggestionCard` saved only
 *      on the person's own "save" through the one self-declared claim action
 *      (then the same catalogue promotion); each section item through
 *      `CvImportSectionReview` and the canonical `confirmCv*` server actions
 *      with conflict handling (§7.1). Nothing is saved by proposing.
 *
 * CV text + file content are treated as UNTRUSTED DATA, never instructions.
 * If parsing yields nothing, the flow degrades honestly to a manual-entry hint.
 */
export function WorkerCvFlow({
  onClose,
  initialFile = null,
  onRegisterAttachSink,
}: {
  onClose: () => void;
  /** The CV the person picked with the composer paperclip before this flow
   *  opened — read through `CvImportUpload`'s own pick path. */
  initialFile?: File | null;
  /** While open, a paperclip CV goes into THIS flow, never a second one. */
  onRegisterAttachSink?: RegisterAttachSink;
}) {
  const t = useTranslations("conversation.cv");
  // The claim confirm step's copy is the profile flow's own (no new text).
  const tClaims = useTranslations("skills.textFirst");
  const tBucket = useTranslations("structuring.buckets");
  const locale = useLocale();
  const proposals = useCvImportProposals({ locale });
  const [proposed, setProposed] = useState(false);
  const [parsedEmpty, setParsedEmpty] = useState(false);
  const [handedOver, setHandedOver] = useState<File | null>(initialFile);
  const [closed, setClosed] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState(false);
  useAttachSink(onRegisterAttachSink, "cv", !closed, isCvFile, setHandedOver);

  function onExtracted(text: string) {
    const r = proposals.propose(text);
    setApplied(false);
    setApplyError(false);
    setProposed(r.hasAny);
    setParsedEmpty(!r.hasAny);
  }

  async function saveClaims() {
    const labels = proposals.confirmedLabels;
    if (labels.length === 0) return;
    setApplying(true);
    setApplyError(false);
    try {
      await proposals.saveConfirmed(labels);
      setApplied(true);
      await proposals.promote(labels);
    } catch (e) {
      console.error("[conversation-cv] claim save failed:", e);
      setApplyError(true);
    } finally {
      setApplying(false);
    }
  }

  const claims = proposals.claims;
  const pendingClaims = claims.some((c) => c.status === "pending" || c.status === "confirmed");
  const sections = proposals.sections;
  const showSections = sections !== null && (hasAnyProposal(sections) || proposals.aiSections !== null);

  return (
    <div
      className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 px-4 py-3"
      data-testid="conversation-cv-flow"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-card-title font-semibold text-text-primary">{t("title")}</h3>
        <button
          type="button"
          onClick={() => {
            setClosed(true);
            onClose();
          }}
          className="ua-press -mr-2 inline-flex min-h-11 items-center rounded-control px-2 text-support font-medium text-text-muted hover:text-text-secondary"
        >
          {t("close")}
        </button>
      </div>
      <p className="text-support leading-relaxed text-text-secondary">{t("intro")}</p>

      <CvImportUpload onExtracted={onExtracted} file={handedOver} />

      {parsedEmpty && (
        <p className="text-support text-text-muted" role="status" data-testid="conversation-cv-empty">
          {t("noneFound")}
        </p>
      )}

      {proposed && (
        <div className="flex flex-col gap-4" data-testid="conversation-cv-review" aria-live="polite">
          {claims.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="conversation-cv-skill-claims">
              <DetectedSuggestionList title={tBucket("selfDeclared")} count={claims.length}>
                {claims.map((it) => (
                  <DetectedSuggestionCard
                    key={it.key}
                    label={it.label}
                    hint={it.aiOrigin ? tClaims("aiSuggestionHint") : undefined}
                    status={it.status}
                    onConfirm={() => proposals.toggle(it.key, "confirmed")}
                    onDiscard={() => proposals.toggle(it.key, "discarded")}
                  />
                ))}
              </DetectedSuggestionList>
              {pendingClaims && (
                <Button
                  type="button"
                  size="sm"
                  onClick={saveClaims}
                  disabled={proposals.confirmedLabels.length === 0 || applying}
                  className="self-start"
                  data-testid="conversation-cv-skill-apply"
                >
                  {applying
                    ? tClaims("applying")
                    : proposals.confirmedLabels.length === 0
                      ? tClaims("applyAllDisabledHint")
                      : tClaims("applyAll")}
                </Button>
              )}
              {applied && (
                <p role="status" className="text-support text-state-success" data-testid="conversation-cv-skill-applied">
                  ✓ {tClaims("savedToCapabilities")} · {tClaims("needsExternalConfirmation")}
                </p>
              )}
              {applyError && (
                <p role="alert" className="text-support text-state-danger">
                  {tClaims("applyErrorLabel")}
                </p>
              )}
            </div>
          )}
          {showSections && <CvImportSectionReview proposals={sections} aiProposals={proposals.aiSections} />}
        </div>
      )}
    </div>
  );
}
