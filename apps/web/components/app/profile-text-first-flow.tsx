"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CvInputPanel } from "@/components/app/cv-input-panel";
import { DetectedSuggestionCard, type SuggestionStatus } from "@/components/app/detected-suggestion-card";
import { DetectedSuggestionList } from "@/components/app/detected-suggestion-list";
import { TextFirstComposer } from "@/components/app/text-first-composer";
import { extractProfileSkillClaims } from "@/lib/profile/skill-claim-extractor";
import { saveProfileSkillClaimsAction } from "@/lib/profile/profile-skill-claims-actions";
import { saveWorkerProfileText } from "@/lib/worker/profile-text-actions";
import { recordEvent } from "@/lib/telemetry/task";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** Tiny inline pill — tells the user the *narrative* is persisted. Suggestions
 *  still need per-card confirm; this is decoupled from "skills are verified". */
function TextSaveIndicator({
  state,
  t,
}: {
  state: "idle" | "saving" | "saved" | "error";
  t: (key: string) => string;
}) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <p
        role="status"
        className="font-mono text-[10px] uppercase tracking-label text-text-muted"
      >
        {t("textSavingLabel")}
      </p>
    );
  }
  if (state === "error") {
    return (
      <p
        role="alert"
        className="font-mono text-[10px] uppercase tracking-label text-state-danger"
      >
        {t("textSaveErrorLabel")}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="font-mono text-[10px] uppercase tracking-label text-state-success"
    >
      ✓ {t("textSavedLabel")} · {t("textClaimNotVerified")}
    </p>
  );
}

/** Per-suggestion view state — the parser proposes, the user disposes. */
type Item = {
  key: string;
  status: SuggestionStatus;
  /** Normalized label — UNIQUE key column for `profile_skill_claims`. */
  value: string;
  /** Human form shown in the chip. */
  label: string;
};

/**
 * Text-first / CV-first onboarding for the worker profile.
 *
 * Single canonical output: the `Paties nurodyti įgūdžiai` bucket, sourced
 * exclusively from the PR #45 free-text extractor and persisted to
 * `profile_skill_claims` (owner-only RLS, status='self_declared',
 * source='profile_text', visibility='closed').
 *
 * Removed in fix/cc/profile-text-skills-unify-flow-v2: the legacy
 * `extractProfileSuggestions` bucket grid (`Rasti įgūdžiai` / `Galimos
 * darbo kryptys` / `Galimi vaidmenys` / `Patirtis` / `Galimi CV įrašai`)
 * and the `/api/workers/:id/skills` POST that backed it. Owner production
 * smoke proved the dual-system UX confused users (e.g. "Stogdengys"
 * appearing ONLY in the lower bucket while the upper canonical one stayed
 * empty, even though the new extractor matches `stog`). The catalogued
 * worker_skills picker remains available via `Pridėti rankiniu būdu`
 * (manualSlot) — the explicit, intentional path.
 */
