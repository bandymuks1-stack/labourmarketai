import {
  WORKER_LANGUAGES,
  WORKER_LANGUAGE_LEVELS,
  WORKER_LANGUAGE_NATIVE_NAMES,
} from "@/lib/worker/worker-languages-model";
import { EDUCATION_TYPE_SLUGS } from "@/lib/worker/worker-education-model";

/**
 * Declarative inline-form specs for the reversible worker conversation actions
 * (Phase B). Each spec maps a small set of deterministic fields to the exact
 * typed input its zod schema + executor expect. Pure/client-safe (no IO, no
 * LLM) so the conversation surface can render a structured form — never a bare
 * free-text box — for every profile-building action, and works with AI OFF.
 */

export type FieldSpec =
  | { name: string; kind: "text" | "textarea"; labelKey: string; placeholderKey?: string; required?: boolean; maxLength?: number }
  | { name: string; kind: "number"; labelKey: string; placeholderKey?: string; min?: number; max?: number; required?: boolean }
  | { name: string; kind: "select"; labelKey: string; required?: boolean; options: ReadonlyArray<{ value: string; label?: string; labelKey?: string }> }
  | { name: string; kind: "tristate"; labelKey: string }
  | { name: string; kind: "checkbox"; labelKey: string };

export type FormState = Record<string, string | boolean>;

export interface WorkerFormSpec {
  actionId: string;
  titleKey: string; // conversation.actions.worker.<x>.label
  fields: readonly FieldSpec[];
  /** Convert raw form state to the typed input the schema expects. */
  build: (s: FormState) => Record<string, unknown>;
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const numOrNull = (v: unknown) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
};

const languageOptions = WORKER_LANGUAGES.map((code) => ({
  value: code,
  label: WORKER_LANGUAGE_NATIVE_NAMES[code] ?? code,
}));
const levelOptions = WORKER_LANGUAGE_LEVELS.map((lvl) => ({ value: lvl, label: lvl }));
const educationTypeOptions = EDUCATION_TYPE_SLUGS.map((slug) => ({
  value: slug,
  labelKey: `cvSections.educationTypes.${slug}`,
}));
const availabilityOptions = [
  { value: "available", labelKey: "conversation.forms.availability.available" },
  { value: "busy", labelKey: "conversation.forms.availability.busy" },
  { value: "unavailable", labelKey: "conversation.forms.availability.unavailable" },
];

