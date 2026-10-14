/**
 * IMPORTED HISTORY — DATA QUALITY, BEFORE AND AFTER (pure; owner 2026-10-14).
 *
 * A messy timesheet import is not a failure to hide; every mismatch is a
 * measurable fact. This folds what the store already holds — the records
 * (never changed), the project rows the import created, the consolidation
 * ledger (historical_consolidation_decisions) — into:
 *
 *   before   what the import produced: project rows, records, hours, people
 *   after    real objects, merged fragments, records linked to a project,
 *            people with a project history, what remains unresolved
 *   bySession / byProject   the same, per source file and per kept project
 *   register  every recorded mismatch (ledger) + record-level categories
 *
 * Invariant the tests pin: consolidation moves NO record and NO hour — the
 * record count, hours and people are identical before and after.
 */

export interface QualityRecord {
  readonly id: string;
  readonly sessionId: string | null;
  readonly sourceFilename: string | null;
  readonly personId: string;
  readonly workObjectId: string | null;
  readonly activityDate: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly hours: number | null;
  /** The object text the source row carried (object / addresses / codes / label). */
  readonly objectText: string;
  /** The source stated several objects (an array with >1 entry). */
  readonly objectListLength: number;
}

export interface QualityProjectRow {
  readonly id: string;
  readonly title: string | null;
  readonly recordState: string;
  readonly canonicalProjectId: string | null;
  readonly historical: boolean;
}

export interface QualityDecision {
  readonly projectId: string;
  readonly canonicalProjectId: string | null;
  readonly decision: "merged" | "canonical" | "kept_separate";
  readonly mismatchTypes: readonly string[];
  readonly certainty: "unambiguous" | "probable" | "none";
  readonly conflicts: readonly unknown[];
  readonly originalText: string;
  readonly normalizedName: string;
  readonly ruleVersion: string;
  readonly decidedAt: string;
  readonly reverted: boolean;
}

export type UnplacedKind = "no_object" | "multiple_objects" | "single_unmatched";

const MULTI = /[;+]|\s(ir|and|en)\s|,\s*\S+.*,/i;

/** Why a record has no work object — from its own source text. */
export function unplacedKind(r: Pick<QualityRecord, "objectText" | "objectListLength">): UnplacedKind {
  const text = r.objectText.trim();
  if (!text || text === "[]" || text === "-" || text === "null") return "no_object";
  if (r.objectListLength > 1 || MULTI.test(text)) return "multiple_objects";
  // Two object codes, or two street + number parts, name two objects even
  // with a single separator ("W22.073 (…), W22.057 (…)").
  const codes = new Set([...text.matchAll(/[Ww]22[.:](\d{3})/g)].map((m) => m[1]));
  const addressParts = text.split(/[,/|]/).filter((p) => /[A-Za-zÀ-ž]{3,}\s*\d+/.test(p)).length;
  if (codes.size > 1 || addressParts > 1) return "multiple_objects";
  return "single_unmatched";
}

const isDay = (r: QualityRecord) => !!r.activityDate;

