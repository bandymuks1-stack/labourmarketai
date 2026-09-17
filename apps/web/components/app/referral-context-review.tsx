"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import { reviewReferralContextAction } from "@/lib/invitations/actions";
import type { DeclaredContextItem, ReviewDecision } from "@/lib/invitations/model";

/**
 * WHAT WAS DECLARED ABOUT YOU — the worker confirmation boundary (universal
 * network v1, requirement R).
 *
 * An approved source referred this person and declared professions, sectors,
 * skills, languages, destinations. Every line is DECLARED INPUT: the person
 * accepts it, rejects it, or corrects it, and the decision is recorded on
 * their own acceptance row with provenance (`review_referral_context_v1`).
 *
 * WHAT ACCEPTING DOES NOT DO: it does not write a skill, a profession or an
 * evidence row. The profile paths that already exist are the only writers,
 * and the footer points there. That is deliberate — a declared line becoming
 * a profile fact must be the person's own act on the profile, not a side
 * effect of a click on an invitation page.
 */
type ReviewState = { decision: ReviewDecision; correction?: string | null };

export function ReferralContextReview({
  invitationId,
  sourceName,
  items,
  freeText,
  initialReviews,
}: {
  invitationId: string;
  sourceName: string;
  items: readonly DeclaredContextItem[];
  freeText: string | null;
  /** The person's earlier decisions, keyed by item key. */
  initialReviews?: Record<string, ReviewState>;
}) {
  const t = useTranslations("network.referralReview");
  const [reviews, setReviews] = useState<Record<string, ReviewState>>(initialReviews ?? {});
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(item: DeclaredContextItem, decision: ReviewDecision, text?: string) {
    setFailed(null);
    startTransition(async () => {
      const r = await reviewReferralContextAction({
        invitationId,
        itemKey: item.key,
        decision,
        correction: decision === "corrected" ? (text ?? "") : null,
      });
      if (r.status === "ok" && r.outcome === "recorded") {
        setReviews((prev) => ({
          ...prev,
          [item.key]: { decision, correction: decision === "corrected" ? text ?? null : null },
        }));
        setCorrecting(null);
        setCorrection("");
      } else {
        setFailed(r.status === "needs-migration" ? "not_enabled" : "error");
      }
    });
  }

  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="referral-context-review"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-base font-bold text-text-primary">
          {t("title", { source: sourceName })}
        </h2>
        <p className="text-xs text-text-secondary">{t("intro")}</p>
      </header>

      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-1.5">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`groups.${group}`)}
          </p>
          <ul className="flex flex-col gap-1">
            {items
              .filter((i) => i.group === group)
              .map((item) => {
                const state = reviews[item.key];
                return (
                  <li
                    key={item.key}
                    className="flex flex-wrap items-center gap-2 rounded border border-ink-600 px-2.5 py-1.5 text-sm"
                    data-testid={`referral-item-${item.key}`}
                    data-decision={state?.decision ?? "undecided"}
                  >
                    <span className="min-w-0 break-words text-text-primary">
                      {state?.decision === "corrected" && state.correction ? (
                        <>
                          <s className="text-text-muted">{item.label}</s>{" "}
                          <span>{state.correction}</span>
                        </>
                      ) : (
                        item.label
                      )}
                    </span>
                    {state ? (
                      <span
                        className={`ml-auto font-mono text-meta uppercase tracking-label ${
                          state.decision === "rejected" ? "text-state-danger" : "text-state-success"
                        }`}
                      >
                        {t(`decisions.${state.decision}`)}
                      </span>
                    ) : correcting === item.key ? (
                      <span className="ml-auto flex items-center gap-1.5">
                        <input
                          value={correction}
                          onChange={(e) => setCorrection(e.target.value)}
                          maxLength={200}
                          placeholder={t("correctionPlaceholder")}
                          data-testid="referral-correction"
                          className="min-h-8 rounded border border-ink-500 bg-ink-800/40 px-2 text-xs text-text-primary"
                        />
                        <button
                          type="button"
                          disabled={pending || correction.trim().length === 0}
                          onClick={() => decide(item, "corrected", correction.trim())}
                          data-testid="referral-correction-save"
                          className="rounded border border-ink-500 px-2 py-1 text-meta text-text-secondary hover:border-brand-blue hover:text-text-primary disabled:opacity-50"
                        >
                          {t("save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCorrecting(null)}
                          className="rounded px-2 py-1 text-meta text-text-muted hover:text-text-primary"
                        >
                          {t("cancel")}
                        </button>
                      </span>
                    ) : (
                      <span className="ml-auto flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => decide(item, "accepted")}
                          data-testid="referral-accept"
                          className="rounded border border-ink-500 px-2 py-1 text-meta text-text-secondary hover:border-state-success hover:text-text-primary disabled:opacity-50"
                        >
                          {t("accept")}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setCorrecting(item.key);
                            setCorrection(item.label);
                          }}
                          data-testid="referral-correct"
                          className="rounded border border-ink-500 px-2 py-1 text-meta text-text-secondary hover:border-brand-blue hover:text-text-primary disabled:opacity-50"
                        >
                          {t("correct")}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => decide(item, "rejected")}
                          data-testid="referral-reject"
                          className="rounded border border-ink-500 px-2 py-1 text-meta text-text-secondary hover:border-state-danger hover:text-text-primary disabled:opacity-50"
                        >
                          {t("reject")}
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}

      {freeText && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("groups.freeText")}
          </p>
          <p className="whitespace-pre-wrap rounded border border-ink-600 px-2.5 py-1.5 text-xs text-text-secondary">
            {freeText}
          </p>
        </div>
      )}

      {failed && (
        <p role="status" className="text-xs text-state-danger" data-testid="referral-review-failed">
          {t(`failed.${failed}`)}
        </p>
      )}

      <p className="text-meta text-text-muted" data-testid="referral-review-boundary">
        {t("boundary")}{" "}
        <Link href="/dashboard/profile" className="underline hover:text-text-primary">
          {t("toProfile")}
        </Link>
      </p>
    </section>
  );
}
