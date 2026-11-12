"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import { parseNeedPublicState, type NeedPublicState } from "./public-company-needs-model";

/**
 * THE COMPANY'S EXPLICIT CHOICE — "Publish publicly" for ONE need (owner
 * principle C, 2026-11-12). Default off; nothing is public until the company
 * chooses. The database door `set_need_public_publication_v1` decides who may
 * choose (the need's poster, or an organization member with demand authority)
 * and records every publish / withdraw as an append-only event. This action
 * only forwards the choice under the caller's own session.
 */
export type NeedPublicationActionState =
  | { ok: true; state: NeedPublicState | null }
  | { ok: false; code: "invalid" | "not_allowed" | "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Last non-empty valid entry: the hidden input and the clicked button both post `publish`. */
function readChoice(values: readonly FormDataEntryValue[]): boolean | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const s = (values[i] ?? "").toString();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

export async function setNeedPublicationAction(
  _prev: NeedPublicationActionState | null,
  formData: FormData,
): Promise<NeedPublicationActionState> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const publish = readChoice(formData.getAll("publish"));
  if (!UUID.test(requestId) || publish === null) return { ok: false, code: "invalid" };
  try {
    const supabase = await createClient();
    const { data, error } = (await asAny(supabase).rpc("set_need_public_publication_v1", {
      p_request_id: requestId,
      p_publish: publish,
    })) as { data: unknown; error: { code?: string } | null };
    if (error) return { ok: false, code: error.code === "42501" ? "not_allowed" : "error" };
    revalidatePath("/", "layout");
    return { ok: true, state: parseNeedPublicState(data) };
  } catch {
    return { ok: false, code: "error" };
  }
}
