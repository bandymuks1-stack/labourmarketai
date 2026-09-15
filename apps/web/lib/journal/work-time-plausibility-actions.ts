"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  formatWorkTimeOverride,
  isWorkTimeCheckCode,
  normalizeOverrideReason,
  parseWorkTimeOverride,
  WORK_TIME_OVERRIDE_METRIC_SLUG,
} from "@/lib/journal/work-time-plausibility";

/**
 * The worker ACKNOWLEDGES a plausibility check with a reason (owner §13:
 * "overrides recorded with reason"). Append-only, idempotent: one
 * `work_time_override` metric row (`<code>|<day>|<reason>`, source
 * `worker_input`) on an entry the worker owns and that is part of the check.
 * No figure changes — the check is shown as acknowledged, with the reason,
 * from the next read on.
 *
 * Ownership: the entry must be the caller's own live record (RLS would
 * refuse the insert anyway; the explicit check turns that into an honest
 * code instead of a generic write failure). The day must be the entry's own
 * work day — an acknowledgement can only be pinned to evidence it is about.
 */

export type AcknowledgeWorkTimeCheckResult =
  | { ok: true; already: boolean }
  | { ok: false; code: AcknowledgeWorkTimeCheckErrorCode };

export type AcknowledgeWorkTimeCheckErrorCode =
  | "not_authenticated"
  | "no_worker_profile"
  | "entry_not_found"
  | "invalid_check"
  | "invalid_reason"
  | "write_failed";

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

export async function acknowledgeWorkTimeCheck(input: {
  entryId: string;
  code: string;
  day: string;
  reason: string;
}): Promise<AcknowledgeWorkTimeCheckResult> {
  const entryId = typeof input?.entryId === "string" ? input.entryId : "";
  const day = typeof input?.day === "string" ? input.day.trim() : "";
  const code = input?.code;
  if (!entryId || !isWorkTimeCheckCode(code) || !DAY_RX.test(day)) {
    return { ok: false, code: "invalid_check" };
  }
  const reason = normalizeOverrideReason(input?.reason);
  if (!reason) return { ok: false, code: "invalid_reason" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_authenticated" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return { ok: false, code: "no_worker_profile" };

  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id, worker_id, created_at, superseded_by, deleted_at")
    .eq("id", entryId)
    .maybeSingle();
  if (
    !entry ||
    entry.worker_id !== worker.id ||
    entry.deleted_at ||
    entry.superseded_by
  ) {
    return { ok: false, code: "entry_not_found" };
  }

  // The day must be the entry's own work day: the stated `work_date`, else
  // the created day — the same resolution the canonical rule uses.
  const { data: existing } = await supabase
    .from("journal_entry_metrics")
    .select("metric_slug, value_text, source")
    .eq("entry_id", entryId)
    .in("metric_slug", ["work_date", WORK_TIME_OVERRIDE_METRIC_SLUG])
    .order("created_at", { ascending: true });
  const rows = (existing ?? []) as {
    metric_slug: string;
    value_text: string | null;
    source: string | null;
  }[];
  const statedDays = rows
    .filter((r) => r.metric_slug === "work_date" && DAY_RX.test((r.value_text ?? "").trim()))
    .map((r) => (r.value_text ?? "").trim());
  const entryDay =
    statedDays.length > 0
      ? statedDays[statedDays.length - 1]!
      : String(entry.created_at ?? "").slice(0, 10);
  if (day !== entryDay) return { ok: false, code: "invalid_check" };

  const already = rows.some((r) => {
    if (r.metric_slug !== WORK_TIME_OVERRIDE_METRIC_SLUG || r.source !== "worker_input") {
      return false;
    }
    const parsed = parseWorkTimeOverride(r.value_text);
    return parsed !== null && parsed.code === code && parsed.day === day;
  });
  if (!already) {
    const ins = await supabase.from("journal_entry_metrics").insert([
      {
        entry_id: entryId,
        metric_slug: WORK_TIME_OVERRIDE_METRIC_SLUG,
        source: "worker_input",
        value_text: formatWorkTimeOverride({ code, day, reason }),
      },
    ]);
    if (ins.error) return { ok: false, code: "write_failed" };
  }
  try {
    revalidatePath("/[locale]/dashboard/journal", "page");
    revalidatePath("/[locale]/cv", "page");
  } catch {
    /* freshness hint only */
  }
  return { ok: true, already };
}
