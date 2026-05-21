"use server";

import "server-only";
import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";
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
  const tileType = String(formData.get("tile_type") ?? "").trim();
  const areaRaw = String(formData.get("area_done") ?? "").trim();
  const unitSlug = String(formData.get("unit_slug") ?? "square_meters").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const workDate = String(formData.get("work_date") ?? "").trim();
  const area = Number(areaRaw);

  if (!engagementId) throw new Error("Engagement context required");
  if (!siteName) throw new Error("Site name required");
  if (!Number.isFinite(area) || area <= 0) throw new Error("Area must be a positive number");

  // tiler profession (M1 form is tiler-specific)
  const { data: prof } = await supabase
    .from("professions")
    .select("id")
    .eq("slug", "tiler")
    .maybeSingle();

  // original_text: worker's notes, else an auto-composed summary (§2 — the
  // structured fields still produce author content for uniform translation).
  let originalText = notes;
  if (!originalText) {
    const tJournal = await getTranslations({ locale, namespace: "journal" });
    const tUnit = await getTranslations({ locale, namespace: "productivityUnits" });
    originalText = tJournal("composeTiler", {
      area,
      unit: tUnit(unitSlug),
      site: siteName,
    });
  }

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
      entry_type_slug: "structured",
      profession_id: prof?.id ?? null,
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

  const metrics = [
    { entry_id: entry.id, metric_slug: "site_name", value_text: siteName, source: "worker_input" },
    ...(tileType
      ? [{ entry_id: entry.id, metric_slug: "tile_type", value_text: tileType, source: "worker_input" }]
      : []),
    {
      entry_id: entry.id,
      metric_slug: "area_done",
      value_numeric: area,
      unit_slug: unitSlug,
      source: "worker_input",
    },
    // journal_entries has no work_date column — the date the work happened is
    // a metric (created_at remains the immutable log timestamp, §3).
    ...(workDate
      ? [{ entry_id: entry.id, metric_slug: "work_date", value_text: workDate, source: "worker_input" }]
      : []),
  ];
  const { error: mErr } = await supabase.from("journal_entry_metrics").insert(metrics);
  if (mErr) {
    console.error("[journal] insert metrics failed:", mErr.message);
    throw new Error(`journal metrics insert failed: ${mErr.message}`);
  }

  revalidatePath(`/${locale}/dashboard/journal`);
}
