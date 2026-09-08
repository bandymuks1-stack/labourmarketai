import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getWorkerDocumentCentre } from "@/lib/documents/document-centre";
import { getWorkerCriteriaSnapshot } from "@/lib/conversation/worker-activity";
import { deriveDocumentGap, type DocumentGap } from "@/lib/conversation/documents-gap";

/**
 * DOCUMENT GAP — the canonical use case for the conversation (owner contract
 * 2026-09-04 §12). The ONE place the chat reads a person's documents from:
 * the same document-centre read the documents page renders + the same
 * criteria snapshot the search uses for WHERE the person wants to work.
 * The AI workflow layer never queries; it enters this use case.
 *
 * Countries are the person's own stated preferences (at most three). An
 * empty list is returned as such — the answer must ASK, never guess a
 * country. Every degraded state is a named kind, never an empty inventory
 * pretending to be "no documents".
 */
export type WorkerDocumentGapResult =
  | { readonly kind: "ok"; readonly gap: DocumentGap; readonly countries: readonly string[] }
  | { readonly kind: "no-worker" }
  | { readonly kind: "unavailable" };

const COUNTRY_CAP = 3;

export async function loadWorkerDocumentGap(): Promise<WorkerDocumentGapResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "no-worker" };
    const [centre, snapshot] = await Promise.all([
      getWorkerDocumentCentre(),
      getWorkerCriteriaSnapshot(user.id),
    ]);
    if (centre.inventory.kind === "no-worker") return { kind: "no-worker" };
    if (centre.inventory.kind !== "ok") return { kind: "unavailable" };
    const countries = (snapshot?.preferredCountries ?? []).slice(0, COUNTRY_CAP);
    const readiness = centre.inventory.readiness;
    return {
      kind: "ok",
      countries,
      gap: deriveDocumentGap(readiness.documents, readiness.requirements, countries, new Date()),
    };
  } catch {
    return { kind: "unavailable" };
  }
}
