"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, ArrowRight, ShieldCheck, Activity } from "lucide-react";
import { saveProfileSkillClaimsAction } from "@/lib/profile/profile-skill-claims-actions";
import {
  buildEntrySkillReview,
  type EntryReviewItem,
  type ExistingSkillRef,
  type ReviewDecision,
} from "@/lib/work-entry/entry-skill-review";

/**
 * "Suggested skills from this entry" — Work Entry Review bridge v2 (cross-sector).
 *
 * Renders the deterministic Universal Recognition of the entry text as REVIEWABLE
 * output, with the owner-required separation made visual:
 *   - performed ACTIVITIES in this entry (sector-tagged);
 *   - EXISTING profile skills this entry evidences (not re-added, not duplicated);
 *   - NEW possible skills (accept → a SELF-DECLARED claim, never verified);
 *   - an honest evidence-source + verification footer (Work Journal · not verified).
 * Nothing is auto-confirmed; unknown work stays an unmapped review phrase.
 */
type SaveState = "idle" | "saving" | "done" | "error";

export function WorkEntrySkillReview({
  text,
  existingSkills,
}: {
  text: string;
  /** REQUIRED: the worker's already-declared skills, so existing-vs-new is real
   *  and a declared skill is never shown as a "new" candidate. Pass [] only for
   *  a worker with no declared skills yet (an honest, explicit empty list). */
  existingSkills: readonly ExistingSkillRef[];
}) {
  const t = useTranslations("workEntryReview");
  const review = useMemo(
    () => buildEntrySkillReview(text, existingSkills),
    [text, existingSkills],
  );
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

  const domainBadge = (it: EntryReviewItem) => (
    <span className="rounded-sm border border-border-subtle bg-surface-1 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label text-text-muted">
      {t(`domain.${it.domain}`)}
    </span>
  );

  return (
    <section
      className="card-border flex flex-col gap-4 p-4 sm:p-5"
      data-testid="work-entry-skill-review"
    >
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-sm font-semibold text-text-primary">{t("title")}</h3>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("intro")}</p>
      </header>

      {/* Performed activities in this entry (sector-tagged "what I did"). */}
      {review.activities.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="work-entry-activities">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-text-muted">
            <Activity className="h-3.5 w-3.5 text-brand-cyan" strokeWidth={1.75} aria-hidden />
            {t("activitiesTitle")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {review.activities.map((a, i) => (
              <li
                key={`a${i}`}
                data-testid={`work-entry-activity-${a.domain}`}
                className="flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800/40 px-2.5 py-1 text-[11px] text-text-secondary"
              >
                <span className="font-mono text-[9px] uppercase tracking-label text-text-muted">
                  {t(`domain.${a.domain}`)}
                </span>
                <span className="text-text-secondary">{a.phrase}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-text-muted">{t("activitiesNote")}</p>
        </div>
      )}

      {/* Date/time/duration/quantity signals. */}
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

      {/* EXISTING profile skills evidenced by this entry — never re-added. */}
      {review.existingItems.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="work-entry-existing">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("existingTitle")}</p>
          <ul className="flex flex-col gap-1.5">
            {review.existingItems.map((it) => (
              <li
                key={it.id}
                data-testid={`work-entry-existing-${it.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 bg-ink-800/30 px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{it.label}</span>
                  {domainBadge(it)}
                </span>
                <span className="rounded-sm border border-brand-blue/40 bg-brand-blue/5 px-1.5 py-0.5 text-[10px] font-semibold text-brand-blue">
                  {t("existingBadge")}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-text-muted">{t("existingNote")}</p>
        </div>
      )}

      {/* NEW possible skills — accept (self-declared) or ignore. */}
      {review.newItems.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="work-entry-new">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("newTitle")}</p>
          <p className="text-[11px] leading-relaxed text-text-muted">{t("newNote")}</p>
          <ul className="flex flex-col gap-2" data-testid="work-entry-review-items">
            {review.newItems.map((it) => {
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
                      {domainBadge(it)}
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
        </div>
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

      {/* Honest evidence-source + verification footer (never auto-verified). */}
      <footer
        className="flex flex-col gap-1 border-t border-ink-600/60 pt-3"
        data-testid="work-entry-verification-note"
      >
        <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.75} aria-hidden />
          {t("evidenceLabel")}: {t("evidenceJournal")}
        </p>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("verificationNote")}</p>
      </footer>
    </section>
  );
}