export function ProfileTextFirstFlow({
  initialText = "",
  savedClaimNormalizedLabels = [],
  manualSlot,
}: {
  /** Previously-saved self-description text (owner-only profiles.profile_text),
   *  prefilled into the composer. */
  initialText?: string;
  /** Normalized labels of profile_skill_claims rows the user has already
   *  saved. Used to suppress duplicate suggestions on re-extract. */
  savedClaimNormalizedLabels?: string[];
  /** Manual picker rendered after the user clicks "Add manually".
   *  Optional — non-worker users (e.g. pure company/agency accounts)
   *  have no catalogued worker_skills picker yet, so the "Pridėti
   *  rankiniu būdu" CTA is hidden for them entirely. */
  manualSlot?: React.ReactNode;
}) {
  const t = useTranslations("skills.textFirst");
  const tS = useTranslations("structuring");
  const tBucket = useTranslations("structuring.buckets");
  const router = useRouter();

  const [stage, setStage] = useState<"compose" | "review" | "manual">("compose");
  const [text, setText] = useState(initialText);
  const [pasted, setPasted] = useState("");
  const [textSaveState, setTextSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >(initialText.trim().length > 0 ? "saved" : "idle");
  const [hasExtracted, setHasExtracted] = useState(false);
  const [selfDeclared, setSelfDeclared] = useState<Item[]>([]);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedClaimSet = useMemo(
    () => new Set(savedClaimNormalizedLabels),
    [savedClaimNormalizedLabels],
  );

  // Counts the user actually needs to reason about save-state. The
  // visible UI uses these directly so the bottom save button cannot
  // be wired without a non-zero selection, and the "no new
  // suggestions" empty state shows when extraction returns nothing
  // genuinely new.
  const newSuggestions = selfDeclared.filter(
    (s) => s.status !== "already_saved",
  );
  const newCount = newSuggestions.length;
  const selectedCount = selfDeclared.filter(
    (s) => s.status === "confirmed",
  ).length;
  const alreadySavedShown = selfDeclared.filter(
    (s) => s.status === "already_saved",
  ).length;
  const savedThisSession = selfDeclared.filter(
    (s) => s.status === "saved",
  ).length;

  function analyse(raw: string) {
    setError(null);
    setApplied(false);
    setText(raw);
    setHasExtracted(true);

    // Persist the user's own words. The text is the *claim* — saved into
    // the owner-only `profiles.profile_text` (migration 0014); reload
    // prefills the composer. Suggestions still need per-card confirm;
    // this save does NOT mark any skill as verified. profiles_select RLS
    // (0001) keeps the text owner-only — employers cannot read it.
    if (raw.trim().length > 0) {
      setTextSaveState("saving");
      void saveWorkerProfileText(raw)
        .then(() => setTextSaveState("saved"))
        .catch((e) => {
          console.error("[profile-text-first] save text failed:", e);
          setTextSaveState("error");
        });
    }

    // Single extractor → single bucket. Chips the user has ALREADY
    // saved (server-side `profile_skill_claims`) are kept in the list
    // BUT marked with `already_saved` status so the user sees *why*
    // they aren't actionable (rather than silently disappearing — the
    // prior PR #48 behavior, which broke save-state clarity). New
    // suggestions still carry `pending` status with the standard
    // select / discard actions.
    setSelfDeclared(
      extractProfileSkillClaims(raw).map((c, i) => ({
        key: `claim-${i}-${c.normalizedLabel}`,
        status: savedClaimSet.has(c.normalizedLabel)
          ? "already_saved"
          : "pending",
        value: c.normalizedLabel,
        label: c.label,
      })),
    );
    setStage("review");
  }

  function toggle(key: string, next: SuggestionStatus) {
    setSelfDeclared((prev) =>
      prev.map((it) => (it.key === key ? { ...it, status: next } : it)),
    );
  }

  async function applyConfirmed() {
    setApplying(true);
    setError(null);
    try {
      const confirmedClaims = selfDeclared
        .filter((it) => it.status === "confirmed")
        .map((it) => it.label.trim())
        .filter((l) => l.length > 0);
      if (confirmedClaims.length === 0) {
        // Defensive — the bottom save button is disabled in this case
        // so the call should not happen. Bail rather than no-op.
        return;
      }

      // Self-declared profile_skill_claims — the ONLY persistence path
      // from the text composer. Owner-only RLS; the server action
      // upserts on (profile_id, normalized_label) so re-clicking Save
      // never duplicates.
      await saveProfileSkillClaimsAction(confirmedClaims);

      // Pilot telemetry — fire-and-forget. We send a count of confirmed
      // skill claims (number, not labels) so the admin can see funnel
      // throughput without the labels themselves leaking into telemetry.
      recordEvent("profile_text_saved");
      recordEvent("profile_skill_suggestion_confirmed", {
        skill_count: confirmedClaims.length,
      });

      // SAVE-STATE LIFECYCLE (feat/cc/profile-save-state-and-idea-extraction):
      // The confirmed chips MOVE from `confirmed` → `saved` so the
      // user immediately sees that those chips are part of their
      // profile, not pending input. The success message below points
      // to the unified `Mano gebėjimai` surface below. router.refresh()
      // re-fetches the page so `CapabilityProfileSection` shows the new
      // chips in the canonical area without a full reload.
      setSelfDeclared((prev) =>
        prev.map((it) =>
          it.status === "confirmed" ? { ...it, status: "saved" } : it,
        ),
      );
      setApplied(true);
      router.refresh();
    } catch (e) {
      console.error("[profile-text-first] apply failed:", e);
      setError(tS("actions.confirm"));
    } finally {
      setApplying(false);
    }
  }

  if (stage === "manual" && manualSlot) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setStage(hasExtracted ? "review" : "compose")}
          className="self-start text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("backToText")}
        </button>
        {manualSlot}
      </div>
    );
  }

  if (stage === "compose" || !hasExtracted) {
    return (
      <div
        className="flex flex-col gap-4"
        data-testid="profile-text-flow-compose"
      >
        <TextFirstComposer
          title={t("title")}
          helper={t("helper")}
          placeholder={t("placeholder")}
          submitLabel={t("submit")}
          manualLabel={manualSlot ? t("manualCta") : undefined}
          onSubmit={analyse}
          onManual={manualSlot ? () => setStage("manual") : undefined}
          initial={text}
        />
        <TextSaveIndicator state={textSaveState} t={t} />
        <CvInputPanel
          onPasteSubmit={(v) => {
            setPasted(v);
            analyse(v);
          }}
        />
        {manualSlot && (
          <p className="text-xs text-text-secondary">{t("manualHelper")}</p>
        )}
      </div>
    );
  }

  const anyConfirmed = selectedCount > 0;
  // Counter shown above the bucket is "Sistema pasiūlė · N" where N is
  // NEW suggestions only — `already_saved` chips are visually present
  // but don't count as "new findings", otherwise the user sees
  // "Sistema pasiūlė · 4" with all 4 chips greyed out as already saved,
  // which is confusing.
  const headerCount = newCount;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
          <span className="text-text-muted">{tS("groupEyebrow")}</span> ·{" "}
          {headerCount}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => analyse(text || pasted)}
            className="rounded-md border border-ink-500 px-2.5 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
          >
            {t("rescan")}
          </button>
          <button
            type="button"
            onClick={() => {
              // Defensive reset on back-navigation: the user may have
              // saved earlier and we don't want a stale success toast
              // re-appearing if they tap submit again with no
              // changes. analyse() resets these too, but resetting
              // them here makes the edit-then-resuggest contract
              // explicit and matches the owner's mental model
              // ("clicking Grįžti prie teksto is a fresh start").
              setApplied(false);
              setError(null);
              setStage("compose");
            }}
            className="rounded-md border border-brand-blue/40 bg-brand-blue/5 px-2.5 py-1 text-xs font-semibold text-text-primary hover:border-brand-blue"
            data-testid="profile-text-flow-back-to-text"
          >
            ← {t("backToText")}
          </button>
          {manualSlot && (
            <button
              type="button"
              onClick={() => setStage("manual")}
              className="rounded-md border border-ink-500 px-2.5 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              {t("manualCta")}
            </button>
          )}
        </div>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tS("ruleBasedNotice")}
      </p>

      {selfDeclared.length > 0 && (
        <p
          className="text-xs text-text-secondary"
          data-testid="profile-text-flow-self-declared-disclaimer"
        >
          {tBucket("selfDeclaredDisclaimer")}
        </p>
      )}

      <TextSaveIndicator state={textSaveState} t={t} />

      {selfDeclared.length === 0 ? (
        // Universal fallback — the dictionary missed everything. The
        // text is still saved (TextSaveIndicator above shows that),
        // but no chips to confirm. Point at the manual path so the
        // flow never dead-ends.
        <div className="card-border flex flex-col gap-3 p-4">
          <p className="text-sm text-text-secondary">
            {t("noSuggestionsFallback")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStage("compose")}
              className="rounded-md border border-ink-500 px-2.5 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              {t("backToText")}
            </button>
            {manualSlot && (
              <button
                type="button"
                onClick={() => setStage("manual")}
                className="rounded-md border border-ink-500 px-2.5 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
              >
                {t("manualCta")}
              </button>
            )}
          </div>
        </div>
      ) : newCount === 0 && alreadySavedShown > 0 && savedThisSession === 0 ? (
        // "Only already-saved" empty state. The dictionary did find
        // chips, but all of them are already in the user's profile —
        // a re-extract with no new finds. The user must SEE the
        // already-saved chips (so they know nothing was missed) AND
        // the friendly explanation, but the bottom Save button is
        // disabled to keep the action surface honest.
        <>
          <p
            className="text-xs text-text-secondary"
            data-testid="profile-text-flow-no-new-suggestions"
          >
            {t("noNewSuggestions")}
          </p>
          <DetectedSuggestionList
            title={tBucket("selfDeclared")}
            count={selfDeclared.length}
          >
            {selfDeclared.map((it) => (
              <DetectedSuggestionCard
                key={it.key}
                label={it.label}
                status={it.status}
                onConfirm={() => toggle(it.key, "confirmed")}
                onDiscard={() => toggle(it.key, "discarded")}
              />
            ))}
          </DetectedSuggestionList>
        </>
      ) : (
        <DetectedSuggestionList
          title={tBucket("selfDeclared")}
          count={selfDeclared.length}
        >
          {selfDeclared.map((it) => (
            <DetectedSuggestionCard
              key={it.key}
              label={it.label}
              status={it.status}
              onConfirm={() => toggle(it.key, "confirmed")}
              onDiscard={() => toggle(it.key, "discarded")}
            />
          ))}
        </DetectedSuggestionList>
      )}

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}
      {applied && (
        <div
          role="status"
          className="rounded-md border border-state-success/40 bg-state-success/5 px-3 py-2 text-xs text-state-success"
          data-testid="profile-text-flow-applied-toast"
        >
          <p className="font-semibold">✓ {t("savedToCapabilities")}</p>
          <p className="mt-1 text-text-secondary">
            <span className="font-mono text-[10px] uppercase tracking-label text-state-success">
              {t("confirmedByYou")}
            </span>{" "}
            · {t("addedToProfile")} · {t("needsExternalConfirmation")}
          </p>
          {/* Make the result reachable — link straight to the capabilities
              surface below where the saved chips now live, so the save is not
              a silent dead end. */}
          <a
            href="#capabilities"
            className="mt-2 inline-flex text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
            data-testid="profile-text-flow-view-capabilities"
          >
            {t("viewCapabilities")} →
          </a>
        </div>
      )}

      <div className={cn("flex flex-wrap items-center gap-3")}>
        {/* Save button is honest about what it will do: hidden when
            there's nothing to save (newCount === 0 and selectedCount
            === 0), disabled when there are new suggestions but the
            user hasn't selected any, and switches to a loading label
            during the actual save round-trip. */}
        {(newCount > 0 || selectedCount > 0) && (
          <Button
            type="button"
            onClick={applyConfirmed}
            disabled={!anyConfirmed || applying}
            data-testid="profile-text-flow-apply-button"
          >
            {applying
              ? t("applying")
              : selectedCount === 0
                ? t("applyAllDisabledHint")
                : t("applyAll")}
          </Button>
        )}
        <span className="text-[11px] text-text-muted">
          {tS("ruleBasedNotice")}
        </span>
      </div>
    </div>
  );
}
