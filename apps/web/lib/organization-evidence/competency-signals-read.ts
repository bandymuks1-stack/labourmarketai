import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * COMPETENCY SIGNALS → THE SUBJECT (2026-09-20).
 *
 * `organization_evidence_competency_signals` was WRITTEN on every commit
 * (`import-core.ts`, through `competency-signals.ts`) and read by nothing:
 * the RLS subject branch admitted the linked person from day one
 * (migration …organization_evidence_import_v1.sql), and no surface asked.
 * So the chain WORK → EVIDENCE → SUGGESTION stopped at EVIDENCE for
 * imported history. This is the subject's bounded read of those signals,
 * grouped by canonical skill — the SOURCE a suggestion list is built from.
 *
 * A signal is DERIVED from the organization's words about the person's
 * work; it is never a fact about the person and never verified (SEP-1,
 * SEP-3). What comes out here is what a suggestion needs and nothing more:
 * which canonical skill, the terms that named it, in how many records.
 *
 * Bounded: the caller passes the record ids it already holds (≤ the
 * profile's own record read), and the read stops at `SIGNAL_READ_LIMIT`.
 * Honest degradation: a missing table is an EMPTY set, a failed read is
 * `error` — never "no skill was named".
 */

const MISSING_OBJECT_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const SIGNAL_READ_LIMIT = 400;
/** Record ids per `.in()` — a URL-length bound, not a coverage cap. */
const RECORD_ID_CHUNK = 100;

export interface SubjectCompetencySignal {
  /** Canonical skill slug (the value an acceptance writes). */
  readonly slug: string;
  /** The phrases in the organization's records that named it, distinct,
   *  as written — the WHY a person may disagree with. */
  readonly terms: readonly string[];
  /** Distinct records the skill was named in. */
  readonly records: number;
  /** The strongest stored confidence (0..1) — carried, never rounded up. */
  readonly confidence: number;
}

export type SubjectCompetencySignalsRead =
  | { readonly kind: "ok"; readonly signals: readonly SubjectCompetencySignal[]; readonly truncated: boolean }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

export async function readSubjectCompetencySignals(
  supabase: SupabaseClient,
  recordIds: readonly string[],
): Promise<SubjectCompetencySignalsRead> {
  if (recordIds.length === 0) return { kind: "ok", signals: [], truncated: false };

  type Row = { record_id: string; term: string; skill_slug: string | null; confidence: number | string | null };
  const rows: Row[] = [];
  let truncated = false;
  for (let i = 0; i < recordIds.length; i += RECORD_ID_CHUNK) {
    const chunk = recordIds.slice(i, i + RECORD_ID_CHUNK);
    const res = await db(supabase)
      .from("organization_evidence_competency_signals")
      .select("record_id, term, skill_slug, confidence")
      .in("record_id", chunk)
      .not("skill_slug", "is", null)
      .order("confidence", { ascending: false })
      .limit(SIGNAL_READ_LIMIT);
    if (res.error) {
      if (MISSING_OBJECT_CODES.has(res.error.code ?? "")) return { kind: "needs-migration" };
      console.error("[evidence] competency signals read failed:", res.error.code);
      return { kind: "error" };
    }
    const got = (res.data ?? []) as Row[];
    if (got.length >= SIGNAL_READ_LIMIT) truncated = true;
    rows.push(...got);
  }

  const bySlug = new Map<
    string,
    { terms: Set<string>; records: Set<string>; confidence: number }
  >();
  for (const r of rows) {
    const slug = (r.skill_slug ?? "").trim();
    if (!slug) continue;
    const entry = bySlug.get(slug) ?? { terms: new Set<string>(), records: new Set<string>(), confidence: 0 };
    const term = (r.term ?? "").trim();
    if (term) entry.terms.add(term);
    entry.records.add(r.record_id);
    const c = Number(r.confidence);
    if (Number.isFinite(c) && c > entry.confidence) entry.confidence = Math.min(1, c);
    bySlug.set(slug, entry);
  }

  const signals: SubjectCompetencySignal[] = [...bySlug.entries()]
    .map(([slug, e]) => ({
      slug,
      terms: [...e.terms].slice(0, 6),
      records: e.records.size,
      confidence: e.confidence,
    }))
    // Most-evidenced first: more records, then stronger match, then name.
    .sort(
      (a, b) =>
        b.records - a.records ||
        b.confidence - a.confidence ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
  return { kind: "ok", signals, truncated };
}
