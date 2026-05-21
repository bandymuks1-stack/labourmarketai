"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { createJournalEntry } from "@/lib/journal/actions";

export type JournalEngagement = {
  id: string;
  label: string;
  isPrimary: boolean;
};

const UNIT_SLUGS = ["square_meters", "box_per_day"] as const;

function SubmitButton() {
  const t = useTranslations("journal");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("saving") : t("save")}
    </Button>
  );
}

/** Worker tiler entry form (M1). Structured fields → a structured journal
 *  entry via the createJournalEntry server action (which composes original_text
 *  and writes the hash chain). The form auto-selects the primary engagement. */
export function JournalEntryForm({
  engagements,
}: {
  engagements: JournalEngagement[];
}) {
  const t = useTranslations("journal");
  const tUnit = useTranslations("productivityUnits");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const primaryId =
    engagements.find((e) => e.isPrimary)?.id ?? engagements[0]?.id ?? "";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await createJournalEntry(fd);
        formRef.current?.reset();
      }}
      className="card-border flex flex-col gap-4 p-4 sm:p-6"
    >
      <h3 className="font-display text-lg font-semibold text-text-primary">
        {t("newEntry")}
      </h3>
      <input type="hidden" name="locale" value={locale} />

      <label className="flex flex-col gap-1.5">
        <Label>{t("engagement")}</Label>
        <Select name="engagement_context_id" defaultValue={primaryId} required>
          {engagements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <Label>{t("date")}</Label>
          <Input type="date" name="work_date" defaultValue={today} />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>{t("field.site_name")}</Label>
          <Input name="site_name" required />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <Label>{t("field.tile_type")}</Label>
          <Input name="tile_type" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5">
            <Label>{t("field.area_done")}</Label>
            <Input
              type="number"
              name="area_done"
              min="0"
              step="0.1"
              inputMode="decimal"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>{t("unit")}</Label>
            <Select name="unit_slug" defaultValue="square_meters">
              {UNIT_SLUGS.map((u) => (
                <option key={u} value={u}>
                  {tUnit(u)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <Label>{t("notes")}</Label>
        <textarea
          name="notes"
          rows={3}
          placeholder={t("prompt.tiler")}
          className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
        />
      </label>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
