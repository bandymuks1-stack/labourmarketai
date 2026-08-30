"use server";

import "server-only";
import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failedPipelineResult } from "@/lib/journal/skill-pipeline";
import {
  collectUnitSlugs,
  createJournalEntryCore,
  parseFragments,
  parseRejectedSlugs,
  runSkillPipeline,
  type CreateJournalEntryResult,
  type ParsedFragmentInput,
  type RpcMetricRow,
} from "@/lib/journal/journal-write-core";

// The write implementation and its whole vocabulary moved to
// `journal-write-core.ts` (owner-approved transport extraction, 2026-08-29
// §6) so the SAME save can run for a cookie session and a bearer caller.
// Existing import sites keep working through these type re-exports; the
// runtime behavior of every action in this file is unchanged.
export type {
  CreateJournalEntryResult,
  JournalSaveErrorCode,
} from "@/lib/journal/journal-write-core";

/** Request-locale translator over the `journal.errors` namespace — the same
 *  next-intl server pattern sibling actions use (e.g. skill-pipeline-actions,
 *  conversation/find-work), so every locale gets its OWN error copy instead
 *  of hardcoded Lithuanian. */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Persist a reviewed work-journal entry (M1) — the WEB transport wrapper.
 *
 * Resolves the cookie session, then delegates to the ONE canonical write
 * (`createJournalEntryCore`), which is transport-neutral and also serves the
 * bearer boundary (the MCP/ChatGPT capability layer). The browser path is
 * behaviorally identical to the pre-extraction implementation: same
 * validation order, same error codes, same hash chain, same atomic RPC with
 * the same legacy fallback, same awaited skill pipeline, same revalidate.
 */
export async function createJournalEntry(
  formData: FormData,
): Promise<CreateJournalEntryResult> {
  const t = await getTranslations("journal.errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: t("sessionExpired"),
    };
  }
  return createJournalEntryCore({ supabase, userId: user.id, t }, formData);
}

// ─────────────────────────────────────────────────────────────────────────
// v3 — correction / edit / delete lifecycle (migration 0018).
// ─────────────────────────────────────────────────────────────────────────

export type JournalLifecycleResult =
  | { ok: true }
  | { ok: false; code: JournalLifecycleErrorCode; message: string };

export type JournalLifecycleErrorCode =
  | "not_authenticated"
  | "entry_not_found"
  | "not_owner"
  | "already_confirmed"
  | "cannot_supersede_deleted"
  | "entry_superseded"
  | "rpc_unavailable"
  | "unknown_error";

/** Create a new entry that supersedes an existing one (v4 edit flow).
 *
 *  Routes through the `journal_entry_supersede` RPC from migration 0018.
 *  Pre-confirmation: the OLD row's `superseded_by` is set to the new id and
 *  the entries-list filter hides it. Post-confirmation: the new row's
 *  `correction_of` is set instead; the OLD row stays untouched and visible.
 *
 *  Shares the FormData contract with `createJournalEntry` — the composer can
 *  re-use the same submit code path with just `mode=supersede` + `old_id`.
 */
