"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import { supersedeJournalEntry } from "@/lib/journal/actions";
import type { JournalEditingEntry } from "@/lib/journal/edit-entry";
import {
  buildCompactSaveFields,
  compactStateFingerprint,
  computeTotalTime,
  deriveCompactRows,
  type CompactActivityRow,
  type CompactSaveInput,
  type CompactTimeUnit,
} from "@/lib/journal/compact-edit-model";
import {
  confirmJournalAmbiguousChoice,
  rejectJournalAmbiguousCandidate,
  searchTaxonomySkills,
  type TaxonomySkillHit,
} from "@/lib/journal/skill-pipeline-actions";
import type {
  JournalPipelineCandidate,
  JournalSkillPipelineResult,
} from "@/lib/journal/skill-pipeline";
import { JOURNAL_PIPELINE_VERSION } from "@/lib/journal/journal-recognition";
import {
  formatLtCount,
  LT_HOUR_FORMS,
  LT_MINUTE_FORMS,
} from "@/lib/i18n/lt-plural";
import { formatDuration } from "@/lib/journal/format-duration";
import { recordEvent } from "@/lib/telemetry/task";
import { cn } from "@/lib/utils";
import type {
  JournalDirection,
  JournalEngagement,
  JournalSkill,
} from "@/components/app/journal-entry-composer";

/**
 * COMPACT edit surface for an existing journal entry (journal compact edit
 * UX, P0). Replaces the full composer + multi-bucket review matrix in the
 * EDIT flow only — the create flow keeps the existing composer + pipeline
 * result groups untouched.
 *
 * Contract:
 *   • ONLY the entry text, ONE compact activity-row list (skill + ITS time
 *     together), one sticky "Išsaugoti pakeitimus" + "Atšaukti";
 *   • rows derive from the entry's PERSISTED state (fragment metrics +
 *     durable links) — suggestions are never re-run to build the form;
 *   • every in-form change stays visibly LOCAL (dashed border + "Neišsaugota"
 *     chip on additions, a dirty indicator) until the ONE save — which runs
 *     the existing `supersedeJournalEntry` action (append-only supersede,
 *     hash chain kept, metrics rebuilt atomically with the new entry);
 *   • on failure every edit stays in the form (retryable, no reset);
 *   • quantity / direction / site / institution / topic sit under one
 *     collapsed "Daugiau informacijos" disclosure; empty categories render
 *     NOTHING (no "nothing found" boxes anywhere);
 *   • ambiguous readings from the accepted post-save pipeline result render
 *     as ONE short card each, riding the EXISTING clarification actions.
 */
