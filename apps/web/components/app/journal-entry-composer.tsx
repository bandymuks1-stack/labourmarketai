"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import { Input } from "@/components/ui/Input";
import {
  DetectedSuggestionCard,
  type SuggestionStatus,
} from "@/components/app/detected-suggestion-card";
import { DetectedSuggestionList } from "@/components/app/detected-suggestion-list";
import { SuggestionProvenanceLabel } from "@/components/app/suggestion-provenance";
import {
  extractJournalSuggestions,
  type JournalFragmentSuggestion,
} from "@/lib/structuring/extract-journal-suggestions";
import {
  createJournalEntry,
  supersedeJournalEntry,
} from "@/lib/journal/actions";
import {
  isValidJournalPhoto,
  uploadJournalEntryPhoto,
  type JournalPhotoUploadResult,
} from "@/lib/journal/photo-upload";
import { formatDuration } from "@/lib/journal/format-duration";
import {
  completeTask,
  errorTask,
  recordEvent,
  startTask,
} from "@/lib/telemetry/task";
import { cn } from "@/lib/utils";
import { Link } from "@/lib/i18n/navigation";

export type JournalEngagement = {
  id: string;
  label: string;
  isPrimary: boolean;
};
export type JournalDirection = { slug: string; name: string };
export type JournalSkill = { slug: string; name: string };

const UNIT_OPTIONS = [
  "hours",
  "minutes",
  "days",
  "square_meters",
  "meters",
  "pieces",
  "kilograms",
  "packages",
] as const;

type Stage = "compose" | "review";

type FragmentReviewState = JournalFragmentSuggestion & {
  status: SuggestionStatus;
  /** When the parser flagged this fragment as `isUnknown`, the worker can
   *  type a short free-text label ("Nesuprasta / patikslinkite"). The label
   *  is forwarded to the save action as a review-only `unknown_phrase`
   *  metric — never auto-promoted to a verified taxonomy entry. */
  userLabel: string;
};

export type JournalEditingEntry = {
  id: string;
  originalText: string;
};

