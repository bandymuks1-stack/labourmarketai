import "server-only";

import { getTranslations } from "next-intl/server";

/**
 * CAPABILITY PRESENTATION ADAPTER — the human layer over capability results.
 *
 * A capability returns canonical structured facts (`ExecResult.data`). An
 * external client's model then has to turn that JSON into language, and the
 * real ChatGPT test (2026-08-30, CHATGPT_MCP_CLIENT_V1 §6) showed what that
 * looks like without help: raw JSON pasted at the user. This module produces
 * a short LOCALIZED summary per capability so the model can lead with
 * language.
 *
 * Rules (chat-first audit, presentation contract v1):
 * - ADDITIVE ONLY. The structured payload is never altered or replaced; the
 *   adapter's output travels next to it, not instead of it.
 * - Success only. Failures already carry `code` + `message`; inventing prose
 *   around them would blur the honesty model.
 * - Unknown capability or unexpected data shape → `null`, never a guess.
 * - Strings come from the `capabilities` message namespace (all five active
 *   locales, parity-guarded) — no hardcoded product copy here.
 */

type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const MAX_NOTES_CHARS = 140;

function trimNotes(notes: string): string {
  const oneLine = notes.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_NOTES_CHARS
    ? `${oneLine.slice(0, MAX_NOTES_CHARS - 1)}…`
    : oneLine;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function summarizeProfile(t: Translator, data: Record<string, unknown>): string | null {
  const profile = asRecord(data.profile);
  const worker = asRecord(data.worker);
  if (!profile || !worker) return null;
  const workerStatus =
    worker.status === "exists"
      ? t("workerExists")
      : worker.status === "none"
        ? t("workerNone")
        : t("workerUnavailable");
  return t("profileSummary", {
    name: text(profile.fullName) ?? t("notSet"),
    country: text(profile.country) ?? t("notSet"),
    language: text(profile.locale) ?? t("notSet"),
    role: text(profile.activeRole) ?? t("notSet"),
    worker: workerStatus,
  });
}

function summarizeSkills(t: Translator, data: Record<string, unknown>): string | null {
  const skills = data.skills;
  if (!Array.isArray(skills)) return null;
  if (skills.length === 0) return t("skillsEmpty");
  const verified = skills.filter(
    (s) => asRecord(s)?.verified === true,
  ).length;
  return t("skillsSummary", { count: skills.length, verified });
}

function summarizeDraft(t: Translator, data: Record<string, unknown>): string | null {
  // Rule-C outcome: the entry could belong to several contexts — the human
  // must choose by NAME before anything is drafted.
  if (data.status === "engagement_choice_required" && Array.isArray(data.options)) {
    const labels = data.options
      .map((o) => text(asRecord(o)?.label))
      .filter((l): l is string => l !== null);
    if (labels.length === 0) return null;
    return t("draftChooseContext", { options: labels.join(", ") });
  }
  const preview = asRecord(data.preview);
  if (!preview) return null;
  const date = text(preview.workDate);
  const notes = text(preview.notes);
  if (!date || !notes) return null;
  const site = text(preview.siteName);
  const base = site
    ? t("draftSummaryWithSite", { date, site, notes: trimNotes(notes) })
    : t("draftSummary", { date, notes: trimNotes(notes) });
  const context = text(preview.engagementLabel);
  return context ? `${base} ${t("draftContext", { context })}` : base;
}

function summarizeConfirm(t: Translator, data: Record<string, unknown>): string | null {
  const skills = asRecord(data.skills);
  if (typeof data.entryId !== "string" || !skills) return null;
  return t("confirmSummary", {
    added: typeof skills.added === "number" ? skills.added : 0,
    strengthened: typeof skills.strengthened === "number" ? skills.strengthened : 0,
    reviewNeeded: typeof skills.reviewNeeded === "number" ? skills.reviewNeeded : 0,
  });
}

function summarizeJournalList(
  t: Translator,
  data: Record<string, unknown>,
): string | null {
  const entries = data.entries;
  if (!Array.isArray(entries)) return null;
  if (entries.length === 0) return t("journalListEmpty");
  // The newest entry's work_date metric (the product's own date for the
  // work) — created_at as the honest fallback when the metric is absent.
  const first = asRecord(entries[0]);
  const metrics = Array.isArray(first?.metrics) ? first.metrics : [];
  const workDate = metrics
    .map((m) => asRecord(m))
    .find((m) => m?.slug === "work_date");
  const latest =
    text(workDate?.valueText) ?? text(first?.createdAt)?.slice(0, 10) ?? "";
  return t("journalListSummary", { count: entries.length, latest });
}

function summarizeContextSwitch(
  t: Translator,
  data: Record<string, unknown>,
): string | null {
  if (data.status === "workspace_choice_required" && Array.isArray(data.options)) {
    const labels = data.options
      .map((o) => text(asRecord(o)?.label))
      .filter((l): l is string => l !== null);
    if (labels.length === 0) return null;
    return t("workspaceChoose", { options: labels.join(", ") });
  }
  if (data.status === "switched") {
    const label = text(data.label);
    return label ? t("workspaceSwitched", { label }) : null;
  }
  return null;
}

const SUMMARIZERS: Record<
  string,
  (t: Translator, data: Record<string, unknown>) => string | null
> = {
  "profile.get": summarizeProfile,
  "living_cv.skills.get": summarizeSkills,
  "journal.list": summarizeJournalList,
  "journal.create_draft": summarizeDraft,
  "journal.confirm": summarizeConfirm,
  "context.switch": summarizeContextSwitch,
};

/**
 * Localized human summary of a SUCCESSFUL capability result, or `null` when
 * the capability has no summarizer or the data shape is not what the
 * summarizer honestly understands. Callers must treat a thrown error as
 * "no summary" — presentation may never break the call it decorates.
 */
export async function summarizeCapabilityResult(
  capabilityId: string,
  data: Record<string, unknown>,
  locale: string,
): Promise<string | null> {
  const summarize = SUMMARIZERS[capabilityId];
  if (!summarize) return null;
  const t = (await getTranslations({
    locale,
    namespace: "capabilities",
  })) as unknown as Translator;
  return summarize(t, data);
}
