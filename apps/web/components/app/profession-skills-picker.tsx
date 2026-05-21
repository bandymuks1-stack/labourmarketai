"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ApiSkill = {
  id: string;
  slug: string | null;
  name_lt: string | null;
  name_en: string | null;
  category: string | null;
  isCore: boolean;
  displayOrder: number;
};

/**
 * Multi-select skill chips scoped to one profession. Fetches the profession's
 * curated skills from the API, lets the worker toggle them, and saves the full
 * set. Selected = safety-orange fill; core skills get a subtle badge; persisted
 * (saved) skills show a "self-declared" label (M1 — nothing is verified yet).
 */
export function ProfessionSkillsPicker({
  workerId,
  professionId,
  initialSelectedIds,
}: {
  workerId: string;
  professionId: string;
  initialSelectedIds: string[];
}) {
  const t = useTranslations("skills");
  const locale = useLocale();
  const [skills, setSkills] = useState<ApiSkill[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );
  const [persisted, setPersisted] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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

  function label(s: ApiSkill): string {
    return (locale === "lt" ? s.name_lt : s.name_en) ?? s.name_en ?? s.slug ?? "";
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    setToast(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/workers/${workerId}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillIds: [...selected] }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setPersisted(new Set(selected));
      setToast(t("savedToast"));
    } catch (e) {
      console.error("[skills-picker] save failed:", e);
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (skills === null) {
    return <p className="text-sm text-text-secondary">{t("loading")}</p>;
  }
  if (skills.length === 0) {
    return <p className="text-sm text-text-secondary">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("pickerTitle")}
        </h2>
        <p className="mt-1 text-xs text-text-secondary">{t("pickerHelp")}</p>
      </div>

      <ul className="flex flex-wrap gap-2">
        {skills.map((s) => {
          const isSelected = selected.has(s.id);
          const isPersisted = persisted.has(s.id) && isSelected;
          return (
            <li key={s.id} className="flex flex-col items-start gap-0.5">
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
                {label(s)}
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
              {isPersisted && (
                <span className="pl-2 font-mono text-[9px] uppercase tracking-label text-text-muted">
                  {t("selfDeclared")}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? t("saving") : t("saveButton")}
        </Button>
        {toast && (
          <span className="text-xs text-state-live" role="status">
            ✓ {toast}
          </span>
        )}
      </div>
    </div>
  );
}
