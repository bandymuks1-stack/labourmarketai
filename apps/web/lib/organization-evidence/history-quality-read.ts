import "server-only";

import { withSessionWorkspacePointer } from "@/lib/company/active-organization";
import { createClient } from "@/lib/supabase/server";

import { resolveEvidenceOrganization } from "./evidence-org-context";
import { untypedClient } from "./evidence-store";
import {
  buildHistoryQuality,
  type HistoryQuality,
  type QualityDecision,
  type QualityProjectRow,
  type QualityRecord,
} from "./history-quality";

/**
 * The ACTIVE organization's imported-history quality, read through the
 * caller's own RLS session (managers of the organization). Nothing written.
 *   ready        the fold + the ledger rows + how long the fold took
 *   hidden       personal workspace / no organization
 *   unavailable  a failed read — never rendered as "no problems"
 */
export type HistoryQualityLoad =
  | {
      readonly kind: "ready";
      readonly organizationName: string;
      readonly quality: HistoryQuality;
      readonly decisions: readonly (QualityDecision & { readonly id: string; readonly title: string | null })[];
      readonly ledgerApplied: boolean;
      readonly foldMs: number;
    }
  | { readonly kind: "hidden" }
  | { readonly kind: "unavailable" };

const MISSING = new Set(["42P01", "PGRST205", "PGRST202"]);

async function pages<T>(run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const res = await run(from, from + 999);
    if (res.error) return null;
    const got = (res.data ?? []) as T[];
    out.push(...got);
    if (got.length < 1000) return out;
  }
  return out;
}

/** The object text a source row carried, from its own source fact. */
export function objectTextOf(sourceFact: Record<string, unknown> | null, contextLabel: string | null): { text: string; listLength: number } {
  const f = sourceFact ?? {};
  for (const key of ["object", "Object / recognized objects", "addresses", "object_codes", "projectLabel"]) {
    const v = f[key];
    if (Array.isArray(v)) {
      const items = v.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (items.length) return { text: items.join(", "), listLength: items.length };
    } else if (typeof v === "string" && v.trim()) {
      return { text: v.trim(), listLength: 1 };
    }
  }
  return { text: (contextLabel ?? "").trim(), listLength: contextLabel?.trim() ? 1 : 0 };
}

export async function loadHistoryQuality(locale: string): Promise<HistoryQualityLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "hidden" };
  const caller = await withSessionWorkspacePointer({ supabase, userId: user.id, locale });
  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) return org.reason === "error" ? { kind: "unavailable" } : { kind: "hidden" };
  const db = untypedClient(supabase);
  const orgId = org.organizationId;

  type RawRec = {
    id: string; session_id: string | null; source_filename: string | null; organization_person_id: string;
    work_object_id: string | null; activity_date: string | null; period_start: string | null; period_end: string | null;
    hours: number | string | null; context_label: string | null; source_fact: Record<string, unknown> | null;
  };
  const [rawRecords, rawProjects, rawObjects] = await Promise.all([
    pages<RawRec>((from, to) =>
      db.from("organization_evidence_records")
        .select("id, session_id, source_filename, organization_person_id, work_object_id, activity_date, period_start, period_end, hours, context_label, source_fact")
        .eq("organization_id", orgId).order("id", { ascending: true }).range(from, to),
    ),
    pages<{ id: string; title: string | null; record_state: string | null; canonical_project_id: string | null; historical_key: string | null }>((from, to) =>
      db.from("projects").select("id, title, record_state, canonical_project_id, historical_key")
        .eq("organization_id", orgId).order("id", { ascending: true }).range(from, to),
    ),
    pages<{ id: string; project_id: string | null }>((from, to) =>
      db.from("work_objects").select("id, project_id").eq("organization_id", orgId).order("id", { ascending: true }).range(from, to),
    ),
  ]);
  if (!rawRecords || !rawProjects || !rawObjects) return { kind: "unavailable" };

  // The ledger may not exist yet (migration unapplied) — then nothing has
  // been consolidated, which the page says.
  let ledgerApplied = true;
  type RawDecision = {
    id: string; project_id: string; canonical_project_id: string | null; decision: QualityDecision["decision"];
    mismatch_types: string[] | null; certainty: QualityDecision["certainty"]; conflicts: unknown[] | null;
    original_text: string; normalized_name: string; rule_version: string; decided_at: string; reverted_at: string | null;
  };
  let rawDecisions: RawDecision[] = [];
  const dres = await db.from("historical_consolidation_decisions")
    .select("id, project_id, canonical_project_id, decision, mismatch_types, certainty, conflicts, original_text, normalized_name, rule_version, decided_at, reverted_at")
    .eq("organization_id", orgId).limit(5000);
  if (dres.error) {
    if (!MISSING.has(dres.error.code ?? "")) return { kind: "unavailable" };
    ledgerApplied = false;
  } else {
    rawDecisions = (dres.data ?? []) as RawDecision[];
    ledgerApplied = rawDecisions.length > 0;
  }

  const records: QualityRecord[] = rawRecords.map((r) => {
    const o = objectTextOf(r.source_fact, r.context_label);
    return {
      id: r.id,
      sessionId: r.session_id,
      sourceFilename: r.source_filename,
      personId: r.organization_person_id,
      workObjectId: r.work_object_id,
      activityDate: r.activity_date,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      hours: r.hours === null ? null : Number(r.hours),
      objectText: o.text,
      objectListLength: o.listLength,
    };
  });
  const projects: QualityProjectRow[] = rawProjects.map((p) => ({
    id: p.id,
    title: p.title,
    recordState: p.record_state ?? "active",
    canonicalProjectId: p.canonical_project_id,
    historical: !!p.historical_key,
  }));
  const projectOfObject = new Map(rawObjects.filter((o) => o.project_id).map((o) => [o.id, o.project_id!]));
  const titleOf = new Map(rawProjects.map((p) => [p.id, p.title]));
  const decisions = rawDecisions.map((d) => ({
    id: d.id,
    title: titleOf.get(d.project_id) ?? null,
    projectId: d.project_id,
    canonicalProjectId: d.canonical_project_id,
    decision: d.decision,
    mismatchTypes: d.mismatch_types ?? [],
    certainty: d.certainty,
    conflicts: d.conflicts ?? [],
    originalText: d.original_text,
    normalizedName: d.normalized_name,
    ruleVersion: d.rule_version,
    decidedAt: d.decided_at,
    reverted: !!d.reverted_at,
  }));

  const t0 = performance.now();
  const quality = buildHistoryQuality({ records, projects, projectOfObject, decisions });
  const foldMs = Math.round(performance.now() - t0);
  return { kind: "ready", organizationName: org.organizationName, quality, decisions, ledgerApplied, foldMs };
}
