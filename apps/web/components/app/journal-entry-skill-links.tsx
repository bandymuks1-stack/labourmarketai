"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { setJournalEntrySkillLinks } from "@/lib/journal/journal-entry-skills-actions";
import {
  needsReview,
  type EntrySkillSource,
} from "@/lib/journal/entry-skill-source";

/**
 * Per-entry skill-link control (Journal Entry ↔ Skill links v1 + stale-skill
 * review state, PR B).
 *
 * Lets the worker mark which of their OWN declared skills a work-journal entry
 * supports. Honest framing: this is EVIDENCE-SUPPORT the worker asserts — not
 * verification. Each linked chip carries an honest SOURCE (recognized from the
 * entry text / confirmed / manually linked). A linked skill the recognizer knows
 * but the entry text does NOT support is shown separately under "Reikia
 * peržiūrėti" — never as clean current evidence — with safe review actions. No
 * link is ever removed without an explicit worker click.
 */
// CV-friendly: a linked skill in the worker's CV needs NO provenance label —
// only a real confirmation is worth surfacing ("Patvirtinta"). The technical
// recognized/manual distinction stays internal (audit/classifier), never shown.
const SOURCE_LABEL_KEY: Record<EntrySkillSource, string | null> = {
  recognized_from_text: null,
  confirmed_by_person: "source.confirmed",
  manually_linked_to_entry: null,
  stale_needs_review: null, // rendered in the review group, not as a clean chip
  profile_skill_available_to_link: null,
};

