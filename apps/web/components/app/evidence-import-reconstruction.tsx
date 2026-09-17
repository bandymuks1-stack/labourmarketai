import type { ReactNode } from "react";

import { HistoricalWorkspace } from "@/components/app/historical/historical-workspace";
import type { Option } from "@/components/app/evidence-import-forms";
import type { EvidenceImportActionState } from "@/lib/organization-evidence/import-actions";
import type { ImportProjection } from "@/lib/organization-evidence/import-projections";

/**
 * THE RECONSTRUCTION — "this is how your company actually worked", read
 * from the staged source before anything is written (owner commands
 * 2026-09-16 §39–§40, §57; post-#1748 §2, §5–§9; the LABOURMARKET_VISUAL_FIRST
 * constitution of the same day, §H–§I, §BB).
 *
 * It is ONE workspace, not a document: a top state (period · people ·
 * objects · person-days · hours · aggregates apart · decisions), six modes
 * that REPLACE the central surface — Overview, People, Field, Objects,
 * Calendar, Attention — and a persistent decision bar carrying the existing
 * commit control. The earlier sequence of eight stacked sections (sentence,
 * issues, seven expanded cards, field, a 17-row place report, a weekly
 * table called "Calendar", two prose boxes, an impact list) was rejected by
 * the owner's human walk as a report disguised as a product.
 *
 * Every figure is a projection of staged rows. Nothing here is a record,
 * nothing here writes. This server component only hands the projection, the
 * staging-only actions and the section's commit node to the client
 * workspace — never a formatter function (history-client-boundary guard).
 */

type Action = (prev: EvidenceImportActionState, form: FormData) => Promise<EvidenceImportActionState>;

export async function EvidenceImportReconstruction({
  locale,
  sessionId,
  projection,
  workObjects,
  actions,
  errors,
  commit,
  readyCount,
  sourceRowsId,
}: {
  locale: string;
  sessionId: string;
  projection: ImportProjection;
  /** The organization's existing objects, for a label-level choice. */
  workObjects: readonly Option[];
  actions: { readonly resolveLabel: Action; readonly resolveTime: Action };
  errors: Record<string, string>;
  /** The plan block and the commit form, rendered by the section. */
  commit: ReactNode;
  readyCount: number;
  sourceRowsId: string;
}) {
  return (
    <HistoricalWorkspace
      locale={locale}
      sessionId={sessionId}
      projection={projection}
      workObjects={workObjects}
      actions={actions}
      errors={errors}
      commit={commit}
      readyCount={readyCount}
      sourceRowsId={sourceRowsId}
    />
  );
}
