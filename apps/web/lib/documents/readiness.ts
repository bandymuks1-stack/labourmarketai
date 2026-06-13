import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENT_COUNTRIES,
  DOCUMENT_EXPIRING_WINDOW_DAYS,
  DOCUMENTS_READINESS_ENABLED,
} from "@/lib/config/documents";
import { matrixRequirementRows } from "@/lib/country-readiness/requirement-rows";

/**
 * Worker documents → country readiness derivation (S3, design doc §2).
 *
 * HONESTY: statuses are the worker's own input plus date arithmetic — never
 * a system verification, never legal compliance. "Expiring" and "expired"
 * are DERIVED here from valid_until (doctrine §6 — never stored). When a
 * country has NO curated requirement rows yet, the result says so honestly
 * (requirementsKnown=false) instead of pretending "all good".
 *
 * Degrades: flag off OR tables absent (42P01 — draft migration not applied)
 * → needs-migration/disabled results, never an error surface.
 */

const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Stored base status + the two derived states. */
export type DerivedDocumentStatus =
  | "missing"
  | "ready"
  | "expiring"
  | "blocked";

export interface WorkerDocumentRow {
  readonly id: string;
  readonly documentTypeSlug: string;
  readonly country: string | null;
  readonly storedStatus: "missing" | "ready" | "blocked";
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly note: string | null;
}

export interface RequirementRow {
  readonly country: string;
  readonly documentTypeSlug: string;
  readonly requirementLevel: "required" | "recommended" | "conditional";
  readonly conditionNote: string | null;
  readonly sourceStatus: "needs_legal_source" | "sourced" | "reviewed";
  /** Official source backing this requirement (matrix-supplied; optional for
   *  legacy DB rows that predate the country-readiness matrix). */
  readonly sourceUrl?: string | null;
  readonly sourceTitle?: string | null;
  readonly confidence?: "official" | "strong" | "needs_legal_review" | null;
}

/** Pure: derive the user-visible status of one document at `now`. An expired
 *  document counts as MISSING (it no longer covers the worker). */
export function deriveDocumentStatus(
  doc: Pick<WorkerDocumentRow, "storedStatus" | "validUntil">,
  now: Date,
): DerivedDocumentStatus {
  if (doc.storedStatus === "blocked") return "blocked";
  if (doc.storedStatus === "missing") return "missing";
  if (doc.validUntil) {
    const until = new Date(`${doc.validUntil}T23:59:59Z`);
    if (until.getTime() < now.getTime()) return "missing";
    const windowMs = DOCUMENT_EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (until.getTime() - now.getTime() < windowMs) return "expiring";
  }
  return "ready";
}

export interface CountryReadinessItem {
  readonly documentTypeSlug: string;
  readonly requirementLevel: RequirementRow["requirementLevel"];
  readonly sourceStatus: RequirementRow["sourceStatus"];
  readonly status: DerivedDocumentStatus;
  readonly validUntil: string | null;
  readonly sourceUrl: string | null;
  readonly sourceTitle: string | null;
  readonly confidence: "official" | "strong" | "needs_legal_review" | null;
}

export interface CountryReadiness {
  readonly country: string;
  /** false → no curated requirement rows yet; UI must say so honestly. */
  readonly requirementsKnown: boolean;
  readonly items: readonly CountryReadinessItem[];
  /** First missing required/conditional doc — the single next action. */
  readonly nextActionSlug: string | null;
}