export function JournalEntrySkillLinks({
  entryId,
  availableSkills,
  linkedSkillIds,
  skillSources,
  detected,
}: {
  entryId: string;
  availableSkills: { id: string; name: string }[];
  linkedSkillIds: string[];
  /** Per-entry honest source for each linked skill id. Missing → treated as an
   *  honest manual link (never auto-flagged). */
  skillSources?: Record<string, EntrySkillSource>;
  /** Render-time detected signals grounded in THIS entry's text (computed by
   *  the server page from the same pure recognition pipeline the composer
   *  uses — no DB write, no auto-attach). `skills` are detected skills the
   *  worker has DECLARED (linkable in place via the existing chip toggle);
   *  `labels` are display-only detected capability labels. Suggestions only,
   *  never facts. Omitted → the detected section is not rendered. */
  detected?: { skills: { id: string; name: string }[]; labels: string[] };
}) {
  const t = useTranslations("journalSkillLinks");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(linkedSkillIds),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [pending, startTransition] = useTransition();
  // Show ONLY the skills the worker explicitly linked to THIS entry by default
  // (grounded in the entry). The full profile-skill picker is opt-in behind a
  // disclosure — otherwise every entry card showed the worker's whole profile
  // skill set (e.g. a construction worker's chips on a dog-walking entry).
  const [picker, setPicker] = useState(false);
  // Stale links the entry text no longer supports stay COLLAPSED by default:
  // an old entry must not visibly show unrelated chips (owner mobile review —
  // a web-design entry still showed eight construction skills). We surface only
  // an honest one-line summary + a clean-up action; the actual chips expand on
  // request. No DB mutation — the links remain until the worker unlinks them.
  const [reviewOpen, setReviewOpen] = useState(false);

  const sourceOf = (id: string): EntrySkillSource =>
    skillSources?.[id] ?? "manually_linked_to_entry";

  // Linked chips split into clean evidence vs. the review bucket. Derived from
  // the live `selected` set so unlinking moves a chip out of review immediately.
  const linkedSelected = useMemo(
    () => availableSkills.filter((s) => selected.has(s.id)),
    [availableSkills, selected],
  );
  const reviewChips = linkedSelected.filter((s) => needsReview(sourceOf(s.id)));
  const cleanChips = linkedSelected.filter((s) => !needsReview(sourceOf(s.id)));

  // Section A (detected from THIS entry's text) — derived, display-only.
  // Detected+declared skills already linked render in the linked list above
  // (user-chosen facts), so they are filtered out here; detected labels that
  // duplicate a visible chip name are dropped too. Never auto-attached.
  const detectedLinkable = (detected?.skills ?? []).filter(
    (s) => !selected.has(s.id),
  );
  const linkedNames = new Set(linkedSelected.map((s) => s.name));
  const detectedLabels = (detected?.labels ?? []).filter(
    (l) => !linkedNames.has(l) && !detectedLinkable.some((s) => s.name === l),
  );
  const hasDetected = detectedLinkable.length > 0 || detectedLabels.length > 0;

  if (availableSkills.length === 0) {
    return (
      <div className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">
        {detected && (
          <div
            className="flex flex-col gap-1"
            data-testid={`entry-skill-detected-${entryId}`}
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
              {t("detectedHeading")}
            </p>
            {detectedLabels.length > 0 ? (
              <ul className="flex flex-wrap gap-1">
                {detectedLabels.map((label) => (
                  <li key={label}>
                    <span
                      className="inline-block rounded-full border border-ink-500/70 px-2 py-0.5 text-[10px] text-text-secondary"
                      data-testid={`entry-skill-detected-label-${entryId}`}
                    >
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="text-[10px] leading-relaxed text-text-muted"
                data-testid={`entry-skill-detected-empty-${entryId}`}
              >
                {t("detectedEmpty")}
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] text-text-muted">
          {t("none")}{" "}
          <Link
            href="/dashboard/profile"
            className="text-brand-blue hover:text-brand-cyan"
          >
            {t("profileLink")} →
          </Link>
        </p>
      </div>
    );
  }

  function persist(next: Set<string>) {
    setSelected(new Set(next));
    setStatus("saving");
    startTransition(async () => {
      const res = await setJournalEntrySkillLinks(entryId, [...next]);
      setStatus(res.ok ? "saved" : "error");
    });
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persist(next);
  }

  function unlinkFlagged() {
    const next = new Set(selected);
    for (const c of reviewChips) next.delete(c.id);
    persist(next);
  }

  function chip(s: { id: string; name: string }, tone: "on" | "off" | "review") {
    const on = selected.has(s.id);
    const labelKey = SOURCE_LABEL_KEY[sourceOf(s.id)];
    return (
      <li key={s.id}>
        <button
          type="button"
          onClick={() => toggle(s.id)}
          disabled={pending}
          aria-pressed={on}
          title={labelKey ? t(labelKey) : undefined}
          data-source={sourceOf(s.id)}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50",
            tone === "review"
              ? "border-state-warning/60 bg-state-warning/10 text-state-warning hover:border-state-warning"
              : on
                ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                : "border-ink-500 text-text-secondary hover:border-text-muted",
          )}
          data-testid={`entry-skill-toggle-${entryId}-${s.id}`}
        >
          {tone === "review" ? "⚠ " : on ? "✓ " : ""}
          {s.name}
        </button>
      </li>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">
      <p className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
        {t("signalsHeading")}
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] leading-relaxed text-text-muted">{t("helper")}</p>
        {status === "error" ? (
          <span className="shrink-0 text-[10px] text-state-danger" role="alert">
            {t("error")}
          </span>
        ) : status !== "idle" ? (
          <span className="shrink-0 text-[10px] text-text-muted" role="status">
            {status === "saving" ? t("saving") : t("saved")}
          </span>
        ) : null}
      </div>

      <ul className="flex flex-wrap gap-1" data-testid={`entry-skill-links-${entryId}`}>
        {/* Clean current evidence ONLY: recognized-from-text / confirmed /
            honest manual links. The full profile-skill catalogue renders in
            its own labelled section below — never inside this chip list, so a
            profile skill can't read as detected from this entry. */}
        {cleanChips.map((s) => chip(s, "on"))}
      </ul>

      {/* SECTION A — skills detected from THIS entry's text at render time
          (same pure recognition pipeline as the composer; no DB write, no
          auto-attach). Detected skills the worker has DECLARED reuse the
          existing link-toggle chip; other detected labels are display-only
          suggestions. Honest empty state when nothing is confidently
          detected — the profile catalogue must NEVER stand in for this. */}
      {detected && (
        <div
          className="flex flex-col gap-1"
          data-testid={`entry-skill-detected-${entryId}`}
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
            {t("detectedHeading")}
          </p>
          {hasDetected ? (
            <ul className="flex flex-wrap gap-1">
              {detectedLinkable.map((s) => chip(s, "off"))}
              {detectedLabels.map((label) => (
                <li key={label}>
                  <span
                    className="inline-block rounded-full border border-ink-500/70 px-2 py-0.5 text-[10px] text-text-secondary"
                    data-testid={`entry-skill-detected-label-${entryId}`}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="text-[10px] leading-relaxed text-text-muted"
              data-testid={`entry-skill-detected-empty-${entryId}`}
            >
              {t("detectedEmpty")}
            </p>
          )}
        </div>
      )}

      {/* SECTION B — manual profile-skill picker, COLLAPSED by default. The
          disclosure button names the section honestly ("Pasirinkti iš mano
          profilio įgūdžių"), rendered OUTSIDE the chip lists as a plain text
          action — a UI control must not look like a skill chip (owner P0:
          the "Baigta" chip). Historical profile skills render ONLY after the
          worker opens this picker. */}
      {(availableSkills.some((s) => !selected.has(s.id)) || picker) && (
        <button
          type="button"
          onClick={() => setPicker((v) => !v)}
          className="self-start font-mono text-[10px] uppercase tracking-label text-text-muted transition-colors hover:text-text-secondary"
          data-testid={`entry-skill-picker-toggle-${entryId}`}
          aria-expanded={picker}
        >
          {picker ? t("linkDone") : t("linkMore")}
        </button>
      )}

      {/* Manual-association picker (open state): the worker's OWN profile
          skills (their whole catalogue), for optional hand-linking to this
          entry. Explicitly labelled so it is never mistaken for skills
          detected in this entry. Chips already linked stay in the clean list
          above. */}
      {picker && (
        <div
          className="flex flex-col gap-1"
          data-testid={`entry-skill-picker-${entryId}`}
        >
          <p className="text-[10px] leading-relaxed text-text-muted">
            {t("pickerHint")}
          </p>
          <ul className="flex flex-wrap gap-1">
            {availableSkills
              .filter((s) => !selected.has(s.id))
              .map((s) => chip(s, "off"))}
          </ul>
        </div>
      )}

      {/* Review bucket: linked skills the entry text does not support. COLLAPSED
          by default — only an honest summary + clean-up action show, so stale
          unrelated chips are never presented as this entry's skills. The chips
          themselves expand on request. Amber, and explicitly NOT clean evidence. */}
      {reviewChips.length > 0 && (
        <div
          className="mt-1 flex flex-col gap-1.5 rounded-md border border-state-warning/30 bg-state-warning/5 p-2"
          data-testid={`entry-skill-review-${entryId}`}
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
            {t("reviewHeading")}
          </p>
          <p
            className="text-[10px] leading-relaxed text-text-muted"
            data-testid={`entry-skill-review-summary-${entryId}`}
          >
            {t("reviewSummary", { count: reviewChips.length })}
          </p>
          {reviewOpen && (
            <ul className="flex flex-wrap gap-1">
              {reviewChips.map((s) => chip(s, "review"))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            <button
              type="button"
              onClick={() => setReviewOpen((v) => !v)}
              className="font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-text-secondary"
              data-testid={`entry-skill-review-toggle-${entryId}`}
              aria-expanded={reviewOpen}
            >
              {reviewOpen ? t("reviewHide") : t("reviewShow")}
            </button>
            <Link
              href={`/dashboard/journal?editing=${entryId}#journal-composer`}
              className="font-mono text-[10px] uppercase tracking-label text-brand-blue hover:text-brand-cyan"
              data-testid={`entry-skill-review-again-${entryId}`}
            >
              {t("reviewAgain")}
            </Link>
            <button
              type="button"
              onClick={unlinkFlagged}
              disabled={pending}
              className="font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-state-danger disabled:opacity-50"
              data-testid={`entry-skill-unlink-flagged-${entryId}`}
            >
              {t("unlinkFlagged")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
