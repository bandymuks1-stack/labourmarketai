"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, ArrowRight } from "lucide-react";
import { saveProfileSkillClaimsAction } from "@/lib/profile/profile-skill-claims-actions";
import {
  buildEntrySkillReview,
  type ReviewDecision,
} from "@/lib/work-entry/entry-skill-review";

/**
 * "Suggested skills from this entry" — the Work Entry Review bridge (PR #478).
 *
 * Renders the deterministic Universal Recognition (#477) of the entry text as
 * REVIEWABLE suggestions: accept (→ a SELF-DECLARED profile claim via the
 * existing claims path — supported/profile signal, never verified), ignore, or
 * leave unmapped phrases for review. Honest: every item is "needs review / not
 * confirmed"; nothing is confirmed automatically; unknown work stays an unmapped phrase,
 * never an invented unrelated skill. No DB migration — reuses the claims action.
 */
type SaveState = "idle" | "saving" | "done" | "error";

export function WorkEntrySkillReview({ text }: { text: string }) {
  const t = useTranslations("workEntryReview");
  const review = useMemo(() => buildEntrySkillReview(text), [text]);
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [save, setSave] = useState<Record<string, SaveState>>({});

  if (review.items.length === 0 && review.unmapped.length === 0) {
    return review.needsMoreDetail ? (
      <p
        data-testid="work-entry-review-empty"
        className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs leading-relaxed text-text-muted"
      >
        {t("needsMoreDetail")}
      </p>
    ) : null;
  }

  async function accept(id: string, label: string) {
    setSave((s) => ({ ...s, [id]: "saving" }));
    try {
      await saveProfileSkillClaimsAction([label]);
      setDecisions((d) => ({ ...d, [id]: "accepted" }));
      setSave((s) => ({ ...s, [id]: "done" }));
    } catch {
      setSave((s) => ({ ...s, [id]: "error" }));
    }
  }
  function ignore(id: string) {
    setDecisions((d) => ({ ...d, [id]: "ignored" }));
  }

  return (
    <section
      className="card-border flex flex-col gap-3 p-4 sm:p-5"
      data-testid="work-entry-skill-review"
    >
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-sm font-semibold text-text-primary">{t("title")}</h3>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("intro")}</p>
      </header>

      {(review.durations.length > 0 || review.quantities.length > 0) && (
        <ul className="flex flex-wrap gap-2" data-testid="work-entry-review-signals">
          {review.quantities.map((q, i) => (
            <li key={`q${i}`} className="rounded-full border border-ink-500 bg-ink-800/40 px-2.5 py-1 text-[11px] text-text-secondary">
              {t("quantityLabel")}: {q.raw}
            </li>
          ))}
          {review.durations.map((d, i) => (
            <li key={`d${i}`} className="rounded-full border border-ink-500 bg-ink-800/40 px-2.5 py-1 text-[11px] text-text-secondary">
              {t("durationLabel")}: {d.value} {t(`unit.${d.unit}`)}
            </li>
          ))}
        </ul>
      )}

      {review.items.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="work-entry-review-items">
          {review.items.map((it) => {
            const decided = decisions[it.id];
            const state = save[it.id] ?? "idle";
            return (
              <li
                key={it.id}
                data-testid={`work-entry-item-${it.id}`}
                data-decision={decided ?? "pending"}
                className="flex flex-col gap-1.5 rounded-md border border-ink-500 bg-ink-800/50 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{it.label}</span>
                    <span className="rounded-sm border border-border-subtle bg-surface-1 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label text-text-muted">
                      {t(`domain.${it.domain}`)}
                    </span>
                  </span>
                  {decided === "accepted" ? (
                    <span className="text-xs font-semibold text-state-success" data-testid={`work-entry-accepted-${it.id}`}>
                      ✓ {t("accepted")}
                    </span>
                  ) : decided === "ignored" ? (
                    <span className="text-xs text-text-muted">{t("ignored")}</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={state === "saving"}
                        onClick={() => accept(it.id, it.label)}
                        data-testid={`work-entry-accept-${it.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-state-success/50 px-2 py-1 text-xs font-semibold text-state-success transition-colors hover:bg-state-success/10 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        {state === "saving" ? t("accepting") : t("accept")}
                      </button>
                      <button
                        type="button"
                        onClick={() => ignore(it.id)}
                        data-testid={`work-entry-ignore-${it.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2 py-1 text-xs text-text-muted transition-colors hover:border-brand-blue hover:text-text-secondary"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        {t("ignore")}
                      </button>
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-text-muted">
                  {t("reasonLabel")}: {it.reason}
                </p>
                {state === "error" && (
                  <p className="text-[11px] text-state-danger" role="alert">{t("saveError")}</p>
                )}
                {decided === "accepted" && (
                  <p className="text-[11px] leading-relaxed text-text-muted">{t("acceptedNote")}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {review.unmapped.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="work-entry-review-unmapped">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("unmappedTitle")}</p>
          <ul className="flex flex-col gap-1">
            {review.unmapped.map((u, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
                „{u.phrase}&quot;
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-text-muted">{t("unmappedNote")}</p>
        </div>
      )}
    </section>
  );
}