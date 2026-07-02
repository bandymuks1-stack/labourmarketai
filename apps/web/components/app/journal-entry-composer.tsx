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
import { WorkEntrySkillReview } from "@/components/app/work-entry-skill-review";
import {
  extractJournalSuggestions,
  type JournalFragmentSuggestion,
} from "@/lib/structuring/extract-journal-suggestions";
import { dedupeSignalsByLabel } from "@/lib/structuring/signal-dedupe";
import { localizeCapabilityLabel } from "@/lib/structuring/capability-labels";
import type { SkillConfidence } from "@/lib/structuring/skill-recognition";
import {
  recognizeNewSkillSuggestions,
  labelForLocale,
  NEW_SKILL_LIMIT,
} from "@/lib/structuring/new-skill-suggestions";
import { classifyEntryRecognition } from "@/lib/structuring/recognition-tiers";
import { SimilarSkillsSection } from "@/components/app/similar-skills-section";
import {
  createJournalEntry,
  supersedeJournalEntry,
} from "@/lib/journal/actions";
import { autoLinkRecognizedJournalSkills } from "@/lib/journal/journal-entry-skills-actions";
import { saveProfileSkillClaimsAction } from "@/lib/profile/profile-skill-claims-actions";
import type { JournalEditingEntry } from "@/lib/journal/edit-entry";
import {
  isValidJournalPhoto,
  uploadJournalEntryPhoto,
  type JournalPhotoUploadResult,
} from "@/lib/journal/photo-upload";
import { compressImageFile } from "@/lib/browser/image-compress";
import { formatDuration } from "@/lib/journal/format-duration";
import {
  completeTask,
  errorTask,
  recordEvent,
  startTask,
  trackFunnel,
} from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { cn } from "@/lib/utils";
import { Link } from "@/lib/i18n/navigation";

export type JournalEngagement = {
  id: string;
  label: string;
  isPrimary: boolean;
};
export type JournalDirection = { slug: string; name: string };
export type JournalSkill = { slug: string; name: string };
/** A worker skill matched to the entry, carrying why it was suggested and how
 *  strong the evidence is (Recognition v1). */
export type ComposerSkillSuggestion = JournalSkill & {
  matchedText: string;
  confidence: SkillConfidence;
};
/** A skill the entry hints at that the worker has NOT declared yet
 *  (Recognition v1.1). Adding it creates ONLY a self-declared profile claim
 *  — never verified, never manager-confirmed, never journal evidence. */
export type ComposerNewSkillSuggestion = {
  slug: string;
  /** Canonical (LT) label — used for dedupe and as the stored profile claim. */
  name: string;
  /** Locale-aware label for DISPLAY only; falls back to `name`. */
  displayName?: string;
  matchedText: string;
  confidence: SkillConfidence;
};
type NewSkillAddStatus = "idle" | "adding" | "added" | "error";

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

