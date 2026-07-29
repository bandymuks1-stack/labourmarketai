"use client";

import { useTranslations } from "next-intl";

/**
 * "Panašūs įgūdžiai / Similar skills" — the owner's tier-2 (CANDIDATE) section.
 *
 * Rendered ONLY when the recogniser was NOT confident but has similar catalogue
 * matches. It is deliberately separate — visually and semantically — from:
 *   - current signals ("Sistema suprato" / the detected buckets),
 *   - linked skills ("Susieti įgūdžiai"),
 *   - earlier/stale links,
 *   - the manual fallback ("Susieti ranka / Add manually").
 *
 * These are SUGGESTIONS the worker chooses from — never current signals, never
 * linked facts, never "verified/confirmed". Selecting one routes through the
 * SAME self-declared-claim path as a possible-new-skill (no new persistence,
 * no fake link). Until the worker taps "add", nothing happens.
 */
export type SimilarSkillCandidate = {
  /** Catalogue slug (used for keys + the self-declared claim). */
  slug: string;
  /** Canonical label (stored claim, dedupe). */
  name: string;
  /** Locale-aware display label; falls back to `name`. */
  displayName?: string;
  /** The folded stem that triggered the match — shown as the WHY line. */
  matchedText: string;
};

export type SimilarSkillAddStatus = "idle" | "adding" | "added" | "error";

export function SimilarSkillsSection({
  candidates,
  statusBySlug,
  onAdd,
}: {
  candidates: readonly SimilarSkillCandidate[];
  statusBySlug: Readonly<Record<string, SimilarSkillAddStatus>>;
  onAdd: (slug: string, name: string) => void;
}) {
  const t = useTranslations("journal");
  if (candidates.length === 0) return null;

  return (
    <section
      data-testid="similar-skills-section"
      aria-labelledby="similar-skills-heading"
      className="md:col-span-2 flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/40 p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h4
          id="similar-skills-heading"
          className="font-display text-sm font-semibold text-text-primary"
        >
          {t("similarSkillsTitle")}
        </h4>
        {/* Exact owner subtitle: "Pasirinkite, jei tinka / Choose if this fits". */}
        <p className="text-meta leading-relaxed text-text-secondary">
          {t("similarSkillsChoose")}
        </p>
        {/* Honesty line — these are not facts and nothing is linked. */}
        <p className="text-meta leading-relaxed text-text-muted">
          {t("similarSkillsIntro")}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((c) => {
          const status = statusBySlug[c.slug] ?? "idle";
          return (
            <div
              key={c.slug}
              data-testid={`similar-skill-${c.slug}`}
              className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-700/40 px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {c.displayName ?? c.name}
                </span>
                {status === "added" ? (
                  <span
                    className="text-xs font-semibold text-state-success"
                    data-testid={`similar-skill-added-${c.slug}`}
                  >
                    ✓ {t("newSkillAdded")}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={status === "adding"}
                    onClick={() => onAdd(c.slug, c.name)}
                    data-testid={`similar-skill-choose-${c.slug}`}
                    className="rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
                  >
                    {status === "adding" ? t("newSkillAdding") : t("similarSkillChoose")}
                  </button>
                )}
              </div>
              <p className="text-meta leading-relaxed text-text-muted">
                {t("reasonFound", { word: c.matchedText })}
              </p>
              {status === "error" && (
                <p
                  className="text-meta text-state-danger"
                  role="alert"
                  data-testid={`similar-skill-error-${c.slug}`}
                >
                  {t("newSkillError")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
