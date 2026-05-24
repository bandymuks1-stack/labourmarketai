"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import {
  extractProfileSkillClaims,
  normalizeClaimLabel,
  type SkillClaimSuggestion,
} from "@/lib/profile/skill-claim-extractor";
import type { ProfileSkillClaimRow } from "@/lib/profile/profile-skill-claims";
import {
  saveProfileSkillClaimsAction,
  deleteProfileSkillClaimAction,
} from "@/lib/profile/profile-skill-claims-actions";

/**
 * Owner-only self-declared skill claims block. Sits ABOVE the existing
 * detected-suggestions UI on /[locale]/dashboard/profile and is the
 * primary surface for the slice goal:
 *
 *   1. User wrote `profile_text`.
 *   2. We propose editable skill chips extracted from that text.
 *   3. User confirms (per chip) which to save.
 *   4. Saved claims persist in `profile_skill_claims` (owner-only) and
 *      survive a page reload.
 *
 * Every visible chip carries the self-declared / not-verified disclaimer
 * via the section's intro copy. No card here may render "verified" or
 * "confirmed" copy — guarded by lib/guards/profile-skill-claims-copy.test.ts.
 */

type PendingItem = {
  /** Stable key for React + dedupe within the pending list. */
  key: string;
  /** Display label, editable. */
  label: string;
};

export function ProfileSkillClaimsSection({
  initialText,
  initialClaims,
}: {
  /** Pre-existing narrative loaded from profiles.profile_text. */
  initialText: string;
  /** Pre-existing saved claims (owner-only). Newest first. */
  initialClaims: ProfileSkillClaimRow[];
}) {
  const t = useTranslations("profileSkillClaims");

  const [savedClaims, setSavedClaims] =
    useState<ProfileSkillClaimRow[]>(initialClaims);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [lastSuggestedAt, setLastSuggestedAt] = useState<number | null>(null);

  const savedNormalizedSet = useMemo(
    () => new Set(savedClaims.map((c) => c.normalized_label)),
    [savedClaims],
  );

  function suggest(text: string) {
    setError(null);
    const next = extractProfileSkillClaims(text);
    setLastSuggestedAt(Date.now());
    // Filter out anything already saved, so we don't show duplicate chips.
    const filtered = next.filter(
      (s: SkillClaimSuggestion) => !savedNormalizedSet.has(s.normalizedLabel),
    );
    // Keep any pending edits the user already made; merge unseen suggestions.
    setPending((prev) => {
      const seen = new Set(prev.map((p) => normalizeClaimLabel(p.label)));
      const merged = [...prev];
      filtered.forEach((s, i) => {
        if (!seen.has(s.normalizedLabel)) {
          merged.push({ key: `sug-${Date.now()}-${i}`, label: s.label });
        }
      });
      return merged;
    });
  }

  function editPending(key: string, nextLabel: string) {
    setPending((prev) =>
      prev.map((p) => (p.key === key ? { ...p, label: nextLabel } : p)),
    );
  }

  function removePending(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }

  function saveAll() {
    setError(null);
    const labels = pending.map((p) => p.label.trim()).filter((l) => l.length > 0);
    if (labels.length === 0) return;
    startSave(() => {
      saveProfileSkillClaimsAction(labels)
        .then((rows) => {
          setSavedClaims(rows);
          setPending([]);
        })
        .catch((e: unknown) => {
          console.error("[profile-skill-claims] save failed", e);
          setError(t("saveError"));
        });
    });
  }

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

  const hasText = initialText.trim().length > 0;
  const showEmptySuggestNotice =
    hasText && lastSuggestedAt !== null && pending.length === 0;

  return (
    <section
      aria-labelledby="profile-skill-claims-title"
      className="card-border flex flex-col gap-4 p-5"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="profile-skill-claims-title"
          className="font-display text-lg font-semibold text-text-primary"
        >
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
        <p
          className="font-mono text-[10px] uppercase tracking-label text-text-muted"
          data-testid="profile-skill-claims-disclaimer"
        >
          {t("disclaimer")}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => suggest(initialText)}
          disabled={!hasText || isSaving}
        >
          {t("suggestButton")}
        </Button>
        {!hasText && (
          <span className="text-xs text-text-secondary">
            {t("needsTextHint")}
          </span>
        )}
      </div>

      {showEmptySuggestNotice && (
        <p className="text-xs text-text-secondary" role="status">
          {t("noNewSuggestions")}
        </p>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
            {t("pendingTitle")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {pending.map((p) => (
              <li
                key={p.key}
                className="flex items-center gap-2 rounded-md border border-ink-500 bg-surface-2 px-2 py-1 text-sm text-text-primary"
              >
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => editPending(p.key, e.target.value)}
                  className="min-w-[10ch] bg-transparent outline-none"
                  aria-label={t("editLabel")}
                />
                <button
                  type="button"
                  onClick={() => removePending(p.key)}
                  className="text-xs text-text-muted hover:text-state-danger"
                  aria-label={t("removeLabel")}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div>
            <Button
              type="button"
              size="sm"
              onClick={saveAll}
              disabled={isSaving || pending.length === 0}
            >
              {isSaving ? t("savingButton") : t("saveButton")}
            </Button>
          </div>
        </div>
      )}

      {savedClaims.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
            {t("savedTitle")}
          </p>
          <ul className="flex flex-wrap gap-2" data-testid="profile-skill-claims-saved">
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
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-state-danger">
          {error}
        </p>
      )}
    </section>
  );
}
