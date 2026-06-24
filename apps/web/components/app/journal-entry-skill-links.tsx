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
}: {
  entryId: string;
  availableSkills: { id: string; name: string }[];
  linkedSkillIds: string[];
  /** Per-entry honest source for each linked skill id. Missing → treated as an
   *  honest manual link (never auto-flagged). */
  skillSources?: Record<string, EntrySkillSource>;
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

  if (availableSkills.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-text-muted">
        {t("none")}{" "}
        <Link
          href="/dashboard/profile"
          className="text-brand-blue hover:text-brand-cyan"
        >
          {t("profileLink")} →
        </Link>
      </p>
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
        {/* Clean current evidence: recognized-from-text / confirmed / honest
            manual links. Plus the picker (all profile skills) when opened. */}
        {(picker ? availableSkills : cleanChips).map((s) =>
          chip(s, picker && !selected.has(s.id) ? "off" : "on"),
        )}
        {/* Disclosure to open/close the full profile-skill picker. */}
        {(availableSkills.some((s) => !selected.has(s.id)) || picker) && (
          <li>
            <button
              type="button"
              onClick={() => setPicker((v) => !v)}
              className="rounded-full border border-dashed border-ink-500 px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:border-text-secondary hover:text-text-secondary"
              data-testid={`entry-skill-picker-toggle-${entryId}`}
              aria-expanded={picker}
            >
              {picker ? t("linkDone") : t("linkMore")}
            </button>
          </li>
        )}
      </ul>

      {/* Review bucket: linked skills the entry text does not support. Compact,
          amber, and explicitly NOT presented as clean current evidence. */}
      {reviewChips.length > 0 && (
        <div
          className="mt-1 flex flex-col gap-1.5 rounded-md border border-state-warning/30 bg-state-warning/5 p-2"
          data-testid={`entry-skill-review-${entryId}`}
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
            {t("reviewHeading")}
          </p>
          <p className="text-[10px] leading-relaxed text-text-muted">
            {t("reviewHelper")}
          </p>
          <ul className="flex flex-wrap gap-1">
            {reviewChips.map((s) => chip(s, "review"))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
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
