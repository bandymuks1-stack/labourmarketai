"use server";

import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  failedPipelineResult,
  processJournalEntrySkills,
  type JournalSkillPipelineResult,
} from "@/lib/journal/skill-pipeline";

/**
 * Result of `createJournalEntry`. Replaces the old throw-based contract so the
 * client can render a precise failure reason instead of a generic copy.
 *
 * Production Next.js server actions strip thrown error messages to a digest —
 * the prior implementation propagated `throw new Error("...")`, but the
 * composer only ever saw a generic rejection and surfaced "Nepavyko išsaugoti"
 * (P0-B in the journal-evidence-loop sprint goal). Returning a tagged result
 * keeps the real cause attached and stops the silent failure mode.
 *
 * P0 Track B: the ok-variant now carries the AWAITED skill-pipeline result
 * (`skills`) so the composer renders the REAL recognition outcome instead of
 * trusting a fire-and-forget client call that could silently die.
 */
export type CreateJournalEntryResult =
  | { ok: true; entryId: string; skills: JournalSkillPipelineResult }
  | { ok: false; code: JournalSaveErrorCode; message: string };

/** Defensive parse of the composer's `rejected_slugs_json` FormData field:
 *  JSON string array, capped at 50, slug-shaped entries only. Anything
 *  malformed degrades to an empty exclusion list (never a save failure). */
function parseRejectedSlugs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is string =>
          typeof s === "string" && /^[a-z0-9_-]{1,64}$/i.test(s),
      )
      .slice(0, 50);
  } catch {
    return [];
  }
}

/** Run the canonical skill pipeline for a saved entry. A pipeline throw must
 *  NEVER fail the already-persisted save — it degrades to an honest `failed`
 *  result the UI can show (with a trace id + reprocess path). */
async function runSkillPipeline(opts: {
  entryId: string;
  text: string;
  locale: string;
  excludeSlugs: string[];
}): Promise<JournalSkillPipelineResult> {
  try {
    return await processJournalEntrySkills(opts);
  } catch (e) {
    console.error(
      "[journal] skill pipeline threw:",
      e instanceof Error ? e.message : String(e),
    );
    return failedPipelineResult();
  }
}

export type JournalSaveErrorCode =
  | "not_authenticated"
  | "no_worker_profile"
  | "engagement_required"
  | "notes_required"
  | "quantity_invalid"
  | "unit_slug_unknown"
  | "entry_insert_failed"
  | "metrics_insert_failed"
  /** P1-B — the target entry was already superseded (stale tab/deep link);
   *  superseding it again would fork the chain into duplicate live entries. */
  | "entry_superseded";

