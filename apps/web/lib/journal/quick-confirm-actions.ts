"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { confirmEntryAndVerifySkills } from "@/lib/operations/org-membership";
import { reviewJournalEntry } from "./review-actions";

/**
 * One-Tap Confirm actions (S3.5). NO new write paths: every confirmation is
 * delegated to the EXISTING gated chain —
 *   - skills present → `confirm_entry_and_verify_skills` RPC (via the
 *     org-membership wrapper), the only path that can flip worker_skills;
 *   - no unverified skills → `review_journal_entry` RPC (approved), via the
 *     existing reviewJournalEntry action.
 * The card lists exactly what a tap confirms (worker, date, works, skills) —
 * nothing is confirmed without the manager's explicit tap, and the batch
 * dialog shows the full summary before its single confirm.
 */

export type QuickConfirmState =
  | { ok: true; verifiedSkills: number }
  | { ok: false; code: string; message?: string };

async function confirmOne(
  entryId: string,
  skillIds: string[],
  locale: string,
): Promise<QuickConfirmState> {
  if (skillIds.length > 0) {
    const res = await confirmEntryAndVerifySkills(entryId, skillIds, null, locale);
    if (res.ok) return { ok: true, verifiedSkills: res.verified ?? 0 };
    return { ok: false, code: res.code, message: res.message };
  }
  // No unverified skills on the card — the tap approves the entry itself
  // through the existing review action (same RPC the inbox uses).
  const fd = new FormData();
  fd.set("entry_id", entryId);
  fd.set("decision", "approved");
  fd.set("locale", locale);
  const res = await reviewJournalEntry(null, fd);
  if (res.ok) return { ok: true, verifiedSkills: 0 };
  return { ok: false, code: res.code, message: res.message };
}

export async function quickConfirmEntry(
  _prev: QuickConfirmState | null,
  formData: FormData,
): Promise<QuickConfirmState> {
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const locale = String(formData.get("locale") ?? "lt");
  const skillIds = formData
    .getAll("skill_id")
    .map((v) => String(v).trim())
    .filter((v) => v !== "");
  if (entryId === "") return { ok: false, code: "error", message: "entry_id required" };
  const res = await confirmOne(entryId, skillIds, locale);
  if (res.ok) revalidatePath(`/${locale}/dashboard/inbox/quick`);
  return res;
}

export type BatchQuickConfirmState =
  | {
      ok: true;
      confirmedEntries: number;
      verifiedSkills: number;
      failed: { entryId: string; code: string }[];
    }
  | { ok: false; code: string };

type BatchItem = { entryId: string; skillIds: string[] };

const BATCH_LIMIT = 50;

function parseBatchPayload(raw: string): BatchItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > BATCH_LIMIT) {
    return null;
  }
  const items: BatchItem[] = [];
  for (const it of parsed) {
    const entryId =
      typeof (it as { entryId?: unknown })?.entryId === "string"
        ? ((it as { entryId: string }).entryId ?? "").trim()
        : "";
    if (entryId === "") return null;
    const skillIdsRaw = (it as { skillIds?: unknown })?.skillIds;
    if (!Array.isArray(skillIdsRaw)) return null;
    const skillIds = skillIdsRaw
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    items.push({ entryId, skillIds });
  }
  return items;
}

/** Batch "confirm all of today" — loops the SAME per-entry chain; one entry's
 *  block reason never silently swallows the rest (failures are reported). */
export async function batchQuickConfirm(
  _prev: BatchQuickConfirmState | null,
  formData: FormData,
): Promise<BatchQuickConfirmState> {
  const locale = String(formData.get("locale") ?? "lt");
  const items = parseBatchPayload(String(formData.get("payload") ?? ""));
  if (!items) return { ok: false, code: "invalid_payload" };

  let confirmedEntries = 0;
  let verifiedSkills = 0;
  const failed: { entryId: string; code: string }[] = [];
  for (const item of items) {
    const res = await confirmOne(item.entryId, item.skillIds, locale);
    if (res.ok) {
      confirmedEntries += 1;
      verifiedSkills += res.verifiedSkills;
    } else {
      failed.push({ entryId: item.entryId, code: res.code });
    }
  }
  if (confirmedEntries > 0) revalidatePath(`/${locale}/dashboard/inbox/quick`);
  return { ok: true, confirmedEntries, verifiedSkills, failed };
}