export async function supersedeJournalEntry(
  oldEntryId: string,
  formData: FormData,
): Promise<CreateJournalEntryResult> {
  const t = await getTranslations("journal.errors");
  if (!oldEntryId) {
    return {
      ok: false,
      code: "entry_insert_failed",
      message: t("missingOldEntryId"),
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: t("sessionExpired"),
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
  const institutionName = String(formData.get("institution_name") ?? "")
    .trim()
    .slice(0, 200);
  const topic = String(formData.get("topic") ?? "").trim().slice(0, 500);
  const fragments = parseFragments(
    String(formData.get("fragments_json") ?? "") || null,
  );
  const rejectedSlugs = parseRejectedSlugs(
    String(formData.get("rejected_slugs_json") ?? ""),
  );
  const quantity = quantityRaw === "" ? null : Number(quantityRaw);

  if (!engagementId) {
    return {
      ok: false,
      code: "engagement_required",
      message: t("engagementRequired"),
    };
  }
  if (!notes) {
    return {
      ok: false,
      code: "notes_required",
      message: t("notesRequired"),
    };
  }
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    return {
      ok: false,
      code: "quantity_invalid",
      message: t("quantityInvalid"),
    };
  }

  // Stale-chain guard (post-merge review P1): the `journal_entry_supersede`
  // RPC does not refuse an already-superseded old entry, so a stale client
  // (second tab, old `?editing=` deep link, drawer left open across a
  // refresh) could stamp `superseded_by` on the SAME entry twice — forking
  // the chain into duplicate live entries. Refuse here, under the caller's
  // own RLS (a foreign entry reads as not found). The RPC-level raise is an
  // owner-gated migration follow-up; this closes every app path today.
  const { data: oldEntry } = await supabase
    .from("journal_entries")
    .select("id, superseded_by, deleted_at")
    .eq("id", oldEntryId)
    .maybeSingle();
  if (!oldEntry) {
    return {
      ok: false,
      code: "entry_insert_failed",
      message: t("oldEntryNotFound"),
    };
  }
  if (oldEntry.superseded_by || oldEntry.deleted_at) {
    return {
      ok: false,
      code: "entry_superseded",
      message: t("entrySupersededElsewhere"),
    };
  }

  // Pre-validate unit_slug just like the create path so the worker sees
  // a precise reason on un-migrated DBs.
  const unitSlugsToCheck = collectUnitSlugs({ quantity, unitSlug, fragments });
  if (unitSlugsToCheck.size > 0) {
    const { data: knownUnits } = await supabase
      .from("productivity_units")
      .select("slug")
      .in("slug", [...unitSlugsToCheck]);
    const known = new Set((knownUnits ?? []).map((r) => r.slug));
    const missing = [...unitSlugsToCheck].filter((s) => !known.has(s));
    if (missing.length > 0) {
      return {
        ok: false,
        code: "unit_slug_unknown",
        message: t("unitSlugUnknown", { units: missing.join(", ") }),
      };
    }
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
  const hashSelf = createHash("sha256")
    .update(
      [
        user.id,
        engagementId,
        originalText,
        locale,
        "supersede:" + oldEntryId,
        new Date().toISOString(),
      ].join("|"),
    )
    .digest("hex");

  const hasStructured =
    quantity !== null || workDirection !== "" || fragments.length > 0;

  const metrics = buildMetricsForSave({
    workDirection,
    siteName,
    quantity,
    unitSlug,
    workDate,
    institutionName,
    topic,
    fragments,
  });

  // Slugs the worker EXPLICITLY selected in this save (compact-editor rows
  // only — see ParsedFragmentInput.selected). Slug-shaped values only — the
  // RPC re-validates every survivor against the ACTIVE taxonomy and fails the
  // WHOLE transaction on an unknown slug, so a "successful save" can never
  // silently drop a selection.
  const selectedSlugs = [
    ...new Set(
      fragments
        .filter((f) => f.selected === true)
        .map((f) => f.activitySlug ?? null)
        .filter(
          (s): s is string =>
            typeof s === "string" && SELECTED_SLUG_RE.test(s),
        ),
    ),
  ].slice(0, 50);

  // Atomic supersede (post-#840 review P1 repair): ONE transaction locks the
  // old row, refuses stale/concurrent saves (`entry_superseded`), creates the
  // new entry + metrics, carries decision markers and non-rederivable skill
  // links, and persists the selected taxonomy evidence (worker_skills
  // verified=false + journal_entry_skills). Any required-write failure rolls
  // back everything — success here means the entire requested edit is durable.
  const rpcParams = {
    p_old_entry_id: oldEntryId,
    p_engagement_context_id: engagementId,
    p_entry_type_slug: hasStructured ? "hybrid" : "freeform",
    p_profession_id: professionId,
    p_original_text: originalText,
    p_original_language: locale.slice(0, 2),
    p_hash_self: hashSelf,
    p_visibility_scope: "closed",
    p_metrics: metrics,
    p_selected_slugs: selectedSlugs,
    p_rejected_slugs: rejectedSlugs,
  };
  const { data: newEntryId, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: typeof rpcParams,
    ) => Promise<{
      data: string | null;
      error: { code?: string; message?: string } | null;
    }>
  )("journal_entry_supersede_v2", rpcParams);

  if (error || typeof newEntryId !== "string") {
    const errText = `${error?.message ?? ""} ${error?.code ?? ""}`.toLowerCase();
    if (
      errText.includes("invalid_skill_slug") ||
      errText.includes("skill_slug_unknown")
    ) {
      // The whole transaction rolled back — nothing was saved, the form keeps
      // every edit. Honest failure beats silently dropping the selection.
      return {
        ok: false,
        code: "skill_selection_invalid",
        message: t("skillSelectionInvalid"),
      };
    }
    const mapped = mapJournalRpcError(
      error ?? { code: undefined, message: undefined },
      t,
    );
    if (mapped) {
      // mapped is JournalLifecycleResult; convert to CreateJournalEntryResult.
      if (mapped.ok) {
        // Defensive path (mapJournalRpcError never returns ok today): the
        // pipeline did not run for the old entry — report that honestly.
        return { ok: true, entryId: oldEntryId, skills: failedPipelineResult() };
      }
      return {
        ok: false,
        code: mapped.code === "entry_superseded" ? "entry_superseded" : "entry_insert_failed",
        message: mapped.message,
      };
    }
    return {
      ok: false,
      code: "entry_insert_failed",
      message: t("updateFailed", {
        reason: error?.message ?? t("unknownReason"),
      }),
    };
  }

  // P0 Track B: run the canonical pipeline for the NEW entry id with the new
  // text — pipeline idempotency (ignore-duplicate upserts + metric dedupe)
  // makes an edit/re-save safe to reprocess.
  const skills = await runSkillPipeline({
    entryId: newEntryId,
    text: originalText,
    locale,
    excludeSlugs: rejectedSlugs,
  });
  revalidatePath(`/${locale}/dashboard/journal`);
  return { ok: true, entryId: newEntryId, skills };
}

/** Slug shape accepted from the client before any DB lookup — mirrors the
 *  pipeline actions' SLUG_RE. The RPC re-validates server-side; this filter
 *  just keeps junk out of the request payload. */
const SELECTED_SLUG_RE = /^[a-z0-9_-]{1,64}$/;

/** Shared metric-row builder used by both `createJournalEntry` and
 *  `supersedeJournalEntry`. Keeps the field semantics identical across
 *  both code paths so an edit can't silently drop institution/topic/
 *  fragment metadata that a create would have persisted. */
function buildMetricsForSave(args: {
  workDirection: string;
  siteName: string;
  quantity: number | null;
  unitSlug: string;
  workDate: string;
  institutionName: string;
  topic: string;
  fragments: ParsedFragmentInput[];
}): RpcMetricRow[] {
  const {
    workDirection,
    siteName,
    quantity,
    unitSlug,
    workDate,
    institutionName,
    topic,
    fragments,
  } = args;
  return [
    ...(workDirection
      ? [
          {
            metric_slug: "work_direction",
            value_text: workDirection,
            source: "worker_input" as const,
          },
        ]
      : []),
    ...(siteName
      ? [
          {
            metric_slug: "site_name",
            value_text: siteName,
            source: "worker_input" as const,
          },
        ]
      : []),
    ...(quantity !== null
      ? [
          {
            metric_slug: "quantity",
            value_numeric: quantity,
            unit_slug: unitSlug,
            source: "worker_input" as const,
          },
        ]
      : []),
    ...(workDate
      ? [
          {
            metric_slug: "work_date",
            value_text: workDate,
            source: "worker_input" as const,
          },
        ]
      : []),
    ...(institutionName
      ? [
          {
            metric_slug: "institution_name",
            value_text: institutionName,
            source: "worker_input" as const,
          },
        ]
      : []),
    ...(topic
      ? [
          {
            metric_slug: "topic",
            value_text: topic,
            source: "worker_input" as const,
          },
        ]
      : []),
    ...fragments.flatMap((f, idx): RpcMetricRow[] => {
      const rows: RpcMetricRow[] = [
        {
          metric_slug: "parsed_fragment",
          value_text: `${idx + 1}|${f.rawPhrase}`,
          source: "worker_input" as const,
        },
      ];
      if (f.timeValue !== null && f.timeValue !== undefined && f.timeUnit) {
        rows.push({
          metric_slug: "fragment_time",
          value_numeric: f.timeValue,
          unit_slug: f.timeUnit,
          value_text: String(idx + 1),
          source: "worker_input" as const,
        });
      }
      const activityLabel = f.activitySlug ?? f.activityLabel;
      if (activityLabel) {
        rows.push({
          metric_slug: "fragment_activity",
          value_text: `${idx + 1}|${activityLabel}`,
          source: "worker_input" as const,
        });
      }
      if (f.isUnknown && f.userLabel) {
        rows.push({
          metric_slug: "unknown_phrase",
          value_text: `${idx + 1}|${f.rawPhrase}|${f.userLabel}`,
          source: "worker_input" as const,
        });
      }
      return rows;
    }),
  ];
}

/** Soft-delete a journal entry the caller owns AND that no external party
 *  has confirmed yet. Calls the `journal_entry_soft_delete` RPC from 0018.
 *  Returns a tagged result so the UI can render a precise reason. */
export async function softDeleteJournalEntry(
  entryId: string,
  // Kept for call-site stability; revalidation moved to restore (see below).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _locale: string,
): Promise<JournalLifecycleResult> {
  const t = await getTranslations("journal.errors");
  if (!entryId) {
    return {
      ok: false,
      code: "entry_not_found",
      message: t("entryNotFound"),
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: t("sessionExpired"),
    };
  }

  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: { p_entry_id: string },
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  )("journal_entry_soft_delete", { p_entry_id: entryId });

  if (error) {
    const mapped = mapJournalRpcError(error, t);
    if (mapped) return mapped;
    return {
      ok: false,
      code: "unknown_error",
      message: t("deleteFailed", { reason: error.message ?? t("unknownReason") }),
    };
  }

  // Deliberately NO revalidatePath here (user-journey repair v1): the row
  // component swaps to an inline "removed — restore?" placeholder, and a
  // revalidate would unmount that undo affordance mid-interaction. The list
  // query filters deleted entries server-side on the next real navigation.
  return { ok: true };
}

