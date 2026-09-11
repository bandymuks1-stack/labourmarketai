"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  MODULE_VALUE_MAX_LENGTH,
  moduleGroupsForRelationship,
  type ModuleFieldValues,
} from "@/lib/journal/journal-module-fields";

/**
 * ARCHETYPE MODULE FIELDS (owner §12) — the ONE block both journal editors
 * render behind their existing "more" disclosure. Which fields appear is
 * decided by the entry's ENGAGEMENT relationship through `composeJournal`:
 * a placement (`student`) shows supervision level / competency practised /
 * learning outcome; volunteering shows the field-project modules; an
 * employee context composes nothing today, so this renders nothing — no
 * generic form, no "nothing found" box (honest absence).
 *
 * Every field is one `journal_entry_metrics` row of the person's own text;
 * the server accepts a slug only when the engagement's own composition
 * allows it. The person never sees archetype or module vocabulary — group
 * and field names are plain words from `journal.moduleFields`.
 */
export function JournalModuleFields({
  relationshipSlug,
  values,
  onChange,
  testId = "journal-module-fields",
}: {
  /** The selected engagement's relationship (`student`, `volunteer`, …). */
  relationshipSlug: string | null | undefined;
  values: ModuleFieldValues;
  onChange: (next: ModuleFieldValues) => void;
  testId?: string;
}) {
  const t = useTranslations("journal.moduleFields");
  const groups = useMemo(
    () => moduleGroupsForRelationship(relationshipSlug),
    [relationshipSlug],
  );
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-text-secondary">{t("title")}</p>
        <p className="text-meta leading-relaxed text-text-muted">{t("hint")}</p>
      </div>
      {groups.map((g) => (
        <div
          key={g.moduleId}
          className="flex flex-col gap-2"
          data-testid={`${testId}-${g.moduleId}`}
        >
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`modules.${g.moduleId}`)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.slugs.map((slug) => (
              <label key={slug} className="flex flex-col gap-1.5">
                <Label>{t(`fields.${slug}`)}</Label>
                <Input
                  type="text"
                  value={values[slug] ?? ""}
                  maxLength={MODULE_VALUE_MAX_LENGTH}
                  data-testid={`${testId}-${slug}`}
                  onChange={(e) =>
                    onChange({ ...values, [slug]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
