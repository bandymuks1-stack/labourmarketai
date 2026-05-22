"use server";

import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Create a structured tiler journal entry (M1). Append-only (§3): composes
 * original_text (notes, else an auto-summary), computes a sha256 hash chained
 * to the worker's previous entry, inserts the entry + its metric rows. AI
 * extraction (§7.1) and freeform are M2.
 */
export async function createJournalEntry(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) throw new Error("No worker profile");

  const locale = String(formData.get("locale") ?? "lt");
  const engagementId = String(formData.get("engagement_context_id") ?? "").trim();
  const siteName = String(formData.get("site_name") ?? "").trim();
  const workDirection = String(formData.get("work_direction") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const unitSlug = String(formData.get("unit_slug") ?? "square_meters").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const workDate = String(formData.get("work_date") ?? "").trim();
  const quantity = quantityRaw === "" ? null : Number(quantityRaw);

  if (!engagementId) throw new Error("Engagement context required");
  // Free text is the proof of record — it is the one required field now (no
  // longer locked to a tiler template needing site + area). Quantity optional.
  if (!notes) throw new Error("Please describe what you did");
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    throw new Error("Quantity must be a non-negative number");
  }

  // Resolve the chosen work direction to a profession id (null = general work).
  // Any of the worker's directions — never forced to one template.
  let professionId: string | null = null;
  if (workDirection) {
    const { data: prof } = await supabase
      .from("professions")
      .select("id")
      .eq("slug", workDirection)
      .maybeSingle();
    professionId = prof?.id ?? null;
  }

  // The worker's own words are the original_text (required, §2).
  const originalText = notes;

  // hash chain: link to this worker's previous entry
  const { data: prev } = await supabase
    .from("journal_entries")
    .select("hash_self")
    .eq("worker_id", worker.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const hashPrev = prev?.hash_self ?? null;
  const hashSelf = createHash("sha256")
    .update(
      [worker.id, engagementId, originalText, locale, hashPrev ?? "", new Date().toISOString()].join("|"),
    )
    .digest("hex");

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({
      worker_id: worker.id,
      engagement_context_id: engagementId,
      // freeform when only the narrative was given; hybrid when a metric is too.
      entry_type_slug: quantity !== null ? "hybrid" : "freeform",
      profession_id: professionId,
      original_text: originalText,
      original_language: locale.slice(0, 2),
      hash_prev: hashPrev,
      hash_self: hashSelf,
      visibility_scope: "closed",
    })
    .select("id")
    .single();
  if (error || !entry) {
    console.error("[journal] insert entry failed:", error?.message);
    throw new Error(`journal entry insert failed: ${error?.message}`);
  }

  // Generic, optional metrics — nothing tiler-specific. metric_slug is free
  // text, so any work type composes the same way (no schema change).
  const metrics = [
    ...(workDirection
      ? [{ entry_id: entry.id, metric_slug: "work_direction", value_text: workDirection, source: "worker_input" }]
      : []),
    ...(siteName
      ? [{ entry_id: entry.id, metric_slug: "site_name", value_text: siteName, source: "worker_input" }]
      : []),
    ...(quantity !== null
      ? [{ entry_id: entry.id, metric_slug: "quantity", value_numeric: quantity, unit_slug: unitSlug, source: "worker_input" }]
      : []),
    ...(workDate
      ? [{ entry_id: entry.id, metric_slug: "work_date", value_text: workDate, source: "worker_input" }]
      : []),
  ];
  if (metrics.length > 0) {
    const { error: mErr } = await supabase.from("journal_entry_metrics").insert(metrics);
    if (mErr) {
      console.error("[journal] insert metrics failed:", mErr.message);
      throw new Error(`journal metrics insert failed: ${mErr.message}`);
    }
  }

  revalidatePath(`/${locale}/dashboard/journal`);
}
