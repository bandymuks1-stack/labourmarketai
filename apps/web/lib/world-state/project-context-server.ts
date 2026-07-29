import "server-only";

import { getTranslations } from "next-intl/server";

import { getProjectOperations } from "@/lib/projects/operations";
import type {
  ContextFact,
  ContextRecommendation,
  ContextRequirement,
  EntityContextResult,
  EntityContextView,
} from "./entity-context";

/**
 * `project` entity → Context Panel, server half (W4).
 *
 * THE POINT OF THIS FILE IS HOW SMALL IT IS. W3 claimed that adding an entity
 * type to the workspace is a REGISTRATION, not an architecture change
 * (`registrationIsEnough`). This is the first time that claim is tested by a
 * second type, and the bill came to: one resolver module, one line in
 * `resolvers.ts`, one entry in the allowlist. The panel did not change, World
 * State did not change, the conversation did not change, the map did not
 * change.
 *
 * WHERE THE FACTS COME FROM. `getProjectOperations` — the canonical manager
 * read that the operations screen renders. It is RLS-scoped and returns null
 * for a project the caller may not see, so authorization is the platform's, not
 * this file's. Nothing here queries, counts or ranks.
 */
export async function resolveProjectContext(projectId: string): Promise<EntityContextResult> {
  const tPanel = await getTranslations("workspace.panel");
  const ops = await getProjectOperations(projectId);
  if (!ops) {
    // Not visible to this person, or gone. Same honest wording as a demand
    // that left the board — never an empty panel implying an empty project.
    return { kind: "unavailable", reason: tPanel("unavailableGone") };
  }

  const t = await getTranslations("workspace.project");
  const notStated = tPanel("notStated");
  const fact = (label: string, value: string | null): ContextFact =>
    value ? { label, value } : { label, value: notStated, unknown: true };

  const p = ops.project;
  const period =
    p.startDate && p.endDate
      ? `${p.startDate} — ${p.endDate}`
      : (p.startDate ?? p.endDate ?? null);

  const facts: ContextFact[] = [
    fact(t("fieldStatus"), p.status),
    fact(t("fieldPeriod"), period),
    fact(t("fieldPlace"), p.city ?? p.country ?? null),
    fact(t("fieldAssigned"), String(ops.counters.totalAssigned)),
  ];

  // "Requirements" for a project reads as crew readiness: who is ready, and who
  // is not. Straight counts of real assignment rows — no score.
  const requirements: ContextRequirement[] = [];
  if (ops.counters.totalAssigned > 0) {
    requirements.push({ label: t("crewReady", { count: ops.counters.ready }), met: true });
    if (ops.counters.needsEvidence > 0) {
      requirements.push({
        label: t("crewNeedsEvidence", { count: ops.counters.needsEvidence }),
        met: false,
      });
    }
    if (ops.counters.withMissingDocs > 0) {
      requirements.push({
        label: t("crewMissingDocs", { count: ops.counters.withMissingDocs }),
        met: false,
      });
    }
  }

  // Deterministic, and each one names the count it came from.
  const recommendations: ContextRecommendation[] = [];
  if (ops.counters.withMissingDocs > 0) {
    recommendations.push({
      text: t("recMissingDocs", { count: ops.counters.withMissingDocs }),
      basis: t("recBasisCounters"),
      chipId: null,
    });
  } else if (ops.counters.needsEvidence > 0) {
    recommendations.push({
      text: t("recNeedsEvidence", { count: ops.counters.needsEvidence }),
      basis: t("recBasisCounters"),
      chipId: null,
    });
  }

  const view: EntityContextView = {
    ref: { type: "project", id: p.id },
    title: p.title ?? t("untitled"),
    // A project carries no verification signal — so it gets no badge, rather
    // than a reassuring one.
    badge: null,
    description: null,
    facts,
    contactNote: tPanel("contactNote"),
    requirements,
    // A project's history needs an event source this read does not carry;
    // an invented timeline would be worse than none.
    history: [],
    related: ops.workers.slice(0, 5).map((w) => ({ label: w.name, ref: null })),
    recommendations,
    // Every crew action lives on the operations screen with its own
    // confirmation; the panel offers none rather than a shortcut that skips it.
    actions: [],
  };

  return { kind: "context", view };
}
