"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileSkillClaimRow } from "@/lib/profile/profile-skill-claims";
import {
  deleteProfileSkillClaimAction,
  saveProfileSkillClaimsAction,
} from "@/lib/profile/profile-skill-claims-actions";
import { confirmCvWorkHistoryAction } from "@/lib/profile/cv-section-import-actions";
import type {
  EngagementCard,
  SkillDot,
} from "@/components/app/cv-engagement-cards";
import {
  groupSkillsByFunction,
  skillGroupLabelKey,
} from "@/lib/skills/skill-groups";

/**
 * Unified CV / capability surface (replaces the disconnected
 * ProfileSkillClaimsSection card on top + the worker-only
 * CvEngagementCards below).
 *
 * Product rule from PLATFORM_DOCTRINE: a user is never locked into one
 * category. Profile-text-derived self-declared skills belong to the
 * person, not to whichever work category they currently surface in.
 * This component reflects that:
 *
 *   1. The self-declared skill claims render FIRST, as the canonical
 *      "Įgūdžiai" / "Skills" sub-section of the user's capability
 *      profile. Always visible when the user has any saved claims,
 *      regardless of whether they have a worker row.
 *
 *   2. Work history (engagement cards) renders BELOW the skills when the
 *      user has worker engagements — it's a CONTEXT for the capabilities
 *      above, not a gate that hides them.
 *
 *   3. Worker skill dots (worker_skills, confidence-binned) render
 *      inside the primary engagement card as before.
 *
 *   4. The chip list carries ONE plain-language honesty line (the
 *      disclaimer) so the user cannot mistake these for externally
 *      confirmed claims. No "verified" / "confirmed" / "patvirtinta"
 *      wording for these chips, ever — and no system-internal status
 *      fragments ("source: …") either.
 */