/** Pure: join the worker's documents against a country's requirements. */
export function computeCountryReadiness(
  country: string,
  documents: readonly WorkerDocumentRow[],
  requirements: readonly RequirementRow[],
  now: Date,
): CountryReadiness {
  const relevant = requirements.filter((r) => r.country === country);
  if (relevant.length === 0) {
    return { country, requirementsKnown: false, items: [], nextActionSlug: null };
  }
  const items: CountryReadinessItem[] = relevant.map((req) => {
    // A country-scoped document wins over a generic one of the same type.
    const doc =
      documents.find(
        (d) => d.documentTypeSlug === req.documentTypeSlug && d.country === country,
      ) ??
      documents.find(
        (d) => d.documentTypeSlug === req.documentTypeSlug && d.country === null,
      );
    return {
      documentTypeSlug: req.documentTypeSlug,
      requirementLevel: req.requirementLevel,
      sourceStatus: req.sourceStatus,
      status: doc ? deriveDocumentStatus(doc, now) : "missing",
      validUntil: doc?.validUntil ?? null,
      sourceUrl: req.sourceUrl ?? null,
      sourceTitle: req.sourceTitle ?? null,
      confidence: req.confidence ?? null,
    };
  });
  const nextAction = items.find(
    (i) => i.status === "missing" && i.requirementLevel !== "recommended",
  );
  return {
    country,
    requirementsKnown: true,
    items,
    nextActionSlug: nextAction?.documentTypeSlug ?? null,
  };
}

export type DocumentsListResult =
  | {
      kind: "ok";
      documents: readonly WorkerDocumentRow[];
      requirements: readonly RequirementRow[];
      typeSlugs: readonly string[];
      /** availability_status==='available' OR an available_from date set. */
      availabilitySet: boolean;
    }
  | { kind: "disabled" }
  | { kind: "needs-migration" }
  | { kind: "no-worker" }
  | { kind: "error"; message: string };

export async function listMyDocuments(): Promise<DocumentsListResult> {
  if (!DOCUMENTS_READINESS_ENABLED) return { kind: "disabled" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };

  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id, availability_status, available_from")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return { kind: "no-worker" };
  const availabilitySet =
    worker.availability_status === "available" ||
    Boolean(worker.available_from);

  const { data: docs, error } = await asAny(supabase)
    .from("worker_documents")
    .select(
      "id, document_type_slug, country, status, valid_from, valid_until, note",
    )
    .eq("worker_id", worker.id);
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }

  const [{ data: reqs }, { data: types }] = await Promise.all([
    asAny(supabase)
      .from("country_document_requirements")
      .select("country, document_type_slug, requirement_level, condition_note, source_status"),
    asAny(supabase).from("document_types").select("slug").eq("is_active", true),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbRequirements: RequirementRow[] = ((reqs ?? []) as any[]).map((r) => ({
    country: r.country as string,
    documentTypeSlug: r.document_type_slug as string,
    requirementLevel: r.requirement_level as RequirementRow["requirementLevel"],
    conditionNote: (r.condition_note as string | null) ?? null,
    sourceStatus: r.source_status as RequirementRow["sourceStatus"],
    sourceUrl: null,
    sourceTitle: null,
    confidence: null,
  }));

  // The DB country_document_requirements table is the admin OVERRIDE surface
  // and ships empty. Where a country has NO curated DB rows, supply the
  // canonical, guard-enforced matrix rows (worker_posted scope — the platform's
  // cross-border core) so the worker gets a real, sourced checklist now.
  const dbCountries = new Set(dbRequirements.map((r) => r.country));
  const matrixRequirements: RequirementRow[] = [];
  for (const country of DOCUMENT_COUNTRIES) {
    if (dbCountries.has(country)) continue;
    for (const m of matrixRequirementRows(country, "worker_posted")) {
      matrixRequirements.push({
        country: m.country,
        documentTypeSlug: m.documentTypeSlug,
        requirementLevel: m.requirementLevel,
        conditionNote: m.conditionNote,
        sourceStatus: m.sourceStatus,
        sourceUrl: m.sourceUrl,
        sourceTitle: m.sourceTitle,
        confidence: m.confidence,
      });
    }
  }

  return {
    kind: "ok",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    documents: ((docs ?? []) as any[]).map((d) => ({
      id: d.id as string,
      documentTypeSlug: d.document_type_slug as string,
      country: (d.country as string | null) ?? null,
      storedStatus: d.status as "missing" | "ready" | "blocked",
      validFrom: (d.valid_from as string | null) ?? null,
      validUntil: (d.valid_until as string | null) ?? null,
      note: (d.note as string | null) ?? null,
    })),
    requirements: [...dbRequirements, ...matrixRequirements],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeSlugs: ((types ?? []) as any[]).map((t) => t.slug as string),
    availabilitySet,
  };
}
