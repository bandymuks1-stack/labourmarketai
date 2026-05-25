"use server";

import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Result of `createJournalEntry`. Replaces the old throw-based contract so the
 * client can render a precise failure reason instead of a generic copy.
 *
 * Production Next.js server actions strip thrown error messages to a digest —
 * the prior implementation propagated `throw new Error("...")`, but the
 * composer only ever saw a generic rejection and surfaced "Nepavyko išsaugoti"
 * (P0-B in the journal-evidence-loop sprint goal). Returning a tagged result
 * keeps the real cause attached and stops the silent failure mode.
 */
export type CreateJournalEntryResult =
  | { ok: true; entryId: string }
  | { ok: false; code: JournalSaveErrorCode; message: string };

export type JournalSaveErrorCode =
  | "not_authenticated"
  | "no_worker_profile"
  | "engagement_required"
  | "notes_required"
  | "quantity_invalid"
  | "entry_insert_failed"
  | "metrics_insert_failed";

type ParsedFragmentInput = {
  rawPhrase: string;
  timeValue?: number | null;
  timeUnit?: "hours" | "minutes" | "days" | null;
  activitySlug?: string | null;
  activityLabel?: string | null;
};

function parseFragments(raw: string | null): ParsedFragmentInput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ParsedFragmentInput[] = [];
    for (const row of parsed) {
      if (typeof row !== "object" || row === null) continue;
      const r = row as Record<string, unknown>;
      const rawPhrase = String(r.rawPhrase ?? "").trim();
      if (!rawPhrase) continue;
      const timeUnitRaw = r.timeUnit;
      const timeUnit: ParsedFragmentInput["timeUnit"] =
        timeUnitRaw === "hours" ||
        timeUnitRaw === "minutes" ||
        timeUnitRaw === "days"
          ? timeUnitRaw
          : null;
      out.push({
        rawPhrase,
        timeValue:
          typeof r.timeValue === "number" && Number.isFinite(r.timeValue)
            ? r.timeValue
            : null,
        timeUnit,
        activitySlug:
          typeof r.activitySlug === "string" ? r.activitySlug : null,
        activityLabel:
          typeof r.activityLabel === "string" ? r.activityLabel : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Persist a reviewed work-journal entry (M1). Append-only (§3): composes
 * `original_text` (the worker's own words — never silently dropped), computes
 * a sha256 hash chained to the worker's previous entry, inserts the entry +
 * its metric rows. Per-fragment review metadata is stored as `parsed_fragment`
 * metrics with `source='worker_input'` so the suggestions stay reviewable but
 * never get marked verified (§7 — no fake AI / no fake verification).
 */
export async function createJournalEntry(
  formData: FormData,
): Promise<CreateJournalEntryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
    };
  }

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) {
    return {
      ok: false,
      code: "no_worker_profile",
      message:
        "Nerastas darbuotojo profilis. Atidarykite paskyros nustatymus ir įjunkite darbuotojo vaidmenį.",
    };
  }

  const locale = String(formData.get("locale") ?? "lt");
  const engagementId = String(formData.get("engagement_context_id") ?? "").trim();
  const siteName = String(formData.get("site_name") ?? "").trim();
  const workDirection = String(formData.get("work_direction") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const unitSlug = String(formData.get("unit_slug") ?? "square_meters").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const workDate = String(formData.get("work_date") ?? "").trim();
  const fragments = parseFragments(String(formData.get("fragments_json") ?? "") || null);
  const quantity = quantityRaw === "" ? null : Number(quantityRaw);

  if (!engagementId) {
    return {
      ok: false,
      code: "engagement_required",
      message:
        "Pasirinkite darbo kontekstą (organizaciją ar projektą), prie kurio priklauso šis įrašas.",
    };
  }
  if (!notes) {
    return {
      ok: false,
      code: "notes_required",
      message: "Aprašykite ką dirbote — laisvas tekstas yra įrašo įrodymas.",
    };
  }
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    return {
      ok: false,
      code: "quantity_invalid",
      message: "Kiekis turi būti neneigiamas skaičius.",
    };
  }

  let professionId: string | null = null;
  if (workDirection) {
    const { data: prof } = await supabase
      .from("professions")
      .select("id")
      .eq("slug", workDirection)
      .maybeSingle();
    professionId = prof?.id ?? null;
  }

  const originalText = notes;

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
      [
        worker.id,
        engagementId,
        originalText,
        locale,
        hashPrev ?? "",
        new Date().toISOString(),
      ].join("|"),
    )
    .digest("hex");

  const hasStructured =
    quantity !== null || workDirection !== "" || fragments.length > 0;

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({
      worker_id: worker.id,
      engagement_context_id: engagementId,
      entry_type_slug: hasStructured ? "hybrid" : "freeform",
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
    return {
      ok: false,
      code: "entry_insert_failed",
      message: `Įrašo išsaugoti nepavyko: ${error?.message ?? "nežinoma klaida"}`,
    };
  }

  const metrics = [
    ...(workDirection
      ? [
          {
            entry_id: entry.id,
            metric_slug: "work_direction",
            value_text: workDirection,
            source: "worker_input",
          },
        ]
      : []),
    ...(siteName
      ? [
          {
            entry_id: entry.id,
            metric_slug: "site_name",
            value_text: siteName,
            source: "worker_input",
          },
        ]
      : []),
    ...(quantity !== null
      ? [
          {
            entry_id: entry.id,
            metric_slug: "quantity",
            value_numeric: quantity,
            unit_slug: unitSlug,
            source: "worker_input",
          },
        ]
      : []),
    ...(workDate
      ? [
          {
            entry_id: entry.id,
            metric_slug: "work_date",
            value_text: workDate,
            source: "worker_input",
          },
        ]
      : []),
    // Per-fragment review metadata. Each row preserves the raw phrase + the
    // interpretation the worker confirmed. Marked `worker_input` so the trust
    // layer never treats these as externally verified.
    ...fragments.flatMap((f, idx) => {
      type MetricRow = {
        entry_id: string;
        metric_slug: string;
        source: string;
        value_text?: string | null;
        value_numeric?: number | null;
        unit_slug?: string | null;
      };
      const rows: MetricRow[] = [
        {
          entry_id: entry.id,
          metric_slug: "parsed_fragment",
          value_text: `${idx + 1}|${f.rawPhrase}`,
          source: "worker_input",
        },
      ];
      if (f.timeValue !== null && f.timeValue !== undefined && f.timeUnit) {
        rows.push({
          entry_id: entry.id,
          metric_slug: "fragment_time",
          value_numeric: f.timeValue,
          unit_slug: f.timeUnit,
          value_text: String(idx + 1),
          source: "worker_input",
        });
      }
      const activityLabel = f.activitySlug ?? f.activityLabel;
      if (activityLabel) {
        rows.push({
          entry_id: entry.id,
          metric_slug: "fragment_activity",
          value_text: `${idx + 1}|${activityLabel}`,
          source: "worker_input",
        });
      }
      return rows;
    }),
  ];
  if (metrics.length > 0) {
    const { error: mErr } = await supabase
      .from("journal_entry_metrics")
      .insert(metrics);
    if (mErr) {
      console.error("[journal] insert metrics failed:", mErr.message);
      return {
        ok: false,
        code: "metrics_insert_failed",
        message: `Įrašas išsaugotas, bet pasiūlymų metadata nepridėta: ${mErr.message}`,
      };
    }
  }

  revalidatePath(`/${locale}/dashboard/journal`);
  return { ok: true, entryId: entry.id };
}
