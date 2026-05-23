"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { DetectedSuggestionCard, type SuggestionStatus } from "@/components/app/detected-suggestion-card";
import { DetectedSuggestionList } from "@/components/app/detected-suggestion-list";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { createJournalEntry } from "@/lib/journal/actions";
import { cn } from "@/lib/utils";

export type JournalEngagement = {
  id: string;
  label: string;
  isPrimary: boolean;
};
export type JournalDirection = { slug: string; name: string };
export type JournalSkill = { slug: string; name: string };

/** All units exposed by `messages/{locale}/productivity-units.json`. Hours is
 *  surfaced FIRST because the spec wants time as the universal default (§Units). */
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

/**
 * Journal entry composer — text-first (§Work Journal). The worker writes one
 * paragraph ("Ką šiandien dirbote?"), then the rule-based parser proposes
 * structured data. Each proposal needs a confirm before it lands in the form;
 * nothing is persisted until the worker clicks "Patvirtinti įrašą".
 *
 * The submit goes through the existing server action `createJournalEntry`,
 * so the journal_entries / journal_entry_metrics tables behave exactly as
 * before — no DB migration required.
 */
export function JournalEntryComposer({
  engagements,
  directions,
  workerSkills,
}: {
  engagements: JournalEngagement[];
  directions: JournalDirection[];
  /** The worker's saved skills — used to suggest "this entry could strengthen X". */
  workerSkills: JournalSkill[];
}) {
  const t = useTranslations("journal");
  const tS = useTranslations("structuring");
  const tBucket = useTranslations("structuring.buckets");
  const tUnit = useTranslations("productivityUnits");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  const primaryId =
    engagements.find((e) => e.isPrimary)?.id ?? engagements[0]?.id ?? "";
  const today = new Date().toISOString().slice(0, 10);

  const [stage, setStage] = useState<Stage>("compose");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 5: a saved-state feedback flag — set immediately after a successful
  // server save so the worker SEES the confirmation, not a silent reset.
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Suggestion view state. We don't keep the raw parser result in state —
  // each bucket (time / quantity / direction / site / skills) has its own
  // user-editable mirror below, and re-running the parser updates them.
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
    setStage("review");
  }

  function setSkillStatus(slug: string, next: SuggestionStatus) {
    setSkillStatuses((prev) => ({ ...prev, [slug]: next }));
  }

  async function submit() {
    if (!text.trim()) {
      setError(t("saveError"));
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
      // Only forward fields the worker actually confirmed.
      if (siteStatus === "confirmed" && siteName.trim())
        fd.set("site_name", siteName.trim());
      if (dirStatus === "confirmed" && dirSlug) fd.set("work_direction", dirSlug);
      if (qtyStatus === "confirmed" && qtyValue) {
        fd.set("quantity", qtyValue);
        fd.set("unit_slug", qtyUnit);
      } else if (timeStatus === "confirmed" && timeValue) {
        // Time is the universal fallback unit when no other quantity was given.
        fd.set("quantity", timeValue);
        fd.set("unit_slug", timeUnit);
      }
      await createJournalEntry(fd);
      formRef.current?.reset();
      // Reset to compose stage with a fresh slate, but mark "just saved" so
      // the compose stage can render a visible success card (Phase 5 —
      // mobile-safe saved-state feedback).
      setStage("compose");
      setText("");
      setTimeValue("");
      setQtyValue("");
      setDirSlug("");
      setSiteName("");
      setSkillSuggestions([]);
      setSkillStatuses({});
      setSavedAt(Date.now());
    } catch (e) {
      console.error("[journal-composer] submit failed:", e);
      setError(t("saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  // Quick action: confirm everything still pending (a typical "all good" tap).
  function confirmAllPending() {
    if (timeStatus === "pending" && timeValue) setTimeStatus("confirmed");
    if (qtyStatus === "pending" && qtyValue) setQtyStatus("confirmed");
    if (dirStatus === "pending" && dirSlug) setDirStatus("confirmed");
    if (siteStatus === "pending" && siteName) setSiteStatus("confirmed");
    setSkillStatuses((prev) => {
      const next = { ...prev };
      for (const slug of Object.keys(next)) {
        if (next[slug] === "pending") next[slug] = "confirmed";
      }
      return next;
    });
  }

  if (stage === "compose") {
    return (
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          setSavedAt(null);
          analyse(text);
        }}
        className="card-border flex flex-col gap-4 p-4 sm:p-6"
      >
        {savedAt !== null && (
          // Phase 5: clear success card after a journal save. Stays until the
          // worker submits the next entry so it's not missed on mobile.
          <div
            role="status"
            className="rounded-md border border-state-success/40 bg-state-success/5 px-3 py-2"
          >
            <p className="text-sm font-semibold text-state-success">
              ✓ {t("savedTitle")}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {t("savedBody")}
            </p>
          </div>
        )}
        <h3 className="font-display text-lg font-semibold text-text-primary">
          {t("newEntry")}
        </h3>

        <label className="flex flex-col gap-1.5">
          <Label>{t("engagement")}</Label>
          <Select
            value={engagementId}
            onChange={(e) => setEngagementId(e.target.value)}
            required
          >
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
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

        {/* Phase 5 (adaptive): cross-domain examples so the journal does
            not feel like a construction-only form. Worker doesn't have to
            click anything — they can copy the wording style. */}
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
          <Button type="submit" disabled={text.trim().length === 0}>
            {t("analyseSubmit")}
          </Button>
          <span className="text-[11px] text-text-muted">
            {t("classifyLater")}
          </span>
        </div>
      </form>
    );
  }

  // Review stage — show structured suggestions and a final confirm CTA.
  const totalDetected =
    (timeValue ? 1 : 0) +
    (qtyValue ? 1 : 0) +
    (dirSlug ? 1 : 0) +
    (siteName ? 1 : 0) +
    skillSuggestions.length;

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
      {/* Phase 5: explicit "these are suggestions" framing — the worker sees
          this every time they hit review, before any confirm tap. */}
      <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary">
        {t("suggestionReviewIntro")}
      </p>

      {totalDetected === 0 ? (
        <p className="text-sm text-text-secondary">{tS("noMatches")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
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
                  <Select
                    value={timeUnit}
                    onChange={(e) => {
                      setTimeUnit(e.target.value);
                      setTimeStatus("edited");
                    }}
                  >
                    {(["hours", "minutes", "days"] as const).map((u) => (
                      <option key={u} value={u}>
                        {tUnit(u)}
                      </option>
                    ))}
                  </Select>
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
                  <Select
                    value={qtyUnit}
                    onChange={(e) => {
                      setQtyUnit(e.target.value);
                      setQtyStatus("edited");
                    }}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {tUnit(u)}
                      </option>
                    ))}
                  </Select>
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
                <Select
                  value={dirSlug}
                  onChange={(e) => {
                    setDirSlug(e.target.value);
                    setDirStatus("edited");
                  }}
                >
                  {directions.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
                </Select>
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
            {skillSuggestions.map((row) => (
              <DetectedSuggestionCard
                key={row.slug}
                label={row.name}
                hint={t("strengthensHint")}
                status={skillStatuses[row.slug] ?? "pending"}
                onConfirm={() => setSkillStatus(row.slug, "confirmed")}
                onDiscard={() => setSkillStatus(row.slug, "discarded")}
              />
            ))}
          </DetectedSuggestionList>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <Label>{t("engagement")}</Label>
          <Select
            value={engagementId}
            onChange={(e) => setEngagementId(e.target.value)}
          >
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
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

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <div className={cn("flex flex-wrap items-center gap-3")}>
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? t("saving") : t("confirmEntry")}
        </Button>
        {totalDetected > 0 && (
          <button
            type="button"
            onClick={confirmAllPending}
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
    </div>
  );
}
