"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  parseWorkerLanguage,
  parseWorkerLanguageLevel,
  classifyLanguagesError,
} from "@/lib/worker/worker-languages-model";
import {
  validateEducationInput,
  classifyEducationError,
} from "@/lib/worker/worker-education-model";
import {
  validateAchievementInput,
  classifyAchievementsError,
} from "@/lib/worker/worker-achievements-model";
import { getOwnAvailabilityPrefs } from "@/lib/worker/availability-prefs";
import type { CvAvailabilityHintKey, CvDatePart } from "@/lib/cv/structured-parse";
import { periodEndIso, periodStartIso } from "@/lib/cv/period-dates";

/**
 * Confirm actions for the structured CV import review panel (Full CV System
 * v1, M2 wiring). ONE action per section kind; each persists ONE explicitly
 * user-confirmed proposal into its CANONICAL table:
 *
 *   work history  → engagement_contexts via save_self_declared_work_history_v1
 *                   (DRAFT migration 20260714161000 — honest needs_migration
 *                   until the owner applies it);
 *   education     → worker_education (DRAFT 20260714160000);
 *   language      → worker_languages via save_worker_language_v1 (applied);
 *   certificate   → worker_achievements with slug 'declared_certificate'
 *                   (HONEST MAPPING: no file exists, so no worker_documents
 *                   row is fabricated — the documents readiness surface stays
 *                   real; the row is always labelled declared-not-verified);
 *   achievement   → worker_achievements ('achievement');
 *   salary        → workers.salary_min_eur/max_eur via the applied
 *                   save_worker_card RPC (partial-save: nulls keep existing);
 *   availability  → worker availability preference columns via the applied
 *                   save_worker_availability_prefs RPC(s) — READ-MERGE-WRITE:
 *                   current values are read first and passed back, only the
 *                   confirmed key changes.
 *
 * NEVER auto-persist, NEVER overwrite silently: single-value facts (salary,
 * an existing language level, an already-set availability preference) return
 * `code: "conflict"` with the existing value when it differs — the UI shows
 * BOTH values and only an explicit "replace" re-call (allowReplace=true)
 * writes. Doctrine §7.1.
 */

export type CvImportConfirmResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "unauthenticated"
        | "invalid"
        | "conflict"
        | "error";
      /** Human-renderable existing value for conflict display. */
      existing?: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

