"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * The person's own employer-facing summary (PER-2): `workers.headline` and
 * `workers.bio`, written ONLY through `save_worker_public_summary_v1` (own row,
 * two columns, length-limited). Separate from the private `profiles.profile_text`
 * on purpose — this is the text the person writes knowing that organisations
 * they work with read it.
 */
const PUBLIC_HEADLINE_MAX = 120;
const PUBLIC_BIO_MAX = 1000;

type PublicSummaryResult =
  | { kind: "saved" }
  | { kind: "too-long" }
  | { kind: "no-worker" }
  | { kind: "unavailable" }
  | { kind: "error" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient<any>) => c as unknown as SupabaseClient;

export async function saveWorkerPublicSummary(input: {
  headline: string;
  bio: string;
}): Promise<PublicSummaryResult> {
  const headline = (input.headline ?? "").trim();
  const bio = (input.bio ?? "").trim();
  if (headline.length > PUBLIC_HEADLINE_MAX || bio.length > PUBLIC_BIO_MAX) return { kind: "too-long" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "error" };

  const { data, error } = await asAny(supabase).rpc("save_worker_public_summary_v1", {
    p_headline: headline,
    p_bio: bio,
  });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") return { kind: "unavailable" };
    return { kind: "error" };
  }
  const res = (data ?? {}) as { ok?: boolean; error?: string };
  if (res.ok) {
    revalidatePath("/[locale]/dashboard/profile", "page");
    return { kind: "saved" };
  }
  if (res.error === "headline_too_long" || res.error === "bio_too_long") return { kind: "too-long" };
  if (res.error === "no_worker_profile") return { kind: "no-worker" };
  return { kind: "error" };
}
