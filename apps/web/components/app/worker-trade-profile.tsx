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

      {/* Additional directions — the first choice is not a limit (§1) */}
      {currentProfessionId && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-text-secondary">
            {t("additionalDirections")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {directions.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 text-sm text-text-primary"
              >
                {d.name}
                {d.isPrimary ? (
                  <span className="font-mono text-[9px] uppercase tracking-label text-brand-orange">
                    {t("primaryBadge")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => run(() => removeWorkerDirection(d.id))}
                    disabled={pending}
                    aria-label={`${t("removeDirection")} ${d.name}`}
                    className="text-text-muted transition-colors hover:text-state-danger"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
          {available.length > 0 && (
            <label className="flex max-w-md flex-col gap-1.5 text-xs text-text-secondary">
              {t("addDirection")}
              <select
                value=""
                onChange={(e) =>
                  e.target.value &&
                  run(() => addWorkerDirection(e.target.value))
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
        </div>
      )}

      {error && (
        <span className="text-xs text-state-danger" role="alert">
          {error}
        </span>
      )}

      {currentProfessionId && editSlug ? (
        <div className="flex flex-col gap-4">
          {/* Choose which direction's skills to edit (does not change primary) */}
          {directions.length > 1 && (
            <label className="flex max-w-md flex-col gap-1.5 text-xs text-text-secondary">
              {t("editingSkillsFor")}
              <select
                value={editId}
                onChange={(e) => setEditId(e.target.value)}
                className={inputCls}
              >
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
        </div>
      ) : (
        <p className="text-sm text-text-secondary">{t("noProfession")}</p>
      )}
    </div>
  );
}
