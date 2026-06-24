"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { setJournalEntrySkillLinks } from "@/lib/journal/journal-entry-skills-actions";

/**
 * Per-entry skill-link control (Journal Entry ↔ Skill links v1).
 *
 * Lets the worker mark which of their OWN declared skills a work-journal entry
 * supports. Honest framing: this is EVIDENCE-SUPPORT the worker asserts — not
 * verification, confirmation, or certification. Toggling a chip persists the
 * durable link via the owner-scoped server action; a status/alert surface
 * announces the save result (no silent write).
 */
export function JournalEntrySkillLinks({
  entryId,
  availableSkills,
  linkedSkillIds,
}: {
  entryId: string;
  availableSkills: { id: string; name: string }[];
  linkedSkillIds: string[];
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

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setStatus("saving");
    startTransition(async () => {
      const res = await setJournalEntrySkillLinks(entryId, [...next]);
      setStatus(res.ok ? "saved" : "error");
    });
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
        {/* Default: only skills linked to THIS entry. Picker open: all profile
            skills (so the worker can link more). Never a profile-wide chip wall
            on an unrelated entry. */}
        {(picker ? availableSkills : availableSkills.filter((s) => selected.has(s.id))).map(
          (s) => {
            const on = selected.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  disabled={pending}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50",
                    on
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-ink-500 text-text-secondary hover:border-text-muted",
                  )}
                  data-testid={`entry-skill-toggle-${entryId}-${s.id}`}
                >
                  {on ? "✓ " : ""}
                  {s.name}
                </button>
              </li>
            );
          },
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
    </div>
  );
}
