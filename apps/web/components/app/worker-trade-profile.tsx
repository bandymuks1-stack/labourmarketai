"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CvPreview, type CvSkill } from "@/components/app/cv-preview";
import { ProfessionSkillsPicker } from "@/components/app/profession-skills-picker";
import {
  addWorkerDirection,
  removeWorkerDirection,
  setPrimaryProfession,
} from "@/lib/worker/actions";
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

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-blue disabled:opacity-60";

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
        <select
          value={currentProfessionId ?? ""}
          onChange={(e) => onPrimaryChange(e.target.value)}
          disabled={pending}
          className={inputCls}
        >
          <option value="" disabled>
            {t("professionPlaceholder")}
          </option>
          {professions.map((p) => (
            <option key={p.id} value={p.id}>
              {tProf(p.slug)}
            </option>
          ))}
        </select>
      </label>

      {/* Work directions — calmer capability-group chips. Click a chip to edit
          its skills (does NOT change primary). The first choice is not a
          limit (§1); non-primary directions are removable. */}
      {currentProfessionId && (
        <section className="card-border flex flex-col gap-3 p-5">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {t("workDirectionsTitle")}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {directions.map((d) => {
              const isActive = d.id === editId;
              return (
                <span
                  key={d.id}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                      : "border-ink-500 bg-ink-800 text-text-secondary hover:border-text-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setEditId(d.id)}
                    aria-pressed={isActive}
                    className="inline-flex items-center gap-1.5"
                  >
                    {d.name}
                    {d.isPrimary && (
                      <span className="font-mono text-[9px] uppercase tracking-label text-brand-orange">
                        {t("primaryBadge")}
                      </span>
                    )}
                  </button>
                  {!d.isPrimary && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t("removeConfirm", { name: d.name }))) {
                          if (editId === d.id) setEditId(currentProfessionId);
                          run(() => removeWorkerDirection(d.id));
                        }
                      }}
                      disabled={pending}
                      aria-label={`${t("removeDirection")} ${d.name}`}
                      className="text-text-muted transition-colors hover:text-state-danger"
                    >
                      ✕
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          {available.length > 0 && (
            <label className="flex max-w-xs flex-col gap-1.5 text-xs text-text-secondary">
              {t("addDirection")}
              <select
                value=""
                onChange={(e) =>
                  e.target.value && run(() => addWorkerDirection(e.target.value))
                }
                disabled={pending}
                className={inputCls}
              >
                <option value="">{t("addDirectionCta")}</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {tProf(p.slug)}
                  </option>
                ))}
              </select>
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
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-blue/10 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-brand-blue">
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
