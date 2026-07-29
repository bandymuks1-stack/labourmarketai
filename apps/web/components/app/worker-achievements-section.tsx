"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  removeWorkerAchievementAction,
  saveWorkerAchievementAction,
  type WorkerAchievementActionResult,
} from "@/lib/worker/worker-achievements-actions";
import {
  ACHIEVEMENT_TYPE_SLUGS,
  type WorkerAchievementEntry,
} from "@/lib/worker/worker-achievements-model";

/**
 * "Achievements & declared certificates" card (Full CV System v1) — list +
 * add/edit/remove for worker_achievements (DRAFT migration 20260714160000,
 * human-gated). Same honesty pattern as the languages/education cards:
 *
 *  - declared certificates ALWAYS carry the "declared — not verified" badge;
 *  - the manager-confirmed badge renders ONLY from the real
 *    confirmed_by_manager column, which the app can never set (grant-level
 *    exclusion) — no fake verification UI exists here;
 *  - honest not-enabled state until the owner applies the draft migration.
 */

type FormState = {
  id: string | null;
  title: string;
  description: string;
  date: string;
  typeSlug: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  description: "",
  date: "",
  typeSlug: "achievement",
};

export function WorkerAchievementsSection({
  initial,
  needsMigration = false,
}: {
  initial: WorkerAchievementEntry[];
  needsMigration?: boolean;
}) {
  const t = useTranslations("cvSections.achievements");
  const tType = useTranslations("cvSections.achievementTypes");
  const router = useRouter();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function errorLabel(res: WorkerAchievementActionResult): string {
    if (res.ok) return "";
    switch (res.code) {
      case "needs_migration":
        return t("notEnabled");
      case "invalid":
        return t("invalid");
      case "limit":
        return t("limit");
      default:
        return t("error");
    }
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      if (form.id) fd.set("id", form.id);
      fd.set("title", form.title);
      fd.set("description", form.description);
      fd.set("achieved_at", form.date);
      fd.set("achievement_type_slug", form.typeSlug);
      const res = await saveWorkerAchievementAction(null, fd);
      if (!res.ok) {
        setError(errorLabel(res));
        return;
      }
      setForm(EMPTY_FORM);
      setOpen(false);
      router.refresh();
    } catch (e) {
      console.error("[worker-achievements] save failed:", e);
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", id);
      const res = await removeWorkerAchievementAction(null, fd);
      if (!res.ok) {
        setError(errorLabel(res));
        return;
      }
      router.refresh();
    } catch (e) {
      console.error("[worker-achievements] remove failed:", e);
      setError(t("error"));
    }
  }

  const typeOptions = ACHIEVEMENT_TYPE_SLUGS.map((slug) => ({
    value: slug,
    label: tType(slug),
  }));

  return (
    <section
      id="cv-achievements"
      className="card-border flex scroll-mt-20 flex-col gap-3 p-5"
      data-testid="worker-achievements"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{t("hint")}</p>
      </header>

      {needsMigration ? (
        <p
          className="rounded-md border border-ink-600 bg-ink-800/40 p-3 text-sm text-text-secondary"
          role="status"
          data-testid="worker-achievements-needs-migration"
        >
          {t("notEnabled")}
        </p>
      ) : (
        <>
          {initial.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="worker-achievements-list">
              {initial.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-ink-600 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {entry.title}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {tType(entry.achievementTypeSlug)}
                      {entry.achievedAt ? ` · ${entry.achievedAt.slice(0, 10)}` : ""}
                    </span>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {entry.confirmedByManager
                        ? t("confirmedBadge")
                        : t("declaredBadge")}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          id: entry.id,
                          title: entry.title,
                          description: entry.description ?? "",
                          date: entry.achievedAt ? entry.achievedAt.slice(0, 10) : "",
                          typeSlug: entry.achievementTypeSlug,
                        });
                        setOpen(true);
                      }}
                      className="rounded-md border border-ink-600 px-2 py-1 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(entry.id)}
                      className="rounded-md border border-ink-600 px-2 py-1 text-xs text-text-secondary transition-colors hover:border-state-danger hover:text-state-danger"
                      data-testid={`worker-achievements-remove-${entry.id}`}
                    >
                      {t("remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary" data-testid="worker-achievements-empty">
              {t("empty")}
            </p>
          )}

          {!open ? (
            <Button
              type="button"
              size="sm"
              className="w-fit"
              onClick={() => {
                setForm(EMPTY_FORM);
                setOpen(true);
              }}
              data-testid="worker-achievements-add-open"
            >
              + {t("add")}
            </Button>
          ) : (
            <div
              className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/40 p-3"
              data-testid="worker-achievements-form"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("achTitle")}</Label>
                  <input
                    type="text"
                    value={form.title}
                    maxLength={160}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                    data-testid="worker-achievements-title"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("type")}</Label>
                  <DarkListbox
                    value={form.typeSlug}
                    onChange={(v) => setForm({ ...form, typeSlug: v })}
                    options={typeOptions}
                    placeholder="—"
                    ariaLabel={t("type")}
                    testId="worker-achievements-type"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("date")}</Label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>{t("description")}</Label>
                  <textarea
                    rows={2}
                    value={form.description}
                    maxLength={2000}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  loading={pending}
                  disabled={pending || form.title.trim().length < 2}
                  onClick={submit}
                  data-testid="worker-achievements-save"
                >
                  {pending ? t("adding") : t("save")}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setForm(EMPTY_FORM);
                    setError(null);
                  }}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  {t("cancel")}
                </button>
                {error && (
                  <span className="text-xs text-state-danger" role="alert" data-testid="worker-achievements-error">
                    {error}
                  </span>
                )}
              </div>
            </div>
          )}
          {error && !open && (
            <span className="text-xs text-state-danger" role="alert">
              {error}
            </span>
          )}
        </>
      )}

      <p
        className="text-xs leading-relaxed text-text-muted"
        data-testid="worker-achievements-self-stated"
      >
        {t("selfStated")}
      </p>
    </section>
  );
}