/** Restore a soft-deleted journal entry the caller owns (undo of
 *  softDeleteJournalEntry). Calls the `journal_entry_restore` RPC
 *  (20260712120000). Idempotent server-side; refuses superseded entries.
 *  Returns a tagged result so the UI can render a precise, honest reason —
 *  including the environment where the RPC is not applied yet. */
export async function restoreJournalEntry(
  entryId: string,
  locale: string,
): Promise<JournalLifecycleResult> {
  const t = await getTranslations("journal.errors");
  if (!entryId) {
    return {
      ok: false,
      code: "entry_not_found",
      message: t("entryNotFound"),
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: t("sessionExpired"),
    };
  }

  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: { p_entry_id: string },
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  )("journal_entry_restore", { p_entry_id: entryId });

  if (error) {
    const mapped = mapJournalRpcError(error, t);
    if (mapped) return mapped;
    return {
      ok: false,
      code: "unknown_error",
      message: t("restoreFailed", { reason: error.message ?? t("unknownReason") }),
    };
  }

  // Universal pipeline lifecycle rule: a RESTORED entry re-enters the
  // recognition loop (idempotent; a pipeline failure never fails the restore).
  const { data: restored } = await supabase
    .from("journal_entries")
    .select("id, original_text")
    .eq("id", entryId)
    .maybeSingle();
  if (restored?.id) {
    await runSkillPipeline({
      entryId: restored.id,
      text: (restored.original_text as string | null) ?? "",
      locale,
      excludeSlugs: [],
    });
  }

  revalidatePath(`/${locale}/dashboard/journal`);
  return { ok: true };
}

