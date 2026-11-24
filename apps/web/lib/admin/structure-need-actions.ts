"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * S6 — HUMAN structuring of a demand request (§19 demand→ESCO bridge).
 *
 * Writes payload.structured_need = { esco_occupation_uri, esco_skill_uris,
 * structured_at, structured_by: 'admin' } on customer_requests through the
 * EXISTING admin UPDATE RLS (0028) — the same no-migration path
 * recordHumanMatch uses. Old requests get structure ONLY through this
 * explicit human act (or the intake pick) — nothing is ever invented.
 * The typeahead pick gives esco concept ids; this action resolves them to
 * the canonical ESCO URIs server-side.
 */

export type StructureNeedState =
  | { ok: true; skillCount: number }
  | { ok: false; code: "invalid" | "not_found" | "not_admin" | "error" }
  | null;

const MAX_SKILLS = 30;

function parseIds(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [
      ...new Set(
        v
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter((x) => x !== ""),
      ),
    ].slice(0, MAX_SKILLS);
  } catch {
    return [];
  }
}

export async function structureRequestNeed(
  _prev: StructureNeedState,
  formData: FormData,
): Promise<StructureNeedState> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const locale = String(formData.get("locale") ?? "lt");
  const skillConceptIds = parseIds(String(formData.get("skill_concept_ids") ?? "[]"));
  const occupationConceptId =
    String(formData.get("occupation_concept_id") ?? "").trim() || null;
  if (requestId === "" || skillConceptIds.length === 0) {
    return { ok: false, code: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_admin" };

  // Resolve concept ids → canonical ESCO URIs (read-only catalogue lookups).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: skillRows, error: sErr } = await sb
    .from("esco_skills")
    .select("id, esco_uri")
    .in("id", skillConceptIds);
  if (sErr) return { ok: false, code: "error" };
  const skillUris = [
    ...new Set(
      ((skillRows ?? []) as { esco_uri: string | null }[])
        .map((r) => r.esco_uri)
        .filter((u): u is string => !!u),
    ),
  ].sort();
  if (skillUris.length === 0) return { ok: false, code: "invalid" };

  let occupationUri: string | null = null;
  if (occupationConceptId) {
    const { data: occ } = await sb
      .from("esco_occupations")
      .select("esco_uri")
      .eq("id", occupationConceptId)
      .maybeSingle();
    occupationUri = (occ as { esco_uri: string | null } | null)?.esco_uri ?? null;
  }

  // Read-modify-write under the EXISTING admin UPDATE RLS — a non-admin
  // matches 0 rows and surfaces not_found honestly.
  const { data: row, error: rErr } = await sb
    .from("customer_requests")
    .select("id, payload")
    .eq("id", requestId)
    .maybeSingle();
  if (rErr) return { ok: false, code: "error" };
  if (!row) return { ok: false, code: "not_found" };

  const payload = {
    ...((row as { payload: Record<string, unknown> | null }).payload ?? {}),
    structured_need: {
      esco_occupation_uri: occupationUri,
      esco_skill_uris: skillUris,
      structured_at: new Date().toISOString(),
      structured_by: "admin",
    },
  };

  const { data: updated, error: uErr } = await sb
    .from("customer_requests")
    .update({ payload })
    .eq("id", requestId)
    .select("id");
  if (uErr) return { ok: false, code: "error" };
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: false, code: "not_admin" };
  }

  revalidatePath(`/${locale}/dashboard/admin/matching`);
  return { ok: true, skillCount: skillUris.length };
}
