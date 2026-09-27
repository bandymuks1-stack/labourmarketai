"use client";

import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CvPreview, type CvSkill } from "@/components/app/cv-preview";
import { ProfessionSkillsPicker } from "@/components/app/profession-skills-picker";
import { DarkListbox } from "@/components/ui/DarkListbox";
import { Button } from "@/components/ui/Button";
import {
  addOwnProfession,
  addWorkerDirection,
  removeOwnProfession,
  removeWorkerDirection,
  setPrimaryProfession,
} from "@/lib/worker/actions";
import {
  SELF_DECLARED_PROFESSION_MAX_LENGTH,
  normalizeSelfDeclaredProfession,
} from "@/lib/worker/self-declared-profession";
import { type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type ProfessionOption = { id: string; slug: string };
type Direction = { id: string; slug: string; name: string; isPrimary: boolean };

/**
 * Worker "Work directions & skills" panel. A worker is NOT locked to one
 * profession (§1): they keep one PRIMARY direction and may add more. Skills are
 * edited per direction, but the picker is fed ALL saved skills, so saving one
 * direction's catalog never drops another direction's skills. The skills API
 * allows any skill from any of the worker's directions.
 */
export function WorkerTradeProfile({
  workerId,
  professions,
  currentProfessionId,
  directions,
  ownProfessions = [],
  initialSkillIds,
  personName,
  roles,
  activeRole,
  savedSkills,
}: {
  workerId: string;
  professions: ProfessionOption[];
  currentProfessionId: string | null;
  directions: Direction[];
  /** Professions this person named in their OWN WORDS, shown exactly as typed.
   *  They carry no catalogue row, so they drive no skills editor — they are
   *  here because they are the person's answer, and they are editable here
   *  because onboarding promised they could be added to later. */
  ownProfessions?: readonly { id: string; label: string }[];
  initialSkillIds: string[];
  personName: string;
  roles: Role[];
  activeRole: Role | null;
  savedSkills: CvSkill[];
}) {
  const t = useTranslations("skills");
  const tProf = useTranslations("professions");
  const router = useRouter();
  // Which direction's skill catalogue is being edited (NOT the primary).
  const [editId, setEditId] = useState<string>(currentProfessionId ?? "");
  const locale = useLocale();
  /** The words being typed on the profile — theirs until they add them. */
  const [ownDraft, setOwnDraft] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        console.error("[trade-profile] action failed:", e);
        setError(t("saveError"));
      }
    });
  };

  function onPrimaryChange(next: string) {
    if (!next) return;
    setEditId(next);
    run(() => setPrimaryProfession(next));
  }


  const directionIds = new Set(directions.map((d) => d.id));
  const available = professions.filter((p) => !directionIds.has(p.id));
  const editSlug = directions.find((d) => d.id === editId)?.slug ?? "";
  const editName = directions.find((d) => d.id === editId)?.name ?? "";
  const primarySlug = directions.find((d) => d.isPrimary)?.slug ?? "";

  return (
    <div className="flex flex-col gap-6">
      {/* Primary work direction */}
      <label className="flex max-w-md flex-col gap-1.5 text-xs text-text-secondary">
        {t("primaryDirection")}
        <DarkListbox
          value={currentProfessionId ?? ""}
          onChange={onPrimaryChange}
          disabled={pending}
          placeholder={t("professionPlaceholder")}
          ariaLabel={t("primaryDirection")}
          options={professions.map((p) => ({ value: p.id, label: tProf(p.slug) }))}
        />
      </label>

      {/* Work directions — calmer capability-group chips. Click a chip to edit
          its skills (does NOT change primary). The first choice is not a
          limit (§1); non-primary directions are removable. */}
      {/* THE PERSON'S OWN WORDS. Rendered outside the directions section on
          purpose: that section is gated on a primary REGISTRY profession, so
          somebody whose profession the catalogue does not carry would have
          seen nothing at all of what they told us (owner walk 2026-09-27).
          Verbatim, never translated, never matched to a catalogue entry. */}
      {ownProfessions.length > 0 && (
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="worker-own-professions"
        >
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {t("ownProfessionsTitle")}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {ownProfessions.map((own) => (
              <li
                key={own.id}
                className="inline-flex items-center gap-2 rounded-full border border-brand-blue/30 bg-brand-blue/10 py-1 pl-3 pr-1 text-sm text-text-primary"
                data-testid="worker-own-profession"
              >
                {own.label}
                <InlineConfirm
                  label="✕"
                  question={t("ownProfessionRemoveConfirm", { name: own.label })}
                  confirmLabel={t("ownProfessionRemove")}
                  cancelLabel={t("keepDirection")}
                  tier="important_write"
                  disabled={pending}
                  onConfirm={() => run(() => removeOwnProfession(own.id))}
                  className="flex-none rounded-full px-1.5 py-0.5 text-text-muted transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                  testId={`worker-own-profession-remove-${own.id}`}
                />
              </li>
            ))}
          </ul>
          {/* The writer onboarding's copy promised: "Vėliau galėsite jas
              papildyti". Without it these words could only ever be entered in
              the first minutes of an account. */}
          <form
            action={async (formData: FormData) => {
              const result = await addOwnProfession(formData);
              setOwnDraft(result.ok ? "" : ownDraft);
            }}
            className="flex gap-2"
          >
            <input type="hidden" name="locale" value={locale} />
            <input
              type="text"
              name="label"
              value={ownDraft}
              onChange={(e) => setOwnDraft(e.target.value)}
              maxLength={SELF_DECLARED_PROFESSION_MAX_LENGTH}
              placeholder={t("ownProfessionPlaceholder")}
              aria-label={t("ownProfessionsTitle")}
              data-testid="worker-own-profession-input"
              className="min-h-11 w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={!normalizeSelfDeclaredProfession(ownDraft)}
              data-testid="worker-own-profession-add"
              className="flex-none rounded-md"
            >
              {t("ownProfessionAdd")}
            </Button>
          </form>
          <p className="text-meta leading-relaxed text-text-muted">
            {t("ownProfessionsNote")}
          </p>
        </section>
      )}

      {currentProfessionId && (
        <section className="card-border flex flex-col gap-3 p-5">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {t("workDirectionsTitle")}
          </h3>
          {/* Capability groups — each direction is a calm card; the active one
              (being edited) has a clear ring + pulse. */}
          <div className="grid gap-2 sm:grid-cols-2">
            {directions.map((d) => {
              const isActive = d.id === editId;
              return (
                <div
                  key={d.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border p-3 transition-colors",
                    isActive
                      ? "border-brand-blue bg-brand-blue/5"
                      : "border-ink-600 bg-ink-800/50 hover:border-text-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setEditId(d.id)}
                    aria-pressed={isActive}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 flex-none rounded-full",
                        isActive
                          ? "stage-current bg-brand-orange"
                          : "bg-ink-500",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text-primary">
                        {d.name}
                      </span>
                      <span className="block font-mono text-meta uppercase tracking-label text-text-muted">
                        {d.isPrimary
                          ? t("primaryBadge")
                          : isActive
                            ? t("editingDirection")
                            : t("skillsForDirection")}
                      </span>
                    </span>
                  </button>
                  {!d.isPrimary && (
                    <InlineConfirm
                      label="✕"
                      question={t("removeConfirm", { name: d.name })}
                      confirmLabel={t("removeDirection")}
                      cancelLabel={t("keepDirection")}
                      tier="important_write"
                      disabled={pending}
                      onConfirm={() => {
                        if (editId === d.id) setEditId(currentProfessionId);
                        run(() => removeWorkerDirection(d.id));
                      }}
                      className="flex-none rounded-md px-1.5 py-0.5 text-text-muted transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                      testId={`worker-direction-remove-${d.id}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {available.length > 0 && (
            <label className="flex max-w-xs flex-col gap-1.5 text-xs text-text-secondary">
              {t("addDirection")}
              <DarkListbox
                value=""
                onChange={(v) => v && run(() => addWorkerDirection(v))}
                disabled={pending}
                placeholder={t("addDirectionCta")}
                ariaLabel={t("addDirection")}
                options={available.map((p) => ({ value: p.id, label: tProf(p.slug) }))}
              />
            </label>
          )}
        </section>
      )}

      {error && (
        <span className="text-xs text-state-danger" role="alert">
          {error}
        </span>
      )}

      {currentProfessionId && editSlug ? (
        <section className="flex flex-col gap-3">
          {/* Clear editing context — which direction, and that others are safe */}
          <div className="flex flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-blue/10 px-3 py-1 font-mono text-meta uppercase tracking-label text-brand-blue">
              {t("editingDirection")}: {editName}
            </span>
            <p className="text-sm font-semibold text-text-primary">
              {t("skillsForDirection")}
            </p>
            <p className="text-xs leading-relaxed text-text-muted">
              {t("othersRemainSaved")} · {t("canChangeLater")}
            </p>
          </div>
          {/* Honest self-declared framing — never imply confirmed/proof-backed */}
          <p className="rounded-md border border-ink-600 bg-ink-800/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
            {t("notConfirmedYet")}
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ProfessionSkillsPicker
              key={editId}
              workerId={workerId}
              professionId={editId}
              initialSelectedIds={initialSkillIds}
              onSaved={() => router.refresh()}
            />
            <CvPreview
              personName={personName}
              roles={roles}
              activeRole={activeRole}
              professionSlug={primarySlug || editSlug}
              skills={savedSkills}
            />
          </div>
        </section>
      ) : (
        <p className="text-sm text-text-secondary">{t("noProfession")}</p>
      )}
    </div>
  );
}
