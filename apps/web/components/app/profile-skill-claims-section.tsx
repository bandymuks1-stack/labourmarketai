"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ProfileSkillClaimRow } from "@/lib/profile/profile-skill-claims";
import { deleteProfileSkillClaimAction } from "@/lib/profile/profile-skill-claims-actions";

/**
 * Display-only list of the user's already-saved self-declared skill claims
 * (`profile_skill_claims`, migration 0015). Owner-only via RLS, never
 * asserted as verified.
 *
 * NO extract / suggest CTA here — adding new claims happens via the
 * composer in {@link ProfileTextFirstFlow}, which runs the same
 * deterministic extractor and persists via the same server action.
 * Having TWO competing "Pasiūlykite struktūrą" buttons (one in this
 * section, one in the composer) caused the production wiring bug that
 * `fix/cc/profile-text-skills-production-wiring` resolves — owner clicked
 * the composer's button, the OLD detector returned 0 chips for
 * "programuoti / statyti namus", and the second button up here looked
 * unrelated. This section is now a pure read+delete surface.
 */
export function ProfileSkillClaimsSection({
  initialClaims,
}: {
  /** Pre-existing saved claims (owner-only). Newest first. */
  initialClaims: ProfileSkillClaimRow[];
}) {
  const t = useTranslations("profileSkillClaims");

  const [savedClaims, setSavedClaims] =
    useState<ProfileSkillClaimRow[]>(initialClaims);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function removeSaved(id: string) {
    setError(null);
    startDelete(() => {
      deleteProfileSkillClaimAction(id)
        .then(() => {
          setSavedClaims((prev) => prev.filter((c) => c.id !== id));
        })
        .catch((e: unknown) => {
          console.error("[profile-skill-claims] delete failed", e);
          setError(t("deleteError"));
        });
    });
  }

  if (savedClaims.length === 0) return null;

  return (
    <section
      aria-labelledby="profile-skill-claims-title"
      className="card-border flex flex-col gap-3 p-5"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="profile-skill-claims-title"
          className="font-display text-lg font-semibold text-text-primary"
        >
          {t("savedTitle")}
        </h2>
        <p
          className="font-mono text-[10px] uppercase tracking-label text-text-muted"
          data-testid="profile-skill-claims-disclaimer"
        >
          {t("disclaimer")}
        </p>
      </header>

      <ul
        className="flex flex-wrap gap-2"
        data-testid="profile-skill-claims-saved"
      >
        {savedClaims.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2 rounded-md border border-state-success/40 bg-state-success/5 px-2 py-1 text-sm text-text-primary"
          >
            <span>{c.label}</span>
            <button
              type="button"
              onClick={() => removeSaved(c.id)}
              disabled={isDeleting}
              className="text-xs text-text-muted hover:text-state-danger"
              aria-label={t("removeSavedLabel")}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-xs text-state-danger">
          {error}
        </p>
      )}
    </section>
  );
}