export function CapabilityProfileSection({
  claims,
  engagements = [],
  workerSkillDots = [],
  professionIconSlug = null,
}: {
  /** Owner-only `profile_skill_claims` rows, newest first. */
  claims: ProfileSkillClaimRow[];
  /** Worker engagement-context cards. Empty for non-workers. */
  engagements?: EngagementCard[];
  /** Worker_skills confidence dots. Empty for non-workers. */
  workerSkillDots?: SkillDot[];
  /** Worker profession glyph slug. */
  professionIconSlug?: string | null;
}) {
  const t = useTranslations("capabilityProfile");
  const tEng = useTranslations("journal.cv");
  const tRel = useTranslations("relationshipTypes");
  const tGroups = useTranslations();
  const locale = useLocale();

  const router = useRouter();
  const [savedClaims, setSavedClaims] =
    useState<ProfileSkillClaimRow[]>(claims);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [manualLabel, setManualLabel] = useState("");
  const [isAdding, startAdd] = useTransition();

  function removeClaim(id: string) {
    setError(null);
    startDelete(() => {
      deleteProfileSkillClaimAction(id)
        .then(() =>
          setSavedClaims((prev) => prev.filter((c) => c.id !== id)),
        )
        .catch((e: unknown) => {
          console.error("[capability-profile] delete failed", e);
          setError(t("deleteError"));
        });
    });
  }

  // Manual-add path for pilot users (Work Package D1). The extractor
  // remains the primary way to surface chips, but users must be able
  // to add a capability that the dictionary missed without editing
  // their profile text. Save path is identical (same
  // saveProfileSkillClaimsAction → profile_skill_claims), so the
  // honest status posture is preserved.
  function addManual() {
    const label = manualLabel.trim();
    if (label.length === 0) return;
    setError(null);
    startAdd(() => {
      saveProfileSkillClaimsAction([label])
        .then(() => {
          setManualLabel("");
          // router.refresh() re-fetches the server-rendered claims
          // list so the new chip appears in this section without a
          // page reload. The UNIQUE (profile_id, normalized_label)
          // constraint + `ignoreDuplicates: true` in the server
          // action handle the no-duplicate guarantee for us.
          router.refresh();
        })
        .catch((e: unknown) => {
          console.error("[capability-profile] add failed", e);
          setError(t("addError"));
        });
    });
  }

  // ── Manual work-experience entry (Worker Launch Readiness v1) ─────────────
  // A worker WITHOUT a CV file had no way to type a job + month/year period —
  // work history could only arrive from a CV import or the journal. This small
  // form writes through the SAME already-applied canonical RPC the CV import
  // uses (save_self_declared_work_history_v1, via confirmCvWorkHistoryAction),
  // so it is a pure UI wrapper — no new table, no new RPC, no migration.
  const [expTitle, setExpTitle] = useState("");
  const [expStartYear, setExpStartYear] = useState("");
  const [expStartMonth, setExpStartMonth] = useState("");
  const [expEndYear, setExpEndYear] = useState("");
  const [expEndMonth, setExpEndMonth] = useState("");
  const [expCurrent, setExpCurrent] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);
  const [isSavingExp, startSaveExp] = useTransition();

  function toYear(v: string): number | null {
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
  }
  function toMonth(v: string): number | null {
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
  }

  function addExperience() {
    const title = expTitle.trim();
    setExpError(null);
    if (title.length < 3) {
      setExpError(t("expInvalid"));
      return;
    }
    const startYear = toYear(expStartYear);
    if (startYear === null) {
      setExpError(t("expInvalid"));
      return;
    }
    const endYear = expCurrent ? null : toYear(expEndYear);
    if (!expCurrent && endYear === null) {
      setExpError(t("expInvalid"));
      return;
    }
    const startPart = { year: startYear, month: toMonth(expStartMonth), day: null };
    const endPart = expCurrent
      ? null
      : { year: endYear as number, month: toMonth(expEndMonth), day: null };
    startSaveExp(() => {
      confirmCvWorkHistoryAction({
        title,
        startYear,
        endYear,
        start: startPart,
        end: endPart,
        isCurrent: expCurrent,
      })
        .then((res) => {
          if (res.ok) {
            setExpTitle("");
            setExpStartYear("");
            setExpStartMonth("");
            setExpEndYear("");
            setExpEndMonth("");
            setExpCurrent(false);
            router.refresh();
          } else if (res.code === "needs_migration") {
            setExpError(t("expNeedsMigration"));
          } else if (res.code === "invalid") {
            setExpError(t("expInvalid"));
          } else {
            setExpError(t("expError"));
          }
        })
        .catch((e: unknown) => {
          console.error("[capability-profile] add experience failed", e);
          setExpError(t("expError"));
        });
    });
  }

  const hasClaims = savedClaims.length > 0;
  const hasEngagements = engagements.length > 0;
  // Always render — the manual-add form needs to be available even
  // when the user has no claims yet. The original "return null when
  // empty" preserved the slim-display invariant but blocked manual
  // entry; the form's small footprint is acceptable to always show.

  const fmt = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
        })
      : null;
  const hasProfIcon = professionIconSlug
    ? PROFESSION_ICON_SLUGS.has(professionIconSlug)
    : false;

  return (
    <section
      aria-labelledby="capability-profile-title"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="capability-profile-title"
          className="font-display text-lg font-semibold text-text-primary"
        >
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Manual-add row — always rendered when the user has any saved
          claims OR when they're going to use this surface as a manual
          entry point. The form sits ABOVE the chip list for keyboard
          flow: type label, press Enter or click Pridėti, the new chip
          appears below. */}
      <form
        className="card-border flex flex-wrap items-end gap-2 p-3"
        data-testid="capability-profile-manual-add"
        onSubmit={(e) => {
          e.preventDefault();
          addManual();
        }}
      >
        <label className="flex flex-1 min-w-[10rem] flex-col gap-1">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("manualAddLabel")}
          </span>
          <input
            type="text"
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            placeholder={t("manualAddPlaceholder")}
            className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            data-testid="capability-profile-manual-input"
            disabled={isAdding}
            maxLength={80}
          />
        </label>
        <button
          type="submit"
          disabled={isAdding || manualLabel.trim().length === 0}
          className="rounded-md border border-state-success/40 bg-state-success/5 px-3 py-2 text-sm font-semibold text-state-success hover:border-state-success disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="capability-profile-manual-add-button"
        >
          {isAdding ? t("manualAdding") : t("manualAddButton")}
        </button>
      </form>

      {hasClaims && (
        <div
          className="card-border flex flex-col gap-3 p-4"
          data-testid="capability-profile-self-declared"
        >
          <header className="flex flex-col gap-1">
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {t("skillsTitle")}
            </h3>
            {/* ONE plain-language honesty line (human-first profile pass).
                The old triple status chain ("Laukia peržiūros · Dar
                nepagrįsta darbo įrašais · Šaltinis: profilio tekstas") read
                like system internals; the single disclaimer sentence carries
                the same honest meaning in human words. */}
            <p className="text-xs text-text-secondary">{t("disclaimer")}</p>
          </header>
          <ul
            className="flex flex-wrap gap-2"
            data-testid="capability-profile-claims"
          >
            {savedClaims.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-md border border-state-success/40 bg-state-success/5 px-2 py-1 text-sm text-text-primary"
              >
                <span>{c.label}</span>
                <button
                  type="button"
                  onClick={() => removeClaim(c.id)}
                  disabled={isDeleting}
                  className="text-xs text-text-muted hover:text-state-danger"
                  aria-label={t("removeLabel")}
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
        </div>
      )}

      {hasEngagements && (
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {t("experienceTitle")}
          </h3>
          <ul className="flex flex-col gap-3">
            {engagements.map((c) => {
              const start = fmt(c.startedAt);
              const end = c.endedAt ? fmt(c.endedAt) : tEng("present");
              return (
                <li key={c.id} className="card-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-sm font-semibold text-text-primary">
                        {hasProfIcon && (
                          <Wrench
                            aria-hidden
                            strokeWidth={1.75}
                            className="mr-1.5 inline h-3.5 w-3.5 text-text-muted"
                          />
                        )}
                        {c.orgName}
                      </p>
                      <p className="mt-0.5 text-meta text-text-secondary">
                        {tRel(c.relationship)}
                        {c.title ? ` · ${c.title}` : ""}
                      </p>
                    </div>
                    {c.isPrimary && (
                      <span className="flex-none rounded-sm px-1 font-mono text-meta uppercase tracking-label text-brand-orange">
                        {tEng("primary")}
                      </span>
                    )}
                  </div>
                  {start && (
                    <p className="mt-1 font-mono text-meta uppercase tracking-label text-text-muted">
                      {start} — {end}
                    </p>
                  )}

                  {/* Worker skill dots — grouped by functional taxonomy
                      (systemic-ux-skills-v1) so a profession, a specific task
                      skill, a general ability and a business ability are no
                      longer dumped in one flat list. */}
                  {c.isPrimary && workerSkillDots.length > 0 && (
                    <div
                      className="mt-3 flex flex-col gap-3 border-t border-ink-600 pt-3"
                      data-testid="capability-worker-skill-groups"
                    >
                      {groupSkillsByFunction(workerSkillDots).map(
                        ({ group, items }) => (
                          <div key={group} className="flex flex-col gap-1.5">
                            <p
                              className="font-mono text-meta uppercase tracking-label text-text-muted"
                              data-skill-group={group}
                            >
                              {tGroups(skillGroupLabelKey(group))}
                            </p>
                            <ul className="flex flex-col gap-1.5">
                              {items.map((s) => (
                                <li
                                  key={s.slug}
                                  className="flex items-center justify-between gap-2 text-sm text-text-primary"
                                >
                                  <span className="flex items-center gap-2">
                                    <span
                                      aria-hidden
                                      className={cn(
                                        "inline-block size-2 flex-none rounded-full",
                                        BIN_DOT[s.bin] ?? "bg-ink-500",
                                      )}
                                    />
                                    {s.name}
                                  </span>
                                  {s.isCore && (
                                    <span className="flex-none rounded-sm px-1 font-mono text-meta uppercase tracking-label text-brand-orange">
                                      {tEng("primary")}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Manual work-experience entry — always available so a worker with no
          CV file can still record a job with a month/year period. Writes via
          the same canonical RPC as the CV import (no migration). */}
      <details className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-1/40">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary">
          <span aria-hidden>+</span>
          {t("addExperienceTitle")}
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3" data-testid="add-experience-form">
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {t("expTitleLabel")}
            <input
              type="text"
              value={expTitle}
              maxLength={200}
              onChange={(e) => setExpTitle(e.target.value)}
              placeholder={t("expTitlePlaceholder")}
              data-testid="add-experience-title"
              className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-1 flex-col gap-1 text-meta text-text-muted">
              {t("expStartLabel")}
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  value={expStartMonth}
                  onChange={(e) => setExpStartMonth(e.target.value)}
                  placeholder={t("expMonthPlaceholder")}
                  aria-label={t("expStartLabel")}
                  className="w-16 rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={2100}
                  value={expStartYear}
                  onChange={(e) => setExpStartYear(e.target.value)}
                  placeholder={t("expYearPlaceholder")}
                  aria-label={t("expStartLabel")}
                  className="w-24 rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                />
              </div>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-meta text-text-muted">
              {t("expEndLabel")}
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  value={expEndMonth}
                  disabled={expCurrent}
                  onChange={(e) => setExpEndMonth(e.target.value)}
                  placeholder={t("expMonthPlaceholder")}
                  aria-label={t("expEndLabel")}
                  className="w-16 rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue disabled:opacity-40"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={2100}
                  value={expEndYear}
                  disabled={expCurrent}
                  onChange={(e) => setExpEndYear(e.target.value)}
                  placeholder={t("expYearPlaceholder")}
                  aria-label={t("expEndLabel")}
                  className="w-24 rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue disabled:opacity-40"
                />
              </div>
            </label>
          </div>
          <label className="flex items-center gap-2 text-meta text-text-secondary">
            <input
              type="checkbox"
              checked={expCurrent}
              onChange={(e) => setExpCurrent(e.target.checked)}
              data-testid="add-experience-current"
            />
            {t("expOngoing")}
          </label>
          {expError && (
            <p role="alert" className="text-xs text-state-danger">
              {expError}
            </p>
          )}
          <button
            type="button"
            disabled={isSavingExp}
            onClick={addExperience}
            data-testid="add-experience-save"
            className="w-fit rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-1.5 text-xs font-semibold text-brand-blue hover:border-brand-blue disabled:opacity-50"
          >
            {isSavingExp ? t("expSaving") : t("expSave")}
          </button>
        </div>
      </details>
    </section>
  );
}

// Reusing the worker-CV bin colour map. The constants are tiny and live
// only in CvEngagementCards today; copying keeps the new component
// self-contained without an extra import cycle. Source of truth still
// lives next to the worker CV component.
const BIN_DOT: Record<string, string> = {
  red: "bg-state-danger",
  green: "bg-state-success",
  yellow: "bg-state-warning",
};

// Profession/skill icon slugs the M1 registry recognises. Rendered as a
// neutral lucide outline icon (no emoji); a richer asset set is M3.
const PROFESSION_ICON_SLUGS = new Set<string>(["icon.tile"]);
