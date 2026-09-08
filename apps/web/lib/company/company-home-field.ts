import "server-only";

import { loadProjectRiskForChat } from "@/lib/conversation/project-risk";
import type { ProjectRiskRow } from "@/lib/conversation/project-risk-contract";
import { loadWhoIsAvailableForChat } from "@/lib/conversation/capacity";
import type { CapacityChatResult } from "@/lib/conversation/capacity-contract";
import { loadEmployerOpeningBrief, type OpeningBrief } from "@/lib/conversation/opening-brief";
import { listProjectStages } from "@/lib/projects/stages";
import { listProjectAssignments } from "@/lib/projects/projects";
import type { CompanyWorkersListResult } from "@/lib/company/company-workers";
import {
  COMPANY_HOME_PEOPLE_CHIP_LIMIT,
  COMPANY_HOME_PROJECT_LIMIT,
  carriedPeopleNames,
  carriedStages,
  deriveStageTimeline,
  unpackRiskSignals,
  type RiskSignal,
  type StageTimeline,
  type TimelineStage,
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
 *   now / next        → the stages THAT READ already returned, carried on the
 *                       risk row (QA Q-3) — derived in the pure model, "next"
 *                       marked DERIVED; `listProjectStages()` runs only when a
 *                       row carries none or a list the panel's bound cut short
 *   people on it      → the roster names the same read returned; the panel's
 *                       `listProjectAssignments()` only as the same fallback
 *                       (names capped per row, the count is the risk row's)
 *   who is free       → loadWhoIsAvailableForChat() (the chat's capacity answer;
 *                       the company page hands in the roster read it already
 *                       awaits, so the roster is queried once per request)
 *   needs you         → loadEmployerOpeningBrief()  (the chat's opening brief)
 *
 * Every source degrades on its own into a named state — a failed read is
 * never a calm empty block (owner contract §1 rule 3: real state, never
 * decoration). Bounded: ≤ 6 projects, and in the common case ZERO queries
 * beyond the risk read itself (≤ 6 × (1 stages + 1 assignments) only as the
 * fallback above). The remaining objects (needs, partners) are rows the
 * company page ALREADY reads for its other sections and are passed in, not
 * read twice.
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
      // QA Q-3: the risk row went through the panel's detail read already —
      // its stages and roster names are reused; the canonical reads run only
      // when the row carries nothing usable (`carriedStages` /
      // `carriedPeopleNames` hold the completeness rule). Each fallback read
      // guards itself: an unreadable stage list becomes the honest
      // "unavailable" state, an unreadable roster leaves the count (which the
      // risk row already carries) and drops only the names.
      const carried = carriedStages(r);
      const names = carriedPeopleNames(r);
      const [stages, peopleNames] = await Promise.all([
        carried !== undefined
          ? Promise.resolve<readonly TimelineStage[] | null>(carried)
          : listProjectStages(r.projectId)
              .then((d): readonly TimelineStage[] | null => (d.applied ? d.stages : null))
              .catch((): null => null),
        names !== undefined
          ? Promise.resolve<readonly string[]>(names)
          : listProjectAssignments(r.projectId)
              .then((a): readonly string[] =>
                a.slice(0, COMPANY_HOME_PEOPLE_CHIP_LIMIT).map((x) => x.name),
              )
              .catch((): readonly string[] => []),
      ]);
      const timeline = deriveStageTimeline(stages);
      const unpacked = unpackRiskSignals(r);
      return {
        projectId: r.projectId,
        title: r.title,
        status: r.status,
        people: r.people,
        peopleNames,
        timeline,
        riskKnown: unpacked.known,
        risk: unpacked.signals,
      };
    }),
  );
  return { kind: "ok", rows, total: risk.total };
}

export interface CompanyHomeFieldInput {
  /**
   * QA Q-3: the company page already awaits `listActiveCompanyWorkers` for
   * its roster section. Handing that SAME pending read in lets the capacity
   * answer reuse it instead of running the roster query a second time in the
   * same request. Optional — without it the field reads exactly as before.
   */
  readonly roster?: PromiseLike<CompanyWorkersListResult> | CompanyWorkersListResult | null;
}

export async function loadCompanyHomeField(
  input: CompanyHomeFieldInput = {},
): Promise<CompanyHomeField> {
  const [projects, capacity, attention] = await Promise.all([
    loadProjectRows().catch((): HomeProjectsResult => ({ kind: "error" })),
    loadWhoIsAvailableForChat(input.roster ? { roster: input.roster } : undefined).catch(
      (): CapacityChatResult => ({ kind: "error" }),
    ),
    // HONESTY (QA Q-2): a failed brief read is "unavailable", never "all clear".
    loadEmployerOpeningBrief().catch((): { kind: "unavailable" } => ({ kind: "unavailable" })),
  ]);
  return { projects, capacity, attention };
}
