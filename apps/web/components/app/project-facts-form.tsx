import { getTranslations } from "next-intl/server";

import { setProjectFactsAction } from "@/lib/projects/project-admin-actions";
import { ALL_ISO_COUNTRIES, countryDisplayName } from "@/lib/location/country-model";

/**
 * PROJECT FACTS — R-3 (2026-09-19 completion audit).
 *
 * The facts the calendar band, the operations "dates" chip, the location
 * block and the booking-overlap check READ — title, city, country, start and
 * end dates — had no write path after creation (production: every project
 * has country NULL and no dates). This is the one native-nav form for them,
 * in the same manage strip as the responsible person and the lifecycle, and
 * it writes through the ONE gated RPC `update_project_facts_v1` (owner-gated
 * migration 20260919130000). Until that is applied the action returns the
 * honest `needs_migration` notice — the form never pretends to have saved.
 *
 * A completed project is terminal: no form, one sentence.
 *
 * Only real stored values are pre-filled. Country is an ISO-3166 alpha-2
 * code shown by its localized name; city stays free text — the product never
 * upgrades a city to a coordinate here (COUNTRY ≠ CITY ≠ ADDRESS ≠ COORDINATE).
 */
export async function ProjectFactsForm({
  locale,
  projectId,
  project,
}: {
  locale: string;
  projectId: string;
  project: {
    readonly title: string | null;
    readonly city: string | null;
    readonly country: string | null;
    readonly startDate: string | null;
    readonly endDate: string | null;
    readonly status: string | null;
  };
}) {
  const t = await getTranslations("projectOps.manage.facts");

  if (project.status === "completed") {
    return (
      <p className="text-sm text-text-secondary" data-testid="ops-manage-facts-readonly">
        {t("completedReadOnly")}
      </p>
    );
  }

  const field =
    "rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";
  const label = "flex flex-col gap-1 text-xs text-text-secondary";

  return (
    <form
      action={setProjectFactsAction}
      className="flex flex-col gap-3"
      data-testid="ops-manage-facts-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className={`${label} sm:col-span-2 lg:col-span-2`}>
          <span>{t("title")}</span>
          <input
            name="title"
            type="text"
            required
            minLength={2}
            maxLength={200}
            defaultValue={project.title ?? ""}
            className={field}
            data-testid="ops-manage-facts-title"
          />
        </label>
        <label className={label}>
          <span>{t("city")}</span>
          <input
            name="city"
            type="text"
            maxLength={120}
            defaultValue={project.city ?? ""}
            className={field}
            data-testid="ops-manage-facts-city"
          />
        </label>
        <label className={label}>
          <span>{t("country")}</span>
          <select
            name="country"
            defaultValue={project.country ?? ""}
            className={field}
            data-testid="ops-manage-facts-country"
          >
            <option value="">{t("countryNone")}</option>
            {ALL_ISO_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {countryDisplayName(code, locale)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3 lg:col-span-1">
          <label className={label}>
            <span>{t("startDate")}</span>
            <input
              name="startDate"
              type="date"
              defaultValue={project.startDate ?? ""}
              className={field}
              data-testid="ops-manage-facts-start"
            />
          </label>
          <label className={label}>
            <span>{t("endDate")}</span>
            <input
              name="endDate"
              type="date"
              defaultValue={project.endDate ?? ""}
              className={field}
              data-testid="ops-manage-facts-end"
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-lg border border-ink-500 px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue"
          data-testid="ops-manage-facts-save"
        >
          {t("save")}
        </button>
        <span className="text-xs text-text-muted">{t("hint")}</span>
      </div>
    </form>
  );
}
