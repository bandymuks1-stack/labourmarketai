/**
 * Operator candidate pool — SERVER loader (Staffing Operating Model v1, PR7).
 *
 * Read-only. Reuses the matching-workbench supply query (existing `workers` +
 * skill/journal counts, admin-RLS-scoped) and maps each worker to an honest
 * CandidateView (evidence status + missing info). No write, no migration, no new
 * table. The page is admin-gated (requireSuperadmin) before this runs.
 */
import "server-only";
import { listWorkbench } from "@/lib/admin/matching-workbench";
import { toCandidateView, type CandidateView } from "./candidate-pool-core";

export type CandidatePoolResult =
  | { readonly kind: "ok"; readonly candidates: CandidateView[] }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error"; readonly message: string };

export async function loadCandidatePool(
  locale = "en",
): Promise<CandidatePoolResult> {
  const wb = await listWorkbench(locale);
  if (wb.kind === "needs-migration") return { kind: "needs-migration" };
  if (wb.kind === "error") return { kind: "error", message: wb.message };
  return { kind: "ok", candidates: wb.supply.map((s) => toCandidateView(s)) };
}
