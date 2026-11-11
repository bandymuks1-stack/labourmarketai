import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * PUBLIC COMPANY SEARCH (owner decision 2026-11-11). One read: `search_organizations_directory_v2`
 * (migration 20261111090000) decides who may be listed and returns no contact or internal field.
 * A company that has not taken over its profile is listed as unconfirmed and links nowhere.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type DirectoryEntry = {
  id: string;
  name: string;
  type: string;
  country: string | null;
  /** Only for a confirmed company that opted in to its public profile. */
  slug: string | null;
  confirmed: boolean;
};

export type DirectorySearch =
  | { kind: "idle" }
  | { kind: "not_enabled" }
  | { kind: "unavailable" }
  | { kind: "ok"; entries: DirectoryEntry[] };

export const DIRECTORY_TERM_MAX = 80;

export async function searchPublicDirectory(term: string): Promise<DirectorySearch> {
  const q = term.trim().slice(0, DIRECTORY_TERM_MAX);
  if (q.length < 2) return { kind: "idle" };
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("search_organizations_directory_v2", { p_term: q });
  if (error) {
    return ["42883", "PGRST202"].includes(error.code ?? "") ? { kind: "not_enabled" } : { kind: "unavailable" };
  }
  const rows = (data ?? []) as {
    id: string;
    display_name: string;
    organization_type: string;
    country: string | null;
    public_slug: string | null;
    confirmed: boolean;
  }[];
  return {
    kind: "ok",
    entries: rows.map((r) => ({
      id: r.id,
      name: r.display_name,
      type: r.organization_type,
      country: r.country,
      slug: r.confirmed ? r.public_slug : null,
      confirmed: r.confirmed === true,
    })),
  };
}
