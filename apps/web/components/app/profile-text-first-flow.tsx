"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CvInputPanel } from "@/components/app/cv-input-panel";
import { DetectedSuggestionCard, type SuggestionStatus } from "@/components/app/detected-suggestion-card";
import { DetectedSuggestionList } from "@/components/app/detected-suggestion-list";
import { TextFirstComposer } from "@/components/app/text-first-composer";
import {
  extractProfileSuggestions,
  type ProfileSuggestions,
} from "@/lib/structuring/extract-profile-suggestions";
import { saveWorkerProfileText } from "@/lib/worker/profile-text-actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type SkillRow = { id: string; slug: string };
type ProfRow = { id: string; slug: string };

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
type Item<T> = {
  key: string;
  status: SuggestionStatus;
  value: T;
  /** Editable label (skills/directions keep their slug; the label is shown). */
  label: string;
};

/**
 * Text-first / CV-first onboarding for the worker profile. This is the
 * PRIMARY path now (PLATFORM_DOCTRINE §7, TASK spec). The legacy chip picker
 * stays available behind `Pridėti rankiniu būdu` for users who prefer manual.
 *
 * Parser source: lib/structuring/extract-profile-suggestions.ts — rule-based,
 * not AI. Nothing is persisted from this component directly. The user clicks
 * `Įtraukti patvirtintus pasiūlymus` to apply confirmed skills via the same
 * /api/workers/:id/skills endpoint the manual picker uses.
 */
