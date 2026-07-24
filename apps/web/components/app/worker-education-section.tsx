"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  removeWorkerEducationAction,
  saveWorkerEducationAction,
  type WorkerEducationActionResult,
} from "@/lib/worker/worker-education-actions";
import {
  EDUCATION_TYPE_SLUGS,
  type WorkerEducationEntry,
} from "@/lib/worker/worker-education-model";

/**
 * "Education" card (Full CV System v1) — list + add/edit/remove for the
 * worker_education table from DRAFT migration 20260714160000 (human-gated,
 * NOT applied yet). Follows the worker-languages-section pattern:
 *
 *  - honest gating: when the read path reported the table absent the card
 *    still renders — with its calm not-enabled note instead of a form that
 *    would fail on save (never a fake empty list);
 *  - a visible line states entries are the worker's own statements — the
 *    platform does not verify education; nothing here may ever look verified;
 *  - type labels come from i18n by registry slug (§10 — no hardcoded names).
 */

type FormState = {
  id: string | null;
  institution: string;
  program: string;
  typeSlug: string;
  startYear: string;
  endYear: string;
  isCurrent: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  institution: "",
  program: "",
  typeSlug: "",
  startYear: "",
  endYear: "",
  isCurrent: false,
};

export function WorkerEducationSection({
  initial,
  needsMigration = false,
}: {
  initial: WorkerEducationEntry[];
  needsMigration?: boolean;
}) {
  const t = useTranslations("cvSections.education");
  const tType = useTranslations("cvSections.educationTypes");
  const router = useRouter();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function errorLabel(res: WorkerEducationActionResult): string {
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
      fd.set("institution_name", form.institution);
      fd.set("program_or_field", form.program);
      fd.set("education_type_slug", form.typeSlug);
      fd.set("start_year", form.startYear);
      fd.set("end_year", form.isCurrent ? "" : form.endYear);
      fd.set("is_current", form.isCurrent ? "true" : "");
      const res = await saveWorkerEducationAction(null, fd);
      if (!res.ok) {
        setError(errorLabel(res));
        return;
      }
      setForm(EMPTY_FORM);
      setOpen(false);
      router.refresh();
    } catch (e) {
      console.error("[worker-education] save failed:", e);
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
      const res = await removeWorkerEducationAction(null, fd);
      if (!res.ok) {
        setError(errorLabel(res));
        return;
      }
      router.refresh();
    } catch (e) {
      console.error("[worker-education] remove failed:", e);
      setError(t("error"));
    }
  }

  const typeOptions = EDUCATION_TYPE_SLUGS.map((slug) => ({
    value: slug,
    label: tType(slug),
  }));

  return (
    <section
      id="cv-education"
      className="card-border flex scroll-mt-20 flex-col gap-3 p-5"
      data-testid="worker-education"
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
          data-testid="worker-education-needs-migration"
        >
          {t("notEnabled")}
        </p>
      ) : (
        <>
          {initial.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="worker-education-list">
              {initial.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-ink-600 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {entry.institutionName}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {tType(entry.educationTypeSlug)}
                      {entry.programOrField ? ` · ${entry.programOrField}` : ""}
                      {entry.startYear || entry.endYear || entry.isCurrent
                        ? ` · ${entry.startYear ?? ""}–${
                            entry.isCurrent ? t("isCurrent") : (entry.endYear ?? "")
                          }`
                        : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          id: entry.id,
                          institution: entry.institutionName,
                          program: entry.programOrField ?? "",
                          typeSlug: entry.educationTypeSlug,
                          startYear: entry.startYear ? String(entry.startYear) : "",
                          endYear: entry.endYear ? String(entry.endYear) : "",
                          isCurrent: entry.isCurrent,
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
                      data-testid={`worker-education-remove-${entry.id}`}
                    >
                      {t("remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary" data-testid="worker-education-empty">
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
              data-testid="worker-education-add-open"
            >
              + {t("add")}
            </Button>
          ) : (
            <div
              className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/40 p-3"
              data-testid="worker-education-form"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("institution")}</Label>
                  <input
                    type="text"
                    value={form.institution}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, institution: e.target.value })}
                    placeholder={t("institutionPlaceholder")}
                    className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                    data-testid="worker-education-institution"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("program")}</Label>
                  <input
                    type="text"
                    value={form.program}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, program: e.target.value })}
                    placeholder={t("programPlaceholder")}
                    className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
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
                    testId="worker-education-type"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("startYear")}</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1900}
                      max={2100}
                      value={form.startYear}
                      onChange={(e) => setForm({ ...form, startYear: e.target.value })}
                      placeholder={t("yearPlaceholder")}
                      className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("endYear")}</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1900}
                      max={2100}
                      value={form.endYear}
                      disabled={form.isCurrent}
                      onChange={(e) => setForm({ ...form, endYear: e.target.value })}
                      placeholder={t("yearPlaceholder")}
                      className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.isCurrent}
                  onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })}
                />
                {t("isCurrent")}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  loading={pending}
                  disabled={pending || form.institution.trim().length < 2 || form.typeSlug === ""}
                  onClick={submit}
                  data-testid="worker-education-save"
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
                  <span className="text-xs text-state-danger" role="alert" data-testid="worker-education-error">
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

      {/* Always visible — education is self-stated, never platform-verified. */}
      <p
        className="text-xs leading-relaxed text-text-muted"
        data-testid="worker-education-self-stated"
      >
        {t("selfStated")}
      </p>
    </section>
  );
}