export const WORKER_FORMS: readonly WorkerFormSpec[] = [
  {
    actionId: "worker.add-language",
    titleKey: "conversation.actions.worker.addLanguage.label",
    fields: [
      { name: "lang", kind: "select", labelKey: "conversation.forms.fields.language", required: true, options: languageOptions },
      { name: "level", kind: "select", labelKey: "conversation.forms.fields.level", required: true, options: levelOptions },
    ],
    build: (st) => ({ lang: s(st.lang), level: s(st.level) }),
  },
  {
    actionId: "worker.add-work-history",
    titleKey: "conversation.actions.worker.addWorkHistory.label",
    fields: [
      { name: "title", kind: "text", labelKey: "conversation.forms.fields.jobTitle", placeholderKey: "conversation.forms.fields.jobTitlePlaceholder", required: true, maxLength: 200 },
      { name: "startMonth", kind: "number", labelKey: "conversation.forms.fields.startMonth", placeholderKey: "conversation.forms.fields.mm", min: 1, max: 12 },
      { name: "startYear", kind: "number", labelKey: "conversation.forms.fields.startYear", placeholderKey: "conversation.forms.fields.yyyy", min: 1900, max: 2100, required: true },
      { name: "isCurrent", kind: "checkbox", labelKey: "conversation.forms.fields.ongoing" },
      { name: "endMonth", kind: "number", labelKey: "conversation.forms.fields.endMonth", placeholderKey: "conversation.forms.fields.mm", min: 1, max: 12 },
      { name: "endYear", kind: "number", labelKey: "conversation.forms.fields.endYear", placeholderKey: "conversation.forms.fields.yyyy", min: 1900, max: 2100 },
    ],
    build: (st) => ({
      title: s(st.title),
      startYear: numOrNull(st.startYear),
      startMonth: numOrNull(st.startMonth),
      isCurrent: st.isCurrent === true,
      endYear: st.isCurrent === true ? null : numOrNull(st.endYear),
      endMonth: st.isCurrent === true ? null : numOrNull(st.endMonth),
    }),
  },
  {
    actionId: "worker.add-education",
    titleKey: "conversation.actions.worker.addEducation.label",
    fields: [
      { name: "institution", kind: "text", labelKey: "conversation.forms.fields.institution", placeholderKey: "conversation.forms.fields.institutionPlaceholder", required: true, maxLength: 200 },
      { name: "program", kind: "text", labelKey: "conversation.forms.fields.program", placeholderKey: "conversation.forms.fields.programPlaceholder", maxLength: 200 },
      { name: "educationTypeSlug", kind: "select", labelKey: "conversation.forms.fields.educationType", required: true, options: educationTypeOptions },
      { name: "startYear", kind: "number", labelKey: "conversation.forms.fields.startYear", placeholderKey: "conversation.forms.fields.yyyy", min: 1900, max: 2100 },
      { name: "endYear", kind: "number", labelKey: "conversation.forms.fields.endYear", placeholderKey: "conversation.forms.fields.yyyy", min: 1900, max: 2100 },
      { name: "isCurrent", kind: "checkbox", labelKey: "conversation.forms.fields.ongoing" },
    ],
    build: (st) => ({
      institution: s(st.institution),
      program: s(st.program) || null,
      educationTypeSlug: s(st.educationTypeSlug),
      startYear: numOrNull(st.startYear),
      endYear: numOrNull(st.endYear),
      isCurrent: st.isCurrent === true,
    }),
  },
  {
    actionId: "worker.add-achievement",
    titleKey: "conversation.actions.worker.addAchievement.label",
    fields: [
      { name: "title", kind: "text", labelKey: "conversation.forms.fields.achievementTitle", required: true, maxLength: 200 },
      { name: "kind", kind: "select", labelKey: "conversation.forms.fields.achievementKind", required: true, options: [
        { value: "achievement", labelKey: "conversation.forms.achievementKind.achievement" },
        { value: "declared_certificate", labelKey: "conversation.forms.achievementKind.certificate" },
      ] },
      { name: "achievedYear", kind: "number", labelKey: "conversation.forms.fields.year", placeholderKey: "conversation.forms.fields.yyyy", min: 1900, max: 2100 },
      { name: "description", kind: "textarea", labelKey: "conversation.forms.fields.description", maxLength: 1000 },
    ],
    build: (st) => ({
      title: s(st.title),
      kind: s(st.kind) === "declared_certificate" ? "declared_certificate" : "achievement",
      achievedYear: numOrNull(st.achievedYear),
      description: s(st.description) || null,
    }),
  },
  {
    actionId: "worker.save-work-card",
    titleKey: "conversation.actions.worker.saveWorkCard.label",
    fields: [
      { name: "availabilityStatus", kind: "select", labelKey: "conversation.forms.fields.availability", options: [{ value: "", labelKey: "conversation.forms.fields.notStated" }, ...availabilityOptions] },
      { name: "locationCountry", kind: "text", labelKey: "conversation.forms.fields.locationCountry", placeholderKey: "conversation.forms.fields.countryCodePlaceholder", maxLength: 2 },
      { name: "preferredCountries", kind: "text", labelKey: "conversation.forms.fields.preferredCountries", placeholderKey: "conversation.forms.fields.preferredCountriesPlaceholder" },
      { name: "salaryMin", kind: "number", labelKey: "conversation.forms.fields.salaryMin", placeholderKey: "conversation.forms.fields.salaryMinPlaceholder", min: 0, max: 100000 },
      { name: "salaryMax", kind: "number", labelKey: "conversation.forms.fields.salaryMax", placeholderKey: "conversation.forms.fields.salaryMaxPlaceholder", min: 0, max: 100000 },
    ],
    build: (st) => ({
      availabilityStatus: s(st.availabilityStatus) || null,
      locationCountry: s(st.locationCountry).toUpperCase() || null,
      preferredCountries: s(st.preferredCountries)
        ? s(st.preferredCountries).split(",").map((c) => c.trim().toUpperCase()).filter((c) => c.length === 2)
        : [],
      salaryMin: numOrNull(st.salaryMin),
      salaryMax: numOrNull(st.salaryMax),
    }),
  },
  {
    actionId: "worker.save-preferences",
    titleKey: "conversation.actions.worker.savePreferences.label",
    fields: [
      { name: "willingToRelocate", kind: "tristate", labelKey: "conversation.forms.fields.willingToRelocate" },
      { name: "hasTransport", kind: "tristate", labelKey: "conversation.forms.fields.hasTransport" },
      { name: "needsAccommodation", kind: "tristate", labelKey: "conversation.forms.fields.needsAccommodation" },
      { name: "availabilityNote", kind: "textarea", labelKey: "conversation.forms.fields.availabilityNote", placeholderKey: "conversation.forms.fields.availabilityNotePlaceholder", maxLength: 500 },
    ],
    build: (st) => ({
      willingToRelocate: (s(st.willingToRelocate) || "not_stated") as "not_stated" | "yes" | "no",
      hasTransport: (s(st.hasTransport) || "not_stated") as "not_stated" | "yes" | "no",
      needsAccommodation: (s(st.needsAccommodation) || "not_stated") as "not_stated" | "yes" | "no",
      availabilityNote: s(st.availabilityNote) || null,
    }),
  },
] as const;

export function getWorkerForm(actionId: string): WorkerFormSpec | undefined {
  return WORKER_FORMS.find((f) => f.actionId === actionId);
}
