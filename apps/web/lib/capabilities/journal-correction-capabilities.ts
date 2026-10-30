import "server-only";

import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import { fd } from "@/lib/conversation/executor-contract";
import { isJournalMetaRequest } from "@/lib/conversation/worklog-extract";
import { readWorkerCoreRow } from "@/lib/data/worker-core";
import { supersedeJournalEntry } from "@/lib/journal/actions";
import { buildEditingEntry, type EditEntryMetricRow } from "@/lib/journal/edit-entry";
import { seedFragmentsFromEntry } from "@/lib/journal/edit-fragment-seed";
import { intakeWorkTimeFields } from "@/lib/journal/intake-work-time";
import { journalChainFingerprint } from "@/lib/journal/journal-chain-fingerprint";
import { MODULE_METRICS_FIELD, serializeModuleFields } from "@/lib/journal/journal-module-fields";
import { fragmentMetricRows, parseFragments } from "@/lib/journal/journal-write-core";
import { checkWorkDate } from "@/lib/journal/work-date";
import { deriveEntryWorkTime } from "@/lib/journal/work-time";

import { mintCapabilityConfirmation, verifyCapabilityConfirmation } from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * A WORKER CORRECTS THEIR OWN JOURNAL ENTRY — the MCP / LLM / mobile face of
 * the web journal's edit (owner P0-A parity, 2026-10-30). Before this, an
 * assistant could create an entry but not correct one: the only correction
 * tools were the organization-evidence ones.
 *
 * No new write path: `journal.correct_confirm` calls the web's OWN
 * `supersedeJournalEntry` server action (inside the bearer caller scope its
 * `createClient()` is the caller's own RLS client), so the correction is the
 * SAME atomic `journal_entry_supersede_v2` RPC — an unconfirmed entry is
 * superseded, a confirmed one keeps its confirmation and gets a pending
 * `correction_of` successor, and every reader counts the chain ONCE
 * (`counted-once.ts`). Draft → confirm with the one-time token every bridged
 * write uses: bound to the exact change, the caller and the journal chain
 * head (the correction appends an entry, so a replay is stale), and spent
 * atomically.
 *
 * What changes is only what the person asked to change (words, day, site).
 * Everything else the entry carries is re-sent as stored — direction,
 * institution, topic, module fields, and, while the words are unchanged,
 * the reviewed durations with their own provenance — because the supersede
 * rebuilds an entry from the form alone. New words derive their time by the
 * SAME rule `journal.confirm` uses (`intakeWorkTimeFields`), and the preview
 * shows the hours before and after by the canonical work-time rule.
 */

const uuid = z.uuid();

const correctionInput = z
  .object({
    entryId: uuid,
    notes: z
      .string()
      .trim()
      .min(3)
      .max(4000)
      .refine((v) => !isJournalMetaRequest(v), { message: "journal_meta_request" })
      .optional(),
    workDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** A new site; `null` removes it; absent keeps the stored one. */
    siteName: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => v.notes !== undefined || v.workDate !== undefined || v.siteName !== undefined, {
    message: "nothing_to_correct",
  });

const correctionConfirmInput = correctionInput.and(z.object({ confirmationToken: z.string().min(10) }));

type CorrectionChange = z.infer<typeof correctionInput>;

type MetricRow = EditEntryMetricRow & { source?: string | null };

type LoadedEntry = {
  id: string;
  originalText: string;
  engagementContextId: string;
  createdAt: string;
  confirmed: boolean;
  metrics: MetricRow[];
};

/** The caller's OWN live entry, under their RLS, or a refusal. */
async function loadOwnLiveEntry(
  caller: CapabilityCaller,
  entryId: string,
): Promise<{ ok: true; entry: LoadedEntry } | { ok: false; result: ExecResult }> {
  const workerRead = await readWorkerCoreRow(caller);
  if (!workerRead.ok) return { ok: false, result: { ok: false, code: "unavailable", message: "Worker read failed." } };
  if (!workerRead.value) {
    return {
      ok: false,
      result: { ok: false, code: "no_worker_profile", message: "This account has no worker profile, so it has no Work Journal." },
    };
  }
  const { data, error } = await caller.supabase
    .from("journal_entries")
    .select(
      "id, worker_id, original_text, engagement_context_id, created_at, superseded_by, deleted_at, journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug, source), journal_entry_confirmations(id)",
    )
    .eq("id", entryId)
    .maybeSingle();
  if (error) return { ok: false, result: { ok: false, code: "unavailable", message: "Journal read failed." } };
  const row = data as {
    id: string;
    worker_id: string;
    original_text: string;
    engagement_context_id: string | null;
    created_at: string;
    superseded_by: string | null;
    deleted_at: string | null;
    journal_entry_metrics: MetricRow[] | null;
    journal_entry_confirmations: unknown[] | null;
  } | null;
  // Another person's entry reads exactly like a missing one.
  if (!row || row.worker_id !== workerRead.value.id || !row.engagement_context_id) {
    return { ok: false, result: { ok: false, code: "entry_not_found", message: "No such entry in this account's Work Journal." } };
  }
  if (row.superseded_by || row.deleted_at) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "entry_superseded",
        message: "This entry was already corrected or removed. List the journal again and correct the current version.",
      },
    };
  }
  return {
    ok: true,
    entry: {
      id: row.id,
      originalText: row.original_text,
      engagementContextId: row.engagement_context_id,
      createdAt: row.created_at,
      confirmed: (row.journal_entry_confirmations ?? []).length > 0,
      metrics: row.journal_entry_metrics ?? [],
    },
  };
}