async function requireUser(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

// ── Work history ─────────────────────────────────────────────────────────────

export async function confirmCvWorkHistoryAction(input: {
  title: string;
  startYear: number | null;
  endYear: number | null;
  /** Full-precision endpoints from the deterministic parser; when absent
   *  (AI-enhancement proposals) the bare years above are used. */
  start?: CvDatePart | null;
  end?: CvDatePart | null;
  isCurrent: boolean;
}): Promise<CvImportConfirmResult> {
  const ctx = await requireUser();
  if (!ctx) return { ok: false, code: "unauthenticated" };

  const title = (input.title ?? "").trim();
  if (title.length < 3 || title.length > 200) return { ok: false, code: "invalid" };
  const startPart =
    input.start ??
    (input.startYear ? { year: input.startYear, month: null, day: null } : null);
  const endPart =
    input.end ??
    (input.endYear ? { year: input.endYear, month: null, day: null } : null);
  // Stated precision is preserved: Y → Y-01-01/Y-12-31, Y-M → first/last real
  // day of that month (leap-aware), full date → exact day. Invalid → null.
  const startedAt = periodStartIso(startPart);
  const endedAt = input.isCurrent ? null : periodEndIso(endPart);

  const { error } = await asAny(ctx.supabase).rpc(
    "save_self_declared_work_history_v1",
    {
      p_title: title,
      p_relationship_slug: "employee",
      p_started_at: startedAt,
      p_ended_at: endedAt,
    },
  );
  if (error) {
    if (["42883", "PGRST202"].includes(error.code ?? "")) {
      return { ok: false, code: "needs_migration" };
    }
    if (error.code === "22023") return { ok: false, code: "invalid" };
    console.error("[cv-import] work-history save failed:", error.code, error.message);
    return { ok: false, code: "error" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Education ────────────────────────────────────────────────────────────────

export async function confirmCvEducationAction(input: {
  institution: string;
  program: string | null;
  educationTypeSlug: string;
  startYear: number | null;
  endYear: number | null;
}): Promise<CvImportConfirmResult> {
  const ctx = await requireUser();
  if (!ctx) return { ok: false, code: "unauthenticated" };

  const validated = validateEducationInput({
    institutionName: input.institution,
    programOrField: input.program,
    educationTypeSlug: input.educationTypeSlug,
    startYear: input.startYear,
    endYear: input.endYear,
    isCurrent: false,
    note: null,
  });
  if (!validated) return { ok: false, code: "invalid" };

  const { error } = await asAny(ctx.supabase).from("worker_education").insert({
    profile_id: ctx.userId,
    institution_name: validated.institutionName,
    program_or_field: validated.programOrField,
    education_type_slug: validated.educationTypeSlug,
    start_year: validated.startYear,
    end_year: validated.endYear,
    is_current: false,
    note: null,
  });
  if (error) {
    const mapped = classifyEducationError(error.code);
    if (mapped !== "error") return { ok: false, code: mapped };
    if (["23514", "23503"].includes(error.code ?? "")) {
      return { ok: false, code: "invalid" };
    }
    console.error("[cv-import] education save failed:", error.code, error.message);
    return { ok: false, code: "error" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Language (conflict-aware upsert) ─────────────────────────────────────────

export async function confirmCvLanguageAction(input: {
  lang: string;
  level: string;
  allowReplace?: boolean;
}): Promise<CvImportConfirmResult> {
  const ctx = await requireUser();
  if (!ctx) return { ok: false, code: "unauthenticated" };

  const lang = parseWorkerLanguage(input.lang);
  const level = parseWorkerLanguageLevel(input.level);
  if (!lang || !level) return { ok: false, code: "invalid" };

  // Conflict check — an already-stated DIFFERENT level is a user fact that
  // must never be silently replaced (§7.1).
  if (input.allowReplace !== true) {
    const { data: worker } = await ctx.supabase
      .from("workers")
      .select("id")
      .eq("profile_id", ctx.userId)
      .maybeSingle();
    if (worker?.id) {
      const { data: existingRows, error: readError } = await asAny(ctx.supabase)
        .from("worker_languages")
        .select("lang, level")
        .eq("worker_id", worker.id)
        .eq("lang", lang);
      if (!readError) {
        const existing = (existingRows ?? [])[0] as
          | { lang: string; level: string }
          | undefined;
        if (existing && existing.level !== level) {
          return { ok: false, code: "conflict", existing: existing.level };
        }
      }
    }
  }

  const { error } = await asAny(ctx.supabase).rpc("save_worker_language_v1", {
    p_lang: lang,
    p_level: level,
  });
  if (error) {
    const mapped = classifyLanguagesError(error.code);
    if (mapped === "needs_migration") return { ok: false, code: "needs_migration" };
    if (error.code === "22023") return { ok: false, code: "invalid" };
    console.error("[cv-import] language save failed:", error.code, error.message);
    return { ok: false, code: "error" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Certificates + achievements → worker_achievements ───────────────────────

async function insertAchievement(
  kindSlug: "declared_certificate" | "achievement",
  input: { title: string; year: number | null },
): Promise<CvImportConfirmResult> {
  const ctx = await requireUser();
  if (!ctx) return { ok: false, code: "unauthenticated" };

  const validated = validateAchievementInput({
    title: input.title,
    description: null,
    achievedAt:
      input.year && input.year >= 1900 && input.year <= 2100
        ? `${input.year}-01-01`
        : null,
    achievementTypeSlug: kindSlug,
  });
  if (!validated) return { ok: false, code: "invalid" };

  const { error } = await asAny(ctx.supabase).from("worker_achievements").insert({
    profile_id: ctx.userId,
    title: validated.title,
    description: validated.description,
    achieved_at: validated.achievedAt,
    achievement_type_slug: validated.achievementTypeSlug,
  });
  if (error) {
    const mapped = classifyAchievementsError(error.code);
    if (mapped !== "error") return { ok: false, code: mapped };
    if (["23514", "23503"].includes(error.code ?? "")) {
      return { ok: false, code: "invalid" };
    }
    console.error(`[cv-import] ${kindSlug} save failed:`, error.code, error.message);
    return { ok: false, code: "error" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function confirmCvCertificateAction(input: {
  title: string;
  year: number | null;
}): Promise<CvImportConfirmResult> {
  return insertAchievement("declared_certificate", input);
}

export async function confirmCvAchievementAction(input: {
  title: string;
}): Promise<CvImportConfirmResult> {
  return insertAchievement("achievement", { title: input.title, year: null });
}

// ── Salary expectation (conflict-aware partial save) ─────────────────────────

export async function confirmCvSalaryAction(input: {
  minEur: number | null;
  maxEur: number | null;
  allowReplace?: boolean;
}): Promise<CvImportConfirmResult> {
  const ctx = await requireUser();
  if (!ctx) return { ok: false, code: "unauthenticated" };

  const valid = (n: number | null) =>
    n === null || (Number.isInteger(n) && n >= 0 && n <= 100000);
  if (!valid(input.minEur) || !valid(input.maxEur)) {
    return { ok: false, code: "invalid" };
  }
  if (input.minEur === null && input.maxEur === null) {
    return { ok: false, code: "invalid" };
  }
  if (input.minEur !== null && input.maxEur !== null && input.minEur > input.maxEur) {
    return { ok: false, code: "invalid" };
  }

  if (input.allowReplace !== true) {
    const { data: worker } = await asAny(ctx.supabase)
      .from("workers")
      .select("salary_min_eur, salary_max_eur")
      .eq("profile_id", ctx.userId)
      .maybeSingle();
    const existingMin = (worker?.salary_min_eur as number | null) ?? null;
    const existingMax = (worker?.salary_max_eur as number | null) ?? null;
    const differs =
      (existingMin !== null && input.minEur !== null && existingMin !== input.minEur) ||
      (existingMax !== null && input.maxEur !== null && existingMax !== input.maxEur);
    if (differs) {
      return {
        ok: false,
        code: "conflict",
        existing: [existingMin, existingMax]
          .filter((v): v is number => v !== null)
          .join("–"),
      };
    }
  }

  // save_worker_card is a PARTIAL save (coalesce — nulls keep existing), so
  // only the salary fields move.
  const { error } = await asAny(ctx.supabase).rpc("save_worker_card", {
    p_availability_status: null,
    p_available_from: null,
    p_location_country: null,
    p_preferred_countries: null,
    p_salary_min: input.minEur,
    p_salary_max: input.maxEur,
  });
  if (error) {
    if (["42883", "PGRST202", "42703", "42P01"].includes(error.code ?? "")) {
      return { ok: false, code: "needs_migration" };
    }
    console.error("[cv-import] salary save failed:", error.code, error.message);
    return { ok: false, code: "error" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Availability hints (read-merge-write; conflict-aware) ────────────────────

export async function confirmCvAvailabilityAction(input: {
  key: CvAvailabilityHintKey;
  allowReplace?: boolean;
}): Promise<CvImportConfirmResult> {
  const ctx = await requireUser();
  if (!ctx) return { ok: false, code: "unauthenticated" };

  const prefs = await getOwnAvailabilityPrefs();
  if (prefs.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (prefs.kind === "no-worker") return { ok: false, code: "invalid" };

  const v1 = prefs.values;
  const v2 = prefs.v2.kind === "ok" ? prefs.v2.values : null;

  const isV2Key = input.key === "nightShiftsOk" || input.key === "weekendShiftsOk";
  if (isV2Key && v2 === null) return { ok: false, code: "needs_migration" };

  // Conflict: an existing explicit "no" is a user fact.
  const current: boolean | null = (() => {
    switch (input.key) {
      case "willingToRelocate":
        return v1.willingToRelocate;
      case "hasTransport":
        return v1.hasTransport;
      case "nightShiftsOk":
        return v2?.nightShiftsOk ?? null;
      case "weekendShiftsOk":
        return v2?.weekendShiftsOk ?? null;
    }
  })();
  if (current === true) return { ok: true }; // already stated — nothing to do
  if (current === false && input.allowReplace !== true) {
    return { ok: false, code: "conflict", existing: "no" };
  }

  // READ-MERGE-WRITE: the save RPCs write EVERY field, so we pass every
  // current value back and change only the confirmed key. Untouched fields
  // are preserved explicitly — never wiped.
  if (isV2Key && v2) {
    const { error } = await asAny(ctx.supabase).rpc(
      "save_worker_availability_prefs_v2",
      {
        p_willing_to_relocate: v1.willingToRelocate,
        p_needs_accommodation: v1.needsAccommodation,
        p_has_transport: v1.hasTransport,
        p_max_trip_days: v1.maxTripDays,
        p_preferred_contract_type: v1.preferredContractType,
        p_team_available: v1.teamAvailable,
        p_solo_available: v1.soloAvailable,
        p_availability_note: v1.availabilityNote,
        p_pay_basis_preference: v2.payBasisPreference,
        p_night_shifts_ok:
          input.key === "nightShiftsOk" ? true : v2.nightShiftsOk,
        p_weekend_shifts_ok:
          input.key === "weekendShiftsOk" ? true : v2.weekendShiftsOk,
        p_overtime_ok: v2.overtimeOk,
        p_driving_licence_categories: v2.drivingLicenceCategories,
        p_own_vehicle: v2.ownVehicle,
        p_own_tools: v2.ownTools,
      },
    );
    if (error) {
      if (["42883", "PGRST202", "42703"].includes(error.code ?? "")) {
        return { ok: false, code: "needs_migration" };
      }
      console.error("[cv-import] availability v2 save failed:", error.code, error.message);
      return { ok: false, code: "error" };
    }
  } else {
    const { error } = await asAny(ctx.supabase).rpc(
      "save_worker_availability_prefs",
      {
        p_willing_to_relocate:
          input.key === "willingToRelocate" ? true : v1.willingToRelocate,
        p_needs_accommodation: v1.needsAccommodation,
        p_has_transport: input.key === "hasTransport" ? true : v1.hasTransport,
        p_max_trip_days: v1.maxTripDays,
        p_preferred_contract_type: v1.preferredContractType,
        p_team_available: v1.teamAvailable,
        p_solo_available: v1.soloAvailable,
        p_availability_note: v1.availabilityNote,
      },
    );
    if (error) {
      if (["42883", "PGRST202", "42703"].includes(error.code ?? "")) {
        return { ok: false, code: "needs_migration" };
      }
      console.error("[cv-import] availability save failed:", error.code, error.message);
      return { ok: false, code: "error" };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
