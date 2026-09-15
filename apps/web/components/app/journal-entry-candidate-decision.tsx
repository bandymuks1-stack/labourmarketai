"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  confirmJournalSkillCandidate,
  rejectJournalSkillCandidate,
} from "@/lib/journal/skill-pipeline-actions";
import { JOURNAL_PIPELINE_VERSION } from "@/lib/journal/journal-recognition";
import type { EntryPendingCandidate } from "@/lib/journal/entry-pending-candidates";

/**
 * One PENDING candidate on a SAVED entry's card, decided in place (issue
 * #1689, observed 2026-09-12: decidable only right after the save before).
 *
 * The two buttons go through the SAME server actions the composer's result
 * card and the chat's done card use — `confirmJournalSkillCandidate` (the
 * honest self-declared lane: verified:false, yellow, entry link + fragment
 * evidence) and `rejectJournalSkillCandidate` (an append-only, entry-scoped
 * `skill_rejected` marker). The server re-derives the entry and membership-
 * checks the slug on every call; the row shows the RETURNED result, never an
 * optimistic count. The strings are the composer's own (`journal.candidate*`).
 */
type DecisionState = "idle" | "working" | "confirmed" | "rejected" | "error";

export function JournalEntryCandidateDecision({
  entryId,
  candidate,
}: {
  entryId: string;
  candidate: EntryPendingCandidate;
}) {
  const t = useTranslations("journal");
  const [state, setState] = useState<DecisionState>("idle");

  async function decide(decision: "confirmed" | "rejected") {
    setState("working");
    try {
      const res =
        decision === "confirmed"
          ? await confirmJournalSkillCandidate(
              entryId,
              candidate.slug,
              JOURNAL_PIPELINE_VERSION,
            )
          : await rejectJournalSkillCandidate(
              entryId,
              candidate.slug,
              JOURNAL_PIPELINE_VERSION,
            );
      setState(res.ok ? decision : "error");
    } catch (e) {
      console.error("[journal-entry-candidate] decision failed:", e);
      setState("error");
    }
  }

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-2"
      data-testid={`entry-candidate-${entryId}-${candidate.slug}`}
      data-state={state}
    >
      <span className="text-meta text-text-primary">
        {t("resultNeedsConfirm")}: {candidate.name}
      </span>
      {state === "confirmed" ? (
        <span
          className="text-meta font-semibold text-state-success"
          data-testid={`entry-candidate-confirmed-${entryId}-${candidate.slug}`}
        >
          ✓ {t("candidateConfirmed")}
        </span>
      ) : state === "rejected" ? (
        <span
          className="text-meta text-text-muted"
          data-testid={`entry-candidate-rejected-${entryId}-${candidate.slug}`}
        >
          {t("candidateRejected")}
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={state === "working"}
            aria-busy={state === "working" || undefined}
            onClick={() => void decide("confirmed")}
            data-testid={`entry-candidate-confirm-${entryId}-${candidate.slug}`}
            className="rounded-md border border-brand-blue/50 px-2.5 py-1 text-meta font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
          >
            {state === "working" ? t("candidateConfirming") : t("candidateConfirm")}
          </button>
          <button
            type="button"
            disabled={state === "working"}
            onClick={() => void decide("rejected")}
            data-testid={`entry-candidate-reject-${entryId}-${candidate.slug}`}
            className="rounded-md border border-ink-500 px-2.5 py-1 text-meta text-text-secondary transition-colors hover:border-state-danger/60 hover:text-state-danger disabled:opacity-50"
          >
            {t("candidateReject")}
          </button>
          {state === "error" ? (
            <span
              className="text-meta text-state-danger"
              data-testid={`entry-candidate-error-${entryId}-${candidate.slug}`}
            >
              {t("candidateError")}
            </span>
          ) : null}
        </span>
      )}
    </li>
  );
}