/** The corrected values: what the person asked to change, else as stored. */
function resolveChange(entry: LoadedEntry, change: CorrectionChange) {
  const editing = buildEditingEntry({
    id: entry.id,
    originalText: entry.originalText,
    metrics: entry.metrics,
    engagementContextId: entry.engagementContextId,
    createdAt: entry.createdAt,
  });
  return {
    editing,
    resolved: {
      entryId: entry.id,
      notes: change.notes ?? entry.originalText,
      workDate: change.workDate ?? editing.workDate ?? "",
      siteName: change.siteName === undefined ? editing.siteName : change.siteName || null,
    },
  };
}

const sourceOf = (rows: readonly MetricRow[], slug: string): string | null =>
  rows.find((m) => m.metric_slug === slug)?.source ?? null;

/**
 * THE FormData the correction sends to `supersedeJournalEntry` — pure and
 * deterministic in (stored entry, resolved change), so the draft previews
 * and hashes exactly what the confirm writes. Exported for its tests.
 */
export function correctionFields(
  locale: string,
  entry: LoadedEntry,
  change: CorrectionChange,
): Record<string, string> {
  const { editing, resolved } = resolveChange(entry, change);
  const fields: Record<string, string> = {
    locale,
    engagement_context_id: entry.engagementContextId,
    notes: resolved.notes,
    work_date: resolved.workDate,
    site_name: resolved.siteName ?? "",
    work_direction: editing.workDirectionSlug ?? "",
    institution_name: editing.institutionName ?? "",
    topic: editing.topic ?? "",
  };
  const modules = serializeModuleFields(editing.moduleFields);
  if (modules) fields[MODULE_METRICS_FIELD] = modules;

  const wordsChanged = resolved.notes.trim() !== entry.originalText.trim();
  if (wordsChanged) {
    // New words: their time by the SAME rule journal.confirm records with.
    return { ...fields, ...intakeWorkTimeFields(resolved.notes, resolved.workDate) };
  }
  // Same words: the reviewed durations stay exactly as stored, each with
  // its own provenance.
  const amount = editing.time ?? editing.quantity;
  if (amount) {
    fields.quantity = String(amount.value);
    fields.unit_slug = amount.unitSlug;
    if (sourceOf(entry.metrics, "quantity") === "ai_extracted") fields.quantity_source = "ai_extracted";
  }
  // The SAME seed the web editor preloads its rows from — each fragment
  // keeps its own time, label, clarification and provenance.
  const seeded = seedFragmentsFromEntry(editing);
  if (seeded.length > 0) {
    fields.fragments_json = JSON.stringify(
      seeded.map((f) => ({
        rawPhrase: f.rawPhrase,
        timeValue: f.time?.value ?? null,
        timeUnit: f.time?.unitSlug ?? null,
        activitySlug: f.activitySlug,
        activityLabel: f.activityLabel,
        isUnknown: f.isUnknown,
        userLabel: f.userLabel.trim() || null,
        ...(f.source ? { source: f.source } : {}),
      })),
    );
  }
  for (const slug of ["work_start", "work_end"] as const) {
    const v = entry.metrics.find((m) => m.metric_slug === slug)?.value_text;
    if (v) fields[slug] = v;
  }
  const brk = entry.metrics.find((m) => m.metric_slug === "break_minutes")?.value_numeric;
  if (typeof brk === "number") fields.break_minutes = String(brk);
  if (fields.work_start && sourceOf(entry.metrics, "work_start") === "ai_extracted") fields.work_time_source = "ai_extracted";
  return fields;
}

/** Hours the fields would record, by the canonical work-time rule. */
function hoursOfFields(fields: Record<string, string>, createdAt: string): number {
  const rows: MetricRow[] = [
    ...(fields.work_date ? [{ metric_slug: "work_date", value_text: fields.work_date, value_numeric: null, unit_slug: null }] : []),
    ...(fields.quantity
      ? [{ metric_slug: "quantity", value_text: null, value_numeric: Number(fields.quantity), unit_slug: fields.unit_slug ?? null }]
      : []),
    ...fragmentMetricRows(parseFragments(fields.fragments_json ?? null)).map((r) => ({
      metric_slug: r.metric_slug,
      value_text: r.value_text ?? null,
      value_numeric: r.value_numeric ?? null,
      unit_slug: r.unit_slug ?? null,
    })),
  ];
  return deriveEntryWorkTime({ entryId: "preview", createdAt, metrics: rows }).totalHours;
}

