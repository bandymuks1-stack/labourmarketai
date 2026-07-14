"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  aiJournalEntrySuggestions,
  type JournalAiSuggestionsResult,
} from "@/lib/journal/journal-ai-suggestions-actions";
import { matchProjectNameToEngagement } from "@/lib/journal/journal-ai-suggestions-model";
import { saveProfileSkillClaimsAction } from "@/lib/profile/profile-skill-claims-actions";
import {
  confirmCvAchievementAction,
  confirmCvWorkHistoryAction,
} from "@/lib/profile/cv-section-import-actions";
import { recordEvent } from "@/lib/telemetry/task";
import { cn } from "@/lib/utils";

/**
 * AI suggestions block for the composer's structured REVIEW area (Journal
 * Proof Engine v1, §3). User-INITIATED only: nothing runs until the worker
 * taps "Pasiūlyti iš įrašo (AI)". The deterministic recognizers above stay
 * the always-on layer; this block is an optional labelled ADDITION.
 *
 * §7.1 compliance: every suggestion is confirm/discard —
 *   skill        → the SAME self-declared claim path as the deterministic
 *                  chips (saveProfileSkillClaimsAction; never verified);
 *   achievement  → confirmCvAchievementAction (worker_achievements row;
 *                  honest needs_migration until the owner applies
 *                  20260714160000);
 *   experience   → confirmCvWorkHistoryAction
 *                  (save_self_declared_work_history_v1; honest
 *                  needs_migration until 20260714161000 is applied);
 *   project link → matched against the worker's OWN engagement contexts;
 *                  confirming just selects that context for THIS entry
 *                  (client state — no hidden write).
 *
 * Honest off state: runtime disabled / nothing found → one quiet line,
 * no fake AI badge, no error wall.
 */

type ItemStatus = "idle" | "saving" | "saved" | "discarded" | "needs_migration" | "error";

