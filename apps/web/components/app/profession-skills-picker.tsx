"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { CvImportUpload } from "@/components/app/cv-import-upload";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type ApiSkill = {
  id: string;
  slug: string;
  category: string | null;
  isCore: boolean;
  displayOrder: number;
};

/**
 * Profession-scoped skill chips (left column). Fetches the profession's curated
 * skills by id, toggles selection, and saves the full set. On save it calls
 * `onSaved` so the parent can refresh the server-fed CV preview (which is the
 * read model of what's actually persisted). Also surfaces the M2 scaffolds (CV
 * import + custom skill) as clearly-disabled affordances (doctrine: M1 curated
 * only).
 */
export function ProfessionSkillsPicker({
  workerId,
  professionId,
  initialSelectedIds,
  onSaved,
}: {
  workerId: string;
  professionId: string;
  initialSelectedIds: string[];
  onSaved?: () => void;
}) {
  const t = useTranslations("skills");
  const tName = useTranslations("skillNames");
  const [skills, setSkills] = useState<ApiSkill[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSkills(null);
    fetch(`/api/professions/${professionId}/skills`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setSkills(d.ok ? (d.skills as ApiSkill[]) : []);
      })
      .catch(() => active && setSkills([]));
    return () => {
      active = false;
    };
  }, [professionId]);

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/workers/${workerId}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillIds: [...selected] }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setSaved(true);
      onSaved?.(); // refresh the server-fed CV preview to the saved truth
    } catch (e) {
      console.error("[skills-picker] save failed:", e);
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("pickerTitle")}
        </h2>
        <p className="mt-1 text-xs text-text-secondary">{t("pickerHelp")}</p>
      </div>

      {skills === null ? (
        <p className="text-sm text-text-secondary">{t("loading")}</p>
      ) : skills.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("empty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {skills.map((s) => {
            const isSelected = selected.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-brand-orange bg-brand-orange text-ink-900"
                      : "border-ink-500 text-text-secondary hover:border-text-muted",
                  )}
                >
                  {tName(s.slug)}
                  {s.isCore && (
                    <span
                      className={cn(
                        "rounded-sm px-1 font-mono text-[9px] uppercase tracking-label",
                        isSelected
                          ? "bg-ink-900/20 text-ink-900"
                          : "text-text-muted",
                      )}
                    >
                      {t("coreBadge")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? t("saving") : t("saveButton")}
        </Button>
        {saved && (
          <span
            className="flex items-center gap-2 text-xs text-state-live"
            role="status"
          >
            ✓ {t("savedToast")}
            <Link
              href="/dashboard"
              className="text-brand-blue hover:text-brand-cyan"
            >
              {t("viewProfile")}
            </Link>
          </span>
        )}
      </div>

      {/* M2 scaffolds — clearly not active yet (doctrine: M1 curated only) */}
      <CvImportUpload />
      <p className="text-xs text-text-muted">
        {t("customPrompt")}{" "}
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          ({t("customComingSoon")})
        </span>
      </p>
    </div>
  );
}