export function JournalEntryComposer({
  engagements,
  directions,
  workerSkills,
  editingEntry,
}: {
  engagements: JournalEngagement[];
  directions: JournalDirection[];
  workerSkills: JournalSkill[];
  /** When set, the composer opens in EDIT mode: textarea is prefilled
   *  with `editingEntry.originalText`, the submit CTA reads
   *  "Atnaujinti įrašą", and on save the action calls
   *  `supersedeJournalEntry(editingEntry.id, …)` (RPC from migration 0018)
   *  instead of the create path. */
  editingEntry?: JournalEditingEntry | null;
}) {
  const t = useTranslations("journal");
  const tS = useTranslations("structuring");
  const tBucket = useTranslations("structuring.buckets");
  const tUnit = useTranslations("productivityUnits");
  const tProf = useTranslations("professions");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  const primaryId =
    engagements.find((e) => e.isPrimary)?.id ?? engagements[0]?.id ?? "";
  const today = new Date().toISOString().slice(0, 10);

  const [stage, setStage] = useState<Stage>("compose");
  const [text, setText] = useState(editingEntry?.originalText ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // How many structured details were actually persisted with the last save —
  // drives the "N details added" line in the success banner so the result is
  // visible, not silent. Counts only what the save action truly writes
  // (metrics + confirmed fragments), never the display-only skill hints.
  const [savedDetailCount, setSavedDetailCount] = useState(0);
  // Free-tier photo evidence: ONE photo per entry (more = future VIP/Pro,
  // stated honestly in copy). The file is uploaded AFTER the entry saves;
  // photoOutcome drives an honest line in the success banner.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoOutcome, setPhotoOutcome] =
    useState<JournalPhotoUploadResult | null>(null);

  const [timeStatus, setTimeStatus] = useState<SuggestionStatus>("pending");
  const [timeValue, setTimeValue] = useState<string>("");
  const [timeUnit, setTimeUnit] = useState<string>("hours");
  const [qtyStatus, setQtyStatus] = useState<SuggestionStatus>("pending");
  const [qtyValue, setQtyValue] = useState<string>("");
  const [qtyUnit, setQtyUnit] = useState<string>("square_meters");
  const [dirStatus, setDirStatus] = useState<SuggestionStatus>("pending");
  const [dirSlug, setDirSlug] = useState<string>("");
  const [siteStatus, setSiteStatus] = useState<SuggestionStatus>("pending");
  const [siteName, setSiteName] = useState<string>("");
  const [skillStatuses, setSkillStatuses] = useState<
    Record<string, SuggestionStatus>
  >({});
  const [skillSuggestions, setSkillSuggestions] = useState<JournalSkill[]>([]);
  // Multi-fragment review state — populated when the parser splits the text
  // into more than one work fragment (the owner sentence yields 3).
  const [fragments, setFragments] = useState<FragmentReviewState[]>([]);
  // v3 — institution / topic detection cards.
  const [institutionStatus, setInstitutionStatus] = useState<SuggestionStatus>("pending");
  const [institutionName, setInstitutionName] = useState<string>("");
  const [topicStatus, setTopicStatus] = useState<SuggestionStatus>("pending");
  const [topic, setTopic] = useState<string>("");
  const [engagementId, setEngagementId] = useState<string>(primaryId);
  const [workDate, setWorkDate] = useState<string>(today);

  const workerSkillBySlug = useMemo(
    () => new Map(workerSkills.map((s) => [s.slug, s])),
    [workerSkills],
  );
  const directionBySlug = useMemo(
    () => new Map(directions.map((d) => [d.slug, d])),
    [directions],
  );

  function analyse(raw: string) {
    setError(null);
    const s = extractJournalSuggestions(raw);
    // Pilot telemetry: a journal entry begins when the worker asks for
    // structure suggestions. Edit mode lets us tell create vs supersede
    // apart downstream.
    const taskName = editingEntry ? "journal_entry_edit" : "journal_entry_create";
    startTask(taskName);
    recordEvent("journal_suggest_clicked", {
      fragment_count: s.fragments.length,
    });
    setText(raw);
    setTimeStatus("pending");
    if (s.time) {
      setTimeValue(String(s.time.value));
      setTimeUnit(s.time.unitSlug);
    } else {
      setTimeValue("");
      setTimeUnit("hours");
    }
    setQtyStatus("pending");
    if (s.quantity) {
      setQtyValue(String(s.quantity.value));
      setQtyUnit(s.quantity.unitSlug);
    } else {
      setQtyValue("");
      setQtyUnit("square_meters");
    }
    setDirStatus("pending");
    setDirSlug(
      s.workDirectionSlug && directionBySlug.has(s.workDirectionSlug)
        ? s.workDirectionSlug
        : "",
    );
    setSiteStatus("pending");
    setSiteName(s.siteName ?? "");
    const matchedSkills = s.skillSlugs
      .map((slug) => workerSkillBySlug.get(slug))
      .filter((row): row is JournalSkill => !!row);
    setSkillSuggestions(matchedSkills);
    setSkillStatuses(
      Object.fromEntries(matchedSkills.map((row) => [row.slug, "pending"])),
    );
    // Multi-fragment view is only meaningful when the worker logged more
    // than one work item — otherwise the single-bucket cards already cover
    // the entry without visual duplication.
    if (s.fragments.length > 1) {
      setFragments(
        s.fragments.map((f) => ({
          ...f,
          status: "pending" as SuggestionStatus,
          userLabel: "",
        })),
      );
    } else {
      setFragments([]);
    }
    // v3: institution / topic.
    setInstitutionStatus("pending");
    setInstitutionName(s.institutionName ?? "");
    setTopicStatus("pending");
    setTopic(s.topic ?? "");
    setStage("review");
  }

  function setSkillStatus(slug: string, next: SuggestionStatus) {
    setSkillStatuses((prev) => ({ ...prev, [slug]: next }));
  }

  function setFragmentStatus(idx: number, next: SuggestionStatus) {
    setFragments((prev) =>
      prev.map((f, i) => {
        if (i !== idx) return f;
        // v4 clarify prompt: an unknown fragment cannot be confirmed
        // without a user label. The Confirm tap is treated as a request
        // for clarification rather than a hard error — we keep the
        // status `pending` so the worker sees the inline hint + input.
        if (
          next === "confirmed" &&
          f.isUnknown &&
          f.userLabel.trim().length === 0
        ) {
          return { ...f, status: "pending" };
        }
        return { ...f, status: next };
      }),
    );
  }

  function setFragmentUserLabel(idx: number, label: string) {
    setFragments((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, userLabel: label } : f)),
    );
  }

  async function submit() {
    if (!text.trim()) {
      setError(t("notesRequiredCopy"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("locale", locale);
      fd.set("engagement_context_id", engagementId);
      fd.set("notes", text);
      fd.set("work_date", workDate);
      if (siteStatus === "confirmed" && siteName.trim())
        fd.set("site_name", siteName.trim());
      if (dirStatus === "confirmed" && dirSlug) fd.set("work_direction", dirSlug);
      if (qtyStatus === "confirmed" && qtyValue) {
        fd.set("quantity", qtyValue);
        fd.set("unit_slug", qtyUnit);
      } else if (timeStatus === "confirmed" && timeValue) {
        fd.set("quantity", timeValue);
        fd.set("unit_slug", timeUnit);
      }
      // Forward confirmed fragments as reviewable metadata. Empty when the
      // entry is single-fragment. The optional `userLabel` ships only when
      // the parser flagged the fragment as `isUnknown` and the worker typed
      // a clarification — persisted server-side as `unknown_phrase` metric.
      const confirmedFragments = fragments
        .filter((f) => f.status === "confirmed")
        .map((f) => ({
          rawPhrase: f.rawPhrase,
          timeValue: f.time?.value ?? null,
          timeUnit: f.time?.unitSlug ?? null,
          activitySlug: f.activitySlug,
          activityLabel: f.activityLabel,
          isUnknown: f.isUnknown,
          userLabel: f.userLabel.trim() || null,
        }));
      if (institutionStatus === "confirmed" && institutionName.trim())
        fd.set("institution_name", institutionName.trim());
      if (topicStatus === "confirmed" && topic.trim())
        fd.set("topic", topic.trim());
      if (confirmedFragments.length > 0) {
        fd.set("fragments_json", JSON.stringify(confirmedFragments));
      }
      const result = editingEntry
        ? await supersedeJournalEntry(editingEntry.id, fd)
        : await createJournalEntry(fd);
      const taskName = editingEntry
        ? "journal_entry_edit"
        : "journal_entry_create";
      if (!result.ok) {
        setError(result.message);
        recordEvent("journal_save_error_code", {
          result_kind: result.code,
        });
        errorTask(taskName, result.code, {
          fragment_count: confirmedFragments.length,
          unresolved_unknown_count: fragments.filter(
            (f) => f.isUnknown && f.userLabel.trim().length === 0,
          ).length,
        });
        return;
      }
      // Photo evidence (free tier: 1 photo) — uploaded only AFTER the entry
      // is truly saved, so a photo failure can never lose the entry. The
      // outcome is reported honestly in the success banner.
      if (photoFile) {
        const outcome = await uploadJournalEntryPhoto(
          result.entryId,
          photoFile,
        );
        setPhotoOutcome(outcome);
        recordEvent("journal_photo_outcome", { outcome });
      } else {
        setPhotoOutcome(null);
      }
      recordEvent("journal_save_success", {
        fragment_count: confirmedFragments.length,
      });
      completeTask(taskName, {
        fragment_count: confirmedFragments.length,
      });
      // Count only what the action actually persisted (metrics + confirmed
      // fragments) so the success banner can honestly say how much structure
      // was saved. A plain direct save (no review) yields 0 and the banner
      // shows the base saved state without an inflated count.
      const savedDetails =
        (siteStatus === "confirmed" && siteName.trim() ? 1 : 0) +
        (dirStatus === "confirmed" && dirSlug ? 1 : 0) +
        ((qtyStatus === "confirmed" && qtyValue) ||
        (timeStatus === "confirmed" && timeValue)
          ? 1
          : 0) +
        (institutionStatus === "confirmed" && institutionName.trim() ? 1 : 0) +
        (topicStatus === "confirmed" && topic.trim() ? 1 : 0) +
        confirmedFragments.length;
      setSavedDetailCount(savedDetails);
      formRef.current?.reset();
      setStage("compose");
      setText("");
      setTimeValue("");
      setQtyValue("");
      setDirSlug("");
      setSiteName("");
      setSkillSuggestions([]);
      setSkillStatuses({});
      setFragments([]);
      setInstitutionName("");
      setTopic("");
      setPhotoFile(null);
      setPhotoError(null);
      setSavedAt(Date.now());
    } catch (e) {
      // Network / unexpected — only the truly unexpected path falls through
      // to the generic copy now, since the server action returns structured
      // failures for known reasons.
      console.error("[journal-composer] submit failed:", e);
      setError(t("saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  function confirmAllPending() {
    if (timeStatus === "pending" && timeValue) setTimeStatus("confirmed");
    if (qtyStatus === "pending" && qtyValue) setQtyStatus("confirmed");
    if (dirStatus === "pending" && dirSlug) setDirStatus("confirmed");
    if (siteStatus === "pending" && siteName) setSiteStatus("confirmed");
    if (institutionStatus === "pending" && institutionName)
      setInstitutionStatus("confirmed");
    if (topicStatus === "pending" && topic) setTopicStatus("confirmed");
    setSkillStatuses((prev) => {
      const next = { ...prev };
      for (const slug of Object.keys(next)) {
        if (next[slug] === "pending") next[slug] = "confirmed";
      }
      return next;
    });
    setFragments((prev) =>
      prev.map((f) => (f.status === "pending" ? { ...f, status: "confirmed" } : f)),
    );
  }

  if (stage === "compose") {
    return (
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          setSavedAt(null);
          // Primary action is now SAVE — write and save in one step. Structuring
          // is an optional secondary step (the "Sutvarkyti tekstą" button below).
          void submit();
        }}
        className="card-border flex flex-col gap-4 p-4 sm:p-6"
      >
        {savedAt !== null && (
          <div
            role="status"
            data-testid="journal-saved-banner"
            className="flex flex-col gap-2 rounded-md border border-state-success/40 bg-state-success/5 px-3 py-3"
          >
            <p className="text-sm font-semibold text-state-success">
              ✓ {t("savedTitle")}
            </p>
            <p className="text-xs text-text-secondary">
              {savedDetailCount > 0
                ? t("savedBodyWithDetails", { count: savedDetailCount })
                : t("savedBody")}
            </p>
            {/* Honest "what's next + who confirms" — saving is never a dead end:
                the entry is below, skills surface in the profile, and it stays
                private until a real human confirms it. */}
            <p className="text-[11px] leading-relaxed text-text-muted">
              {t("savedConfirmNote")}
            </p>
            {photoOutcome ? (
              <p
                className={cn(
                  "text-[11px] leading-relaxed",
                  photoOutcome === "uploaded"
                    ? "text-state-success"
                    : "text-state-warning",
                )}
                data-testid="journal-photo-outcome"
              >
                {photoOutcome === "uploaded"
                  ? t("photo.uploaded")
                  : photoOutcome === "limit"
                    ? t("photo.limitReached")
                    : photoOutcome === "not-ready"
                      ? t("photo.notReady")
                      : photoOutcome === "invalid"
                        ? t("photo.invalidFile")
                        : t("photo.uploadFailed")}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <a
                href="#journal-entries"
                className="text-xs font-semibold text-brand-blue hover:text-brand-cyan"
                data-testid="journal-saved-see-entries"
              >
                {t("savedSeeEntries")} →
              </a>
              <Link
                href="/dashboard/profile#capabilities"
                className="text-xs font-semibold text-brand-blue hover:text-brand-cyan"
                data-testid="journal-saved-open-profile"
              >
                {t("savedOpenProfile")} →
              </Link>
            </div>
          </div>
        )}
        <h3 className="font-display text-lg font-semibold text-text-primary">
          {editingEntry ? t("editEntryTitle") : t("newEntry")}
        </h3>
        {editingEntry && (
          // v4 — explicit edit-mode banner so the worker knows their save
          // will REPLACE an earlier entry rather than create a new one.
          <p
            className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
            data-testid="journal-edit-mode-banner"
          >
            {t("editEntryBanner")}{" "}
            <a
              href={`/${locale}/dashboard/journal`}
              className="font-mono text-[10px] uppercase tracking-label text-brand-blue hover:underline"
            >
              {t("editEntryCancel")}
            </a>
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <Label>{t("engagement")}</Label>
          <DarkListbox
            value={engagementId}
            onChange={setEngagementId}
            options={engagements.map((e) => ({ value: e.id, label: e.label }))}
            ariaLabel={t("engagement")}
            testId="journal-engagement-switcher"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <Label>{t("whatDidYouDo")}</Label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            required
            placeholder={t("textPlaceholder")}
            className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
          />
        </label>

        {/* Photo evidence — free tier: ONE photo per entry, enforced
            server-side; more photos are an honestly-labelled future
            VIP feature (no fake tier, no fake upload). */}
        <div
          className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
          data-testid="journal-photo-field"
        >
          <Label>{t("photo.label")}</Label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            data-testid="journal-photo-input"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && !isValidJournalPhoto(f)) {
                setPhotoFile(null);
                setPhotoError(t("photo.invalidFile"));
                return;
              }
              setPhotoError(null);
              setPhotoFile(f);
            }}
            className="text-xs text-text-secondary file:mr-3 file:rounded-md file:border file:border-ink-500 file:bg-ink-700 file:px-3 file:py-1.5 file:text-xs file:text-text-primary"
          />
          {photoError ? (
            <p className="text-xs text-state-danger" role="alert">
              {photoError}
            </p>
          ) : null}
          <p
            className="text-[11px] leading-relaxed text-text-muted"
            data-testid="journal-photo-free-tier-note"
          >
            {t("photo.freeTierNote")}
          </p>
        </div>

        <details className="rounded-md border border-ink-600 bg-ink-800/40 p-3 text-xs text-text-secondary">
          <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("examplesTitle")}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 leading-relaxed">
            <li>· {t("example1")}</li>
            <li>· {t("example2")}</li>
            <li>· {t("example3")}</li>
            <li>· {t("example4")}</li>
          </ul>
        </details>

        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {tS("ruleBasedNotice")}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {/* PRIMARY: save the entry directly — one obvious step. */}
          <Button
            type="submit"
            disabled={text.trim().length === 0 || submitting}
            data-testid="journal-save-entry"
          >
            {submitting
              ? t("saving")
              : editingEntry
                ? t("updateEntry")
                : t("saveEntry")}
          </Button>
          {/* SECONDARY (optional): tidy the text into structured fields first.
              Not a primary action and makes no AI/auto claim. */}
          <button
            type="button"
            onClick={() => {
              setSavedAt(null);
              analyse(text);
            }}
            disabled={text.trim().length === 0 || submitting}
            className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:opacity-50"
            data-testid="journal-organize-text"
          >
            {t("organizeText")}
          </button>
        </div>
        {/* Honest note about the OPTIONAL structuring step (guard-pinned
            suggestion→fact disclaimer). Saving never requires it. */}
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t("classifyLater")}
        </p>
      </form>
    );
  }

  // Review stage — show structured suggestions and a final confirm CTA.
  const fragmentTimes = fragments.filter((f) => f.time !== null).length;
  const fragmentActivities = fragments.filter(
    (f) => f.activitySlug !== null || f.activityLabel !== null,
  ).length;
  const totalDetected =
    (timeValue ? 1 : 0) +
    (qtyValue ? 1 : 0) +
    (dirSlug ? 1 : 0) +
    (siteName ? 1 : 0) +
    (institutionName ? 1 : 0) +
    (topic ? 1 : 0) +
    skillSuggestions.length +
    fragments.length;

  return (
    <div className="card-border flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-text-primary">
          {tS("groupEyebrow")}
        </h3>
        <button
          type="button"
          onClick={() => setStage("compose")}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("editText")}
        </button>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tS("ruleBasedNotice")}
      </p>
      <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary">
        {t("suggestionReviewIntro")}
      </p>

      {fragments.length > 0 && (
        // Multi-fragment summary — required by the supersprint goal so the
        // worker sees how many work items the parser found before reviewing.
        <p
          data-testid="journal-fragment-summary"
          className="rounded-md border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
        >
          {t("foundSummary", { times: fragmentTimes, activities: fragmentActivities })}
        </p>
      )}

      {totalDetected === 0 ? (
        <p className="text-sm text-text-secondary">{tS("noMatches")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fragments.length > 0 && (
            <DetectedSuggestionList
              className="md:col-span-2"
              title={tBucket("fragments")}
              count={fragments.length}
            >
              {fragments.map((f, idx) => {
                const timeLabel = f.time
                  ? formatDuration(
                      f.time.value,
                      f.time.unitSlug,
                      locale === "en" || locale === "ru" ? locale : "lt",
                    )
                  : t("fragment.noTime");
                const activityName = f.isUnknown
                  ? t("fragment.unknownTitle")
                  : f.activitySlug
                    ? tProfSafe(tProf, f.activitySlug, f.activityLabel)
                    : (f.activityLabel ?? t("fragment.noActivity"));
                return (
                  <DetectedSuggestionCard
                    key={`${idx}-${f.rawPhrase}`}
                    label={`${timeLabel} · ${activityName}`}
                    hint={`„${f.rawPhrase}"`}
                    status={f.status}
                    onConfirm={() => setFragmentStatus(idx, "confirmed")}
                    onDiscard={() => setFragmentStatus(idx, "discarded")}
                  >
                    {f.isUnknown && (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] leading-relaxed text-text-secondary">
                          {t("fragment.unknownHint")}
                        </p>
                        <Input
                          type="text"
                          value={f.userLabel}
                          maxLength={120}
                          placeholder={t("fragment.unknownPlaceholder")}
                          onChange={(e) =>
                            setFragmentUserLabel(idx, e.target.value)
                          }
                          data-testid={`fragment-unknown-label-${idx}`}
                        />
                        {f.status === "pending" && f.userLabel.trim().length === 0 && (
                          // v4 — the Confirm button on the card calls
                          // setFragmentStatus(confirmed). The setter
                          // refuses to flip an empty-label unknown to
                          // confirmed, so we render a precise inline
                          // hint so the worker knows what's blocking them.
                          <p
                            className="text-[11px] leading-relaxed text-state-warning"
                            data-testid={`fragment-unknown-clarify-${idx}`}
                          >
                            {t("fragment.unknownClarifyPrompt")}
                          </p>
                        )}
                      </div>
                    )}
                  </DetectedSuggestionCard>
                );
              })}
            </DetectedSuggestionList>
          )}

          {institutionName && (
            <DetectedSuggestionList
              title={tBucket("institution")}
              count={1}
            >
              <DetectedSuggestionCard
                label={institutionName}
                hint={t("fragment.institutionHint")}
                status={institutionStatus}
                editable
                editValue={institutionName}
                onEdit={(next) => {
                  setInstitutionName(next);
                  setInstitutionStatus("edited");
                }}
                onConfirm={() => setInstitutionStatus("confirmed")}
                onDiscard={() => setInstitutionStatus("discarded")}
              />
            </DetectedSuggestionList>
          )}
          {topic && (
            <DetectedSuggestionList
              title={tBucket("topic")}
              count={1}
            >
              <DetectedSuggestionCard
                label={topic}
                hint={t("fragment.topicHint")}
                status={topicStatus}
                editable
                editValue={topic}
                onEdit={(next) => {
                  setTopic(next);
                  setTopicStatus("edited");
                }}
                onConfirm={() => setTopicStatus("confirmed")}
                onDiscard={() => setTopicStatus("discarded")}
              />
            </DetectedSuggestionList>
          )}
          <DetectedSuggestionList
            title={tBucket("time")}
            count={timeValue ? 1 : 0}
          >
            {timeValue && (
              <DetectedSuggestionCard
                label={`${timeValue} ${tUnit(timeUnit)}`}
                status={timeStatus}
                onConfirm={() => setTimeStatus("confirmed")}
                onDiscard={() => setTimeStatus("discarded")}
              >
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={timeValue}
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    onChange={(e) => {
                      setTimeValue(e.target.value);
                      setTimeStatus("edited");
                    }}
                  />
                  <DarkListbox
                    value={timeUnit}
                    onChange={(v) => {
                      setTimeUnit(v);
                      setTimeStatus("edited");
                    }}
                    options={(["hours", "minutes", "days"] as const).map((u) => ({
                      value: u,
                      label: tUnit(u),
                    }))}
                  />
                </div>
              </DetectedSuggestionCard>
            )}
          </DetectedSuggestionList>

          <DetectedSuggestionList
            title={tBucket("quantity")}
            count={qtyValue ? 1 : 0}
          >
            {qtyValue && (
              <DetectedSuggestionCard
                label={`${qtyValue} ${tUnit(qtyUnit)}`}
                status={qtyStatus}
                onConfirm={() => setQtyStatus("confirmed")}
                onDiscard={() => setQtyStatus("discarded")}
              >
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={qtyValue}
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    onChange={(e) => {
                      setQtyValue(e.target.value);
                      setQtyStatus("edited");
                    }}
                  />
                  <DarkListbox
                    value={qtyUnit}
                    onChange={(v) => {
                      setQtyUnit(v);
                      setQtyStatus("edited");
                    }}
                    options={UNIT_OPTIONS.map((u) => ({ value: u, label: tUnit(u) }))}
                  />
                </div>
              </DetectedSuggestionCard>
            )}
          </DetectedSuggestionList>

          <DetectedSuggestionList
            title={tBucket("directions")}
            count={dirSlug ? 1 : 0}
          >
            {dirSlug && (
              <DetectedSuggestionCard
                label={directionBySlug.get(dirSlug)?.name ?? dirSlug}
                status={dirStatus}
                onConfirm={() => setDirStatus("confirmed")}
                onDiscard={() => setDirStatus("discarded")}
              >
                <DarkListbox
                  value={dirSlug}
                  onChange={(v) => {
                    setDirSlug(v);
                    setDirStatus("edited");
                  }}
                  options={directions.map((d) => ({ value: d.slug, label: d.name }))}
                />
              </DetectedSuggestionCard>
            )}
          </DetectedSuggestionList>

          <DetectedSuggestionList
            title={tBucket("site")}
            count={siteName ? 1 : 0}
          >
            {siteName && (
              <DetectedSuggestionCard
                label={siteName}
                status={siteStatus}
                onConfirm={() => setSiteStatus("confirmed")}
                onDiscard={() => setSiteStatus("discarded")}
                editable
                editValue={siteName}
                onEdit={(next) => {
                  setSiteName(next);
                  setSiteStatus("edited");
                }}
              />
            )}
          </DetectedSuggestionList>

          <DetectedSuggestionList
            className="md:col-span-2"
            title={tBucket("skills")}
            count={skillSuggestions.length}
          >
            {skillSuggestions.length > 0 && (
              // Honest framing for the whole skills bucket: these are
              // self-declared suggestions surfaced from the entry, never
              // verified by us. Per-card chips repeat the triad so a single
              // skill is never read out of context.
              <p
                className="md:col-span-2 text-[11px] leading-relaxed text-text-muted"
                data-testid="skill-suggestions-provenance-note"
              >
                {t("skillProvenanceNote")}
              </p>
            )}
            {skillSuggestions.map((row) => (
              <DetectedSuggestionCard
                key={row.slug}
                label={row.name}
                hint={t("strengthensHint")}
                status={skillStatuses[row.slug] ?? "pending"}
                onConfirm={() => setSkillStatus(row.slug, "confirmed")}
                onDiscard={() => setSkillStatus(row.slug, "discarded")}
              >
                <SuggestionProvenanceLabel />
              </DetectedSuggestionCard>
            ))}
          </DetectedSuggestionList>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <Label>{t("engagement")}</Label>
          <DarkListbox
            value={engagementId}
            onChange={setEngagementId}
            options={engagements.map((e) => ({ value: e.id, label: e.label }))}
            ariaLabel={t("engagement")}
            testId="journal-engagement-switcher"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>{t("date")}</Label>
          <Input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </label>
      </div>

      {(() => {
        // v4 — surface a banner when any unknown fragment is still
        // unresolved (pending OR confirmed-but-empty-label). The Save
        // button stays enabled (worker can still save without resolving),
        // but the banner makes it visible so they don't ship with
        // unanswered "patikslinkite" cards in the saved metadata.
        const unresolvedUnknownCount = fragments.filter(
          (f) => f.isUnknown && f.userLabel.trim().length === 0,
        ).length;
        if (unresolvedUnknownCount === 0) return null;
        return (
          <p
            data-testid="journal-unresolved-unknowns"
            className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
          >
            {t("fragment.unresolvedUnknownsBanner", {
              count: unresolvedUnknownCount,
            })}
          </p>
        );
      })()}
      {error && (
        <p
          className="rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-state-danger"
          role="alert"
          data-testid="journal-save-error"
        >
          {error}
        </p>
      )}

      <div className={cn("flex flex-wrap items-center gap-3")}>
        <Button
          type="button"
          onClick={submit}
          disabled={submitting}
          data-testid="journal-confirm-entry"
        >
          {submitting
            ? t("saving")
            : editingEntry
              ? t("updateEntry")
              : t("confirmEntry")}
        </Button>
        {totalDetected > 0 && (
          <button
            type="button"
            onClick={confirmAllPending}
            data-testid="journal-confirm-all-suggestions"
            className="rounded-md border border-state-success/40 px-3 py-1.5 text-xs font-semibold text-state-success hover:border-state-success"
          >
            {t("confirmAllSuggestions")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setStage("compose")}
          className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("editText")}
        </button>
      </div>
      <p className="text-[11px] text-text-muted">{t("reviewMetaNote")}</p>
    </div>
  );
}

/** Resolve a profession slug to its localized label, falling back to the
 *  raw LT label when the taxonomy doesn't have an entry yet (rule-based
 *  matches outside the construction set, e.g. cashier — surfaced via the
 *  free-text label rather than a fake taxonomy entry). */
function tProfSafe(
  tProf: (key: string) => string,
  slug: string,
  fallback: string | null,
): string {
  try {
    const v = tProf(slug);
    if (v && v !== slug) return v;
  } catch {
    /* fall through */
  }
  return fallback ?? slug;
}
