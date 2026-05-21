"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CvPreview, type CvSkill } from "@/components/app/cv-preview";
import { ProfessionSkillsPicker } from "@/components/app/profession-skills-picker";
import { setPrimaryProfession } from "@/lib/worker/actions";
import { type Role } from "@/lib/auth/actions";

type ProfessionOption = { id: string; slug: string };

/**
 * Worker "Profession & skills" panel. Picks a primary profession (saved via
 * server action — PR #5 dropped this from onboarding) and shows the
 * profession-scoped skills picker (left) beside the live CV preview (right).
 * The preview is a read model of SAVED data passed from the server; the picker
 * refreshes it on save so its counts always match what's persisted.
 */
export function WorkerTradeProfile({
  workerId,
  professions,
  currentProfessionId,
  initialSkillIds,
  personName,
  roles,
  activeRole,
  savedSkills,
}: {
  workerId: string;
  professions: ProfessionOption[];
  currentProfessionId: string | null;
  initialSkillIds: string[];
  personName: string;
  roles: Role[];
  activeRole: Role | null;
  savedSkills: CvSkill[];
}) {
  const t = useTranslations("skills");
  const tProf = useTranslations("professions");
  const router = useRouter();
  const [professionId, setProfessionId] = useState<string>(
    currentProfessionId ?? "",
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string) {
    setProfessionId(next);
    setSaved(false);
    setError(null);
    if (!next) return;
    start(async () => {
      try {
        await setPrimaryProfession(next);
        setSaved(true);
        router.refresh();
      } catch (e) {
        console.error("[trade-profile] setPrimaryProfession failed:", e);
        setError(t("saveError"));
      }
    });
  }

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-blue";

  const professionSlug =
    professions.find((p) => p.id === professionId)?.slug ?? "";

  // Pre-select saved skills only when the chosen profession is the one they
  // were saved under (switching profession starts a fresh selection).
  const initialForPicker =
    professionId && professionId === currentProfessionId ? initialSkillIds : [];

  return (
    <div className="flex flex-col gap-6">
      <label className="flex max-w-md flex-col gap-1.5 text-xs text-text-secondary">
        {t("professionLabel")}
        <select
          value={professionId}
          onChange={(e) => onChange(e.target.value)}
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
        {saved && (
          <span className="text-xs text-state-live" role="status">
            ✓ {t("professionSaved")}
          </span>
        )}
        {error && (
          <span className="text-xs text-state-danger" role="alert">
            {error}
          </span>
        )}
      </label>

      {professionId && professionSlug ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ProfessionSkillsPicker
            key={professionId}
            workerId={workerId}
            professionId={professionId}
            initialSelectedIds={initialForPicker}
            onSaved={() => router.refresh()}
          />
          <CvPreview
            personName={personName}
            roles={roles}
            activeRole={activeRole}
            professionSlug={professionSlug}
            skills={savedSkills}
          />
        </div>
      ) : (
        <p className="text-sm text-text-secondary">{t("noProfession")}</p>
      )}
    </div>
  );
}
