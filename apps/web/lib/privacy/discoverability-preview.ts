import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { anonymizedWorkerLabel } from "@/lib/visibility/worker-profile-visibility";

/**
 * "Taip jūsų profilį matys įmonės" — the EXACT limited professional summary
 * an employer could see with discoverability granted. Built ONLY from the
 * caller's own RLS-scoped rows. Contains NO name, email, phone, exact
 * address, documents, CV file or any special-category data — matches the
 * privacy-by-default field set (worker_profile_visibility policy module).
 *
 * 2026-10-18 (owner command, migration 20261018160000): it lists EXACTLY what
 * list_discoverable_worker_profiles_v1 returns to an employer — the person
 * appears under the anonymous label, never by name — so "the other
 * professional information clearly listed in the preview" (consent text) is
 * the whole of it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Yes/no tokens; the view localizes them (preview.yes / preview.no). */
export const YES_TOKEN = "__yes";
export const NO_TOKEN = "__no";

export interface DiscoverabilityPreviewField {
  key:
    | "anonymousLabel"
    | "professions"
    | "experienceYears"
    | "currentCountry"
    | "preferredCountries"
    | "availability"
    | "availableFrom"
    | "salaryExpectation"
    | "contractType"
    | "payBasis"
    | "nightShifts"
    | "weekendShifts"
    | "overtime"
    | "drivingLicence"
    | "ownVehicle"
    | "ownTools"
    | "skillsCount";
  /** A yes/no value is carried as a token and localized by the view. */
  value: string;
}

export async function buildOwnDiscoverabilityPreview(): Promise<
  DiscoverabilityPreviewField[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select(
      "id, experience_years, current_location_country, preferred_countries, availability_status, available_from, salary_min_eur, salary_max_eur, preferred_contract_type, pay_basis_preference, night_shifts_ok, weekend_shifts_ok, overtime_ok, driving_licence_categories, own_vehicle, own_tools",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return [];

  const fields: DiscoverabilityPreviewField[] = [];
  // Companies see the anonymous label, never the name (owner command 2026-10-18).
  fields.push({ key: "anonymousLabel", value: anonymizedWorkerLabel(String(worker.id)) });

  const { data: professions } = await asAny(supabase)
    .from("worker_professions")
    .select("professions(slug)")
    .eq("worker_id", worker.id)
    .limit(5);
  const slugs = Array.isArray(professions)
    ? professions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => p?.professions?.slug)
        .filter((s: unknown): s is string => typeof s === "string")
    : [];
  if (slugs.length > 0) fields.push({ key: "professions", value: slugs.join(", ") });

  if (typeof worker.experience_years === "number") {
    fields.push({ key: "experienceYears", value: String(worker.experience_years) });
  }
  if (typeof worker.current_location_country === "string" && worker.current_location_country) {
    fields.push({ key: "currentCountry", value: String(worker.current_location_country) });
  }
  if (Array.isArray(worker.preferred_countries) && worker.preferred_countries.length > 0) {
    fields.push({
      key: "preferredCountries",
      value: (worker.preferred_countries as string[]).join(", "),
    });
  }
  if (worker.availability_status) {
    fields.push({ key: "availability", value: String(worker.availability_status) });
  }
  if (worker.available_from) {
    fields.push({ key: "availableFrom", value: String(worker.available_from) });
  }
  // Pay expectation appears ONLY when the worker entered it themselves.
  if (
    typeof worker.salary_min_eur === "number" ||
    typeof worker.salary_max_eur === "number"
  ) {
    const min = worker.salary_min_eur ?? "";
    const max = worker.salary_max_eur ?? "";
    fields.push({ key: "salaryExpectation", value: `${min}–${max} EUR` });
  }
  if (worker.preferred_contract_type) {
    fields.push({ key: "contractType", value: String(worker.preferred_contract_type) });
  }
  if (worker.pay_basis_preference) {
    fields.push({ key: "payBasis", value: String(worker.pay_basis_preference) });
  }
  const yesNo = (v: unknown) => (v === true ? YES_TOKEN : NO_TOKEN);
  if (typeof worker.night_shifts_ok === "boolean") {
    fields.push({ key: "nightShifts", value: yesNo(worker.night_shifts_ok) });
  }
  if (typeof worker.weekend_shifts_ok === "boolean") {
    fields.push({ key: "weekendShifts", value: yesNo(worker.weekend_shifts_ok) });
  }
  if (typeof worker.overtime_ok === "boolean") {
    fields.push({ key: "overtime", value: yesNo(worker.overtime_ok) });
  }
  if (Array.isArray(worker.driving_licence_categories) && worker.driving_licence_categories.length > 0) {
    fields.push({
      key: "drivingLicence",
      value: (worker.driving_licence_categories as string[]).join(", "),
    });
  }
  if (typeof worker.own_vehicle === "boolean") {
    fields.push({ key: "ownVehicle", value: yesNo(worker.own_vehicle) });
  }
  if (typeof worker.own_tools === "boolean") {
    fields.push({ key: "ownTools", value: yesNo(worker.own_tools) });
  }

  const { count } = await asAny(supabase)
    .from("worker_skills")
    .select("id", { count: "exact", head: true })
    .eq("worker_id", worker.id);
  if (typeof count === "number" && count > 0) {
    fields.push({ key: "skillsCount", value: String(count) });
  }

  return fields;
}
