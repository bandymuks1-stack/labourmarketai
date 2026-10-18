"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isIsoCountry } from "@/lib/location/country-model";

/**
 * Project administration actions (train D) — NATIVE-NAV forms on the
 * project operations page.
 *
 *   - projectLifecycleAction → set_project_status_v1 (APPLIED, W11): the
 *     ONE lifecycle write — draft→live, live⇄paused, live/paused→completed.
 *     Completing archives the project's active roster atomically inside the
 *     RPC (audited). No new status vocabulary is invented here.
 *   - setProjectResponsibleAction → set_project_responsible_v1 (train-D
 *     gated migration 20260817152000): names the accountable person;
 *     managing roles only, target must be an active org member or an
 *     engaged worker. Honest `needs_migration` notice until the LEAD
 *     applies it.
 *   - setProjectFactsAction → update_project_facts_v1 (R-3, gated migration
 *     20260919130000): the ONE write for title / city / country / dates —
 *     the facts the calendar band, the operations "dates" chip and the
 *     booking-overlap check read and that had NO write path after creation.
 *     Gated by can_manage_project inside the RPC; a completed project is
 *     read-only. Honest `needs_migration` notice until applied.
 *
 * Both actions re-validate every field, call ONLY the gated RPCs (never a
 * direct table write) and redirect back to the operations page with an
 * honest `?notice=` outcome — feedback is the navigation itself.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;
const MIGRATION_MISSING = new Set(["42P01", "42703", "42883", "PGRST202"]);

type Notice =
  | "updated"
  | "invalid"
  | "invalid_transition"
  | "invalid_dates"
  | "completed_read_only"
  | "needs_migration"
  | "not_authorized"
  | "not_found"
  | "error";

function opsUrl(locale: string, projectId: string, notice: Notice): string {
  return `/${locale}/dashboard/projects/${projectId}/operations?notice=${notice}`;
}

function readBase(formData: FormData): { locale: string; projectId: string } {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return {
    locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt",
    projectId: String(formData.get("projectId") ?? "").trim(),
  };
}

function finish(locale: string, projectId: string, notice: Notice): never {
  if (notice === "updated") revalidatePath("/", "layout");
  redirect(opsUrl(locale, projectId, notice));
}

const LIFECYCLE_TARGETS = new Set(["draft", "live", "paused", "completed"]);

/** Move the project along the applied W11 lifecycle matrix. */
export async function projectLifecycleAction(formData: FormData): Promise<void> {
  const { locale, projectId } = readBase(formData);
  if (!UUID_RX.test(projectId)) redirect(`/${locale}/dashboard/projects`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(locale, projectId, "not_authorized");

  const to = String(formData.get("toStatus") ?? "").trim();
  if (!LIFECYCLE_TARGETS.has(to)) finish(locale, projectId, "invalid");

  const { data, error } = await asAny(supabase).rpc("set_project_status_v1", {
    p_project_id: projectId,
    p_status: to,
  });
  if (error) {
    if (MIGRATION_MISSING.has(error.code ?? "")) {
      finish(locale, projectId, "needs_migration");
    }
    if (error.code === "42501") finish(locale, projectId, "not_authorized");
    finish(locale, projectId, "error");
  }
  const outcome = String((data as { outcome?: string } | null)?.outcome ?? "");
  if (outcome === "transitioned" || outcome === "already_in_state") {
    finish(locale, projectId, "updated");
  }
  if (outcome === "invalid_transition" || outcome === "conflict") {
    finish(locale, projectId, "invalid_transition");
  }
  if (outcome === "not_authorized") finish(locale, projectId, "not_authorized");
  if (outcome === "not_found") finish(locale, projectId, "not_found");
  finish(locale, projectId, "error");
}

/** Name (or clear) the project's responsible person. */
export async function setProjectResponsibleAction(
  formData: FormData,
): Promise<void> {
  const { locale, projectId } = readBase(formData);
  if (!UUID_RX.test(projectId)) redirect(`/${locale}/dashboard/projects`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(locale, projectId, "not_authorized");

  const profileId = String(formData.get("profileId") ?? "").trim();
  if (profileId && !UUID_RX.test(profileId)) {
    finish(locale, projectId, "invalid");
  }

  const { data, error } = await asAny(supabase).rpc(
    "set_project_responsible_v1",
    {
      p_project_id: projectId,
      p_profile_id: profileId,
    },
  );
  if (error) {
    if (MIGRATION_MISSING.has(error.code ?? "")) {
      finish(locale, projectId, "needs_migration");
    }
    if (error.code === "42501") finish(locale, projectId, "not_authorized");
    finish(locale, projectId, "error");
  }
  const outcome = String(data ?? "");
  if (outcome === "updated") finish(locale, projectId, "updated");
  if (outcome === "not_allowed") finish(locale, projectId, "not_authorized");
  if (outcome === "not_found") finish(locale, projectId, "not_found");
  finish(locale, projectId, "invalid");
}

const ISO_DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const PROJECT_TITLE_MIN = 2;
const PROJECT_TITLE_MAX = 200;
const PROJECT_CITY_MAX = 120;

/** Read an optional ISO day from the form; `null` = cleared, `undefined` = malformed. */
function readIsoDay(raw: FormDataEntryValue | null): string | null | undefined {
  const v = String(raw ?? "").trim();
  if (v === "") return null;
  if (!ISO_DAY_RX.test(v)) return undefined;
  // A real calendar day, not just the shape of one.
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

/**
 * Set the project's facts: title, city, country (ISO-3166 alpha-2), start and
 * end dates. R-3: every field re-validated here AND inside the RPC; the write
 * is the gated `update_project_facts_v1` — never a direct table write.
 */
export async function setProjectFactsAction(formData: FormData): Promise<void> {
  const { locale, projectId } = readBase(formData);
  if (!UUID_RX.test(projectId)) redirect(`/${locale}/dashboard/projects`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(locale, projectId, "not_authorized");

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < PROJECT_TITLE_MIN || title.length > PROJECT_TITLE_MAX) {
    finish(locale, projectId, "invalid");
  }
  const city = String(formData.get("city") ?? "").trim();
  if (city.length > PROJECT_CITY_MAX) finish(locale, projectId, "invalid");
  const countryRaw = String(formData.get("country") ?? "").trim().toUpperCase();
  if (countryRaw !== "" && !isIsoCountry(countryRaw)) finish(locale, projectId, "invalid");
  const startDate = readIsoDay(formData.get("startDate"));
  const endDate = readIsoDay(formData.get("endDate"));
  if (startDate === undefined || endDate === undefined) finish(locale, projectId, "invalid");
  if (startDate && endDate && endDate < startDate) finish(locale, projectId, "invalid_dates");

  const { data, error } = await asAny(supabase).rpc("update_project_facts_v1", {
    p_project_id: projectId,
    p_title: title,
    p_city: city === "" ? null : city,
    p_country: countryRaw === "" ? null : countryRaw,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) {
    if (MIGRATION_MISSING.has(error.code ?? "")) {
      finish(locale, projectId, "needs_migration");
    }
    if (error.code === "42501") finish(locale, projectId, "not_authorized");
    finish(locale, projectId, "error");
  }
  const outcome = String((data as { outcome?: string } | null)?.outcome ?? "");
  if (outcome === "updated") finish(locale, projectId, "updated");
  if (outcome === "invalid") finish(locale, projectId, "invalid");
  if (outcome === "invalid_dates") finish(locale, projectId, "invalid_dates");
  if (outcome === "completed_read_only") finish(locale, projectId, "completed_read_only");
  if (outcome === "not_authorized") finish(locale, projectId, "not_authorized");
  if (outcome === "not_found") finish(locale, projectId, "not_found");
  finish(locale, projectId, "error");
}
