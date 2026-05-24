"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CvInputPanel } from "@/components/app/cv-input-panel";
import { DetectedSuggestionCard, type SuggestionStatus } from "@/components/app/detected-suggestion-card";
import { DetectedSuggestionList } from "@/components/app/detected-suggestion-list";
import { TextFirstComposer } from "@/components/app/text-first-composer";
import { extractProfileSkillClaims } from "@/lib/profile/skill-claim-extractor";
import { saveProfileSkillClaimsAction } from "@/lib/profile/profile-skill-claims-actions";
import { saveWorkerProfileText } from "@/lib/worker/profile-text-actions";
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
  /** Manual picker rendered after the user clicks "Add manually". */
  manualSlot: React.ReactNode;
}) {
  const t = useTranslations("skills.textFirst");
  const tS = useTranslations("structuring");
  const tBucket = useTranslations("structuring.buckets");

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

    // Single extractor → single bucket. Already-saved labels are
    // filtered so the user doesn't see redundant chips on re-extract.
    setSelfDeclared(
      extractProfileSkillClaims(raw)
        .filter((c) => !savedClaimSet.has(c.normalizedLabel))
        .map((c, i) => ({
          key: `claim-${i}-${c.normalizedLabel}`,
          status: "pending",
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
      // Self-declared profile_skill_claims — the ONLY persistence path
      // from the text composer now. Owner-only RLS; the server action
      // upserts on (profile_id, normalized_label) so re-clicking Save
      // never duplicates. Catalogued worker_skills writes were removed
      // alongside the OLD bucket grid; the manual picker still has its
      // own catalogued save path.
      const confirmedClaims = selfDeclared
        .filter((it) => it.status === "confirmed")
        .map((it) => it.label.trim())
        .filter((l) => l.length > 0);
      if (confirmedClaims.length > 0) {
        await saveProfileSkillClaimsAction(confirmedClaims);
      }
      setApplied(true);
    } catch (e) {
      console.error("[profile-text-first] apply failed:", e);
      setError(tS("actions.confirm"));
    } finally {
      setApplying(false);
    }
  }

  if (stage === "manual") {
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
      <div className="flex flex-col gap-4">
        <TextFirstComposer
          title={t("title")}
          helper={t("helper")}
          placeholder={t("placeholder")}
          submitLabel={t("submit")}
          manualLabel={t("manualCta")}
          onSubmit={analyse}
          onManual={() => setStage("manual")}
          initial={text}
        />
        <TextSaveIndicator state={textSaveState} t={t} />
        <CvInputPanel
          onPasteSubmit={(v) => {
            setPasted(v);
            analyse(v);
          }}
        />
        <p className="text-xs text-text-secondary">{t("manualHelper")}</p>
      </div>
    );
  }

  const anyConfirmed = selfDeclared.some((s) => s.status === "confirmed");
  const totalDetected = selfDeclared.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
          <span className="text-text-muted">{tS("groupEyebrow")}</span> ·{" "}
          {totalDetected}
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
            onClick={() => setStage("compose")}
            className="rounded-md border border-ink-500 px-2.5 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
          >
            {t("backToText")}
          </button>
          <button
            type="button"
            onClick={() => setStage("manual")}
            className="rounded-md border border-ink-500 px-2.5 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
          >
            {t("manualCta")}
          </button>
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

      {totalDetected === 0 ? (
        // Universal fallback — the dictionary will miss anything outside
        // its vocabulary. Tell the user that's OK, point them at the
        // manual path — never a dead end.
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
            <button
              type="button"
              onClick={() => setStage("manual")}
              className="rounded-md border border-ink-500 px-2.5 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              {t("manualCta")}
            </button>
          </div>
        </div>
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
        >
          <p className="font-semibold">✓ {t("appliedToast")}</p>
          <p className="mt-1 text-text-secondary">
            <span className="font-mono text-[10px] uppercase tracking-label text-state-success">
              {t("confirmedByYou")}
            </span>{" "}
            · {t("addedToProfile")} · {t("needsExternalConfirmation")}
          </p>
        </div>
      )}

      <div className={cn("flex flex-wrap items-center gap-3")}>
        <Button
          type="button"
          onClick={applyConfirmed}
          disabled={!anyConfirmed || applying}
        >
          {t("applyAll")}
        </Button>
        <span className="text-[11px] text-text-muted">
          {tS("ruleBasedNotice")}
        </span>
      </div>
    </div>
  );
}
