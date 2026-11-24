import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  isMissingTableCode,
  parseExternalProfileImportStatus,
  parseExternalProfilePlatform,
  parseExternalProfileVisibility,
  type ExternalProfileEntry,
} from "./external-profiles-model";

/**
 * Read service for the worker's OWN external profile links — the
 * worker_external_profiles table from DRAFT migration
 * 20260713210000_multi_source_talent_v1 (human-gated, NOT applied yet).
 *
 * Owner-scoped: reads ONLY the signed-in worker's own rows (worker_id
 * resolved from the caller's workers row; RLS additionally enforces
 * owns_worker-or-admin). There is NO employer read path in v1 — the
 * 'employers' visibility value is a stored preference only, and this module
 * deliberately exposes no function an employer surface could call.
 *
 * NO automatic import: this module performs no fetch of any external host.
 *
 * Graceful degradation: until the owner applies the draft migration the
 * table does not exist and PostgREST answers 42P01 — we surface
 * `kind: "needs-migration"` so the section explains itself honestly instead
 * of crashing SSR or rendering a fake empty list.
 */

// worker_external_profiles is not in the generated Database type until the
// draft is applied and `pnpm db:types` runs — cast at the boundary, same
// pattern as lib/worker/worker-languages.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type ExternalProfilesRead =
  | { kind: "ok"; profiles: ExternalProfileEntry[] }
  | { kind: "needs-migration" }
  | { kind: "no-worker" };

/**
 * Load the signed-in worker's own CONNECTED external profiles (disconnected
 * rows stay in the DB as preserved provenance but are not listed — the UI
 * shows what is currently linked).
 */
export async function getOwnExternalProfiles(): Promise<ExternalProfilesRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return { kind: "no-worker" };

  const { data, error } = await asAny(supabase)
    .from("worker_external_profiles")
    .select("id, platform, url, visibility, import_status, snapshot_reviewed_at, connected_at")
    .eq("worker_id", worker.id)
    .is("disconnected_at", null)
    .order("connected_at", { ascending: true });

  if (error) {
    if (isMissingTableCode(error.code)) {
      return { kind: "needs-migration" };
    }
    console.error("[external-profiles] read failed:", error.code, error.message);
    // Unknown read failure: render the section empty rather than crash the
    // page — writes go through the RPCs, which report their own honest state.
    return { kind: "ok", profiles: [] };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const profiles = rows
    .map((r): ExternalProfileEntry | null => {
      // Validate against the closed vocabularies — a drifted DB value is
      // dropped rather than rendered as an unknown chip.
      const platform = parseExternalProfilePlatform(r.platform as string | null);
      const visibility = parseExternalProfileVisibility(
        r.visibility as string | null,
      );
      const importStatus = parseExternalProfileImportStatus(
        r.import_status as string | null,
      );
      const url = typeof r.url === "string" ? r.url : null;
      if (!platform || !visibility || !importStatus || !url) return null;
      return {
        id: r.id as string,
        platform,
        url,
        visibility,
        importStatus,
        snapshotReviewedAt: (r.snapshot_reviewed_at as string | null) ?? null,
        connectedAt: r.connected_at as string,
      };
    })
    .filter((e): e is ExternalProfileEntry => e !== null);

  return { kind: "ok", profiles };
}