export function ProfileTextFirstFlow({
  workerId,
  professionSkills,
  professions,
  initialSelectedIds,
  initialText = "",
  manualSlot,
}: {
  workerId: string;
  /** Localized skill rows ALLOWED for this worker (across all their directions). */
  professionSkills: (SkillRow & { name: string })[];
  /** Localized professions, used to render direction / role suggestions. */
  professions: (ProfRow & { name: string })[];
  initialSelectedIds: string[];
  /** Previously-saved self-description text (owner-only profiles.profile_text),
   *  prefilled into the composer. */
  initialText?: string;
  /** Manual picker rendered after the user clicks "Add manually". */
  manualSlot: React.ReactNode;
}) {
  const t = useTranslations("skills.textFirst");
  const tS = useTranslations("structuring");
  const tBucket = useTranslations("structuring.buckets");

  const [stage, setStage] = useState<"compose" | "review" | "manual">("compose");
  const [text, setText] = useState(initialText);
  const [pasted, setPasted] = useState("");
  const [textSaveState, setTextSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    initialText.trim().length > 0 ? "saved" : "idle",
  );
  const [suggestions, setSuggestions] = useState<ProfileSuggestions | null>(
    null,
  );
  const [skills, setSkills] = useState<Item<string>[]>([]);
  const [dirs, setDirs] = useState<Item<string>[]>([]);
  const [roles, setRoles] = useState<Item<string>[]>([]);
  const [cvEntries, setCvEntries] = useState<Item<string>[]>([]);
  const [yoe, setYoe] = useState<Item<number> | null>(null);
  const [team, setTeam] = useState<Item<number> | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skillBySlug = useMemo(
    () => new Map(professionSkills.map((s) => [s.slug, s])),
    [professionSkills],
  );
  const professionBySlug = useMemo(
    () => new Map(professions.map((p) => [p.slug, p])),
    [professions],
  );

  function analyse(raw: string) {
    setError(null);
    setApplied(false);
    const s = extractProfileSuggestions(raw);
    setText(raw);
    setSuggestions(s);
    // Persist the user's own words alongside the parser pass. The text is the
    // *claim* (§3) — saved into the owner-only profiles.profile_text column
    // (migration 0014) — and reload prefills the composer. Suggestions still
    // need a per-card confirm; this save does NOT mark any skill as verified.
    // Employers cannot read this column (profiles_select RLS is owner-only).
    if (raw.trim().length > 0) {
      setTextSaveState("saving");
      void saveWorkerProfileText(raw)
        .then(() => setTextSaveState("saved"))
        .catch((e) => {
          console.error("[profile-text-first] save text failed:", e);
          setTextSaveState("error");
        });
    }
    setSkills(
      s.skillSlugs
        .filter((slug) => skillBySlug.has(slug))
        .map((slug, i) => ({
          key: `skill-${i}-${slug}`,
          status: "pending",
          value: slug,
          label: skillBySlug.get(slug)?.name ?? slug,
        })),
    );
    setDirs(
      s.workDirectionSlugs
        .filter((slug) => professionBySlug.has(slug))
        .map((slug, i) => ({
          key: `dir-${i}-${slug}`,
          status: "pending",
          value: slug,
          label: professionBySlug.get(slug)?.name ?? slug,
        })),
    );
    setRoles(
      s.professionSlugs
        .filter((slug) => professionBySlug.has(slug))
        .map((slug, i) => ({
          key: `role-${i}-${slug}`,
          status: "pending",
          value: slug,
          label: professionBySlug.get(slug)?.name ?? slug,
        })),
    );
    setCvEntries(
      s.cvEntries.map((entry, i) => ({
        key: `cv-${i}`,
        status: "pending",
        value: entry,
        label: entry,
      })),
    );
    setYoe(
      s.yearsOfExperience !== null
        ? {
            key: "yoe",
            status: "pending",
            value: s.yearsOfExperience,
            label: String(s.yearsOfExperience),
          }
        : null,
    );
    setTeam(
      s.teamSize !== null
        ? {
            key: "team",
            status: "pending",
            value: s.teamSize,
            label: String(s.teamSize),
          }
        : null,
    );
    setStage("review");
  }

  function toggle<T>(
    list: Item<T>[],
    setList: (next: Item<T>[]) => void,
    key: string,
    next: SuggestionStatus,
  ) {
    setList(list.map((it) => (it.key === key ? { ...it, status: next } : it)));
  }

  async function applyConfirmed() {
    setApplying(true);
    setError(null);
    try {
      // Merge: keep existing saved skills, add confirmed parser slugs that
      // match a real skill row (skill_id from professionSkills).
      const confirmedSlugs = skills
        .filter((it) => it.status === "confirmed")
        .map((it) => it.value);
      const confirmedIds = confirmedSlugs
        .map((slug) => skillBySlug.get(slug)?.id)
        .filter((id): id is string => !!id);
      const nextIds = Array.from(new Set([...initialSelectedIds, ...confirmedIds]));
      const res = await fetch(`/api/workers/${workerId}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillIds: nextIds }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
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
          onClick={() => setStage(suggestions ? "review" : "compose")}
          className="self-start text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("backToText")}
        </button>
        {manualSlot}
      </div>
    );
  }

  if (stage === "compose" || !suggestions) {
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

  const anyConfirmed = skills.some((s) => s.status === "confirmed");
  const totalDetected =
    skills.length +
    dirs.length +
    roles.length +
    cvEntries.length +
    (yoe ? 1 : 0) +
    (team ? 1 : 0);

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

      <TextSaveIndicator state={textSaveState} t={t} />

      {totalDetected === 0 ? (
        // Universal fallback (Phase 4): the parser is rule-based and will miss
        // anything outside its small dictionary. Tell the user that's OK, and
        // point them at the manual path — never a dead end.
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
        <div className="grid gap-5 md:grid-cols-2">
          <DetectedSuggestionList title={tBucket("skills")} count={skills.length}>
            {skills.map((it) => (
              <DetectedSuggestionCard
                key={it.key}
                label={it.label}
                status={it.status}
                onConfirm={() => toggle(skills, setSkills, it.key, "confirmed")}
                onDiscard={() => toggle(skills, setSkills, it.key, "discarded")}
              />
            ))}
          </DetectedSuggestionList>

          <DetectedSuggestionList
            title={tBucket("directions")}
            count={dirs.length}
          >
            {dirs.map((it) => (
              <DetectedSuggestionCard
                key={it.key}
                label={it.label}
                status={it.status}
                onConfirm={() => toggle(dirs, setDirs, it.key, "confirmed")}
                onDiscard={() => toggle(dirs, setDirs, it.key, "discarded")}
              />
            ))}
          </DetectedSuggestionList>

          <DetectedSuggestionList title={tBucket("roles")} count={roles.length}>
            {roles.map((it) => (
              <DetectedSuggestionCard
                key={it.key}
                label={it.label}
                status={it.status}
                onConfirm={() => toggle(roles, setRoles, it.key, "confirmed")}
                onDiscard={() => toggle(roles, setRoles, it.key, "discarded")}
              />
            ))}
          </DetectedSuggestionList>

          <DetectedSuggestionList
            title={tBucket("experience")}
            count={(yoe ? 1 : 0) + (team ? 1 : 0)}
          >
            {yoe && (
              <DetectedSuggestionCard
                label={tS("experience.years", { n: yoe.value })}
                status={yoe.status}
                onConfirm={() => setYoe({ ...yoe, status: "confirmed" })}
                onDiscard={() => setYoe({ ...yoe, status: "discarded" })}
              />
            )}
            {team && (
              <DetectedSuggestionCard
                label={tS("experience.team", { n: team.value })}
                status={team.status}
                onConfirm={() => setTeam({ ...team, status: "confirmed" })}
                onDiscard={() => setTeam({ ...team, status: "discarded" })}
              />
            )}
          </DetectedSuggestionList>

          <DetectedSuggestionList
            className="md:col-span-2"
            title={tBucket("cvEntries")}
            count={cvEntries.length}
          >
            {cvEntries.map((it) => (
              <DetectedSuggestionCard
                key={it.key}
                label={it.label}
                status={it.status}
                editable
                editValue={it.label}
                onEdit={(next) =>
                  setCvEntries((prev) =>
                    prev.map((row) =>
                      row.key === it.key
                        ? { ...row, label: next, status: "edited" }
                        : row,
                    ),
                  )
                }
                onConfirm={() =>
                  toggle(cvEntries, setCvEntries, it.key, "confirmed")
                }
                onDiscard={() =>
                  toggle(cvEntries, setCvEntries, it.key, "discarded")
                }
              />
            ))}
          </DetectedSuggestionList>
        </div>
      )}

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}
      {applied && (
        // Phase 4: make the confirmed-state trail explicit — the user sees
        // exactly which state the saved facts live in: "Confirmed by you"
        // (added to profile), still waiting for external confirmation later.
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
