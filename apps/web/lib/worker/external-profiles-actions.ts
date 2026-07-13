"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  classifyExternalProfilesError,
  parseExternalProfilePlatform,
  parseExternalProfileVisibility,
  validateExternalProfileUrl,
} from "./external-profiles-model";

/**
 * Server actions for the worker's external profile links. The ONLY write
 * paths are the owner-scoped SECURITY DEFINER RPCs from DRAFT migration
 * 20260713210000_multi_source_talent_v1 (human-gated, NOT applied yet):
 *   * save_worker_external_profile_v1(platform, url) — add a link;
 *   * set_external_profile_visibility_v1(id, visibility) — saved preference
 *     only in v1 (no employer read path exists — the UI says so);
 *   * disconnect_external_profile_v1(id) — stamps disconnected_at; NEVER a
 *     hard delete (provenance preserved).
 * All re-validate closed vocabularies + the https-only URL server-side and
 * touch only the caller's own rows. No direct table writes exist anywhere.
 *
 * DELIBERATELY ABSENT in v1 (honesty, not oversight):
 *   * NO automatic/official import action — the platform never fetches an
 *     external profile host. The UI shows an honest "official import is not
 *     available yet — upload an exported CV instead" note pointing at the
 *     existing CV import flow.
 *   * NO snapshot-review action — review_external_profile_snapshot_v1 exists
 *     in the draft migration as the complete contract, but until a file
 *     import path can populate a snapshot there is nothing to review, so no
 *     UI or action pretends otherwise.
 *
 * Tagged returns (never throw across the server-action boundary — Next.js
 * prod strips thrown Error messages), same convention as
 * lib/worker/worker-languages-actions.ts.
 */

export type ExternalProfileActionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "unauthenticated"
        | "no_worker"
        | "invalid"
        | "error";
    };

const UUID_RE = /^[0-9a-f-]{36}$/i;

// The RPCs are not in the generated Database type until the draft is applied
// and `pnpm db:types` runs — cast at the boundary (same pattern as
// worker-languages-actions.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

function classify(code: string | undefined): ExternalProfileActionResult {
  return { ok: false, code: classifyExternalProfilesError(code) };
}

export async function addExternalProfileAction(
  _prev: ExternalProfileActionResult | null,
  formData: FormData,
): Promise<ExternalProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const platform = parseExternalProfilePlatform(
    String(formData.get("platform") ?? ""),
  );
  const url = validateExternalProfileUrl(String(formData.get("url") ?? ""));
  if (!platform || !url.ok) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("save_worker_external_profile_v1", {
    p_platform: platform,
    p_url: url.url,
    p_profile_id: null,
    p_snapshot: null,
  });

  if (error) {
    const result = classify(error.code);
    if (result.ok === false && result.code === "error") {
      console.error("[external-profiles] add failed:", error.code, error.message);
    }
    return result;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setExternalProfileVisibilityAction(
  _prev: ExternalProfileActionResult | null,
  formData: FormData,
): Promise<ExternalProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const id = String(formData.get("id") ?? "");
  const visibility = parseExternalProfileVisibility(
    String(formData.get("visibility") ?? ""),
  );
  if (!UUID_RE.test(id) || !visibility) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc(
    "set_external_profile_visibility_v1",
    { p_profile_id: id, p_visibility: visibility },
  );

  if (error) {
    const result = classify(error.code);
    if (result.ok === false && result.code === "error") {
      console.error(
        "[external-profiles] visibility failed:",
        error.code,
        error.message,
      );
    }
    return result;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function disconnectExternalProfileAction(
  _prev: ExternalProfileActionResult | null,
  formData: FormData,
): Promise<ExternalProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, code: "invalid" };

  // Soft disconnect ONLY — the RPC stamps disconnected_at and keeps the row
  // (provenance preserved). No hard-delete path exists.
  const { error } = await asAny(supabase).rpc("disconnect_external_profile_v1", {
    p_profile_id: id,
  });

  if (error) {
    const result = classify(error.code);
    if (result.ok === false && result.code === "error") {
      console.error(
        "[external-profiles] disconnect failed:",
        error.code,
        error.message,
      );
    }
    return result;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