function normalizedForHash(r: ReturnType<typeof resolveChange>["resolved"]): Record<string, unknown> {
  return { entryId: r.entryId, notes: r.notes, workDate: r.workDate, siteName: r.siteName ?? null };
}

function badDate(workDate: string): ExecResult | null {
  const problem = checkWorkDate(workDate, { requireDate: false, rejectFuture: true });
  return problem
    ? { ok: false, code: problem.code, message: "The work date must be a real day that is not in the future (YYYY-MM-DD)." }
    : null;
}

const journalCorrectDraft: CapabilityDescriptor = {
  id: "journal.correct_draft",
  kind: "draft",
  title: "Draft a correction of one of my Work Journal entries",
  description:
    "Prepares a correction of one of the caller's OWN live Work Journal entries (ids from journal.list): " +
    "new words, another work day and/or another site. Returns the entry before and after, the hours by the " +
    "canonical rule before and after, and a one-time confirmation token. NOTHING is written. A confirmed " +
    "entry keeps its confirmation; the correction becomes a new, unconfirmed version that replaces it in " +
    "every total once saved (counted once).",
  exposed: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: correctionInput,
  run: async (caller, input): Promise<ExecResult> => {
    const change = correctionInput.parse(input);
    const loaded = await loadOwnLiveEntry(caller, change.entryId);
    if (!loaded.ok) return loaded.result;
    const { entry } = loaded;
    const { editing, resolved } = resolveChange(entry, change);
    const dateProblem = badDate(resolved.workDate);
    if (dateProblem) return dateProblem;
    const state = await journalChainFingerprint(caller);
    if (!state.ok) return state.result;
    const after = correctionFields(caller.locale, entry, change);
    const token = mintCapabilityConfirmation({
      actionId: "journal.correct_confirm",
      input: normalizedForHash(resolved),
      userId: caller.userId,
      stateFingerprint: state.fingerprint,
    });
    return {
      ok: true,
      data: {
        preview: {
          entryId: entry.id,
          before: {
            notes: entry.originalText,
            workDate: editing.workDate,
            siteName: editing.siteName,
            hours: deriveEntryWorkTime({ entryId: entry.id, createdAt: entry.createdAt, metrics: entry.metrics }).totalHours,
          },
          after: {
            notes: resolved.notes,
            workDate: resolved.workDate,
            siteName: resolved.siteName,
            hours: hoursOfFields(after, entry.createdAt),
          },
          wasConfirmed: entry.confirmed,
        },
        confirmationToken: token,
        note: "Nothing was saved. Show the user before/after, then call journal.correct_confirm with the SAME arguments and this token.",
      },
    };
  },
};

const journalCorrectConfirm: CapabilityDescriptor = {
  id: "journal.correct_confirm",
  kind: "confirm",
  title: "Confirm a drafted Work Journal correction",
  description:
    "Verifies the one-time token against the exact drafted correction, then performs the web journal's own " +
    "canonical correction (supersede) as the caller. The previous version stays in the history; totals count " +
    "the corrected version once.",
  exposed: true,
  // A real write, append-only (the previous version is kept), single-use token.
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: correctionConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = correctionConfirmInput.parse(input);
    const { confirmationToken, ...change } = parsed;
    const loaded = await loadOwnLiveEntry(caller, change.entryId);
    if (!loaded.ok) return loaded.result;
    const { entry } = loaded;
    const { resolved } = resolveChange(entry, change);
    const state = await journalChainFingerprint(caller);
    if (!state.ok) return state.result;
    const verdict = await verifyCapabilityConfirmation({
      actionId: "journal.correct_confirm",
      token: confirmationToken,
      input: normalizedForHash(resolved),
      userId: caller.userId,
      currentStateFingerprint: state.fingerprint,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message: `Confirmation token rejected (${verdict.reason}). Draft the correction again.`,
      };
    }
    const dateProblem = badDate(resolved.workDate);
    if (dateProblem) return dateProblem;
    const result = await supersedeJournalEntry(entry.id, fd(correctionFields(caller.locale, entry, change)));
    if (!result.ok) return { ok: false, code: result.code, message: result.message };
    return {
      ok: true,
      data: {
        entryId: result.entryId,
        correctedEntryId: entry.id,
        wasConfirmed: entry.confirmed,
        skills: {
          status: result.skills.status,
          added: result.skills.added,
          strengthened: result.skills.strengthened,
          reviewNeeded: result.skills.reviewNeeded,
          claimsSaved: result.skills.claimsSaved,
          cvUpdated: result.skills.cvUpdated,
        },
      },
    };
  },
};

export const JOURNAL_CORRECTION_CAPABILITIES: readonly CapabilityDescriptor[] = [
  journalCorrectDraft,
  journalCorrectConfirm,
];
