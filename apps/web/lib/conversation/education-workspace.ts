"use server";

import "server-only";

import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { readInstitutionPrograms } from "@/lib/education/programs";
import {
  EDUCATION_CHAT_LIST_LIMIT,
  type EducationWorkspaceChatResult,
} from "@/lib/conversation/education-workspace-contract";

/**
 * Education chat-workspace READ adapter (owner contract 2026-09-04 §15).
 *
 * The institution's programmes, cohorts and assignable learners — the SAME
 * canonical read the company page's programmes section renders
 * (`readInstitutionPrograms`, RLS: managers of the organization). The chat
 * needs these rows to answer "parodyk programas", to know WHICH programme a
 * new cohort belongs to, and to build the assign-learner form from real
 * cohorts and real accepted learners. No ranking, no write, display cap only.
 *
 * Every degraded state is a named kind: `no-company` (not acting for an
 * organization), `not-institution` (the organization does not hold the
 * training_provider capability — stated, never a silent empty list),
 * `unavailable` (the read failed).
 */
export async function loadEducationWorkspaceForChat(): Promise<EducationWorkspaceChatResult> {
  const company = await requireEmployerCompany();
  if (!company.ok) return { kind: "no-company" };
  const organizationId = company.organizationId;
  let capabilities: readonly string[] = [];
  try {
    capabilities = await readOrganizationCapabilities(organizationId);
  } catch {
    return { kind: "unavailable" };
  }
  if (!capabilities.includes("training_provider")) return { kind: "not-institution" };
  const read = await readInstitutionPrograms(organizationId);
  if (read.status !== "ok") return { kind: "unavailable" };
  return {
    kind: "ok",
    organizationId,
    programmes: read.programs.slice(0, EDUCATION_CHAT_LIST_LIMIT).map((p) => ({
      id: p.id,
      name: p.name,
      demandCount: p.demandCount,
      cohorts: p.cohorts.map((c) => ({
        id: c.id,
        name: c.name,
        memberCount: c.members.filter((m) => m.status === "active").length,
      })),
    })),
    assignable: read.assignable.slice(0, 50).map((l) => ({ profileId: l.profileId, label: l.label })),
  };
}
