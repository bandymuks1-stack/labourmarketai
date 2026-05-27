"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { createJobPostingAction } from "@/lib/job-postings/job-postings-actions";
import {
  JOB_POSTING_VISIBILITIES,
  type JobPostingVisibility,
} from "@/lib/job-postings/types";

/**
 * Job Posting v1 — create form (client component).
 *
 * Honesty:
 *   - Form intentionally omits any verification / matching / promotion
 *     affordance. Those concepts are reserved for later explicit
 *     owner-consent slices and have no UI hook here.
 *   - Visibility is an explicit user choice; no public-by-default
 *     surprise — but `public` IS the default selection because the
 *     pilot-doctrine §5 says "users who hit the create form WANT to
 *     be visible to candidates"; agencies_only and direct_only are
 *     opt-in narrower scopes.
 *   - On error the precise tagged-result message renders so the user
 *     can act (e.g. "missing company" → onboarding link).
 */
export function JobPostingForm({
  locale,
}: {
  locale: string;
}): React.ReactElement {
  const t = useTranslations("jobPostings.form");
  const router = useRouter();

  const [roleTitle, setRoleTitle] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [headcount, setHeadcount] = useState<string>("1");
  const [salary, setSalary] = useState<string>("");
  const [countriesRaw, setCountriesRaw] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [visibility, setVisibility] =
    useState<JobPostingVisibility>("public");
  const [housing, setHousing] = useState<"" | "yes" | "no">("");
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  function reset(): void {
    setRoleTitle("");
    setProjectTitle("");
    setHeadcount("1");
    setSalary("");
    setCountriesRaw("");
    setStartDate("");
    setVisibility("public");
    setHousing("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);

    const headcountNum = Number.parseInt(headcount, 10);
    const salaryNum = salary ? Number.parseInt(salary, 10) : undefined;
    const countries = countriesRaw
      .split(/[,\s]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const payload = {
      roleTitle,
      projectTitle: projectTitle || undefined,
      headcountNeeded: Number.isFinite(headcountNum) ? headcountNum : 1,
      salaryOfferedEur:
        salaryNum !== undefined && Number.isFinite(salaryNum) ? salaryNum : undefined,
      preferredCountries: countries.length > 0 ? countries : undefined,
      startDate: startDate || undefined,
      visibility,
      housingProvided:
        housing === "yes" ? true : housing === "no" ? false : undefined,
    };

    startSubmit(() => {
      createJobPostingAction(locale, payload)
        .then((result) => {
          if (result.ok) {
            setCreatedAt(new Date().toISOString());
            reset();
            router.refresh();
          } else {
            setError(result.message);
          }
        })
        .catch((e: unknown) => {
          console.error("[job-posting-form] submit failed", e);
          setError(t("submitError"));
        });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3"
      data-testid="job-posting-create-form"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-secondary">{t("field.roleTitle.label")}</span>
        <input
          type="text"
          required
          maxLength={200}
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          placeholder={t("field.roleTitle.placeholder")}
          className="rounded border border-border-default bg-surface-1 px-3 py-2 text-sm"
          data-testid="job-posting-field-role-title"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-secondary">{t("field.projectTitle.label")}</span>
        <input
          type="text"
          maxLength={200}
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          placeholder={t("field.projectTitle.placeholder")}
          className="rounded border border-border-default bg-surface-1 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">{t("field.headcount.label")}</span>
          <input
            type="number"
            min={1}
            max={500}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            className="rounded border border-border-default bg-surface-1 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">{t("field.salary.label")}</span>
          <input
            type="number"
            min={0}
            max={1000000}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder={t("field.salary.placeholder")}
            className="rounded border border-border-default bg-surface-1 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-secondary">{t("field.countries.label")}</span>
        <input
          type="text"
          value={countriesRaw}
          onChange={(e) => setCountriesRaw(e.target.value)}
          placeholder={t("field.countries.placeholder")}
          className="rounded border border-border-default bg-surface-1 px-3 py-2 text-sm"
        />
        <span className="text-[10px] text-text-tertiary">
          {t("field.countries.help")}
        </span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">{t("field.startDate.label")}</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-border-default bg-surface-1 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">{t("field.housing.label")}</span>
          <select
            value={housing}
            onChange={(e) => setHousing(e.target.value as "" | "yes" | "no")}
            className="rounded border border-border-default bg-surface-1 px-3 py-2 text-sm"
          >
            <option value="">{t("field.housing.options.unknown")}</option>
            <option value="yes">{t("field.housing.options.yes")}</option>
            <option value="no">{t("field.housing.options.no")}</option>
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="text-text-secondary">{t("field.visibility.label")}</legend>
        {JOB_POSTING_VISIBILITIES.map((v) => (
          <label key={v} className="flex items-start gap-2">
            <input
              type="radio"
              name="visibility"
              value={v}
              checked={visibility === v}
              onChange={() => setVisibility(v)}
              className="mt-1"
            />
            <span className="flex flex-col">
              <span className="text-text-primary">{t(`field.visibility.options.${v}.label`)}</span>
              <span className="text-[11px] text-text-tertiary">
                {t(`field.visibility.options.${v}.help`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && (
        <p
          className="rounded border border-state-error bg-state-error/10 px-3 py-2 text-sm text-state-error"
          role="alert"
          data-testid="job-posting-form-error"
        >
          {error}
        </p>
      )}

      {createdAt && !error && (
        <p
          className="rounded border border-state-success bg-state-success/10 px-3 py-2 text-sm text-state-success"
          data-testid="job-posting-form-success"
        >
          {t("createdNotice")}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || roleTitle.trim().length === 0}
        className="self-start rounded bg-brand-blue px-4 py-2 text-sm font-semibold text-text-on-brand disabled:opacity-50"
        data-testid="job-posting-submit"
      >
        {submitting ? t("submitting") : t("submitButton")}
      </button>
    </form>
  );
}
