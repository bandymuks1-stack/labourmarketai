import "server-only";
import { normalizeClaimLabel } from "@/lib/profile/skill-claim-extractor";
import { ENTRY_MARKER_SLUGS } from "@/lib/journal/entry-recognition-markers";
import { applyWorkerSkillSourceReconcile } from "@/lib/journal/skill-source-apply";

/**
 * A PERSON DISPUTES WHAT ONE OF THEIR ENTRIES WAS READ AS SHOWING.
 *
 * Owner requirement 2026-10-29: every inference from the Work Journal is
 * traceable, and the person can dispute a wrong one. Before this module the
 * two existing doors each did half of it:
 *
 *   - un-ticking a linked skill on an entry (setJournalEntrySkillLinks)
 *     removed the evidence link, but left no record of the decision — the
 *     next pipeline run over the same text (a version upgrade, the
 *     "refresh recognition" button) recognised the skill again and put the
 *     link straight back;
 *   - rejecting a recognised skill (rejectJournalSkillCandidate) wrote the
 *     durable entry-scoped `skill_rejected` marker, but left the link the
 *     pipeline had already written — so the Living CV and every employer
 *     surface kept reading the skill as evidenced by that entry.
 *
 * Both now end in the same state, through this one helper:
 *
 *   1. the decision is recorded as the append-only `skill_rejected` marker
 *      on THAT entry (the basis is kept: the entry text, the marker and the
 *      learning signal stay; nothing is deleted from the journal lane);
 *   2. the entry↔skill evidence link is removed for that entry only;
 *   3. the worker-side evidence tier is recomputed, so a skill no other
 *      entry supports falls back from "recorded in the journal" to
 *      "self-declared" everywhere the ONE tier ladder is read.
 *
 * What it never does: delete the person's skill row (whether they hold the
 * skill at all is their own profile decision), touch a confirmation, or act
 * on an entry the caller does not own (callers check ownership first; RLS
 * re-checks every row). A failure is reported, never hidden.
 */

/** Append-only entry marker, idempotent by normalised value. */
export async function appendEntryMarker(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  entryId: string,
  metricSlug: string,
  valueText: string,
  valueNumeric?: number,
): Promise<boolean> {
  const { data: existing } = await sb
    .from("journal_entry_metrics")
    .select("id, value_text")
    .eq("entry_id", entryId)
    .eq("metric_slug", metricSlug);
  const normalized = normalizeClaimLabel(valueText);
  const already = ((existing ?? []) as { value_text: string | null }[]).some(
    (r) => normalizeClaimLabel(r.value_text ?? "") === normalized,
  );
  if (already) return true;
  const ins = await sb.from("journal_entry_metrics").insert([
    {
      entry_id: entryId,
      metric_slug: metricSlug,
      source: "worker_input",
      value_text: valueText,
      ...(typeof valueNumeric === "number"
        ? { value_numeric: valueNumeric }
        : {}),
    },
  ]);
  return !ins.error;
}

export type EntrySkillRetraction = {
  ok: boolean;
  /** Catalogue slugs whose dispute is now recorded on the entry. */
  markedSlugs: string[];
};

/**
 * Record the person's dispute of `skillIds` (or `slugs`) on ONE of their own
 * entries and withdraw that entry's evidence link for them. Pass whichever
 * identifier the caller holds; the other is resolved from the catalogue.
 */
export async function retractEntrySkillEvidence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  opts: {
    entryId: string;
    workerId: string;
    skillIds?: readonly string[];
    slugs?: readonly string[];
    /** False when the caller already removed the link rows itself. */
    deleteLinks?: boolean;
  },
): Promise<EntrySkillRetraction> {
  const ids = [...new Set(opts.skillIds ?? [])].filter((s) => !!s);
  const slugs = [...new Set(opts.slugs ?? [])].filter((s) => !!s);
  if (ids.length === 0 && slugs.length === 0) return { ok: true, markedSlugs: [] };

  // Resolve both directions through the one catalogue.
  const query = sb.from("skills").select("id, slug");
  const { data: rows, error } = await (ids.length > 0
    ? query.in("id", ids)
    : query.in("slug", slugs));
  if (error) return { ok: false, markedSlugs: [] };
  // Kept to exactly what was asked for, whatever the read returned.
  const resolved = ((rows ?? []) as { id: string; slug: string | null }[]).filter(
    (r): r is { id: string; slug: string } =>
      typeof r.slug === "string" &&
      (ids.length > 0 ? ids.includes(r.id) : slugs.includes(r.slug)),
  );
  const skillIds = ids.length > 0 ? ids : resolved.map((r) => r.id);
  const markSlugs = ids.length > 0 ? resolved.map((r) => r.slug) : slugs;

  let ok = true;
  const markedSlugs: string[] = [];
  for (const slug of markSlugs) {
    const marked = await appendEntryMarker(
      sb,
      opts.entryId,
      ENTRY_MARKER_SLUGS.skillRejected,
      slug,
    );
    if (marked) markedSlugs.push(slug);
    else ok = false;
  }

  // The evidence is withdrawn only once the dispute is on record: a failed
  // marker leaves the link in place, so the person's retry still sees it.
  if (ok && opts.deleteLinks !== false && skillIds.length > 0) {
    const del = await sb
      .from("journal_entry_skills")
      .delete()
      .eq("journal_entry_id", opts.entryId)
      .eq("worker_id", opts.workerId)
      .in("skill_id", skillIds);
    if (del.error) ok = false;
  }

  // The tier is DERIVED from the links (the source of truth just changed);
  // like every other link writer, the recompute is best-effort and never
  // turns a recorded dispute into a reported failure.
  await applyWorkerSkillSourceReconcile(sb, opts.workerId);
  return { ok, markedSlugs };
}
