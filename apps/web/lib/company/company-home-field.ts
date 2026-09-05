import "server-only";

import { loadProjectRiskForChat } from "@/lib/conversation/project-risk";
import type { ProjectRiskRow } from "@/lib/conversation/project-risk-contract";
import { loadWhoIsAvailableForChat } from "@/lib/conversation/capacity";
import type { CapacityChatResult } from "@/lib/conversation/capacity-contract";
import { loadEmployerOpeningBrief, type OpeningBrief } from "@/lib/conversation/opening-brief";
import { listProjectStages } from "@/lib/projects/stages";
import { listProjectAssignments } from "@/lib/projects/projects";
import {
  COMPANY_HOME_PEOPLE_CHIP_LIMIT,
  COMPANY_HOME_PROJECT_LIMIT,
  deriveStageTimeline,
  unpackRiskSignals,
  type RiskSignal,
  type StageTimeline,
} from "@/lib/company/company-home-field-model";

/**
 * The organisation's home field — ONE composition of the reads the chat
 * already answers with (frozen design contract §5 P5: `employer-workspace`,
 * `capacity`, `attention-brief`, project reads; §2.6 C1 = projects in time
 * × capacity). This module duplicates no source record and writes nothing:
 *
 *   projects + risk   → loadProjectRiskForChat()   (the chat's "which project
 *                       is at risk" — ≤ PROJECT_RISK_SCAN_LIMIT live projects,
 *                       each through the panel's own detail read)
 *   now / next        → listProjectStages()         (the canonical stages read,
 *                       one bounded query per shown project) — derived in the
 *                       pure model, "next" marked DERIVED
 *   people on it      → listProjectAssignments()    (the project panel's read;
 *                       names capped per row, the count is the risk row's)
 *   who is free       → loadWhoIsAvailableForChat() (the chat's capacity answer)
 *   needs you         → loadEmployerOpeningBrief()  (the chat's opening brief)
 *
 * Every source degrades on its own into a named state — a failed read is
 * never a calm empty block (owner contract §1 rule 3: real state, never
 * decoration). Bounded: ≤ 6 projects × (1 stages + 1 assignments query).
 * The remaining objects (needs, partners) are rows the company page ALREADY
 * reads for its other sections and are passed in, not read twice.
 */

export interface HomeProjectRow {
  readonly projectId: string;
  readonly title: string;
  readonly status: ProjectRiskRow["status"];
  readonly people: number;
  readonly peopleNames: readonly string[];
  readonly timeline: StageTimeline;
  readonly riskKnown: boolean;
  readonly risk: readonly RiskSignal[];
}

export type HomeProjectsResult =
  | { readonly kind: "ok"; readonly rows: readonly HomeProjectRow[]; readonly total: number }
  | { readonly kind: "empty" }
  | { readonly kind: "no-company" }
  | { readonly kind: "error" };

export interface CompanyHomeField {
  readonly projects: HomeProjectsResult;
  readonly capacity: CapacityChatResult;
  readonly attention: OpeningBrief | { readonly kind: "unavailable" };
}

async function loadProjectRows(): Promise<HomeProjectsResult> {
  const risk = await loadProjectRiskForChat();
  if (risk.kind !== "ok") return risk;
  const scanned = risk.rows.slice(0, COMPANY_HOME_PROJECT_LIMIT);
  const rows = await Promise.all(
    scanned.map(async (r): Promise<HomeProjectRow> => {
      // Each read guards itself: an unreadable stage list becomes the honest
      // "unavailable" state, an unreadable roster leaves the count (which the
      // risk row already carries) and drops only the names.
      const [stagesData, assignments] = await Promise.all([
        listProjectStages(r.projectId).catch(() => ({ applied: false as const })),
        listProjectAssignments(r.projectId).catch(() => []),
      ]);
      const timeline = deriveStageTimeline(stagesData.applied ? stagesData.stages : null);
      const unpacked = unpackRiskSignals(r);
      return {
        projectId: r.projectId,
        title: r.title,
        status: r.status,
        people: r.people,
        peopleNames: assignments.slice(0, COMPANY_HOME_PEOPLE_CHIP_LIMIT).map((a) => a.name),
        timeline,
        riskKnown: unpacked.known,
        risk: unpacked.signals,
      };
    }),
  );
  return { kind: "ok", rows, total: risk.total };
}

export async function loadCompanyHomeField(): Promise<CompanyHomeField> {
  const [projects, capacity, attention] = await Promise.all([
    loadProjectRows().catch((): HomeProjectsResult => ({ kind: "error" })),
    loadWhoIsAvailableForChat().catch((): CapacityChatResult => ({ kind: "error" })),
    // HONESTY (QA Q-2): a failed brief read is "unavailable", never "all clear".
    loadEmployerOpeningBrief().catch((): { kind: "unavailable" } => ({ kind: "unavailable" })),
  ]);
  return { projects, capacity, attention };
}
