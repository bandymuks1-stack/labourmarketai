"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { SuggestionStatus } from "@/components/app/detected-suggestion-card";
import {
  appendAiClaims,
  confirmedClaimLabels,
  hasAnyCvImportProposal,
  markSavedClaims,
  persistedClaimLabels,
  proposeFromCvText,
  type CvClaimProposal,
} from "@/lib/cv/cv-import-proposals";
import type { CvSectionProposals } from "@/lib/cv/structured-parse";
import {
  promoteConfirmedClaimsAction,
  type PromoteClaimsResult,
} from "@/lib/profile/claim-catalog-promotion-actions";
import { aiCvStructuringSuggestions } from "@/lib/profile/cv-ai-structuring-actions";
import { saveProfileSkillClaimsAction } from "@/lib/profile/profile-skill-claims-actions";

/**
 * THE ONE CV-IMPORT PROPOSAL STATE (CV-18 / G-10, decision 0023), used by
 * both CV doors: the profile's text-first flow and the conversation's CV
 * upload. One text in, the same proposals out:
 *
 *   · skill claims (`extractProfileSkillClaims`) and structured sections
 *     (`parseCvSections`) — deterministic, always on;
 *   · for composed profile text only, the optional AI run (owner-gated),
 *     whose extra claims and sections are labelled AI.
 *
 * Nothing is saved by proposing. `saveConfirmed` persists ONLY the claims the
 * person confirmed, through the one self-declared claim action; `promote`
 * then runs the same catalogue promotion the profile always ran.
 */
export function useCvImportProposals({
  locale,
  savedClaimNormalizedLabels,
}: {
  locale: string;
  /** Claims already saved: shown as saved, never offered twice. */
  savedClaimNormalizedLabels?: readonly string[];
}) {
  const savedKey = (savedClaimNormalizedLabels ?? []).join("\u0000");
  const savedSet = useMemo(
    () => new Set(savedKey.length > 0 ? savedKey.split("\u0000") : []),
    [savedKey],
  );
  const [claims, setClaims] = useState<CvClaimProposal[]>([]);
  const [sections, setSections] = useState<CvSectionProposals | null>(null);
  const [aiSections, setAiSections] = useState<CvSectionProposals | null>(null);
  // Only the latest text's AI run may add to the list.
  const run = useRef(0);

  /** Propose from one text. `extract_failed` = the skill reading threw (the
   *  sections, when any, still stand). */
  const propose = useCallback(
    (raw: string, source: "profile_text" | "cv_document" = "cv_document"): { status: "ok" | "extract_failed"; hasAny: boolean } => {
      const p = proposeFromCvText(raw, savedSet);
      setClaims(p.claims);
      setSections(p.sections);
      setAiSections(null);
      const id = ++run.current;
      // Uploaded or pasted CV documents never cross the composed-bio AI boundary.
      if (p.status === "ok" && source === "profile_text") {
        void aiCvStructuringSuggestions(raw, locale)
          .then((res) => {
            if (id !== run.current || res.status !== "ok") return;
            setAiSections(res.sections);
            setClaims((prev) => appendAiClaims(prev, res.skillLabels, savedSet));
          })
          .catch(() => {
            // Best-effort enhancement — silence is the honest degraded state.
          });
      }
      return { status: p.status, hasAny: hasAnyCvImportProposal(p) };
    },
    [locale, savedSet],
  );

  const toggle = useCallback((key: string, next: SuggestionStatus) => {
    setClaims((prev) => prev.map((it) => (it.key === key ? { ...it, status: next } : it)));
  }, []);

  /** Persist the confirmed claims (self-declared, owner-only) and mark them
   *  saved. Throws when the save fails — the caller names the failure. */
  const saveConfirmed = useCallback(async (labels: readonly string[]): Promise<string[]> => {
    if (labels.length === 0) return [];
    const id = run.current;
    const rows = await saveProfileSkillClaimsAction([...labels]);
    const saved = persistedClaimLabels(labels, rows);
    if (id === run.current) setClaims((prev) => markSavedClaims(prev, saved));
    return saved;
  }, []);

  /** The catalogue promotion of the same confirmation; null when it failed
   *  (a promotion failure never fails the save). */
  const promote = useCallback(async (labels: readonly string[]): Promise<PromoteClaimsResult | null> => {
    try {
      return await promoteConfirmedClaimsAction([...labels]);
    } catch (e) {
      console.error("[cv-import] promotion failed:", e);
      return null;
    }
  }, []);

  return {
    claims,
    sections,
    aiSections,
    confirmedLabels: confirmedClaimLabels(claims),
    propose,
    toggle,
    saveConfirmed,
    promote,
  };
}
