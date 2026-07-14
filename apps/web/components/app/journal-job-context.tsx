import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { MarkOpportunitiesSeen } from "@/components/app/mark-opportunities-seen";
import { createClient } from "@/lib/supabase/server";
import { getWorkerJobRecommendations } from "@/lib/opportunities/recommendations";
import {
  journalConnections,
  type JobRecommendation,
} from "@/lib/opportunities/recommendations-model";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";

/**
 * "Susiję su jūsų įrašais" — journal→jobs context block (Job Recommendation
 * Engine surfacing, Sprint v2 §4). Self-contained: ONE insertion point in
 * journal/page.tsx so merge conflicts stay trivial.
 *
 * Deterministic derivation, no AI: the worker's RECENT (7-day) journal
 * entries' durable skill links (journal_entry_skills — evidence-SUPPORT,
 * never verification) are intersected with the current recommendations'
 * matched/missing skill sets from the ONE request-cached read model. A
 * connection line reads "a recent entry SUPPORTED skill X — this job needs
 * it" (honest wording: journal support is never "confirmed", §7).
 *
 * Honest empty → renders NOTHING: no worker recs, no recent linked skills,
 * or no intersection. Shows at most 2 jobs, each with the §19 basis form.
 */

const RECENT_WINDOW_DAYS = 7;

export async function JournalJobContext({
  workerId,
  locale,
}: {
  workerId: string;
  locale: string;
}) {
  const result = await getWorkerJobRecommendations({ limit: 10 });
  if (result.kind !== "ready" || !result.boardAvailable) return null;
  if (result.recommendations.length === 0) return null;

  const supabase = await createClient();

  // Recent entries (last 7 days). Tolerant select: the v3 lifecycle columns
  // may be absent on older DBs — fall back to the legacy projection (same
  // pattern as the journal page itself).
  const sinceIso = new Date(
    Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  type EntryRow = {
    id: string;
    created_at: string;
    deleted_at?: string | null;
    superseded_by?: string | null;
  };
  let entries: EntryRow[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v3 = await (supabase.from("journal_entries") as any)
    .select("id, created_at, deleted_at, superseded_by")
    .eq("worker_id", workerId)
    .gte("created_at", sinceIso);
  if (v3.error) {
    const legacy = await supabase
      .from("journal_entries")
      .select("id, created_at")
      .eq("worker_id", workerId)
      .gte("created_at", sinceIso);
    entries = (legacy.data ?? []) as EntryRow[];
  } else {
    entries = ((v3.data ?? []) as EntryRow[]).filter(
      (e) => !e.deleted_at && !e.superseded_by,
    );
  }
  if (entries.length === 0) return null;
  const recentEntryIds = new Set(entries.map((e) => e.id));

  // Durable entry↔skill links + the skill id → canonical slug map. Both
  // degrade gracefully (absent store / error → render nothing).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkRes = await (supabase as any)
    .from("journal_entry_skills")
    .select("journal_entry_id, skill_id")
    .eq("worker_id", workerId);
  if (linkRes.error) return null;
  const recentSkillIds = new Set<string>();
  for (const r of (linkRes.data ?? []) as {
    journal_entry_id: string;
    skill_id: string;
  }[]) {
    if (recentEntryIds.has(r.journal_entry_id)) recentSkillIds.add(r.skill_id);
  }
  if (recentSkillIds.size === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: skillRows } = await (supabase as any)
    .from("worker_skills")
    .select("skill_id, skills(slug)")
    .eq("worker_id", workerId);
  const recentSkillSlugs = new Set<string>();
  for (const r of (skillRows ?? []) as {
    skill_id: string | null;
    skills: { slug: string | null } | null;
  }[]) {
    const slug = r.skills?.slug;
    if (r.skill_id && slug && recentSkillIds.has(r.skill_id)) {
      recentSkillSlugs.add(slug);
    }
  }
  if (recentSkillSlugs.size === 0) return null;

  // Deterministic intersection — up to 2 jobs whose matched/missing skill
  // set overlaps the recently journaled skills.
  const connected: {
    rec: JobRecommendation;
    connection: ReturnType<typeof journalConnections>[number];
  }[] = [];
  for (const rec of result.recommendations) {
    const conns = journalConnections(rec, recentSkillSlugs);
    if (conns.length > 0) connected.push({ rec, connection: conns[0] });
    if (connected.length === 2) break;
  }
  if (connected.length === 0) return null;

  const tRec = await getTranslations("opportunities.recommendations");
  const tOpp = await getTranslations("opportunities");
  const tSkill = await getTranslations("skillNames");
  const workLabels = buildWorkTypeLabelMap(locale);
  const roleLabel = (slug: string | null) =>
    (slug && workLabels[slug]) || tOpp("fieldRoleUnknown");
  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const boardHref = "/dashboard/opportunities" as "/dashboard";

  return (
    <section
      className="order-6 card-border flex flex-col gap-2 p-4"
      data-testid="journal-job-context"
    >
      {/* Rendering IS the read event for the shown recommendations. */}
      <MarkOpportunitiesSeen
        requestIds={connected.map((c) => c.rec.requestId)}
      />
      <h2 className="font-display text-base font-semibold tracking-tight text-text-primary">
        {tRec("journalTitle")}
      </h2>
      <ul className="flex flex-col gap-2">
        {connected.map(({ rec, connection }) => (
          <li key={rec.requestId}>
            <Link
              href={boardHref}
              data-testid={`journal-job-context-row-${rec.requestId}`}
              className="flex flex-col gap-0.5 rounded-md p-1 transition-colors hover:bg-ink-800/40"
            >
              <span className="text-sm font-semibold text-text-primary">
                {roleLabel(rec.roleSlug)}
              </span>
              {/* §19 canonical basis — counts + confirmed share together. */}
              <span
                className="text-xs text-text-secondary"
                data-testid="journal-job-context-basis"
              >
                {tRec("basisCompact", {
                  matched: rec.basis.matchedTotal,
                  total: rec.basis.needTotal,
                  confirmed: rec.basis.matchedConfirmed,
                })}
              </span>
              {/* The deterministic journal connection (honest "supported",
                  never "confirmed"). */}
              <span className="text-[11px] leading-relaxed text-text-muted">
                {tRec("journalLine", {
                  skill: skillLabel(connection.slug),
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