export function JournalAiSuggestions({
  text,
  engagements,
  onPickEngagement,
}: {
  text: string;
  engagements: { id: string; label: string }[];
  onPickEngagement: (engagementId: string) => void;
}) {
  const t = useTranslations("journal.aiSuggest");
  const locale = useLocale();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<JournalAiSuggestionsResult | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [usedEngagement, setUsedEngagement] = useState<string | null>(null);

  function setStatus(key: string, status: ItemStatus) {
    setStatuses((prev) => ({ ...prev, [key]: status }));
  }

  async function run() {
    setPhase("loading");
    recordEvent("journal_ai_suggest_clicked", {});
    try {
      const res = await aiJournalEntrySuggestions(text, locale);
      setResult(res);
      recordEvent("journal_ai_suggest_result", { result_kind: res.status });
    } catch (e) {
      console.error("[journal-ai-suggestions] request failed:", e);
      setResult({ status: "off" });
    } finally {
      setPhase("done");
    }
  }

  async function confirmItem(key: string, persist: () => Promise<unknown>) {
    setStatus(key, "saving");
    try {
      const res = await persist();
      if (
        res !== null &&
        typeof res === "object" &&
        "ok" in res &&
        (res as { ok: boolean }).ok === false
      ) {
        const code = (res as { code?: string }).code;
        setStatus(key, code === "needs_migration" ? "needs_migration" : "error");
        return;
      }
      setStatus(key, "saved");
      recordEvent("journal_ai_suggestion_confirmed", {});
    } catch (e) {
      console.error("[journal-ai-suggestions] confirm failed:", e);
      setStatus(key, "error");
    }
  }

  const itemClass = (status: ItemStatus) =>
    cn(
      "flex flex-col gap-1.5 rounded-md border px-3 py-2",
      status === "saved"
        ? "border-state-success/40 bg-state-success/5"
        : status === "discarded"
          ? "border-ink-600 bg-ink-800/40 opacity-60"
          : "border-brand-blue/30 bg-brand-blue/5",
    );

  const itemControls = (
    key: string,
    status: ItemStatus,
    onConfirm: () => void,
    confirmLabel: string,
  ) => {
    if (status === "saved")
      return (
        <span className="text-xs font-semibold text-state-success">
          ✓ {t("added")}
        </span>
      );
    if (status === "discarded") return null;
    return (
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={status === "saving"}
          data-testid={`journal-ai-confirm-${key}`}
          className="rounded-md border border-brand-blue/50 px-3 py-1 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
        >
          {status === "saving" ? t("adding") : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setStatus(key, "discarded")}
          className="rounded-md border border-ink-500 px-3 py-1 text-xs text-text-secondary transition-colors hover:border-ink-500"
        >
          {t("discard")}
        </button>
        {status === "needs_migration" && (
          <span className="text-[11px] text-state-warning" role="alert">
            {t("needsMigration")}
          </span>
        )}
        {status === "error" && (
          <span className="text-[11px] text-state-danger" role="alert">
            {t("saveError")}
          </span>
        )}
      </span>
    );
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid="journal-ai-suggestions"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("title")}
        </p>
        {phase !== "done" || result?.status !== "ok" ? (
          <button
            type="button"
            onClick={() => void run()}
            disabled={phase === "loading" || text.trim().length < 20}
            data-testid="journal-ai-suggest-cta"
            className="rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
          >
            {phase === "loading" ? t("loading") : t("cta")}
          </button>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-text-muted">
        {t("disclaimer")}
      </p>

      {phase === "done" && result?.status === "off" && (
        // Honest off/empty state — the runtime is not enabled here or the
        // model found nothing plainly stated. Never an error wall.
        <p
          className="text-[11px] leading-relaxed text-text-muted"
          data-testid="journal-ai-off-note"
        >
          {t("offNote")}
        </p>
      )}

      {phase === "done" && result?.status === "ok" && (
        <div className="flex flex-col gap-3">
          {result.skillLabels.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-text-secondary">
                {t("skillsTitle")}
              </p>
              <ul className="flex flex-col gap-1.5">
                {result.skillLabels.map((label, i) => {
                  const key = `skill-${i}`;
                  const status = statuses[key] ?? "idle";
                  return (
                    <li key={key} className={itemClass(status)}>
                      <span className="text-sm font-semibold text-text-primary">
                        {label}
                      </span>
                      {itemControls(
                        key,
                        status,
                        () =>
                          void confirmItem(key, () =>
                            saveProfileSkillClaimsAction([label]),
                          ),
                        t("addSkill"),
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {result.achievements.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-text-secondary">
                {t("achievementsTitle")}
              </p>
              <ul className="flex flex-col gap-1.5">
                {result.achievements.map((a, i) => {
                  const key = `achievement-${i}`;
                  const status = statuses[key] ?? "idle";
                  return (
                    <li key={key} className={itemClass(status)}>
                      <span className="text-sm font-semibold text-text-primary">
                        {a.title}
                        {a.year !== null && (
                          <span className="ml-1 text-xs font-normal text-text-muted">
                            ({a.year})
                          </span>
                        )}
                      </span>
                      {itemControls(
                        key,
                        status,
                        () =>
                          void confirmItem(key, () =>
                            confirmCvAchievementAction({ title: a.title }),
                          ),
                        t("addAchievement"),
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {result.experiencePeriods.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-text-secondary">
                {t("experienceTitle")}
              </p>
              <ul className="flex flex-col gap-1.5">
                {result.experiencePeriods.map((p, i) => {
                  const key = `experience-${i}`;
                  const status = statuses[key] ?? "idle";
                  const years =
                    p.startYear || p.endYear
                      ? ` (${p.startYear ?? "?"}–${p.isCurrent ? t("current") : (p.endYear ?? "?")})`
                      : "";
                  return (
                    <li key={key} className={itemClass(status)}>
                      <span className="text-sm font-semibold text-text-primary">
                        {p.title}
                        <span className="text-xs font-normal text-text-muted">
                          {years}
                        </span>
                      </span>
                      {itemControls(
                        key,
                        status,
                        () =>
                          void confirmItem(key, () =>
                            confirmCvWorkHistoryAction({
                              title: p.title,
                              startYear: p.startYear,
                              endYear: p.endYear,
                              isCurrent: p.isCurrent,
                            }),
                          ),
                        t("addExperience"),
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {(() => {
            // Project link — ONLY names that match one of the worker's OWN
            // engagement contexts render; an unmatched name shows nothing.
            const matches = result.projectNames
              .map((name) => ({
                name,
                engagementId: matchProjectNameToEngagement(name, engagements),
              }))
              .filter(
                (m): m is { name: string; engagementId: string } =>
                  m.engagementId !== null,
              );
            if (matches.length === 0) return null;
            return (
              <section className="flex flex-col gap-1.5">
                <p className="text-[11px] font-medium text-text-secondary">
                  {t("projectTitle")}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {matches.map((m, i) => {
                    const key = `project-${i}`;
                    const status = statuses[key] ?? "idle";
                    const used = usedEngagement === m.engagementId;
                    return (
                      <li key={key} className={itemClass(used ? "saved" : status)}>
                        <span className="text-sm font-semibold text-text-primary">
                          {m.name}
                        </span>
                        {used ? (
                          <span className="text-xs font-semibold text-state-success">
                            ✓ {t("projectUsed")}
                          </span>
                        ) : status === "discarded" ? null : (
                          <span className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onPickEngagement(m.engagementId);
                                setUsedEngagement(m.engagementId);
                              }}
                              data-testid={`journal-ai-confirm-${key}`}
                              className="rounded-md border border-brand-blue/50 px-3 py-1 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
                            >
                              {t("useProject")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setStatus(key, "discarded")}
                              className="rounded-md border border-ink-500 px-3 py-1 text-xs text-text-secondary transition-colors hover:border-ink-500"
                            >
                              {t("discard")}
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
}
