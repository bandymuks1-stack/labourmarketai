"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getWorkerCriteriaSnapshot } from "./worker-activity";
import {
  missingImportantCriteria,
  presentCriteria,
  type CriteriaLine,
  type CriteriaResult,
  type WorkCardPrefillResult,
} from "./criteria-summary-contract";
import { workCardPrefillFromCard } from "./worker-forms";

/**
 * W6: the `worker.save-work-card` form opens PREFILLED from the card the
 * person already has — the same canonical snapshot the criteria answer reads
 * (one owner of worker-table reads), mapped by the pure `workCardPrefillFromCard`.
 * Measured on production (#1579): the plain chips opened the form empty, and
 * `preferred_countries` is saved as a whole list, so a person adding one
 * country replaced the others. A failed read is returned as a NAMED state.
 */
export async function loadWorkCardPrefillForChat(): Promise<WorkCardPrefillResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unavailable", reason: "not_authed" };
  const snapshot = await getWorkerCriteriaSnapshot(user.id);
  if (!snapshot) return { kind: "unavailable", reason: "no_worker" };
  return { kind: "prefill", values: workCardPrefillFromCard(snapshot) };
}

/**
 * "Kokie kriterijai pas mane nurodyti?" — a REAL readback of the worker's own
 * persisted search criteria, from the same canonical columns the matching
 * engine consumes. The table reads live in the ONE canonical worker read model
 * (`worker-activity.ts` / `getWorkerCriteriaSnapshot`) — this module only
 * localizes. Nothing is reported that matching does not use, and nothing is
 * invented: an unset field is named as missing, never defaulted.
 */
export async function loadCriteriaSummaryForChat(): Promise<CriteriaResult> {
  const t = await getTranslations("conversation.criteria");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "blocked", message: t("blockedNoWorker") };

  const snapshot = await getWorkerCriteriaSnapshot(user.id);
  if (!snapshot) return { kind: "blocked", message: t("blockedNoWorker") };

  const locale = await getLocale();
  const present = presentCriteria(snapshot);
  const tlm = await getTranslations("labourMarket");

  const countryName = (code: string): string =>
    tlm.has(`countryNames.${code}`) ? (tlm(`countryNames.${code}`) as string) : code;
  const languageName = (code: string): string => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  const lines: CriteriaLine[] = [];
  if (present.skills)
    lines.push({ key: "skills", label: t("factSkills"), value: t("skillsCount", { count: snapshot.skillsCount }) });
  if (present.languages)
    lines.push({ key: "languages", label: t("factLanguages"), value: snapshot.languages.map(languageName).join(", ") });
  if (present.countries)
    lines.push({ key: "countries", label: t("factCountries"), value: snapshot.preferredCountries.map(countryName).join(", ") });
  if (present.salary) {
    const min = snapshot.salaryMinEur;
    const max = snapshot.salaryMaxEur;
    const value =
      min != null && max != null
        ? t("salaryRange", { min, max })
        : min != null
          ? t("salaryFrom", { min })
          : t("salaryTo", { max: max as number });
    lines.push({ key: "salary", label: t("factSalary"), value });
  }
  if (present.availability)
    lines.push({
      key: "availability",
      label: t("factAvailability"),
      value: t.has(`availability.${snapshot.availabilityStatus}`)
        ? (t(`availability.${snapshot.availabilityStatus}`) as string)
        : (snapshot.availabilityStatus as string),
    });
  if (present.start)
    lines.push({ key: "start", label: t("factStart"), value: snapshot.availableFrom as string });
  if (present.relocate)
    lines.push({
      key: "relocate",
      label: t("factRelocate"),
      value: snapshot.willingToRelocate ? t("yes") : t("no"),
    });
  if (present.contract)
    lines.push({
      key: "contract",
      label: t("factContract"),
      value: snapshot.preferredContractType as string,
    });
  if (present.documents)
    lines.push({ key: "documents", label: t("factDocuments"), value: t("documentsCount", { count: snapshot.documentsCount }) });

  const missingKeys = missingImportantCriteria(snapshot);
  const missing = missingKeys.map((k) => t(`missing.${k}`));

  return {
    kind: "criteria",
    intro: lines.length === 0 ? t("introEmpty") : t("intro"),
    lines,
    missing,
    missingIntro: missing.length > 0 ? t("missingIntro") : null,
  };
}
