"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import {
  OUTCOMES_K_ANONYMITY_FLOOR,
  readInstitutionLearnerOutcomes,
} from "@/lib/education/institution-outcomes";
import type { EducationQuestionKind } from "@/lib/conversation/education-question";

/**
 * The institution's questions about its students, ANSWERED (window 6, lane
 * C). Same chain as the programmes read adapter: ACTIVE CONTEXT (company
 * identity; the outcomes RPC re-checks manager authority and the
 * training_provider capability) → the institution's REAL read → words.
 *
 *   outcomes          → `readInstitutionLearnerOutcomes` — the ONE aggregate
 *                        the k-anonymous SQL function returns; the same copy
 *                        the company page's outcomes block renders
 *                        (`roleDashboards.company.learners.outcomes*`).
 *   students-skills / students-fit
 *                     → the privacy boundary, stated: an institution never
 *                        reads a student's skills, documents or journal
 *                        (owner ruling 2026-08-27); it sees participation and
 *                        counts; the employer sees who fits.
 *   students-practice → how an internship reaches students: a partner
 *                        employer posts a need of type "internship" (one need
 *                        free); students see it on their board once the
 *                        employer is verified (feed gate, never weakened).
 *
 * Localised HERE (the chat's label bag is untouched). Every degraded state is
 * a named kind, mirroring the programmes adapter so the chat reuses its
 * branches: `no-company`, `not-institution`, `unavailable`.
 */
export type EducationAnswerResult =
  | { readonly kind: "no-company" }
  | { readonly kind: "not-institution" }
  | { readonly kind: "unavailable"; readonly line: string }
  | { readonly kind: "ok"; readonly lines: readonly string[] };

export async function loadEducationAnswerForChat(question: EducationQuestionKind): Promise<EducationAnswerResult> {
  const t = await getTranslations("conversation.chat");
  const company = await requireEmployerCompany();
  if (!company.ok) return { kind: "no-company" };
  const organizationId = company.organizationId;
  let capabilities: readonly string[] = [];
  try {
    capabilities = await readOrganizationCapabilities(organizationId);
  } catch {
    return { kind: "unavailable", line: t("eduUnavailable") };
  }
  if (!capabilities.includes("training_provider")) return { kind: "not-institution" };

  if (question === "students-skills" || question === "students-fit") {
    return { kind: "ok", lines: [t("eduStudentsPrivacy")] };
  }
  if (question === "students-practice") {
    return { kind: "ok", lines: [t("eduPracticeHow")] };
  }

  const read = await readInstitutionLearnerOutcomes(organizationId);
  if (read.status !== "ok") return { kind: "unavailable", line: t("eduOutcomesUnavailable") };
  const tl = await getTranslations("roleDashboards.company.learners");
  const o = read.outcomes;
  const lines: string[] = [t("eduOutcomesConnected", { count: o.learnersConnected })];
  if (o.suppressed) {
    lines.push(tl("outcomesSuppressed", { count: o.learnersConnected, floor: OUTCOMES_K_ANONYMITY_FLOOR }));
  } else {
    lines.push(
      tl("outcomesActive", { count: o.activeLast30d ?? 0 }),
      tl("outcomesInterest", { count: o.withInterestSignals ?? 0 }),
      tl("outcomesBookings", { count: o.withAcceptedBookings ?? 0 }),
      tl("outcomesEngagements", { count: o.withActiveEngagements ?? 0 }),
    );
  }
  return { kind: "ok", lines };
}