export function JournalEntryCompactEditor({
  entry,
  engagements,
  directions,
  workerSkills,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  entry: JournalEditingEntry;
  engagements: JournalEngagement[];
  directions: JournalDirection[];
  workerSkills: JournalSkill[];
  /** Host callback after the worker CLOSES a successfully saved edit. */
  onSaved: () => void;
  /** Host callback for cancel (the host confirms when dirty via
   *  `onDirtyChange` state). */
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("journal");
  const tUnit = useTranslations("productivityUnits");
  const tProf = useTranslations("professions");
  const locale = useLocale();

  const derived = useMemo(
    () => deriveCompactRows(entry, workerSkills),
    [entry, workerSkills],
  );

  const primaryId =
    engagements.find((e) => e.isPrimary)?.id ?? engagements[0]?.id ?? "";
  const today = new Date().toISOString().slice(0, 10);

  const [text, setText] = useState(entry.originalText);
  const [rows, setRows] = useState<CompactActivityRow[]>(derived.rows);
  const [removedSkillSlugs, setRemovedSkillSlugs] = useState<string[]>([]);
  const [looseTimeValue, setLooseTimeValue] = useState(
    derived.looseTime ? String(derived.looseTime.value) : "",
  );
  const [looseTimeUnit, setLooseTimeUnit] = useState<CompactTimeUnit>(
    derived.looseTime &&
      ["hours", "minutes", "days"].includes(derived.looseTime.unitSlug)
      ? (derived.looseTime.unitSlug as CompactTimeUnit)
      : "hours",
  );
  // Advanced (collapsed) fields — preloaded from the persisted entry so an
  // untouched edit re-submits them unchanged.
  const [workDate, setWorkDate] = useState(entry.workDate ?? today);
  // Default to the entry's OWN engagement (preloaded) so a text-only edit never
  // silently reassigns the work to the worker's primary engagement. Falls back
  // to the primary only for a legacy entry with no stored engagement.
  const [engagementId, setEngagementId] = useState(
    entry.engagementContextId ?? primaryId,
  );
  const [quantityValue, setQuantityValue] = useState(
    entry.quantity ? String(entry.quantity.value) : "",
  );
  const [quantityUnit, setQuantityUnit] = useState(
    entry.quantity?.unitSlug ?? "square_meters",
  );
  const [directionSlug, setDirectionSlug] = useState(
    entry.workDirectionSlug ?? "",
  );
  const [siteName, setSiteName] = useState(entry.siteName ?? "");
  const [institutionName, setInstitutionName] = useState(
    entry.institutionName ?? "",
  );
  const [topic, setTopic] = useState(entry.topic ?? "");

  // Addition flow (small inline autocomplete over ACTIVE taxonomy skills via
  // the existing `searchTaxonomySkills` server action + free-text fallback).
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addHits, setAddHits] = useState<TaxonomySkillHit[]>([]);
  const addSeq = useRef(0);

  // The LATEST live entry of this drawer's supersession chain (P1-B). The
  // first save supersedes the original entry; every later save in the same
  // open drawer must supersede the entry the previous save CREATED — never
  // the original again (which would fork the chain into duplicate live
  // entries). Advanced only on a successful save.
  const [currentEntryId, setCurrentEntryId] = useState(entry.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<{
    entryId: string;
    skills: JournalSkillPipelineResult;
  } | null>(null);
  const [ambiguousStates, setAmbiguousStates] = useState<
    Record<string, "idle" | "working" | "confirmed" | "rejected" | "error">
  >({});

  const saveInput: CompactSaveInput = {
    text,
    workDate,
    engagementContextId: engagementId,
    rows,
    removedSkillSlugs,
    looseTimeValue,
    looseTimeUnit,
    quantityValue,
    quantityUnit,
    directionSlug,
    siteName,
    institutionName,
    topic,
  };
  // Dirty = the ONE save payload differs from the baseline taken at open (or
  // at the last successful save). Never silently reset.
  const [baseline, setBaseline] = useState(() =>
    compactStateFingerprint({
      text: entry.originalText,
      workDate: entry.workDate ?? today,
      engagementContextId: entry.engagementContextId ?? primaryId,
      rows: derived.rows,
      removedSkillSlugs: [],
      looseTimeValue: derived.looseTime ? String(derived.looseTime.value) : "",
      looseTimeUnit:
        derived.looseTime &&
        ["hours", "minutes", "days"].includes(derived.looseTime.unitSlug)
          ? (derived.looseTime.unitSlug as CompactTimeUnit)
          : "hours",
      quantityValue: entry.quantity ? String(entry.quantity.value) : "",
      quantityUnit: entry.quantity?.unitSlug ?? "square_meters",
      directionSlug: entry.workDirectionSlug ?? "",
      siteName: entry.siteName ?? "",
      institutionName: entry.institutionName ?? "",
      topic: entry.topic ?? "",
    }),
  );
  const dirty = compactStateFingerprint(saveInput) !== baseline;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Navigation guard while dirty (drawer close is guarded by the host via
  // onDirtyChange; this covers tab close / full navigation).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /** Canonical stored labels may be slugs — localize for DISPLAY only. */
  function displayLabel(label: string): string {
    try {
      const v = tProf(label);
      if (v && v !== label && !v.includes(`professions.${label}`)) return v;
    } catch {
      /* fall through */
    }
    return label;
  }

  function patchRow(key: string, patch: Partial<CompactActivityRow>): void {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(row: CompactActivityRow): void {
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    if (row.skillSlug) {
      setRemovedSkillSlugs((prev) =>
        prev.includes(row.skillSlug!) ? prev : [...prev, row.skillSlug!],
      );
    }
  }

  async function searchAdd(q: string): Promise<void> {
    setAddQuery(q);
    const seq = ++addSeq.current;
    if (q.trim().length < 2) {
      setAddHits([]);
      return;
    }
    try {
      const hits = await searchTaxonomySkills(q);
      if (addSeq.current === seq) setAddHits(hits);
    } catch {
      if (addSeq.current === seq) setAddHits([]);
    }
  }

  /** Add a row locally — visibly UNSAVED until the one batch save. */
  function addRow(label: string, skillSlug: string | null): void {
    const clean = label.trim().slice(0, 120);
    if (!clean) return;
    setRows((prev) => [
      ...prev,
      {
        key: `added-${Date.now()}-${prev.length}`,
        label: clean,
        skillSlug,
        rawPhrase: null,
        timeValue: "",
        timeUnit: "hours",
        origin: "added",
      },
    ]);
    setAddOpen(false);
    setAddQuery("");
    setAddHits([]);
    recordEvent("journal_compact_row_added", {
      kind: skillSlug ? "taxonomy" : "free_text",
    });
  }

  async function save(): Promise<void> {
    if (!text.trim()) {
      setError(t("notesRequiredCopy"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const fields = buildCompactSaveFields(saveInput);
      const fd = new FormData();
      fd.set("locale", locale);
      fd.set("engagement_context_id", engagementId);
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const result = await supersedeJournalEntry(currentEntryId, fd);
      if (!result.ok) {
        // Retryable: every edit stays in the form exactly as it was — and the
        // chain does NOT advance (a failed save created no new entry).
        setError(result.message);
        recordEvent("journal_save_error_code", { result_kind: result.code });
        return;
      }
      setCurrentEntryId(result.entryId);
      setSavedResult({ entryId: result.entryId, skills: result.skills });
      setBaseline(compactStateFingerprint(saveInput));
      // Persisted now — additions stop rendering as unsaved.
      setRows((prev) => prev.map((r) => ({ ...r, origin: "persisted" })));
      recordEvent("journal_save_success", { result_kind: "compact_edit" });
    } catch (e) {
      console.error("[journal-compact-editor] save failed:", e);
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  // Ambiguous readings from the accepted post-save pipeline result — ONE
  // short card each, riding the EXISTING clarification actions.
  const ambiguousCandidates: JournalPipelineCandidate[] =
    savedResult?.skills.status === "failed"
      ? []
      : (savedResult?.skills.candidates ?? []).filter(
          (c) => c.kind === "ambiguous" && (c.choices?.length ?? 0) > 0,
        );
  const savedPipelineVersion =
    savedResult?.skills.recognition.pipelineVersion ?? JOURNAL_PIPELINE_VERSION;

  async function chooseAmbiguous(
    c: JournalPipelineCandidate,
    slug: string,
  ): Promise<void> {
    if (!savedResult) return;
    setAmbiguousStates((prev) => ({ ...prev, [c.label]: "working" }));
    try {
      const res = await confirmJournalAmbiguousChoice(
        savedResult.entryId,
        c.label,
        slug,
        savedPipelineVersion,
      );
      setAmbiguousStates((prev) => ({
        ...prev,
        [c.label]: res.ok ? "confirmed" : "error",
      }));
    } catch {
      setAmbiguousStates((prev) => ({ ...prev, [c.label]: "error" }));
    }
  }

  async function dismissAmbiguous(c: JournalPipelineCandidate): Promise<void> {
    if (!savedResult) return;
    setAmbiguousStates((prev) => ({ ...prev, [c.label]: "working" }));
    try {
      const res = await rejectJournalAmbiguousCandidate(
        savedResult.entryId,
        c.label,
        savedPipelineVersion,
      );
      setAmbiguousStates((prev) => ({
        ...prev,
        [c.label]: res.ok ? "rejected" : "error",
      }));
    } catch {
      setAmbiguousStates((prev) => ({ ...prev, [c.label]: "error" }));
    }
  }

  const total = computeTotalTime(rows);
  const timeUnitOptions = (u: CompactTimeUnit) => {
    const base: { value: CompactTimeUnit; label: string }[] = [
      { value: "hours", label: t("compactEdit.unitHours") },
      { value: "minutes", label: t("compactEdit.unitMinutes") },
    ];
    // "days" is offered only when the persisted value already uses it — the
    // stored unit is preserved, never silently coerced.
    if (u === "days") {
      base.push({ value: "days", label: t("compactEdit.unitDays") });
    }
    return base;
  };

  const totalLine =
    total === null
      ? null
      : locale === "lt"
        ? total.unitSlug === "hours"
          ? formatLtCount(total.value, LT_HOUR_FORMS)
          : formatLtCount(total.value, LT_MINUTE_FORMS)
        : formatDuration(
            total.value,
            total.unitSlug,
            // formatDuration supports lt/en/ru; other active locales (de/nl/pl)
            // use neutral international "h/min" rather than LT abbreviations.
            locale === "ru" ? "ru" : "en",
          );

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
      data-testid="journal-compact-editor"
    >
      {/* Entry text — the worker's own words, editable. */}
      <label className="flex flex-col gap-1.5">
        <Label>{t("entry.textLabel")}</Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          required
          data-testid="journal-compact-text"
          className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2.5 text-base text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue sm:text-sm"
        />
      </label>

      {/* ONE compact activity list — skill + ITS time together. */}
      <section className="flex flex-col gap-2" data-testid="journal-compact-rows">
        <Label>{t("compactEdit.activitiesTitle")}</Label>
        {rows.map((row) => (
          <div
            key={row.key}
            data-testid="journal-compact-row"
            className={cn(
              "flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:gap-2",
              row.origin === "added"
                ? "border-dashed border-brand-blue/60 bg-brand-blue/5"
                : "border-ink-600 bg-ink-800/40",
            )}
          >
            <span className="min-w-0 flex-1 break-words text-sm text-text-primary">
              {displayLabel(row.label)}
              {row.origin === "added" && (
                <span
                  className="ml-2 rounded-sm border border-dashed border-brand-blue/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-blue"
                  data-testid="journal-compact-unsaved-chip"
                >
                  {t("compactEdit.unsavedChip")}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Input
                type="number"
                value={row.timeValue}
                min="0"
                step="0.1"
                inputMode="decimal"
                aria-label={t("compactEdit.timeLabel")}
                placeholder="—"
                onChange={(e) => patchRow(row.key, { timeValue: e.target.value })}
                data-testid="journal-compact-row-time"
                className="w-20"
              />
              <span className="w-20" data-testid="journal-compact-row-unit">
                <DarkListbox
                  value={row.timeUnit}
                  onChange={(v) =>
                    patchRow(row.key, { timeUnit: v as CompactTimeUnit })
                  }
                  options={timeUnitOptions(row.timeUnit)}
                  ariaLabel={t("compactEdit.timeLabel")}
                />
              </span>
              <button
                type="button"
                onClick={() => removeRow(row)}
                aria-label={t("compactEdit.removeRow")}
                data-testid="journal-compact-row-remove"
                className="inline-flex min-h-[2.5rem] min-w-[2.5rem] items-center justify-center rounded-md border border-ink-500 text-sm text-text-secondary transition-colors hover:border-state-danger/60 hover:text-state-danger"
              >
                ×
              </button>
            </span>
          </div>
        ))}

        {/* Global time — ONLY when no activity row carries its own time. */}
        {rows.every((r) => r.timeValue === "") &&
          (looseTimeValue !== "" || rows.length === 0) && (
            <div
              className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
              data-testid="journal-compact-loose-time"
            >
              <span className="flex-1 text-sm text-text-secondary">
                {t("compactEdit.timeLabel")}
              </span>
              <Input
                type="number"
                value={looseTimeValue}
                min="0"
                step="0.1"
                inputMode="decimal"
                aria-label={t("compactEdit.timeLabel")}
                onChange={(e) => setLooseTimeValue(e.target.value)}
                className="w-20"
              />
              <span className="w-20">
                <DarkListbox
                  value={looseTimeUnit}
                  onChange={(v) => setLooseTimeUnit(v as CompactTimeUnit)}
                  options={timeUnitOptions(looseTimeUnit)}
                  ariaLabel={t("compactEdit.timeLabel")}
                />
              </span>
            </div>
          )}

        {totalLine !== null && rows.some((r) => r.timeValue !== "") && (
          <p
            className="text-[11px] text-text-muted"
            data-testid="journal-compact-total-time"
          >
            {t("compactEdit.totalTime")}: {totalLine}
          </p>
        )}

        {/* + Pridėti veiklą — inline autocomplete over ACTIVE taxonomy skills
            (existing searchTaxonomySkills action) + free-text fallback. */}
        {addOpen ? (
          <div
            className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-2.5"
            data-testid="journal-compact-add-panel"
          >
            <Input
              type="text"
              value={addQuery}
              autoFocus
              placeholder={t("compactEdit.searchPlaceholder")}
              aria-label={t("compactEdit.addActivity")}
              onChange={(e) => void searchAdd(e.target.value)}
              data-testid="journal-compact-add-search"
            />
            {addHits.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {addHits.map((hit) => (
                  <button
                    key={hit.slug}
                    type="button"
                    onClick={() => addRow(hit.label, hit.slug)}
                    data-testid="journal-compact-add-hit"
                    className="rounded-md border border-brand-blue/50 inline-flex min-h-[2.5rem] items-center justify-center px-3 py-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
                  >
                    {hit.label}
                  </button>
                ))}
              </div>
            )}
            {addQuery.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => addRow(addQuery, null)}
                data-testid="journal-compact-add-freetext"
                className="w-fit rounded-md border border-ink-500 inline-flex min-h-[2.5rem] items-center justify-center px-3 py-2 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
              >
                {t("compactEdit.addAsClaim")}: „{addQuery.trim()}“
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setAddQuery("");
                setAddHits([]);
              }}
              className="w-fit text-[11px] text-text-muted hover:text-text-primary"
            >
              {t("compactEdit.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            data-testid="journal-compact-add"
            className="w-fit rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            + {t("compactEdit.addActivity")}
          </button>
        )}
      </section>

      {/* Advanced — ONE collapsed disclosure; empty fields render inputs the
          worker MAY fill, never "nothing found" placeholder boxes. */}
      <details
        className="rounded-md border border-ink-600 bg-ink-800/40"
        data-testid="journal-compact-advanced"
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary">
          {t("compactEdit.advanced")}
        </summary>
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <Label>{t("date")}</Label>
            <Input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>{t("engagement")}</Label>
            <DarkListbox
              value={engagementId}
              onChange={setEngagementId}
              options={engagements.map((e) => ({ value: e.id, label: e.label }))}
              ariaLabel={t("engagement")}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>{t("compactEdit.quantityLabel")}</Label>
            <span className="flex items-center gap-1.5">
              <Input
                type="number"
                value={quantityValue}
                min="0"
                step="0.1"
                inputMode="decimal"
                onChange={(e) => setQuantityValue(e.target.value)}
              />
              <span className="w-24">
                <DarkListbox
                  value={quantityUnit}
                  onChange={setQuantityUnit}
                  options={(
                    [
                      "square_meters",
                      "meters",
                      "pieces",
                      "kilograms",
                      "packages",
                    ] as const
                  ).map((u) => ({ value: u, label: tUnit(u) }))}
                  ariaLabel={t("compactEdit.quantityLabel")}
                />
              </span>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>{t("compactEdit.directionLabel")}</Label>
            <DarkListbox
              value={directionSlug}
              onChange={setDirectionSlug}
              options={[
                { value: "", label: "—" },
                ...directions.map((d) => ({ value: d.slug, label: d.name })),
              ]}
              ariaLabel={t("compactEdit.directionLabel")}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>{t("compactEdit.siteLabel")}</Label>
            <Input
              type="text"
              value={siteName}
              maxLength={200}
              onChange={(e) => setSiteName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>{t("compactEdit.institutionLabel")}</Label>
            <Input
              type="text"
              value={institutionName}
              maxLength={200}
              onChange={(e) => setInstitutionName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>{t("compactEdit.topicLabel")}</Label>
            <Input
              type="text"
              value={topic}
              maxLength={500}
              onChange={(e) => setTopic(e.target.value)}
            />
          </label>
        </div>
      </details>

      {/* Saved state + ambiguous follow-up cards (existing honest lanes). */}
      {savedResult !== null && (
        <div
          role="status"
          data-testid="journal-compact-saved"
          className="flex flex-col gap-2 rounded-md border border-state-success/40 bg-state-success/5 px-3 py-2.5"
        >
          <p className="text-sm font-semibold text-state-success">
            ✓ {t("compactEdit.saved")}
          </p>
          {ambiguousCandidates.map((c) => {
            const state = ambiguousStates[c.label] ?? "idle";
            return (
              <div
                key={c.label}
                className="flex flex-col gap-1.5 rounded-md border border-brand-blue/30 bg-brand-blue/5 px-2.5 py-1.5"
                data-testid="journal-compact-ambiguous-card"
              >
                <span className="text-xs font-semibold text-text-primary">
                  {c.label}
                </span>
                {c.reason ? (
                  <span className="text-[11px] text-text-muted">{c.reason}</span>
                ) : null}
                {state === "confirmed" ? (
                  <span className="text-[11px] font-semibold text-state-success">
                    ✓ {t("candidateConfirmed")}
                  </span>
                ) : state === "rejected" ? (
                  <span className="text-[11px] text-text-muted">
                    {t("candidateRejected")}
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(c.choices ?? []).map((ch) => (
                      <button
                        key={ch.slug}
                        type="button"
                        disabled={state === "working"}
                        onClick={() => void chooseAmbiguous(c, ch.slug)}
                        data-testid="journal-compact-ambiguous-choice"
                        className="rounded-md border border-brand-blue/50 inline-flex min-h-[2.5rem] items-center justify-center px-3 py-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
                      >
                        {ch.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={state === "working"}
                      onClick={() => void dismissAmbiguous(c)}
                      data-testid="journal-compact-ambiguous-reject"
                      className="rounded-md border border-ink-500 inline-flex min-h-[2.5rem] items-center justify-center px-3 py-2 text-xs text-text-secondary transition-colors hover:border-state-danger/60 hover:text-state-danger disabled:opacity-50"
                    >
                      {t("candidateReject")}
                    </button>
                  </div>
                )}
                {state === "error" && (
                  <span className="text-[11px] text-state-danger" role="alert">
                    {t("candidateError")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p
          className="rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-state-danger"
          role="alert"
          data-testid="journal-compact-error"
        >
          {error}
        </p>
      )}

      {/* Sticky save bar — ONE batch save + cancel; dirty state is explicit. */}
      <div
        className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-ink-600 bg-ink-900/95 px-1 py-3 backdrop-blur"
        data-testid="journal-compact-savebar"
      >
        {savedResult !== null && !dirty ? (
          <Button
            type="button"
            onClick={onSaved}
            data-testid="journal-compact-close"
          >
            {t("compactEdit.close")}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || text.trim().length === 0}
            aria-busy={saving || undefined}
            data-testid="journal-compact-save"
          >
            {saving ? t("saving") : t("compactEdit.save")}
          </Button>
        )}
        <button
          type="button"
          onClick={onCancel}
          data-testid="journal-compact-cancel"
          className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
        >
          {t("compactEdit.cancel")}
        </button>
        {dirty && (
          <span
            className="font-mono text-[10px] uppercase tracking-label text-state-warning"
            data-testid="journal-compact-dirty"
          >
            {t("compactEdit.dirtyNote")}
          </span>
        )}
      </div>
    </div>
  );
}
