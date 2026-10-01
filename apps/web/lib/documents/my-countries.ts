import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The countries the signed-in person said they would work in
 * (`workers.preferred_countries`, ISO-2). Owner-scoped by RLS. A PREFERENCE,
 * never a right to work — the documents page uses it only to ORDER its
 * country chips. Failure or no worker row reads as an empty list.
 */
export async function readMyPreferredCountries(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workers")
    .select("preferred_countries")
    .eq("profile_id", userId)
    .maybeSingle();
  return Array.isArray(data?.preferred_countries)
    ? (data.preferred_countries as string[]).map((c) => String(c).toUpperCase())
    : [];
}
