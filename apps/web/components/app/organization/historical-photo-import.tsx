import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { readPhotoAnchorChoices } from "@/lib/organization-evidence/evidence-media-anchors";
import { EVIDENCE_MEDIA_ACTION_MAX_BYTES } from "@/lib/organization-evidence/evidence-media-model";
import {
  HistoricalPhotoImportForm,
  type HistoricalPhotoImportLabels,
} from "./historical-photo-import-form";

/**
 * HISTORICAL PHOTOS - the import door's photo step.
 *
 * Next to the record/hours import: a manager attaches the source image files an
 * organization holds to a STATED anchor (an evidence record, a place, a roster
 * person, or the organization itself). Provenance is the source system the
 * manager names plus the file name as supplied; a photo date is stored only
 * with the basis it came from, otherwise it is unknown. Nothing is matched by
 * date proximity and no photo is ever created or described by the system.
 *
 * Honest states: a failed read of the anchor lists is said (`unavailable`),
 * never an empty form; a caller with no active organization sees nothing.
 */
export async function HistoricalPhotoImport() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const t = await getTranslations("evidenceMedia.import");
  const choices = await readPhotoAnchorChoices({ supabase, userId: user.id, locale: undefined });
  if (choices.kind === "hidden") return null;

  const heading = (
    <header className="flex flex-col gap-1">
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
    </header>
  );

  if (choices.kind === "unavailable") {
    return (
      <section className="flex flex-col gap-2" data-testid="historical-photo-import" data-status="unavailable">
        {heading}
        <p className="text-meta leading-relaxed text-text-muted" data-testid="historical-photo-import-unavailable">
          {t("unavailable")}
        </p>
      </section>
    );
  }

  const maxMb = String(EVIDENCE_MEDIA_ACTION_MAX_BYTES / (1024 * 1024));
  const refusalCodes = [
    "invalid",
    "no_anchor",
    "bad_date",
    "unsupported_type",
    "file_too_large",
    "anchor_not_found",
    "needs_migration",
    "not_allowed",
    "error",
  ] as const;
  const labels: HistoricalPhotoImportLabels = {
    anchorKind: t("anchorKind"),
    kinds: {
      record: t("kind.record"),
      place: t("kind.place"),
      person: t("kind.person"),
      organization: t("kind.organization"),
    },
    chooseAnchor: { record: t("choose.record"), place: t("choose.place"), person: t("choose.person") },
    noChoices: { record: t("none.record"), place: t("none.place"), person: t("none.person") },
    truncated: t("truncated"),
    sourceSystem: t("sourceSystem"),
    sourceSystemHint: t("sourceSystemHint"),
    sourceReference: t("sourceReference"),
    files: t("files"),
    filesHint: t("filesHint", { mb: maxMb }),
    date: t("date"),
    dateHint: t("dateHint"),
    basis: t("basis"),
    bases: {
      organization_stated: t("bases.organization_stated"),
      source_metadata: t("bases.source_metadata"),
      exif: t("bases.exif"),
    },
    caption: t("caption"),
    submit: t("submit"),
    working: t("working"),
    resultTitle: t("resultTitle"),
    registered: t("registered"),
    duplicate: t("duplicate"),
    refusals: Object.fromEntries(refusalCodes.map((c) => [c, t(`refusal.${c}`, { mb: maxMb })])),
    tooLarge: t("refusal.file_too_large", { mb: maxMb }),
    dateNeedsBasis: t("refusal.bad_date", { mb: maxMb }),
    pickAnchor: t("refusal.no_anchor", { mb: maxMb }),
  };

  return (
    <section className="flex flex-col gap-3" data-testid="historical-photo-import" data-status="ready">
      {heading}
      <HistoricalPhotoImportForm
        labels={labels}
        choices={{ record: choices.records, place: choices.places, person: choices.people }}
        truncated={{
          record: choices.truncated.records,
          place: choices.truncated.places,
          person: choices.truncated.people,
        }}
      />
    </section>
  );
}