export interface HistoryQuality {
  readonly before: {
    readonly importedProjectRows: number;
    readonly records: number;
    readonly hours: number;
    readonly people: number;
    readonly sources: number;
  };
  readonly after: {
    readonly realProjects: number;
    readonly mergedRows: number;
    readonly records: number;
    readonly hours: number;
    readonly people: number;
    readonly recordsOnAProject: number;
    readonly hoursOnAProject: number;
    readonly peopleWithProjectHistory: number;
    readonly unplaced: Readonly<Record<UnplacedKind, { records: number; hours: number }>>;
    /** Person-days whose same-day records add up to more than 16 h in one source. */
    readonly dateConflicts: { personDays: number; records: number };
    readonly probableMerges: number;
    readonly recordedConflicts: number;
  };
  /**
   * How the imported rows became the kept projects (owner 2026-10-14):
   * imported = keptUntouched + keptAsCanonical + merged; kept = imported - merged.
   */
  readonly path: {
    readonly imported: number;
    readonly merged: number;
    readonly intoProjects: number;
    readonly keptUntouched: number;
    readonly kept: number;
  };
  /**
   * The three tiers, never mixed: what the rule established from the data
   * alone, what it linked as probable (one undo away), and what it left
   * unresolved as a recorded contradiction.
   */
  readonly tiers: {
    readonly established: { readonly merges: number; readonly groups: number };
    readonly probable: readonly {
      readonly canonicalProjectId: string;
      readonly canonicalText: string;
      readonly variants: readonly string[];
    }[];
    readonly unresolved: readonly {
      readonly projectId: string;
      readonly originalText: string;
      readonly decision: QualityDecision["decision"];
      readonly kinds: readonly string[];
    }[];
  };
  readonly mismatchCounts: Readonly<Record<string, number>>;
  readonly bySession: readonly {
    readonly sessionId: string | null;
    readonly source: string | null;
    readonly records: number;
    readonly hours: number;
    readonly people: number;
    readonly onAProject: number;
    readonly unplaced: number;
  }[];
  readonly byProject: readonly {
    readonly projectId: string;
    readonly title: string | null;
    readonly importedRows: number;
    readonly records: number;
    readonly hours: number;
    readonly people: number;
    readonly firstDate: string | null;
    readonly lastDate: string | null;
    readonly certainty: string | null;
    readonly variants: readonly string[];
  }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildHistoryQuality(input: {
  readonly records: readonly QualityRecord[];
  readonly projects: readonly QualityProjectRow[];
  readonly projectOfObject: ReadonlyMap<string, string>;
  readonly decisions: readonly QualityDecision[];
}): HistoryQuality {
  const { records, projects, projectOfObject, decisions } = input;
  const historical = projects.filter((p) => p.historical);
  const canonicalOf = new Map(
    historical.filter((p) => p.recordState === "duplicate" && p.canonicalProjectId).map((p) => [p.id, p.canonicalProjectId!]),
  );
  const keptProjectOf = (objectId: string | null): string | null => {
    if (!objectId) return null;
    const pid = projectOfObject.get(objectId);
    if (!pid) return null;
    return canonicalOf.get(pid) ?? pid;
  };

  const sumH = (rs: readonly QualityRecord[]) => round(rs.reduce((s, r) => s + (r.hours ?? 0), 0));
  const people = (rs: readonly QualityRecord[]) => new Set(rs.map((r) => r.personId)).size;
  const onProject = records.filter((r) => keptProjectOf(r.workObjectId));
  const unplacedRecs = records.filter((r) => !r.workObjectId);
  const unplaced = { no_object: { records: 0, hours: 0 }, multiple_objects: { records: 0, hours: 0 }, single_unmatched: { records: 0, hours: 0 } };
  for (const r of unplacedRecs) {
    const k = unplacedKind(r);
    unplaced[k].records += 1;
    unplaced[k].hours = round(unplaced[k].hours + (r.hours ?? 0));
  }

  // Same person, same date, same source, more than 16 h: the dates were
  // resolved wrongly (one day label reused across weeks), the hours are real.
  const day = new Map<string, QualityRecord[]>();
  for (const r of records.filter(isDay)) {
    const k = `${r.sessionId}|${r.personId}|${r.activityDate}`;
    const arr = day.get(k);
    if (arr) arr.push(r);
    else day.set(k, [r]);
  }
  const conflicted = [...day.values()].filter((rs) => rs.length > 1 && sumH(rs) > 16);

  const live = decisions.filter((d) => !d.reverted);
  const mismatchCounts: Record<string, number> = {};
  for (const d of decisions) for (const t of d.mismatchTypes) mismatchCounts[t] = (mismatchCounts[t] ?? 0) + 1;
  mismatchCounts.date_conflict_person_days = conflicted.length;
  for (const k of Object.keys(unplaced) as UnplacedKind[]) mismatchCounts[`unplaced_${k}`] = unplaced[k].records;

  const sessions = new Map<string, QualityRecord[]>();
  for (const r of records) {
    const k = r.sessionId ?? "-";
    const arr = sessions.get(k);
    if (arr) arr.push(r);
    else sessions.set(k, [r]);
  }

  const kept = historical.filter((p) => p.recordState !== "duplicate");
  const byProject = kept
    .map((p) => {
      const rows = historical.filter((x) => x.id === p.id || canonicalOf.get(x.id) === p.id);
      const recs = records.filter((r) => keptProjectOf(r.workObjectId) === p.id);
      const dates = recs.flatMap((r) => [r.activityDate, r.periodStart, r.periodEnd]).filter((d): d is string => !!d).sort();
      const decision = live.find((d) => d.projectId === p.id);
      const variants = live
        .filter((d) => d.projectId === p.id || d.canonicalProjectId === p.id)
        .map((d) => d.originalText)
        .slice(0, 6);
      return {
        projectId: p.id,
        title: p.title,
        importedRows: rows.length,
        records: recs.length,
        hours: sumH(recs),
        people: people(recs),
        firstDate: dates[0] ?? null,
        lastDate: dates[dates.length - 1] ?? null,
        certainty: rows.length > 1 ? (live.some((d) => d.canonicalProjectId === p.id && d.certainty === "probable") ? "probable" : "unambiguous") : decision?.certainty ?? null,
        variants,
      };
    })
    .sort((a, b) => b.importedRows - a.importedRows || b.records - a.records);

  // A merge counts as established or probable by its ledger row only, and
  // only while its marker is live — a marker without a ledger row is neither.
  const liveMerges = live.filter((d) => d.decision === "merged" && d.canonicalProjectId && canonicalOf.get(d.projectId) === d.canonicalProjectId);
  const established = liveMerges.filter((d) => d.certainty === "unambiguous");
  const probableMerges = liveMerges.filter((d) => d.certainty === "probable");
  const textOf = new Map(live.map((d) => [d.projectId, d.originalText]));
  const probableByCanonical = new Map<string, string[]>();
  for (const d of probableMerges) {
    const arr = probableByCanonical.get(d.canonicalProjectId!);
    if (arr) arr.push(d.originalText);
    else probableByCanonical.set(d.canonicalProjectId!, [d.originalText]);
  }
  const conflictKind = (c: unknown) =>
    c && typeof c === "object" && typeof (c as { kind?: unknown }).kind === "string" ? (c as { kind: string }).kind : "recorded";
  const canonicals = new Set(canonicalOf.values());

  return {
    before: {
      importedProjectRows: historical.length,
      records: records.length,
      hours: sumH(records),
      people: people(records),
      sources: sessions.size,
    },
    after: {
      realProjects: kept.length,
      mergedRows: historical.length - kept.length,
      records: records.length,
      hours: sumH(records),
      people: people(records),
      recordsOnAProject: onProject.length,
      hoursOnAProject: sumH(onProject),
      peopleWithProjectHistory: people(onProject),
      unplaced,
      dateConflicts: { personDays: conflicted.length, records: conflicted.reduce((n, rs) => n + rs.length, 0) },
      probableMerges: live.filter((d) => d.decision === "merged" && d.certainty === "probable").length,
      recordedConflicts: live.filter((d) => d.conflicts.length > 0).length,
    },
    path: {
      imported: historical.length,
      merged: canonicalOf.size,
      intoProjects: canonicals.size,
      keptUntouched: kept.filter((p) => !canonicals.has(p.id)).length,
      kept: kept.length,
    },
    tiers: {
      established: { merges: established.length, groups: new Set(established.map((d) => d.canonicalProjectId)).size },
      probable: [...probableByCanonical.entries()].map(([canonicalProjectId, variants]) => ({
        canonicalProjectId,
        canonicalText: textOf.get(canonicalProjectId) ?? historical.find((p) => p.id === canonicalProjectId)?.title ?? "—",
        variants,
      })),
      unresolved: live
        .filter((d) => d.conflicts.length > 0)
        .map((d) => ({ projectId: d.projectId, originalText: d.originalText, decision: d.decision, kinds: [...new Set(d.conflicts.map(conflictKind))] })),
    },
    mismatchCounts,
    bySession: [...sessions.entries()]
      .map(([sessionId, rs]) => ({
        sessionId: sessionId === "-" ? null : sessionId,
        source: rs[0]?.sourceFilename ?? null,
        records: rs.length,
        hours: sumH(rs),
        people: people(rs),
        onAProject: rs.filter((r) => keptProjectOf(r.workObjectId)).length,
        unplaced: rs.filter((r) => !r.workObjectId).length,
      }))
      .sort((a, b) => (a.source ?? "").localeCompare(b.source ?? "")),
    byProject,
  };
}