export type { JournalEditingEntry };

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
  const tSkill = useTranslations("skillNames");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  const primaryId =
    engagements.find((e) => e.isPrimary)?.id ?? engagements[0]?.id ?? "";
  const today = new Date().toISOString().slice(0, 10);

  // EDIT-mode preload (v5): when editing, reconstruct the saved structured
  // state so the composer re-sends date / hours / quantity / direction / skills
  // even on a text-only edit — `supersedeJournalEntry` rebuilds metrics from
  // the form, so anything not preloaded here would be silently dropped. The
  // composer is remounted per edit target (page `key`), so these initial values
  // re-run for each edit. Preloaded values open as `confirmed` so they persist
  // without forcing the worker to re-run "Sutvarkyti tekstą".
  const editSkillSuggestions: ComposerSkillSuggestion[] = (
    editingEntry?.skillSlugs ?? []
  )
    .map((slug) => {
      const w = workerSkills.find((s) => s.slug === slug);
      return w
        ? {
            slug: w.slug,
            name: w.name,
            matchedText: w.name,
            confidence: "high" as SkillConfidence,
          }
        : null;
    })
    .filter((row): row is ComposerSkillSuggestion => !!row);

  const [stage, setStage] = useState<Stage>("compose");
  const [text, setText] = useState(editingEntry?.originalText ?? "");
  // Activation funnel (P0-A): fire once when the worker first types into a
  // NEW entry (skip edits of an existing entry, which start pre-filled).
  const journalStartedRef = useRef(Boolean(editingEntry));
  function noteJournalEntryStarted(next: string): void {
    if (journalStartedRef.current) return;
    if (next.trim().length === 0) return;
    journalStartedRef.current = true;
    trackFunnel(FUNNEL_EVENTS.journalEntryStarted, { surface: "journal" });
  }
  // Edit-flow honesty (P0): when the worker changes the text of an entry they
  // are editing, the structured details carried over from the OLD text may no
  // longer match. We never silently keep showing them as current — the
  // preserved block is muted and a neutral prompt asks the worker to re-run
  // "Sutvarkyti tekstą" so the system re-evaluates the CURRENT full text.
  const textDirty =
    !!editingEntry && text.trim() !== (editingEntry.originalText ?? "").trim();
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
    useState<JournalPhotoUploadResult | null>(null);  const [photoPrep, setPhotoPrep] = useState<"idle" | "preparing" | "ready">(
    "idle",
  );


  const [timeStatus, setTimeStatus] = useState<SuggestionStatus>(
    editingEntry?.time ? "confirmed" : "pending",
  );
  const [timeValue, setTimeValue] = useState<string>(
    editingEntry?.time ? String(editingEntry.time.value) : "",
  );
  const [timeUnit, setTimeUnit] = useState<string>(
    editingEntry?.time?.unitSlug ?? "hours",
  );
  const [qtyStatus, setQtyStatus] = useState<SuggestionStatus>(
    editingEntry?.quantity ? "confirmed" : "pending",
  );
  const [qtyValue, setQtyValue] = useState<string>(
    editingEntry?.quantity ? String(editingEntry.quantity.value) : "",
  );
  const [qtyUnit, setQtyUnit] = useState<string>(
    editingEntry?.quantity?.unitSlug ?? "square_meters",
  );
  const [dirStatus, setDirStatus] = useState<SuggestionStatus>(
    editingEntry?.workDirectionSlug ? "confirmed" : "pending",
  );
  const [dirSlug, setDirSlug] = useState<string>(
    editingEntry?.workDirectionSlug ?? "",
  );
  const [siteStatus, setSiteStatus] = useState<SuggestionStatus>(
    editingEntry?.siteName ? "confirmed" : "pending",
  );
  const [siteName, setSiteName] = useState<string>(editingEntry?.siteName ?? "");
  const [skillStatuses, setSkillStatuses] = useState<
    Record<string, SuggestionStatus>
  >(Object.fromEntries(editSkillSuggestions.map((s) => [s.slug, "confirmed"])));
  const [skillSuggestions, setSkillSuggestions] = useState<
    ComposerSkillSuggestion[]
  >(editSkillSuggestions);
  // Recognition v1.1 — skills the entry hints at that the worker has NOT
  // declared yet, surfaced separately as "possible new skills" they may add.
  const [newSkillSuggestions, setNewSkillSuggestions] = useState<
    ComposerNewSkillSuggestion[]
  >([]);
  // Owner 3-level model — tier 2 (CANDIDATE). When the entry was NOT confidently
  // recognised but similar catalogue matches exist, they surface here, in their
  // OWN "Panašūs įgūdžiai / Similar skills" section (never as current signals or
  // facts). Mutually exclusive with `newSkillSuggestions`: a confident entry
  // uses the "Possible new skill" group, an unsure one uses Similar skills.
  const [candidateSuggestions, setCandidateSuggestions] = useState<
    ComposerNewSkillSuggestion[]
  >([]);
  const [newSkillStatus, setNewSkillStatus] = useState<
    Record<string, NewSkillAddStatus>
  >({});
  // Multi-fragment review state — populated when the parser splits the text
  // into more than one work fragment (the owner sentence yields 3).
  const [fragments, setFragments] = useState<FragmentReviewState[]>([]);
  // v3 — institution / topic detection cards.
  const [institutionStatus, setInstitutionStatus] = useState<SuggestionStatus>(
    editingEntry?.institutionName ? "confirmed" : "pending",
  );
  const [institutionName, setInstitutionName] = useState<string>(
    editingEntry?.institutionName ?? "",
  );
  const [topicStatus, setTopicStatus] = useState<SuggestionStatus>(
    editingEntry?.topic ? "confirmed" : "pending",
  );
  const [topic, setTopic] = useState<string>(editingEntry?.topic ?? "");
  const [engagementId, setEngagementId] = useState<string>(primaryId);
  // Preserve the entry's saved work date on edit (do NOT reset to today).
  const [workDate, setWorkDate] = useState<string>(
    editingEntry?.workDate ?? today,
  );

  const existingSkillRefs = useMemo(
    () => workerSkills.map((s) => ({ slug: s.slug, label: s.name })),
    [workerSkills],
  );
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
    // Layer E narrowing: keep only skills the worker has actually declared
    // (no broad cloud), carrying the match reason + confidence for each.
    const matchedSkills: ComposerSkillSuggestion[] = s.skillSuggestions
      .map((m) => {
        const row = workerSkillBySlug.get(m.slug);
        return row
          ? { ...row, matchedText: m.matchedText, confidence: m.confidence }
          : null;
      })
      .filter((row): row is ComposerSkillSuggestion => !!row);
    setSkillSuggestions(matchedSkills);
    setSkillStatuses(
      Object.fromEntries(matchedSkills.map((row) => [row.slug, "pending"])),
    );

    // Recognition v1.1 — possible NEW (undeclared) skills, surfaced separately.
    // Two sources, both excluding what the worker already declared:
    //   1. construction skills the engine recognised but the worker has not
    //      declared (name from the skill taxonomy);
    //   2. cross-sector skills from the sector-neutral catalogue (name carried
    //      with the suggestion).
    // Low-confidence (fuzzy) hits are NOT offered for add — they go to the
    // manual-pick path, so a weak guess never becomes a one-tap profile claim.
    const declaredSlugSet = new Set(workerSkills.map((w) => w.slug));
    const undeclaredFromEngine: ComposerNewSkillSuggestion[] = s.skillSuggestions
      .filter((m) => !declaredSlugSet.has(m.slug) && m.confidence !== "low")
      .map((m) => ({
        slug: m.slug,
        name: tSkillSafe(tSkill, m.slug),
        matchedText: m.matchedText,
        confidence: m.confidence,
      }));
    const crossSector: ComposerNewSkillSuggestion[] = recognizeNewSkillSuggestions(
      raw,
      declaredSlugSet,
    ).map((m) => ({
      slug: m.slug,
      name: labelForLocale(m.labels, locale),
      matchedText: m.matchedText,
      confidence: m.confidence,
    }));
    // Explicit named capabilities/specializations the worker wrote (e.g.
    // "lietuviškos virtuvės gamyba", "vairavimas", "sutarčių ruošimas").
    // These are the strongest evidence — the worker said them outright — and
    // preserve specializations the slug engine would flatten, so they lead the
    // list. They carry a synthetic `claim:` slug (no taxonomy row) and add to
    // the profile as a self-declared claim via the SAME action as below.
    const capabilityNew: ComposerNewSkillSuggestion[] = s.capabilitySuggestions.map(
      (c) => ({
        slug: `claim:${c.normalizedLabel}`,
        // Canonical LT label (dedupe + stored claim); localized for display only
        // so EN/RU never see the LT-only capability label.
        name: c.label,
        displayName: localizeCapabilityLabel(c.label, locale),
        // Reason from the text fragment (every suggestion explains WHY it shows).
        matchedText: c.reason ?? c.label,
        confidence: "medium" as SkillConfidence,
      }),
    );
    // Concept dedupe (round 3, corrected owner P0 2026-07-02): one concept =
    // one ACTIONABLE signal. Seed "already shown" with the worker's declared
    // skills and the matched declared-skill chips only. Fragment activity
    // labels must NOT seed it: a fragment card is informational (it has no
    // add-to-profile action, and single-fragment entries render no card at
    // all), so seeding with it deleted the only actionable chip — e.g. the
    // "Programavimas" add-to-profile chip vanished because a fragment carried
    // the same label. True duplicates (two chips for one skill) are still
    // collapsed by dedupeSignalsByLabel across the merged list itself. Labels
    // are always localized (journal-no-raw-slug guard), so label dedupe is
    // concept dedupe.
    const alreadyShown = [
      ...workerSkills.map((w) => w.name),
      ...matchedSkills.map((m) => m.name),
    ];
    const mergedNew = dedupeSignalsByLabel(
      [...capabilityNew, ...undeclaredFromEngine, ...crossSector].filter(
        (item) => !declaredSlugSet.has(item.slug),
      ),
      alreadyShown,
    );
    // Allow headroom beyond NEW_SKILL_LIMIT so explicitly-named capabilities
    // are not crowded out by engine guesses; still bounded for the review grid.
    const cappedNew = mergedNew.slice(0, Math.max(NEW_SKILL_LIMIT, 12));

    // Owner 3-level routing. `classifyEntryRecognition` is the single source of
    // truth for the tier (same classifier the audit scores against):
    //   - candidate_suggestion → no confident signal, but similar matches exist
    //     → route the cross-sector catalogue hits to the SEPARATE "Similar
    //     skills" section; the "Possible new skill" group stays empty so the two
    //     are never blurred.
    //   - auto_signal / manual_only → keep the existing "Possible new skill"
    //     group (undeclared mentions of an UNDERSTOOD entry); no Similar skills.
    const tier = classifyEntryRecognition(raw, declaredSlugSet);
    const inCandidateMode = tier.tier === "candidate_suggestion";
    const visibleNew = inCandidateMode ? [] : cappedNew;
    const candidates = inCandidateMode ? crossSector : [];
    setNewSkillSuggestions(visibleNew);
    setCandidateSuggestions(candidates);
    setNewSkillStatus(
      Object.fromEntries(
        [...visibleNew, ...candidates].map((row) => [
          row.slug,
          "idle" as NewSkillAddStatus,
        ]),
      ),
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

  /** Add an undeclared skill to the worker's profile as a SELF-DECLARED claim
   *  only (profile_skill_claims). This never sets verified / manager_confirmed
   *  and never creates Work-Journal evidence — the entry is not linked here. */
  async function addNewSkill(slug: string, name: string) {
    setNewSkillStatus((prev) => ({ ...prev, [slug]: "adding" }));
    try {
      await saveProfileSkillClaimsAction([name]);
      setNewSkillStatus((prev) => ({ ...prev, [slug]: "added" }));
      recordEvent("journal_new_skill_added", {});
    } catch (e) {
      console.error("[journal-composer] add new skill failed:", e);
      setNewSkillStatus((prev) => ({ ...prev, [slug]: "error" }));
    }
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
      // systemic-ux-skills-v1: recognition → evidence on save. Links the
      // recognised skills the worker already declared to this entry (real
      // journal-supported evidence). Best-effort + additive: never invents a
      // skill, never verifies, and a failure here never loses the saved entry.
      void autoLinkRecognizedJournalSkills(result.entryId, text);
      recordEvent("journal_save_success", {
        fragment_count: confirmedFragments.length,
      });
      // Activation funnel (P0-A) — canonical journal-artifact-created signal.
      trackFunnel(FUNNEL_EVENTS.journalEntrySaved, {
        surface: "journal",
        success: true,
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
      setNewSkillSuggestions([]);
      setCandidateSuggestions([]);
      setNewSkillStatus({});
      setFragments([]);
      setInstitutionName("");
      setTopic("");
      setPhotoFile(null);
      setPhotoError(null);
      setPhotoPrep("idle");
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
        {editingEntry && (
          // v5 — show the structured state carried over from the saved entry so
          // the worker can SEE that date / hours / quantity / direction / skills
          // are preserved (and will be re-saved) even on a text-only edit.
          <div
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
            data-testid="journal-edit-preserved"
          >
            <p className="text-[11px] font-medium text-text-secondary">
              {t("editPreservedTitle")}
            </p>
            {textDirty && (
              <div className="flex flex-col gap-1.5">
                <p
                  className="text-[11px] leading-relaxed text-state-warning"
                  data-testid="journal-edit-text-changed"
                >
                  {t("editTextChangedHint")}
                </p>
                {/* One clear action to re-run cleanup on the CURRENT text so
                    current signals come from the current text, not the old one. */}
                <button
                  type="button"
                  onClick={() => {
                    setSavedAt(null);
                    analyse(text);
                  }}
                  data-testid="journal-edit-rerun"
                  className="w-fit rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
                >
                  {t("organizeText")}
                </button>
              </div>
            )}
            <div className={cn("flex flex-wrap gap-1.5", textDirty && "opacity-50")}>
              {workDate && (
                <span className="rounded-md border border-ink-500 px-2 py-0.5 text-[11px] text-text-secondary" data-testid="journal-edit-preserved-date">
                  {workDate}
                </span>
              )}
              {timeValue && (
                <span className="rounded-md border border-ink-500 px-2 py-0.5 text-[11px] text-text-secondary" data-testid="journal-edit-preserved-time">
                  {timeValue} {tUnit(timeUnit)}
                </span>
              )}
              {qtyValue && (
                <span className="rounded-md border border-ink-500 px-2 py-0.5 text-[11px] text-text-secondary" data-testid="journal-edit-preserved-qty">
                  {qtyValue} {tUnit(qtyUnit)}
                </span>
              )}
              {dirSlug && (
                <span className="rounded-md border border-ink-500 px-2 py-0.5 text-[11px] text-text-secondary" data-testid="journal-edit-preserved-dir">
                  {directionBySlug.get(dirSlug)?.name ?? dirSlug}
                </span>
              )}
              {skillSuggestions.map((s) => (
                <span
                  key={s.slug}
                  className="rounded-md border border-brand-blue/40 bg-brand-blue/5 px-2 py-0.5 text-[11px] text-brand-blue"
                  data-testid={`journal-edit-preserved-skill-${s.slug}`}
                >
                  {s.name}
                </span>
              ))}
            </div>
          </div>
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
            onChange={(e) => {
              noteJournalEntryStarted(e.target.value);
              setText(e.target.value);
            }}
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
            onChange={async (e) => {
              const f = e.target.files?.[0] ?? null;
              if (!f) {
                setPhotoFile(null);
                setPhotoError(null);
                setPhotoPrep("idle");
                return;
              }
              // Wrong format → honest error; size is handled by compression.
              if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
                setPhotoFile(null);
                setPhotoError(t("photo.invalidFile"));
                setPhotoPrep("idle");
                return;
              }
              setPhotoError(null);
              setPhotoPrep("preparing");
              // Auto-resize/compress normal phone photos before upload.
              const { file: prepared } = await compressImageFile(f);
              if (!isValidJournalPhoto(prepared)) {
                setPhotoFile(null);
                setPhotoPrep("idle");
                setPhotoError(t("photo.tooLargeAfter"));
                return;
              }
              setPhotoFile(prepared);
              setPhotoPrep("ready");
            }}
            className="text-xs text-text-secondary file:mr-3 file:rounded-md file:border file:border-ink-500 file:bg-ink-700 file:px-3 file:py-1.5 file:text-xs file:text-text-primary"
          />
          {photoError ? (
            <p className="text-xs text-state-danger" role="alert">
              {photoError}
            </p>
          ) : null}          {photoPrep === "preparing" ? (
            <p
              className="text-xs text-text-secondary"
              role="status"
              data-testid="journal-photo-preparing"
            >
              {t("photo.preparing")}
            </p>
          ) : null}
          {photoPrep === "ready" ? (
            <p
              className="text-xs text-state-success"
              role="status"
              data-testid="journal-photo-prepared"
            >
              {t("photo.prepared")}
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
    newSkillSuggestions.length +
    candidateSuggestions.length +
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

      {/* The cross-sector "what I understood / did" panel is a CONFIDENT-signal
          view. In candidate mode (unsure) we suppress it so a candidate is never
          presented as a current signal — the "Similar skills" section is shown
          instead (owner rule: candidates must not appear as current signals). */}
      {candidateSuggestions.length === 0 && (
        <WorkEntrySkillReview text={text} existingSkills={existingSkillRefs} />
      )}

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
        // Tier 3 — MANUAL ONLY: nothing confident, no similar candidate. The
        // system never guesses; it offers an honest manual fallback instead.
        <div
          className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-4"
          data-testid="manual-fallback"
        >
          <p className="text-sm text-text-secondary">{tS("noMatches")}</p>
          <p className="text-[11px] leading-relaxed text-text-muted">
            {t("addManuallyHint")}
          </p>
          <Link
            href="/dashboard/profile#capabilities"
            className="w-fit text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
            data-testid="manual-fallback-link"
          >
            {t("addManuallyCta")} →
          </Link>
        </div>
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
                // Label-only activity/capability labels are canonical LT — localize
                // for display so EN/RU never see the LT label. (A matched profession
                // slug already localizes via tProf; its LT fallback is localized too.)
                const localizedFragmentLabel = f.activityLabel
                  ? localizeCapabilityLabel(f.activityLabel, locale)
                  : null;
                const activityName = f.isUnknown
                  ? t("fragment.unknownTitle")
                  : f.activitySlug
                    ? tProfSafe(tProf, f.activitySlug, localizedFragmentLabel)
                    : (localizedFragmentLabel ?? t("fragment.noActivity"));
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
            {skillSuggestions.length === 0 && (
              // Honest empty state for the "skills you already declared" bucket:
              // none matched. The manual-link is offered only when there is also
              // NO similar candidate and NO possible-new-skill — i.e. the genuine
              // tier-3 MANUAL ONLY case — so it never competes with the "Similar
              // skills" choice the worker should make first.
              <div
                className="md:col-span-2 flex flex-col gap-1.5"
                data-testid="skill-suggestions-empty-note"
              >
                <p className="text-[11px] leading-relaxed text-text-muted">
                  {t("skillNoMatch")}
                </p>
                {candidateSuggestions.length === 0 &&
                  newSkillSuggestions.length === 0 && (
                    <Link
                      href="/dashboard/profile#capabilities"
                      className="w-fit text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
                      data-testid="skill-add-manually-link"
                    >
                      {t("addManuallyCta")} →
                    </Link>
                  )}
              </div>
            )}
            {skillSuggestions.map((row) => (
              <DetectedSuggestionCard
                key={row.slug}
                label={row.name}
                // Reason: WHY this skill was suggested (the word we found).
                hint={t("reasonFound", { word: row.matchedText })}
                status={skillStatuses[row.slug] ?? "pending"}
                onConfirm={() => setSkillStatus(row.slug, "confirmed")}
                onDiscard={() => setSkillStatus(row.slug, "discarded")}
              >
                {row.confidence === "low" && (
                  <span
                    className="text-[10px] text-text-muted"
                    data-testid="skill-suggestion-weak"
                  >
                    {t("reasonWeak")}
                  </span>
                )}
              </DetectedSuggestionCard>
            ))}
          </DetectedSuggestionList>

          {newSkillSuggestions.length > 0 && (
            // Recognition v1.1 — possible NEW skills the worker has not declared
            // yet. Adding one creates ONLY a self-declared profile claim (never
            // verified, never manager-confirmed, never journal evidence until
            // the worker explicitly links it). Kept visually separate from the
            // "already in your profile" bucket above.
            <DetectedSuggestionList
              className="md:col-span-2"
              // "Possible new skill" — undeclared skills an UNDERSTOOD entry
              // mentioned. The unsure CANDIDATE tier is a separate section
              // ("Similar skills"), so this group keeps its own clear meaning.
              title={t("newSkillGroupTitle")}
              count={newSkillSuggestions.length}
            >
              <p
                className="md:col-span-2 text-[11px] leading-relaxed text-text-muted"
                data-testid="new-skill-suggestions-intro"
              >
                {t("newSkillIntro")}
              </p>
              {newSkillSuggestions.map((row) => {
                const status = newSkillStatus[row.slug] ?? "idle";
                return (
                  <div
                    key={row.slug}
                    data-testid={`new-skill-suggestion-${row.slug}`}
                    className="flex flex-col gap-2 rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {row.displayName ?? row.name}
                      </span>
                      {status === "added" ? (
                        <span
                          className="text-xs font-semibold text-state-success"
                          data-testid={`new-skill-added-${row.slug}`}
                        >
                          ✓ {t("newSkillAdded")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={status === "adding"}
                          aria-busy={status === "adding" || undefined}
                          onClick={() => addNewSkill(row.slug, row.name)}
                          data-testid={`new-skill-add-${row.slug}`}
                          // Mobile-safe target (≥44px, full-width on phones) so
                          // adding a skill is no longer a tiny text tap. Clear
                          // adding/added/disabled feedback via state above.
                          className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-md border border-brand-blue/50 px-4 text-sm font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          {status === "adding"
                            ? t("newSkillAdding")
                            : t("newSkillAdd")}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-text-muted">
                      {t("reasonFound", { word: row.matchedText })}
                      {row.confidence === "medium" && ` · ${t("reasonWeak")}`}
                    </p>
                    {status === "error" && (
                      <p
                        className="text-[11px] text-state-danger"
                        role="alert"
                        data-testid={`new-skill-error-${row.slug}`}
                      >
                        {t("newSkillError")}
                      </p>
                    )}
                  </div>
                );
              })}
            </DetectedSuggestionList>
          )}

          {/* Tier 2 — CANDIDATE: a distinct "Panašūs įgūdžiai / Similar skills"
              section, separate from current signals, the "Possible new skill"
              group, linked skills and the manual fallback. Renders ONLY for an
              unsure entry; choosing one routes through addNewSkill (the existing
              self-declared-claim path) — never a current signal, never a fact. */}
          <SimilarSkillsSection
            candidates={candidateSuggestions}
            statusBySlug={newSkillStatus}
            onAdd={addNewSkill}
          />
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

/** Resolve a skill slug to its localized taxonomy name, falling back to the
 *  raw slug when the namespace has no entry (keeps the composer renderable
 *  even if a recognised slug is missing a name). */
function tSkillSafe(tSkill: (key: string) => string, slug: string): string {
  try {
    const v = tSkill(slug);
    if (v && v !== slug) return v;
  } catch {
    /* fall through */
  }
  return slug;
}