function mapJournalRpcError(
  err: {
    code?: string;
    message?: string;
  },
  t: Translator,
): JournalLifecycleResult | null {
  // Postgres RAISE EXCEPTION lands in `message`; PostgREST also surfaces
  // SQLSTATE in `code` when available. We pattern-match the message body
  // so we don't depend on PostgREST passing the SQLSTATE unchanged.
  const text = `${err.message ?? ""} ${err.code ?? ""}`.toLowerCase();
  if (/pgrst202|create_journal|create_journal_entry|function/.test(text) &&
      /could not find|does not exist|undefined function/.test(text)) {
    return {
      ok: false,
      code: "rpc_unavailable",
      message: t("rpcUnavailable"),
    };
  }
  if (text.includes("entry_not_found")) {
    return {
      ok: false,
      code: "entry_not_found",
      message: t("entryNotFoundMaybeDeleted"),
    };
  }
  if (text.includes("not_owner")) {
    return {
      ok: false,
      code: "not_owner",
      message: t("notOwner"),
    };
  }
  if (text.includes("already_confirmed_use_correction_request")) {
    return {
      ok: false,
      code: "already_confirmed",
      message: t("alreadyConfirmed"),
    };
  }
  if (text.includes("cannot_supersede_deleted")) {
    return {
      ok: false,
      code: "cannot_supersede_deleted",
      message: t("cannotSupersedeDeleted"),
    };
  }
  if (text.includes("entry_superseded_cannot_restore")) {
    return {
      ok: false,
      code: "entry_superseded",
      message: t("cannotRestoreSuperseded"),
    };
  }
  // W0 restore hardening: a competing live correction of the same original
  // already exists — restoring would show two versions of the same work.
  if (text.includes("correction_conflict_cannot_restore")) {
    return {
      ok: false,
      code: "entry_superseded",
      message: t("cannotRestoreCorrectionConflict"),
    };
  }
  // W0 atomic supersede: the RPC row-lock rejected a stale/concurrent save.
  // Checked AFTER the `_cannot_restore` variant (that text contains this one).
  if (text.includes("entry_superseded")) {
    return {
      ok: false,
      code: "entry_superseded",
      message: t("entrySupersededElsewhere"),
    };
  }
  return null;
}
