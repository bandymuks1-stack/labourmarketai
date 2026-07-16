"use server";

import { revalidatePath } from "next/cache";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";
import {
  findProfileForPilot,
  isNeedsMigrationCode,
  PILOT_ORGANISATION_KINDS,
  PILOT_OUTCOMES,
  PILOT_STATUSES,
} from "@/lib/admin/pilots";

/**
 * Admin pilot-cohort server actions (Pilot Onboarding and Measurement v1).
 *
 * Double-gated: requireSuperadmin() here (app layer) AND public.is_admin()
 * inside every SECURITY DEFINER RPC of the DRAFT-GATED migration
 * 20260716120000_pilots_cohort_v1.sql (DB layer). A non-admin is redirected
 * by requireSuperadmin before any RPC is reached; a caller who somehow got
 * past the app gate still receives 'not_authorized' from the RPC.
 *
 * Honest degradation: while the owner has NOT applied the migration, the
 * RPCs do not exist (42883) and every action returns the tagged
 * `needs_migration` code — the UI states that plainly and fakes nothing.
 */

export type PilotActionState =
  | { ok: true; message?: string }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "not_authorized"
        | "invalid"
        | "not_found"
        | "already_participant"
        | "profile_not_found"
        | "note_too_long"
        | "error";
      message?: string;
    };

type DB = Awaited<ReturnType<typeof createClient>>;

// Narrow, explicit cast for RPCs not yet in the generated Database type
// (the repo's existing pattern — see lib/company/team-brigades.ts).
function rpc(supabase: DB, name: string, args: Record<string, unknown>) {
  return (
    supabase.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }>
  )(name, args);
}

function mapRpcError(error: {
  message: string;
  code?: string;
}): PilotActionState {
  if (isNeedsMigrationCode(error.code)) {
    return { ok: false, code: "needs_migration" };
  }
  return { ok: false, code: "error", message: error.message };
}

/** Map the RPC's tagged text/jsonb outcome onto the action state. */
function mapOutcome(outcome: string): PilotActionState {
  switch (outcome) {
    case "created":
    case "recorded":
    case "added":
    case "rejoined":
    case "ok":
      return { ok: true };
    case "not_authorized":
      return { ok: false, code: "not_authorized" };
    case "pilot_not_found":
    case "not_found":
      return { ok: false, code: "not_found" };
    case "profile_not_found":
    case "participant_not_in_pilot":
      return { ok: false, code: "profile_not_found" };
    case "already_participant":
      return { ok: false, code: "already_participant" };
    case "note_too_long":
      return { ok: false, code: "note_too_long" };
    default:
      // invalid_name / invalid_kind / invalid_window / invalid_status /
      // invalid_joined_via / invalid_outcome — all caller-input problems.
      return { ok: false, code: "invalid" };
  }
}

function outcomeOf(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "outcome" in data) {
    return String((data as { outcome: unknown }).outcome);
  }
  return "error";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readUuid(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return UUID_RE.test(s) ? s : null;
}

function readEnum<T extends readonly string[]>(
  v: FormDataEntryValue | null,
  allowed: T,
): T[number] | null {
  const s = (v ?? "").toString();
  return (allowed as readonly string[]).includes(s) ? (s as T[number]) : null;
}

/** Empty string → null; otherwise must be an ISO date (yyyy-mm-dd). */
function readDate(v: FormDataEntryValue | null): string | null | "invalid" {
  const s = (v ?? "").toString().trim();
  if (s === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "invalid";
}

export async function createPilotAction(
  _prev: PilotActionState | null,
  formData: FormData,
): Promise<PilotActionState> {
  await requireSuperadmin("lt");

  const name = String(formData.get("name") ?? "").trim();
  const kind = readEnum(formData.get("organisation_kind"), PILOT_ORGANISATION_KINDS);
  const startsOn = readDate(formData.get("starts_on"));
  const endsOn = readDate(formData.get("ends_on"));

  if (name.length < 2 || name.length > 120 || !kind) {
    return { ok: false, code: "invalid" };
  }
  if (startsOn === "invalid" || endsOn === "invalid") {
    return { ok: false, code: "invalid" };
  }

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, "create_pilot_v1", {
    p_name: name,
    p_organisation_kind: kind,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  });
  if (error) return mapRpcError(error);
  const state = mapOutcome(outcomeOf(data));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function setPilotStatusAction(
  _prev: PilotActionState | null,
  formData: FormData,
): Promise<PilotActionState> {
  await requireSuperadmin("lt");

  const pilotId = readUuid(formData.get("pilot_id"));
  const status = readEnum(formData.get("status"), PILOT_STATUSES);
  if (!pilotId || !status) return { ok: false, code: "invalid" };

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, "set_pilot_status_v1", {
    p_pilot_id: pilotId,
    p_status: status,
  });
  if (error) return mapRpcError(error);
  const state = mapOutcome(outcomeOf(data));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function addPilotParticipantAction(
  _prev: PilotActionState | null,
  formData: FormData,
): Promise<PilotActionState> {
  await requireSuperadmin("lt");

  const pilotId = readUuid(formData.get("pilot_id"));
  const query = String(formData.get("profile_query") ?? "").trim();
  const joinedVia =
    readEnum(formData.get("joined_via"), ["invitation", "manual"] as const) ??
    "manual";
  if (!pilotId || query.length === 0) return { ok: false, code: "invalid" };

  // Resolve the EXISTING profile server-side (exact email or id — admin
  // RLS read; no fuzzy search, no account creation).
  const lookup = await findProfileForPilot(query);
  if (lookup.kind === "invalid") return { ok: false, code: "invalid" };
  if (lookup.kind === "not_found") {
    return { ok: false, code: "profile_not_found" };
  }

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, "add_pilot_participant_v1", {
    p_pilot_id: pilotId,
    p_profile_id: lookup.profileId,
    p_joined_via: joinedVia,
  });
  if (error) return mapRpcError(error);
  const state = mapOutcome(outcomeOf(data));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function removePilotParticipantAction(
  _prev: PilotActionState | null,
  formData: FormData,
): Promise<PilotActionState> {
  await requireSuperadmin("lt");

  const pilotId = readUuid(formData.get("pilot_id"));
  const profileId = readUuid(formData.get("profile_id"));
  if (!pilotId || !profileId) return { ok: false, code: "invalid" };

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, "remove_pilot_participant_v1", {
    p_pilot_id: pilotId,
    p_profile_id: profileId,
  });
  if (error) return mapRpcError(error);
  const state = mapOutcome(outcomeOf(data));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function recordPilotOutcomeAction(
  _prev: PilotActionState | null,
  formData: FormData,
): Promise<PilotActionState> {
  await requireSuperadmin("lt");

  const pilotId = readUuid(formData.get("pilot_id"));
  const outcome = readEnum(formData.get("outcome"), PILOT_OUTCOMES);
  const participantRaw = String(formData.get("participant_profile_id") ?? "").trim();
  const participantProfileId =
    participantRaw === "" ? null : readUuid(formData.get("participant_profile_id"));
  const note = String(formData.get("note") ?? "").trim();

  if (!pilotId || !outcome) return { ok: false, code: "invalid" };
  if (participantRaw !== "" && participantProfileId === null) {
    return { ok: false, code: "invalid" };
  }
  if (note.length > 500) return { ok: false, code: "note_too_long" };

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, "record_pilot_outcome_v1", {
    p_pilot_id: pilotId,
    p_outcome: outcome,
    p_participant_profile_id: participantProfileId,
    p_note: note === "" ? null : note,
  });
  if (error) return mapRpcError(error);
  const state = mapOutcome(outcomeOf(data));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}
