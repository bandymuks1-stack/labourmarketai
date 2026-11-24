import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { iscoGroupsForEscoUris } from "@/lib/esco/esco-lookup";
import { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * THE OCCUPATION PATH of the universal Work Journal (owner direction #1689):
 *
 *   worker's profession → `professions.esco_uri` → `esco_occupations.isco_group`
 *     → `archetypesForIsco` → `composeJournal`
 *
 * This module resolves the first two arrows for the worker's OWN professions,
 * under the caller's session and RLS (`worker_professions_select` is the
 * worker's own rows; `esco_occupations_select` is every active occupation).
 * Two bounded reads: a worker holds a handful of professions, and the URI
 * batch is capped in `iscoGroupsForEscoUris`.
 *
 * What it returns is DATA the pure composer (`journal-module-fields.ts`)
 * turns into fields; what it never does is guess. A profession without an
 * `esco_uri` (15 of 49 on production — `teacher` and `caregiver` are NULL on
 * purpose, ambiguity kept as UNKNOWN) carries `iscoGroup: null` and composes
 * nothing on this path; a catalogue that cannot be read degrades to no ISCO
 * codes at all, with `escoRead` saying so, so a caller can tell "this worker
 * has no mapped profession" from "the catalogue was unavailable".
 *
 * The server's accept set (`resolveModuleMetricRows`) reads through here by
 * the WORKER, never by a client-posted profession slug — the client only
 * decides which of the worker's own professions an entry names.
 */

export type OwnProfessionDirection = {
  readonly slug: string;
  readonly isPrimary: boolean;
  readonly escoUri: string | null;
  /** ISCO-08 code of the profession's ESCO occupation; null when unmapped. */
  readonly iscoGroup: string | null;
};

export type OwnOccupationPath = {
  /** The worker's professions, primary first (the read's own order). */
  readonly directions: readonly OwnProfessionDirection[];
  /** Every distinct ISCO code the worker's professions resolve to. */
  readonly iscoGroups: readonly string[];
  /** Whether the ESCO catalogue answered — `false` means the codes above
   *  are missing because the read failed, not because nothing is mapped. */
  readonly escoRead: boolean;
};

const EMPTY: OwnOccupationPath = { directions: [], iscoGroups: [], escoRead: true };

/** Resolve the occupation path for a worker (by `workers.id`). */
export async function readOwnOccupationPath(
  supabase: ServerSupabase | SupabaseClient,
  workerId: string,
): Promise<OwnOccupationPath> {
  const { data: rows, error } = await (supabase as ServerSupabase)
    .from("worker_professions")
    .select("is_primary, professions(slug, esco_uri)")
    .eq("worker_id", workerId)
    .order("is_primary", { ascending: false });
  if (error || !rows) return EMPTY;

  const base = rows
    .map((r) => {
      const p = r.professions as { slug: string; esco_uri: string | null } | null;
      return p?.slug
        ? { slug: p.slug, isPrimary: r.is_primary === true, escoUri: p.esco_uri ?? null }
        : null;
    })
    .filter((d): d is { slug: string; isPrimary: boolean; escoUri: string | null } => d !== null);

  const uris = base.map((d) => d.escoUri).filter((u): u is string => !!u);
  const read = await iscoGroupsForEscoUris(uris, supabase as SupabaseClient);
  const byUri = read.status === "ok" ? read.value : new Map<string, string>();

  const directions: OwnProfessionDirection[] = base.map((d) => ({
    ...d,
    iscoGroup: d.escoUri ? (byUri.get(d.escoUri) ?? null) : null,
  }));
  return {
    directions,
    iscoGroups: [...new Set(directions.map((d) => d.iscoGroup).filter((c): c is string => !!c))],
    escoRead: read.status === "ok",
  };
}

/** The same path for the signed-in person (by `profiles.id`); a profile
 *  without a worker row has no professions and no path. */
export async function readOwnOccupationPathForUser(
  supabase: ServerSupabase | SupabaseClient,
  userId: string,
): Promise<OwnOccupationPath> {
  const { data: worker } = await (supabase as ServerSupabase)
    .from("workers")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!worker) return EMPTY;
  return readOwnOccupationPath(supabase, worker.id);
}
