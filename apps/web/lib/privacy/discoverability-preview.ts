import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * "Taip jūsų profilį matys įmonės" — the EXACT limited professional summary
 * an employer could see with discoverability granted. Built ONLY from the
 * caller's own RLS-scoped rows. Contains NO surname, email, phone, exact
 * address, documents, CV file or any special-category data — matches the
 * privacy-by-default field set (worker_profile_visibility policy module).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface DiscoverabilityPreviewField {
  key:
    | "displayName"
    | "professions"
    | "experienceYears"
    | "preferredCountries"
    | "availability"
    | "salaryExpectation"
    | "skillsCount";
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
      "id, display_name, experience_years, preferred_countries, availability_status, salary_min_eur, salary_max_eur",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return [];

  const fields: DiscoverabilityPreviewField[] = [];
  if (worker.display_name) {
    fields.push({ key: "displayName", value: String(worker.display_name) });
  }

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
  if (Array.isArray(worker.preferred_countries) && worker.preferred_countries.length > 0) {
    fields.push({
      key: "preferredCountries",
      value: (worker.preferred_countries as string[]).join(", "),
    });
  }
  if (worker.availability_status) {
    fields.push({ key: "availability", value: String(worker.availability_status) });
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

  const { count } = await asAny(supabase)
    .from("worker_skills")
    .select("id", { count: "exact", head: true })
    .eq("worker_id", worker.id);
  if (typeof count === "number" && count > 0) {
    fields.push({ key: "skillsCount", value: String(count) });
  }

  return fields;
}