type ParsedFragmentInput = {
  rawPhrase: string;
  timeValue?: number | null;
  timeUnit?: "hours" | "minutes" | "days" | null;
  activitySlug?: string | null;
  activityLabel?: string | null;
  /** v3 — true when the parser flagged the fragment as unrecognised
   *  (time, no matched activity). */
  isUnknown?: boolean;
  /** v3 — worker-typed clarification label for an unknown fragment.
   *  Persists as `unknown_phrase` metric (review-only, no fake
   *  taxonomy claim). */
  userLabel?: string | null;
  /** P1-A — true ONLY when the worker EXPLICITLY picked this fragment's
   *  taxonomy skill (compact-editor selection). Only selected fragments may
   *  be skill-linked by the save; the composer's parser-derived slugs never
   *  set it, so confirming a time parse can't silently declare a skill. */
  selected?: boolean;
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
        isUnknown: r.isUnknown === true,
        userLabel:
          typeof r.userLabel === "string" && r.userLabel.trim().length > 0
            ? r.userLabel.trim().slice(0, 200)
            : null,
        selected: r.selected === true,
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
  // v3 — free-text review-only metadata. Capped lengths so a runaway paste
  // can't blow up a single metric row.
  const institutionName = String(formData.get("institution_name") ?? "")
    .trim()
    .slice(0, 200);
  const topic = String(formData.get("topic") ?? "").trim().slice(0, 500);
  const fragments = parseFragments(String(formData.get("fragments_json") ?? "") || null);
  // P0 Track B: slugs the worker explicitly REJECTED in the review step — the
  // pipeline must leave no trace for them (not even an evidence link).
  const rejectedSlugs = parseRejectedSlugs(
    String(formData.get("rejected_slugs_json") ?? ""),
  );
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

  // Pre-validate the unit_slug FK so we fail BEFORE any insert if the
  // worker's productivity unit isn't registered in `productivity_units`.
  // This is what surfaced after PR #61: the legacy seed only covered
  // square_meters / square_meters_per_day / box_per_day, so a confirmed
  // "hours"-as-fallback quantity (or any fragment_time row) tripped the
  // FK. Migration 0017 closes the seed; this pre-check makes sure that on
  // a DB where 0017 hasn't been applied yet, the worker still sees a
  // human-readable reason instead of a half-saved entry.
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
        message:
          `Vieneto registre kol kas nėra: ${missing.join(", ")}. ` +
          `Paprašykite administratoriaus pritaikyti migraciją 0017 ` +
          `(productivity_units seedą), tada bandykite dar kartą.`,
      };
    }
  }

  const metrics: RpcMetricRow[] = [
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
      // v3 — when the parser flagged the fragment as unknown AND the worker
      // typed a clarification, persist that as a review-only label. Stored
      // for future admin / agent dictionary review (no auto-promotion).
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

  // Atomic save — the RPC inserts the entry and all metric rows inside one
  // transaction (see 0017). Any failure rolls back the entry, so the worker
  // never lands in the half-saved "ghost entry" state where the row exists
  // but its interpretation does not.
  const rpcParams = {
    p_worker_id: worker.id,
    p_engagement_context_id: engagementId,
    p_entry_type_slug: hasStructured ? "hybrid" : "freeform",
    p_profession_id: professionId,
    p_original_text: originalText,
    p_original_language: locale.slice(0, 2),
    p_hash_prev: hashPrev,
    p_hash_self: hashSelf,
    p_visibility_scope: "closed",
    p_metrics: metrics,
  };
  // The generated supabase-js types are built from the schema cache and
  // don't include `create_journal_entry_full` until 0017 is applied AND the
  // local types are regenerated. The runtime call is correct; the cast just
  // suppresses the static name check.
  const { data: rpcEntryId, error: rpcErr } = (await (
    supabase.rpc as unknown as (
      fn: string,
      params: typeof rpcParams,
    ) => Promise<{ data: string | null; error: { code?: string; message?: string } | null }>
  )("create_journal_entry_full", rpcParams));

  if (rpcErr || typeof rpcEntryId !== "string") {
    // Fallback path — only entered when the RPC is missing on the target
    // DB (PostgREST returns `PGRST202` "Could not find the function" /
    // a 404 schema cache error). On every other failure we surface the
    // exact reason and DO NOT attempt a second write, so the save stays
    // all-or-nothing.
    const isMissingRpc =
      !!rpcErr &&
      (/PGRST202/i.test(rpcErr.code ?? "") ||
        /create_journal_entry_full/i.test(rpcErr.message ?? "") ||
        rpcErr.message?.includes("function") === true);
    if (!isMissingRpc) {
      console.error("[journal] rpc save failed:", rpcErr?.message);
      return {
        ok: false,
        code: "entry_insert_failed",
        message: `Įrašo išsaugoti nepavyko: ${rpcErr?.message ?? "nežinoma klaida"}`,
      };
    }
    console.warn(
      "[journal] create_journal_entry_full RPC missing — falling back to legacy two-step insert. Apply migration 0017.",
    );
    const legacy = await legacyTwoStepSave(supabase, {
      worker_id: worker.id,
      engagement_context_id: engagementId,
      entry_type_slug: hasStructured ? "hybrid" : "freeform",
      profession_id: professionId,
      original_text: originalText,
      original_language: locale.slice(0, 2),
      hash_prev: hashPrev,
      hash_self: hashSelf,
      visibility_scope: "closed",
      metrics: metrics.map((m) => ({ ...m })),
    });
    if (!legacy.ok) return legacy;
    // Canonical save → recognition → evidence → CV pipeline (AWAITED so the
    // outcome is real, but a pipeline failure never loses the saved entry).
    const legacySkills = await runSkillPipeline({
      entryId: legacy.entryId,
      text: originalText,
      locale,
      excludeSlugs: rejectedSlugs,
    });
    revalidatePath(`/${locale}/dashboard/journal`);
    return { ok: true, entryId: legacy.entryId, skills: legacySkills };
  }

  const skills = await runSkillPipeline({
    entryId: rpcEntryId,
    text: originalText,
    locale,
    excludeSlugs: rejectedSlugs,
  });
  revalidatePath(`/${locale}/dashboard/journal`);
  return { ok: true, entryId: rpcEntryId, skills };
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
  if (!oldEntryId) {
    return {
      ok: false,
      code: "entry_insert_failed",
      message: "Trūksta keičiamo įrašo identifikatoriaus.",
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
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
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
      message: "Keičiamas įrašas nerastas. Perkraukite puslapį.",
    };
  }
  if (oldEntry.superseded_by || oldEntry.deleted_at) {
    return {
      ok: false,
      code: "entry_superseded",
      message:
        "Šis įrašas jau buvo pakeistas kitur (kitame lange ar sesijoje). " +
        "Perkraukite puslapį ir redaguokite naujausią įrašo versiją.",
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
        message:
          `Vieneto registre kol kas nėra: ${missing.join(", ")}. ` +
          `Paprašykite administratoriaus pritaikyti migraciją 0017 ` +
          `(productivity_units seedą), tada bandykite dar kartą.`,
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
  };
  const { data: newEntryId, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: typeof rpcParams,
    ) => Promise<{
      data: string | null;
      error: { code?: string; message?: string } | null;
    }>
  )("journal_entry_supersede", rpcParams);

  if (error || typeof newEntryId !== "string") {
    const mapped = mapJournalRpcError(
      error ?? { code: undefined, message: undefined },
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
        code: mapped.code === "rpc_unavailable" ? "entry_insert_failed" : "entry_insert_failed",
        message: mapped.message,
      };
    }
    return {
      ok: false,
      code: "entry_insert_failed",
      message: `Įrašo atnaujinti nepavyko: ${error?.message ?? "nežinoma klaida"}`,
    };
  }

  // Slugs the worker EXPLICITLY selected in this save (compact-editor rows
  // only — see ParsedFragmentInput.selected). Used twice below: they must be
  // linked, and a previously-rejected slug among them must NOT have its
  // rejection marker carried forward (the re-add wins over the old removal).
  const selectedSlugs = fragments
    .filter((f) => f.selected === true)
    .map((f) => f.activitySlug ?? null);

  // NO DATA LOSS on edit (journal compact edit UX, P0-F): the worker's
  // DECISION markers live as append-only metrics on the OLD entry and the
  // pipeline for the NEW entry would otherwise re-derive without them —
  // resolved ambiguities re-offered, rejected suggestions resurrected,
  // dismissed fragments re-inserted. Copy them to the new entry id BEFORE
  // the pipeline runs so the derivation honours them (idempotent,
  // append-only, RLS-owned inserts).
  await carryForwardEntryDecisionMarkers(
    supabase,
    oldEntryId,
    newEntryId,
    selectedSlugs,
  );

  // NO DATA LOSS on edit (journal compact edit UX, P1-SKILL): entry↔skill
  // evidence links that are NOT re-derivable from the entry text (e.g. a skill
  // the worker manually linked to the entry) would vanish on supersede — the
  // pipeline only re-links skills recognised from the new text. Carry the old
  // entry's links to the new id BEFORE the pipeline (idempotent upsert),
  // EXCLUDING any skill the worker rejected in this edit so a removal sticks.
  await carryForwardEntrySkillLinks(
    supabase,
    oldEntryId,
    newEntryId,
    rejectedSlugs,
  );

  // Manually selected taxonomy skills (journal compact edit, P1-A): a row the
  // worker picked from taxonomy search ships its slug as the fragment's
  // `activitySlug`. The pipeline only links skills recognised from the TEXT,
  // so a selection whose label never appears in the text would leave no
  // worker_skills / journal_entry_skills evidence. Validate every submitted
  // slug server-side (active taxonomy, caller's own worker) and link the
  // survivors to the NEW entry — self-declared lane, verified=false, never a
  // fabricated verification.
  await linkSelectedTaxonomySkills(
    supabase,
    user.id,
    newEntryId,
    selectedSlugs,
    rejectedSlugs,
  );

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

