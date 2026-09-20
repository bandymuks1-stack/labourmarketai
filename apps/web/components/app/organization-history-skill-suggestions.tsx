"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { acceptOrganizationHistorySkillAction } from "@/lib/organization-evidence/competency-signal-actions";

/**
 * SKILLS AN ORGANIZATION'S RECORDS NAMED — the suggestion list on the
 * person's own profile, beside "what organizations have recorded about me"
 * (2026-09-20). One more SOURCE for the same suggestion → accept path the
 * journal uses, with its provenance said out loud: organization history.
 *
 * Nothing is added until the person taps ADD; what is added is a
 * self-declared skill (never verified). NOT NOW hides the suggestion in
 * this view only — the organization's words stay on record, and the
 * suggestion may return; it is a "not now", and the copy calls it that.
 */
export type OrganizationHistorySkillSuggestion = {
  readonly slug: string;
  /** Localized catalogue name — never a raw slug. */
  readonly name: string;
  readonly terms: readonly string[];
  readonly records: number;
};

type Status = "idle" | "adding" | "added" | "already" | "error";

export function OrganizationHistorySkillSuggestions({
  suggestions,
}: {
  suggestions: readonly OrganizationHistorySkillSuggestion[];
}) {
  const t = useTranslations("evidenceImport.mine.suggestions");
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [hidden, setHidden] = useState<Record<string, true>>({});

  const shown = suggestions.filter((s) => !hidden[s.slug]);
  if (shown.length === 0) return null;

  async function add(slug: string) {
    setStatus((s) => ({ ...s, [slug]: "adding" }));
    try {
      const res = await acceptOrganizationHistorySkillAction(slug);
      setStatus((s) => ({
        ...s,
        [slug]: res.ok ? (res.added ? "added" : "already") : "error",
      }));
    } catch {
      setStatus((s) => ({ ...s, [slug]: "error" }));
    }
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-brand-cyan/25 bg-brand-cyan/5 px-4 py-3"
      aria-labelledby="organization-history-skills-heading"
      data-testid="organization-history-skill-suggestions"
      data-count={shown.length}
    >
      <div className="flex flex-col gap-0.5">
        <h3
          id="organization-history-skills-heading"
          className="font-display text-sm font-semibold text-text-primary"
        >
          {t("title")}
        </h3>
        <p className="text-meta leading-relaxed text-text-muted">{t("intro")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((s) => {
          const st = status[s.slug] ?? "idle";
          return (
            <li
              key={s.slug}
              className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-700/40 px-3 py-2.5"
              data-testid={`organization-history-skill-${s.slug}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">{s.name}</span>
                {st === "added" || st === "already" ? (
                  <span
                    className="text-xs font-semibold text-state-success"
                    data-testid={`organization-history-skill-added-${s.slug}`}
                  >
                    {st === "added" ? t("added") : t("already")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={st === "adding"}
                      onClick={() => add(s.slug)}
                      data-testid={`organization-history-skill-add-${s.slug}`}
                      className="rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
                    >
                      {st === "adding" ? t("adding") : t("add")}
                    </button>
                    <button
                      type="button"
                      disabled={st === "adding"}
                      onClick={() => setHidden((h) => ({ ...h, [s.slug]: true }))}
                      data-testid={`organization-history-skill-not-now-${s.slug}`}
                      className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-ink-400 disabled:opacity-50"
                    >
                      {t("notNow")}
                    </button>
                  </span>
                )}
              </div>
              {/* WHY: the organization's own words, and in how many records. */}
              <p className="text-meta leading-relaxed text-text-muted">
                {t("why", { terms: s.terms.join(", "), count: s.records })}
              </p>
              {st === "error" && (
                <p className="text-meta text-state-danger" role="alert">
                  {t("error")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-meta leading-relaxed text-text-muted">{t("selfDeclaredNote")}</p>
    </section>
  );
}
