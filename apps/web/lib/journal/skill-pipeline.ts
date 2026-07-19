import "server-only";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { normalizeClaimLabel } from "@/lib/profile/skill-claim-extractor";
import { applyWorkerSkillSourceReconcile } from "@/lib/journal/skill-source-apply";

/**
 * Canonical server-side journal → skill pipeline (P0 Track B).
 *
 * Replaces the client-side fire-and-forget `void autoLinkRecognizedJournalSkills`
 * call: the save action AWAITS this pipeline, so recognition can no longer
 * silently die in a closed tab, and its honest result is returned to the UI.
 *
 * What it does, all under the CALLER'S OWN RLS (never the admin client):
 *   1. recognises taxonomy skills in the entry text (deterministic, no AI);
 *   2. ADDS new worker_skills rows for strong (exact/synonym) recognitions the
 *      worker has not declared yet — always `verified:false`,
 *      `source:'self_declared'`, `confidence_bin:'yellow'` (see below);
 *   3. links recognised skills to the entry as journal evidence (idempotent);
 *   4. persists free-text capability claims as `skill_claim` metric rows with
 *      provenance (entry id), `source:'worker_input'` — deterministic
 *      extraction is NOT AI, so never the AI-extracted source (doctrine §7);
 *   5. recomputes the worker-side evidence tier (skill-source reconcile).
 *
 * Honesty rules (hard, guarded by lib/guards/journal-pipeline-canonical.test.ts):
 *   • NEVER marks a skill verified and NEVER writes the manager-confirmed
 *     source — verification stays the separate owner-gated manager-confirm flow;
 *   • fuzzy/low-confidence recognitions of UNDECLARED skills are never
 *     auto-added — they only count into `reviewNeeded`;
 *   • server logs carry counts + a trace id ONLY — never the entry text or
 *     claim labels.
 */

export type JournalSkillPipelineResult = {
  status: "completed" | "partial" | "failed";
  /** Recognised taxonomy skills after exclusions (resolved + active). */
  detected: number;
  /** NEW worker_skills rows created this run. */
  added: number;
  /** Previously-declared skills that gained a NEW link to this entry. */
  strengthened: number;
  /** Links that already existed (idempotent retry). */
  alreadyLinked: number;
  /** Low-confidence recognitions NOT auto-added + new free-text claims. */
  reviewNeeded: number;
  /** Free-text capability labels persisted with provenance. */
  claimsSaved: number;
  /** added + strengthened + claimsSaved > 0. */
  cvUpdated: boolean;
  /** Non-secret hex id, also stamped on server logs. */
  trace: string;
};

/** Slug-shaped guard for exclusion lists coming from the client. */
const SLUG_RE = /^[a-z0-9_-]{1,64}$/i;
/** Safety cap on skill_claim rows persisted per run (mirrors profile claims). */
const MAX_CLAIMS_PER_RUN = 12;

function newTrace(): string {
  return randomBytes(6).toString("hex");
}

function zeroResult(
  trace: string,
  status: JournalSkillPipelineResult["status"],
): JournalSkillPipelineResult {
  return {
    status,
    detected: 0,
    added: 0,
    strengthened: 0,
    alreadyLinked: 0,
    reviewNeeded: 0,
    claimsSaved: 0,
    cvUpdated: false,
    trace,
  };
}

/** Shared fallback for callers that must return a result even when the
 *  pipeline itself threw before producing one (a throw must never fail the
 *  underlying journal save). */
export function failedPipelineResult(): JournalSkillPipelineResult {
  return zeroResult(newTrace(), "failed");
}

function logError(trace: string, step: string, error: unknown): void {
  // Counts + codes only — NEVER the entry text or claim labels (§4 privacy).
  const e = error as { code?: string; message?: string } | null;
  console.error("[journal-pipeline] step failed", {
    trace,
    step,
    code: e?.code ?? null,
    message: e?.message ?? String(error ?? "unknown"),
  });
}