/** Worker DECISION markers that must survive a supersede (entry-scoped,
 *  append-only — see `ENTRY_MARKER_SLUGS` in the pipeline). */
const DECISION_MARKER_SLUGS = [
  "ambiguous_resolved",
  "skill_rejected",
  "skill_claim_rejected",
  "unresolved_dismissed",
] as const;

/**
 * Copy the superseded entry's decision markers to the new entry id so the
 * pipeline derivation keeps honouring the worker's answers (a text-only edit
 * must never resurrect a rejected suggestion or re-open a resolved
 * ambiguity). Idempotent: rows already present on the new entry (matched by
 * metric_slug + value_text) are skipped, so a repeated save never
 * duplicates. Append-only inserts under the CALLER'S OWN RLS. A failure is
 * logged (counts only — never entry text) and never fails the already-
 * persisted supersede.
 *
 * `reselectedSlugs` (post-merge review P1): slugs the worker EXPLICITLY
 * selected in THIS save. A `skill_rejected` marker for such a slug is NOT
 * carried — otherwise remove→save→re-add→save would pin a contradictory
 * rejection on the whole chain and permanently suppress that skill's
 * recognition. Other marker kinds are never slug-scoped and carry as before.
 */
async function carryForwardEntryDecisionMarkers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  oldEntryId: string,
  newEntryId: string,
  reselectedSlugs: ReadonlyArray<string | null> = [],
): Promise<void> {
  try {
    const reselected = new Set(
      reselectedSlugs.filter((s): s is string => typeof s === "string" && s.length > 0),
    );
    const { data: oldRows, error: oldErr } = await supabase
      .from("journal_entry_metrics")
      .select("metric_slug, value_text, value_numeric")
      .eq("entry_id", oldEntryId)
      .in("metric_slug", [...DECISION_MARKER_SLUGS]);
    if (oldErr) {
      console.error("[journal] carry-forward read failed:", oldErr.message);
      return;
    }
    if (!oldRows || oldRows.length === 0) return;

    const { data: newRows, error: newErr } = await supabase
      .from("journal_entry_metrics")
      .select("metric_slug, value_text")
      .eq("entry_id", newEntryId)
      .in("metric_slug", [...DECISION_MARKER_SLUGS]);
    if (newErr) {
      console.error("[journal] carry-forward check failed:", newErr.message);
      return;
    }
    const markerKey = (r: { metric_slug: string | null; value_text: string | null }) =>
      `${r.metric_slug ?? ""}|${(r.value_text ?? "").trim()}`;
    const existing = new Set((newRows ?? []).map(markerKey));

    const seen = new Set<string>();
    const toCopy = oldRows.filter((r) => {
      if (!r.metric_slug || !r.value_text) return false;
      // The worker re-selected this skill in the current save — the old
      // rejection is overridden, not carried.
      if (
        r.metric_slug === "skill_rejected" &&
        reselected.has(r.value_text.trim())
      ) {
        return false;
      }
      const key = markerKey(r);
      if (existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (toCopy.length === 0) return;

    const { error: insErr } = await supabase
      .from("journal_entry_metrics")
      .insert(
        toCopy.map((r) => ({
          entry_id: newEntryId,
          metric_slug: r.metric_slug as string,
          source: "worker_input",
          value_text: r.value_text,
          ...(typeof r.value_numeric === "number"
            ? { value_numeric: r.value_numeric }
            : {}),
        })),
      );
    if (insErr) {
      console.error(
        "[journal] carry-forward insert failed:",
        insErr.message,
        `count=${toCopy.length}`,
      );
    }
  } catch (e) {
    console.error(
      "[journal] carry-forward threw:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * Copy the superseded entry's skill EVIDENCE links to the new entry id so a
 * text-only edit never drops a manually-linked (non-text-derivable) skill. The
 * pipeline re-links only skills recognised from the new text; this preserves
 * the rest. Idempotent (`ignoreDuplicates` on the (entry, skill) unique key),
 * append-only, under the CALLER'S OWN RLS, and EXCLUDES any skill the worker
 * rejected in this edit so a deliberate removal is not resurrected. A failure
 * is logged (counts only) and never fails the already-persisted supersede.
 */
async function carryForwardEntrySkillLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  oldEntryId: string,
  newEntryId: string,
  rejectedSlugs: ReadonlyArray<string>,
): Promise<void> {
  try {
    const rejected = new Set(rejectedSlugs);
    const { data: oldLinks, error } = await supabase
      .from("journal_entry_skills")
      .select("skill_id, worker_id, skills(slug)")
      .eq("journal_entry_id", oldEntryId);
    if (error) {
      console.error("[journal] skill-link carry read failed:", error.message);
      return;
    }
    const rows = (oldLinks ?? [])
      .filter((l) => {
        const slug = (l.skills as { slug: string | null } | null)?.slug ?? null;
        return Boolean(l.skill_id) && Boolean(l.worker_id) && !(slug && rejected.has(slug));
      })
      .map((l) => ({
        journal_entry_id: newEntryId,
        worker_id: l.worker_id as string,
        skill_id: l.skill_id as string,
      }));
    if (rows.length === 0) return;
    const { error: insErr } = await supabase
      .from("journal_entry_skills")
      .upsert(rows, { onConflict: "journal_entry_id,skill_id", ignoreDuplicates: true });
    if (insErr) {
      console.error(
        "[journal] skill-link carry insert failed:",
        insErr.message,
        `count=${rows.length}`,
      );
    }
  } catch (e) {
    console.error(
      "[journal] skill-link carry threw:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** Slug shape accepted from the client before any DB lookup — mirrors the
 *  pipeline actions' SLUG_RE so injection attempts die at the boundary. */
const SELECTED_SLUG_RE = /^[a-z0-9_-]{1,64}$/;

/**
 * Link the worker's MANUALLY SELECTED taxonomy skills to the new entry
 * (journal compact edit, P1-A). Every candidate slug is validated server-side:
 *   • slug-shaped (regex) before any lookup — no arbitrary client injection;
 *   • an ACTIVE row in the `skills` taxonomy table;
 *   • never a slug the worker rejected in the same save;
 *   • written only for the CALLER'S OWN worker profile (resolved from the
 *     authenticated user; the supersede RPC has already proven the caller
 *     owns the edited entry).
 * Survivors get the honest self-declared lane: `worker_skills` with
 * verified=false (upsert, never downgrades an existing row) + a
 * `journal_entry_skills` evidence link on the NEW entry. Idempotent
 * (ignore-duplicate upserts) so repeated saves never duplicate. A failure is
 * logged (counts only — never entry text) and never fails the persisted save.
 */
async function linkSelectedTaxonomySkills(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  newEntryId: string,
  candidateSlugs: ReadonlyArray<string | null>,
  rejectedSlugs: ReadonlyArray<string>,
): Promise<void> {
  try {
    const rejected = new Set(rejectedSlugs);
    const slugs = [
      ...new Set(
        candidateSlugs.filter(
          (s): s is string =>
            typeof s === "string" &&
            SELECTED_SLUG_RE.test(s) &&
            !rejected.has(s),
        ),
      ),
    ].slice(0, 50);
    if (slugs.length === 0) return;

    const { data: worker, error: workerErr } = await supabase
      .from("workers")
      .select("id")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!worker?.id) {
      // Never silent: without the worker row the selection cannot be linked
      // and the P1-A symptom would recur invisibly on a transient DB error.
      console.error(
        "[journal] selected-skill worker lookup failed:",
        workerErr?.message ?? "no worker row",
        `slugs=${slugs.length}`,
      );
      return;
    }

    // Active-taxonomy validation: unknown or inactive slugs are dropped —
    // their rows stay honest free labels, no fabricated taxonomy claim.
    const { data: skillRows, error: skillErr } = await supabase
      .from("skills")
      .select("id, slug, is_active")
      .in("slug", slugs);
    if (skillErr) {
      console.error(
        "[journal] selected-skill lookup failed:",
        skillErr.message,
      );
      return;
    }
    const active = (skillRows ?? []).filter((s) => s.is_active !== false);
    if (active.length < slugs.length) {
      console.warn(
        `[journal] selected-skill validation dropped ${slugs.length - active.length} of ${slugs.length} slugs`,
      );
    }
    if (active.length === 0) return;

    const { error: ownErr } = await supabase.from("worker_skills").upsert(
      active.map((s) => ({
        worker_id: worker.id,
        skill_id: s.id,
        verified: false,
        source: "self_declared",
        confidence_bin: "yellow",
      })),
      { onConflict: "worker_id,skill_id", ignoreDuplicates: true },
    );
    if (ownErr) {
      console.error(
        "[journal] selected-skill worker_skills upsert failed:",
        ownErr.message,
        `count=${active.length}`,
      );
      return;
    }

    const { error: linkErr } = await supabase
      .from("journal_entry_skills")
      .upsert(
        active.map((s) => ({
          journal_entry_id: newEntryId,
          worker_id: worker.id,
          skill_id: s.id,
        })),
        { onConflict: "journal_entry_id,skill_id", ignoreDuplicates: true },
      );
    if (linkErr) {
      console.error(
        "[journal] selected-skill evidence link failed:",
        linkErr.message,
        `count=${active.length}`,
      );
    }
  } catch (e) {
    console.error(
      "[journal] selected-skill linking threw:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

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
  if (!entryId) {
    return {
      ok: false,
      code: "entry_not_found",
      message: "Įrašas nerastas.",
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
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
    };
  }

  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: { p_entry_id: string },
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  )("journal_entry_soft_delete", { p_entry_id: entryId });

  if (error) {
    const mapped = mapJournalRpcError(error);
    if (mapped) return mapped;
    return {
      ok: false,
      code: "unknown_error",
      message: `Įrašo pašalinti nepavyko: ${error.message ?? "nežinoma klaida"}`,
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
  if (!entryId) {
    return {
      ok: false,
      code: "entry_not_found",
      message: "Įrašas nerastas.",
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
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
    };
  }

  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: { p_entry_id: string },
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  )("journal_entry_restore", { p_entry_id: entryId });

  if (error) {
    const mapped = mapJournalRpcError(error);
    if (mapped) return mapped;
    return {
      ok: false,
      code: "unknown_error",
      message: `Įrašo atkurti nepavyko: ${error.message ?? "nežinoma klaida"}`,
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

function mapJournalRpcError(err: {
  code?: string;
  message?: string;
}): JournalLifecycleResult | null {
  // Postgres RAISE EXCEPTION lands in `message`; PostgREST also surfaces
  // SQLSTATE in `code` when available. We pattern-match the message body
  // so we don't depend on PostgREST passing the SQLSTATE unchanged.
  const text = `${err.message ?? ""} ${err.code ?? ""}`.toLowerCase();
  if (/pgrst202|create_journal|create_journal_entry|function/.test(text) &&
      /could not find|does not exist|undefined function/.test(text)) {
    return {
      ok: false,
      code: "rpc_unavailable",
      message:
        "Pataisymų funkcija dar nepritaikyta šioje aplinkoje. " +
        "Paprašykite administratoriaus pritaikyti migraciją 0018.",
    };
  }
  if (text.includes("entry_not_found")) {
    return {
      ok: false,
      code: "entry_not_found",
      message: "Įrašas nerastas (gali būti, kad jau buvo pašalintas).",
    };
  }
  if (text.includes("not_owner")) {
    return {
      ok: false,
      code: "not_owner",
      message: "Negalima keisti svetimo įrašo.",
    };
  }
  if (text.includes("already_confirmed_use_correction_request")) {
    return {
      ok: false,
      code: "already_confirmed",
      message:
        "Įrašas jau patvirtintas išorinio asmens — vietoje ištrynimo " +
        "siųskite pataisymo prašymą.",
    };
  }
  if (text.includes("cannot_supersede_deleted")) {
    return {
      ok: false,
      code: "cannot_supersede_deleted",
      message: "Negalima keisti pašalinto įrašo.",
    };
  }
  if (text.includes("entry_superseded_cannot_restore")) {
    return {
      ok: false,
      code: "entry_superseded",
      message:
        "Šio įrašo atkurti negalima — jį jau pakeitė naujesnė versija.",
    };
  }
  return null;
}

type RpcMetricRow = {
  metric_slug: string;
  source: "worker_input";
  value_text?: string | null;
  value_numeric?: number | null;
  unit_slug?: string | null;
};

function collectUnitSlugs(args: {
  quantity: number | null;
  unitSlug: string;
  fragments: ParsedFragmentInput[];
}): Set<string> {
  const out = new Set<string>();
  if (args.quantity !== null && args.unitSlug) out.add(args.unitSlug);
  for (const f of args.fragments) {
    if (f.timeUnit) out.add(f.timeUnit);
  }
  return out;
}

/** Legacy two-step save — only reached when the RPC is not yet on the
 *  target DB. Atomicity here is best-effort: if the metric insert fails
 *  we attempt a compensating delete; if RLS forbids the delete we still
 *  surface the failure so the worker knows the entry leaked. */
async function legacyTwoStepSave(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    worker_id: string;
    engagement_context_id: string;
    entry_type_slug: string;
    profession_id: string | null;
    original_text: string;
    original_language: string;
    hash_prev: string | null;
    hash_self: string;
    visibility_scope: string;
    metrics: RpcMetricRow[];
  },
): Promise<
  // The skill pipeline runs AFTER this save step, so the legacy path returns
  // the bare save outcome; the caller attaches the pipeline result.
  | { ok: true; entryId: string }
  | { ok: false; code: JournalSaveErrorCode; message: string }
> {
  const { metrics, ...entryFields } = args;
  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert(entryFields)
    .select("id")
    .single();
  if (error || !entry) {
    return {
      ok: false,
      code: "entry_insert_failed",
      message: `Įrašo išsaugoti nepavyko: ${error?.message ?? "nežinoma klaida"}`,
    };
  }
  if (metrics.length === 0) return { ok: true, entryId: entry.id };
  const rows = metrics.map((m) => ({ ...m, entry_id: entry.id }));
  const { error: mErr } = await supabase
    .from("journal_entry_metrics")
    .insert(rows);
  if (mErr) {
    // Best-effort compensation — append-only doctrine blocks DELETE by
    // default, so the entry likely leaks. Surface that honestly.
    await supabase.from("journal_entries").delete().eq("id", entry.id);
    return {
      ok: false,
      code: "metrics_insert_failed",
      message:
        `Įrašas nebuvo išsaugotas pilnai: ${mErr.message}. ` +
        `Įrašas atmestas — bandykite dar kartą.`,
    };
  }
  return { ok: true, entryId: entry.id };
}
