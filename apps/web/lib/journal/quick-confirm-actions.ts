"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { confirmEntryAndVerifySkills } from "@/lib/operations/org-membership";
import { isTerminalStaleOutcome } from "@/lib/learning/learning-shared";
import { reviewJournalEntry } from "./review-actions";
import {
  fetchBatchExceptions,
  reviewEntriesBatch,
} from "./batch-review";

/**
 * One-Tap Confirm actions (S3.5 + DESIGN_SOUL §3 exceptions pyramid). NO new
 * write paths of their own: every confirmation is delegated to the gated
 * chain —
 *   - skills present → `confirm_entry_and_verify_skills` RPC (via the
 *     org-membership wrapper), the only path that can flip worker_skills;
 *   - no unverified skills → the `review_journal_entries_batch` RPC
 *     (migration 20260611120000; per-entry delegation to 0034
 *     `review_journal_entry` + ONE batch-testimony audit row), degrading to
 *     the per-entry `reviewJournalEntry` action when the RPC is absent.
 * EXCEPTIONS PYRAMID: before any batch write the server re-checks
 * `batch_review_exceptions`; an excepted entry the manager did NOT explicitly
 * acknowledge in the dialog is refused (`exception_not_acknowledged`) — for
 * BOTH subsets, so the skills path cannot bypass the pyramid either.
 * The card lists exactly what a tap confirms (worker, date, works, skills) —
 * nothing is confirmed without the manager's explicit tap, and the batch
 * dialog shows the full summary + every exception before its single confirm.
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
  // Revalidate the quick route on success AND on a terminal stale outcome
  // (owner-hold v5 P2-3). A stale card is permanently unactionable: leaving it
  // on screen only invites repeated failing submissions, so the route and the
  // count surfaces must refresh without a manual reload. Genuine temporary
  // failures deliberately do NOT revalidate — the card stays, retry still works.
  if (res.ok || isTerminalStaleOutcome(res.code)) {
    revalidatePath(`/${locale}/dashboard/inbox/quick`);
    revalidatePath(`/${locale}/dashboard/inbox`);
    revalidatePath(`/${locale}/dashboard`);
  }
  return res;
}

export type BatchQuickConfirmState =
  | {
      ok: true;
      confirmedEntries: number;
      verifiedSkills: number;
      failed: { entryId: string; code: string }[];
      /** Per-entry results, in request order (RPC outcome strings verbatim;
       *  'approved' for successes, 'exception_not_acknowledged' for entries
       *  the pyramid refused). */
      outcomes: { entryId: string; outcome: string }[];
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

function parseAcknowledged(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v !== "");
  } catch {
    return [];
  }
}

/** Batch "confirm all of today" — the exceptions pyramid in front, the SAME
 *  gated chains behind; one entry's block reason never silently swallows the
 *  rest (per-entry outcomes are reported). */
export async function batchQuickConfirm(
  _prev: BatchQuickConfirmState | null,
  formData: FormData,
): Promise<BatchQuickConfirmState> {
  const locale = String(formData.get("locale") ?? "lt");
  const items = parseBatchPayload(String(formData.get("payload") ?? ""));
  if (!items) return { ok: false, code: "invalid_payload" };
  const acknowledged = new Set(
    parseAcknowledged(String(formData.get("acknowledged") ?? "[]")),
  );

  // SERVER-SIDE pyramid re-check (never trust the dialog alone): an excepted
  // entry without an explicit acknowledgement is refused on BOTH paths.
  const exceptions = await fetchBatchExceptions(items.map((i) => i.entryId));
  const refused = items.filter(
    (i) => exceptions.has(i.entryId) && !acknowledged.has(i.entryId),
  );
  const allowed = items.filter(
    (i) => !exceptions.has(i.entryId) || acknowledged.has(i.entryId),
  );
  const entryOnly = allowed.filter((i) => i.skillIds.length === 0);
  const withSkills = allowed.filter((i) => i.skillIds.length > 0);

  let confirmedEntries = 0;
  let verifiedSkills = 0;
  const failed: { entryId: string; code: string }[] = [];
  const outcomeById = new Map<string, string>();
  for (const r of refused) {
    outcomeById.set(r.entryId, "exception_not_acknowledged");
    failed.push({ entryId: r.entryId, code: "exception_not_acknowledged" });
  }

  // Entry-only approvals → the real batch RPC (testimony + per-entry audit).
  if (entryOnly.length > 0) {
    const batch = await reviewEntriesBatch(
      entryOnly.map((i) => i.entryId),
      [...acknowledged],
    );
    if (batch.ok) {
      for (const o of batch.outcomes) {
        outcomeById.set(o.entryId, o.outcome);
        if (o.outcome === "approved") confirmedEntries += 1;
        else failed.push({ entryId: o.entryId, code: o.outcome });
      }
    } else {
      // RPC not applied → degrade to the existing per-entry chain.
      for (const item of entryOnly) {
        const res = await confirmOne(item.entryId, item.skillIds, locale);
        outcomeById.set(item.entryId, res.ok ? "approved" : res.code);
        if (res.ok) confirmedEntries += 1;
        else failed.push({ entryId: item.entryId, code: res.code });
      }
    }
  }

  // Skills entries → the only path that can flip worker_skills (it writes
  // its own confirmation evidence; routing it through the batch RPC too
  // would double-confirm the entry).
  for (const item of withSkills) {
    const res = await confirmOne(item.entryId, item.skillIds, locale);
    outcomeById.set(item.entryId, res.ok ? "approved" : res.code);
    if (res.ok) {
      confirmedEntries += 1;
      verifiedSkills += res.verifiedSkills;
    } else {
      failed.push({ entryId: item.entryId, code: res.code });
    }
  }

  // Same rule for the batch path: a confirmation OR any terminal stale entry
  // makes the rendered list wrong, so refresh the quick route + counts.
  const sawTerminalStale = [...outcomeById.values()].some(isTerminalStaleOutcome);
  if (confirmedEntries > 0 || sawTerminalStale) {
    revalidatePath(`/${locale}/dashboard/inbox/quick`);
    revalidatePath(`/${locale}/dashboard/inbox`);
    revalidatePath(`/${locale}/dashboard`);
  }
  return {
    ok: true,
    confirmedEntries,
    verifiedSkills,
    failed,
    outcomes: items.map((i) => ({
      entryId: i.entryId,
      outcome: outcomeById.get(i.entryId) ?? "unknown",
    })),
  };
}