export async function processJournalEntrySkills(opts: {
  entryId: string;
  text: string;
  locale: string;
  excludeSlugs?: readonly string[];
  /** default true */
  revalidate?: boolean;
}): Promise<JournalSkillPipelineResult> {
  const trace = newTrace();
  const started = Date.now();
  const { entryId, text } = opts;
  const locale = /^[a-z]{2}(-[a-zA-Z]{2})?$/.test(opts.locale)
    ? opts.locale
    : "lt";

  let writeFailures = 0;
  let writeSuccesses = 0;

  let detected = 0;
  let added = 0;
  let strengthened = 0;
  let alreadyLinked = 0;
  let reviewNeeded = 0;
  let claimsSaved = 0;

  try {
    // ── 1. Auth + ownership ──────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return zeroResult(trace, "failed");

    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!worker?.id) return zeroResult(trace, "failed");

    const { data: entry } = await supabase
      .from("journal_entries")
      .select("id, worker_id")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry || entry.worker_id !== worker.id) {
      return zeroResult(trace, "failed");
    }

    // The link/claim tables are not in the generated Supabase types yet —
    // route through `any` (RLS still enforces ownership at the DB layer).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // ── 2. Deterministic recognition, minus explicit worker rejections ───
    const excluded = new Set(
      (opts.excludeSlugs ?? []).filter(
        (s) => typeof s === "string" && SLUG_RE.test(s),
      ),
    );
    const recognized = recognizeSkills(text, 8).filter(
      (r) => !excluded.has(r.slug),
    );

    // ── 3. Resolve slugs → active taxonomy skills ────────────────────────
    const slugs = [...new Set(recognized.map((r) => r.slug))];
    let resolved: { id: string; slug: string }[] = [];
    if (slugs.length > 0) {
      const { data: skillRows, error } = await supabase
        .from("skills")
        .select("id, slug, is_active")
        .in("slug", slugs);
      if (error) {
        logError(trace, "resolve_skills", error);
        writeFailures += 1; // recognition cannot land anywhere — count once
      }
      resolved = (skillRows ?? [])
        .filter((r) => r.is_active !== false && typeof r.slug === "string")
        .map((r) => ({ id: r.id as string, slug: r.slug as string }));
    }
    detected = resolved.length;
    const resolvedIds = resolved.map((r) => r.id);

    // Strongest evidence per slug (recognizeSkills is evidence-ordered, but
    // be explicit): a slug counts as "strong" when ANY exact/synonym match
    // recognised it. Fuzzy-only recognitions stay weak.
    const strongSlugs = new Set(
      recognized
        .filter((r) => r.via === "exact" || r.via === "synonym")
        .map((r) => r.slug),
    );

    // ── 4. Worker's existing declared skills among the resolved set ──────
    const ownedSet = new Set<string>();
    if (resolvedIds.length > 0) {
      const { data: owned, error } = await supabase
        .from("worker_skills")
        .select("skill_id")
        .eq("worker_id", worker.id)
        .in("skill_id", resolvedIds);
      if (error) {
        logError(trace, "read_owned", error);
        writeFailures += 1;
      }
      for (const r of owned ?? []) {
        if (r.skill_id) ownedSet.add(r.skill_id);
      }
    }

    // ── 5. NEW-skill honesty rule: add ONLY strong (exact/synonym)
    // recognitions the worker has not declared. verified:false +
    // source:'self_declared' always; confidence_bin is NOT NULL with
    // CHECK (red|green|yellow) — 'yellow' is the honest neutral bin for a
    // journal-derived self-declared skill (green would fake confirmation,
    // red would bury the worker's own words). Never verified, never the
    // manager-confirmed source (that is the separate owner-gated flow).
    const toAdd = resolved.filter(
      (r) => strongSlugs.has(r.slug) && !ownedSet.has(r.id),
    );
    let justAdded = new Set<string>();
    if (toAdd.length > 0) {
      const rows = toAdd.map((r) => ({
        worker_id: worker.id,
        skill_id: r.id,
        verified: false,
        source: "self_declared",
        confidence_bin: "yellow",
      }));
      // UNIQUE(worker_id, skill_id) exists on worker_skills (0001/0010) —
      // ignoreDuplicates makes a concurrent/duplicate insert a no-op.
      const ins = await sb.from("worker_skills").upsert(rows, {
        onConflict: "worker_id,skill_id",
        ignoreDuplicates: true,
      });
      if (ins.error) {
        logError(trace, "add_worker_skills", ins.error);
        writeFailures += 1;
      } else {
        // ownedSet was read BEFORE the insert, so everything in toAdd is new.
        justAdded = new Set(toAdd.map((r) => r.id));
        added = toAdd.length;
        writeSuccesses += 1;
      }
    }

    // ── 6. Weak recognitions of undeclared skills → review, never added ──
    const fuzzyNotOwned = resolved.filter(
      (r) => !strongSlugs.has(r.slug) && !ownedSet.has(r.id),
    );
    reviewNeeded += fuzzyNotOwned.length;

    // ── 7. Evidence links for this entry (idempotent) ────────────────────
    // Owned skills may link on ANY confidence (matches the pre-existing
    // behaviour: fuzzy evidence of an already-declared skill is fine);
    // just-added skills link only via their strong recognition.
    const linkTargets = resolved
      .filter((r) => ownedSet.has(r.id) || justAdded.has(r.id))
      .map((r) => r.id);
    if (linkTargets.length > 0) {
      const existingLinkSet = new Set<string>();
      const { data: links, error: linkReadErr } = await sb
        .from("journal_entry_skills")
        .select("skill_id")
        .eq("journal_entry_id", entryId);
      if (linkReadErr) {
        logError(trace, "read_links", linkReadErr);
        writeFailures += 1;
      } else {
        for (const r of (links ?? []) as { skill_id: string }[]) {
          existingLinkSet.add(r.skill_id);
        }
        alreadyLinked = linkTargets.filter((id) =>
          existingLinkSet.has(id),
        ).length;
        const newLinks = linkTargets.filter((id) => !existingLinkSet.has(id));
        if (newLinks.length > 0) {
          const rows = newLinks.map((skill_id) => ({
            journal_entry_id: entryId,
            worker_id: worker.id,
            skill_id,
          }));
          const ins = await sb.from("journal_entry_skills").upsert(rows, {
            onConflict: "journal_entry_id,skill_id",
            ignoreDuplicates: true,
          });
          if (ins.error) {
            logError(trace, "link_entry_skills", ins.error);
            writeFailures += 1;
          } else {
            strengthened = newLinks.filter((id) => ownedSet.has(id)).length;
            writeSuccesses += 1;
          }
        }
      }
    }

    // ── 8. Free-text capability claims with provenance ───────────────────
    // Same deterministic extraction the composer's analyse() uses. Ambiguous
    // readings (mutually-exclusive interpretations) are NOT auto-persisted —
    // only the worker may resolve those in review.
    try {
      const capability = extractJournalSuggestions(text).capabilitySuggestions;
      const seen = new Set<string>();
      const candidates = capability
        .filter((c) => c.ambiguous !== true)
        .filter((c) => {
          if (seen.has(c.normalizedLabel)) return false;
          seen.add(c.normalizedLabel);
          return true;
        })
        .slice(0, MAX_CLAIMS_PER_RUN);

      if (candidates.length > 0) {
        // Existing profile claims (dedupe by normalized label).
        const claimSet = new Set<string>();
        const { data: claimRows, error: claimErr } = await sb
          .from("profile_skill_claims")
          .select("normalized_label")
          .eq("profile_id", user.id);
        if (claimErr) logError(trace, "read_profile_claims", claimErr);
        for (const r of (claimRows ?? []) as { normalized_label: string }[]) {
          claimSet.add(r.normalized_label);
        }

        // Recognised taxonomy slugs (normalized) — a claim that just landed
        // as a taxonomy skill must not double-save as a free-text claim.
        const slugSet = new Set(
          resolved.map((r) =>
            normalizeClaimLabel(r.slug.replace(/[_-]+/g, " ")),
          ),
        );

        // Existing skill_claim metrics on THIS entry (idempotent retry).
        const existingMetricSet = new Set<string>();
        const { data: metricRows, error: metricErr } = await sb
          .from("journal_entry_metrics")
          .select("value_text")
          .eq("entry_id", entryId)
          .eq("metric_slug", "skill_claim");
        if (metricErr) logError(trace, "read_claim_metrics", metricErr);
        for (const r of (metricRows ?? []) as { value_text: string | null }[]) {
          if (r.value_text) {
            existingMetricSet.add(normalizeClaimLabel(r.value_text));
          }
        }

        const toSave = candidates.filter(
          (c) =>
            !claimSet.has(c.normalizedLabel) &&
            !slugSet.has(c.normalizedLabel) &&
            !existingMetricSet.has(c.normalizedLabel),
        );
        if (toSave.length > 0) {
          // source:'worker_input' — the label is derived from the worker's
          // own words by a deterministic lexicon pass; that is NOT AI, so
          // the AI-extracted source value would be dishonest (doctrine §7).
          const rows = toSave.map((c) => ({
            entry_id: entryId,
            metric_slug: "skill_claim",
            source: "worker_input",
            value_text: c.label,
          }));
          const ins = await sb.from("journal_entry_metrics").insert(rows);
          if (ins.error) {
            logError(trace, "save_claims", ins.error);
            writeFailures += 1;
          } else {
            claimsSaved = toSave.length;
            reviewNeeded += claimsSaved;
            writeSuccesses += 1;
          }
        }
      }
    } catch (e) {
      logError(trace, "claims_phase", e);
      writeFailures += 1;
    }

    // ── 9. Evidence-tier recompute (best-effort, swallows its own errors) ─
    await applyWorkerSkillSourceReconcile(supabase, worker.id);

    // ── 10. Surface freshness ────────────────────────────────────────────
    if (opts.revalidate !== false) {
      try {
        revalidatePath(`/${locale}/dashboard/journal`, "page");
        revalidatePath(`/${locale}/dashboard/profile`, "page");
        revalidatePath(`/${locale}/cv`, "page");
      } catch (e) {
        // Revalidation is a freshness hint, never a pipeline failure.
        logError(trace, "revalidate", e);
      }
    }

    const status: JournalSkillPipelineResult["status"] =
      writeFailures === 0
        ? "completed"
        : writeSuccesses > 0
          ? "partial"
          : "failed";

    const result: JournalSkillPipelineResult = {
      status,
      detected,
      added,
      strengthened,
      alreadyLinked,
      reviewNeeded,
      claimsSaved,
      cvUpdated: added + strengthened + claimsSaved > 0,
      trace,
    };
    console.info("[journal-pipeline]", {
      trace,
      status,
      detected,
      added,
      strengthened,
      reviewNeeded,
      ms: Date.now() - started,
    });
    return result;
  } catch (e) {
    logError(trace, "pipeline", e);
    return zeroResult(trace, "failed");
  }
}
