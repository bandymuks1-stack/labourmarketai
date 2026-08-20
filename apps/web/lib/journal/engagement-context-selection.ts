/**
 * WHICH ENGAGEMENT CONTEXT DOES THIS WORK BELONG TO?
 * (field-work operating platform audit v1 — closing the FIRST_BROKEN_LINK)
 *
 * ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
 * The composer ordered a worker's contexts by active-workspace match, then by
 * `is_primary`, and defaulted to the first row. When the active workspace was
 * *person* — no organization selected — that ranked the worker's own org-less
 * primary context first. A worker who has an employer, browsing as themselves,
 * therefore logged work into their personal context by default.
 *
 * `timesheet_compute_lines_v1` scopes by `ec.organization_id = p_organization_id`,
 * so a NULL-organization context can never match any employer. Those hours
 * exist, carry real durations and real provenance, and can reach nobody.
 *
 * Measured in production: of 18 live journal entries sitting in an org-less
 * context, 15 were written by people who ALSO hold an active org-scoped
 * context. Nine profiles hold both kinds.
 *
 * ── WHAT THIS DOES *NOT* DO ────────────────────────────────────────────────
 * It does not force work into an employer context. Reading those 15 entries
 * shows why that would be wrong: several are plainly personal or third-party
 * ("walked the dog", "renovated the house", "an hour driving, three on the
 * till"). Case D below is often the CORRECT answer. The defect was never that
 * personal contexts get used — it is that the choice was invisible and
 * unasked.
 *
 * So this resolves a DEFAULT and, when the default cannot be known, refuses to
 * pick one. The caller must render the outcome before submission and let the
 * worker change it.
 *
 * ── THE HIERARCHY (owner decision 2026-08-20) ──────────────────────────────
 *   A. The entry is being created FROM a task/project/object that already
 *      carries a canonical context → use that context.
 *   B. Exactly ONE applicable active organization-linked context → prefer it.
 *   C. SEVERAL legitimately possible → do NOT guess; require an explicit pick.
 *   D. NONE applicable → the personal, org-less context stays valid.
 *
 * "Prefer" in B means preselect-and-show, never silently assign: the worker
 * still sees it and can change it. That is what keeps B from becoming the
 * inference the owner forbade ("do not infer employer ownership merely because
 * the worker belongs to some organization") — B decides what is highlighted,
 * the worker decides what is true.
 */

/** A context the worker could legitimately log against. */
export type EngagementCandidate = {
  readonly id: string;
  /** `employee`, `owner`, … — the worker's relationship to the org. */
  readonly relationshipSlug: string;
  /** NULL for the personal, org-less context. */
  readonly organizationId: string | null;
  readonly status: string;
  /** ISO `YYYY-MM-DD`, or null when unbounded. */
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly isPrimary: boolean;
};

export type ContextResolution =
  /** A — the work already names its context; nothing to infer. */
  | { readonly rule: "A"; readonly selectedId: string }
  /** B — exactly one applicable organization context. Preselected, changeable. */
  | { readonly rule: "B"; readonly selectedId: string }
  /** C — several are possible. NOTHING is preselected; the worker must pick. */
  | { readonly rule: "C"; readonly selectedId: null; readonly candidateIds: readonly string[] }
  /** D — no organization context applies; the personal one is correct. */
  | { readonly rule: "D"; readonly selectedId: string }
  /** The worker has no usable context at all. */
  | { readonly rule: "NONE"; readonly selectedId: null };

/** A context is usable on a given day when it is active and the day falls
 *  inside its bounds. An unbounded end means "still running". */
export function isApplicableOn(
  c: EngagementCandidate,
  workDay: string | null,
): boolean {
  if (c.status !== "active") return false;
  if (!workDay) return true;
  if (c.startedAt && workDay < c.startedAt) return false;
  if (c.endedAt && workDay > c.endedAt) return false;
  return true;
}

/** Organization-linked, as opposed to the worker's own personal context.
 *
 *  Deliberately NOT narrowed to `employee`: a worker who owns a company does
 *  real work for it, and excluding `owner` would silently route that work to
 *  their personal context — the very bug being fixed. What keeps this honest
 *  is rule C: when more than one org context applies, nothing is preselected. */
export function isOrganizationLinked(c: EngagementCandidate): boolean {
  return c.organizationId !== null;
}

export function resolveEngagementContext(args: {
  readonly candidates: readonly EngagementCandidate[];
  /** The context the originating task/project/object already belongs to. */
  readonly sourceContextId?: string | null;
  /** The day the work happened, if the composer knows it yet. */
  readonly workDay?: string | null;
}): ContextResolution {
  const { candidates, sourceContextId = null, workDay = null } = args;

  const applicable = candidates.filter((c) => isApplicableOn(c, workDay));
  if (applicable.length === 0) return { rule: "NONE", selectedId: null };

  // A — the work itself names its context. Nothing to infer, nothing to guess.
  if (sourceContextId) {
    const hit = applicable.find((c) => c.id === sourceContextId);
    if (hit) return { rule: "A", selectedId: hit.id };
    // A source context that is not applicable is NOT silently ignored in
    // favour of a guess — fall through to the normal rules, which will ask.
  }

  const orgLinked = applicable.filter(isOrganizationLinked);

  // B — exactly one organization context applies.
  if (orgLinked.length === 1) return { rule: "B", selectedId: orgLinked[0].id };

  // C — several apply. The personal context is a legitimate answer too, so it
  // joins the choice rather than being excluded from it.
  if (orgLinked.length > 1) {
    return {
      rule: "C",
      selectedId: null,
      candidateIds: applicable.map((c) => c.id),
    };
  }

  // D — no organization context applies; the personal one is correct.
  const personal =
    applicable.find((c) => !isOrganizationLinked(c) && c.isPrimary) ??
    applicable.find((c) => !isOrganizationLinked(c));
  if (personal) return { rule: "D", selectedId: personal.id };

  return { rule: "NONE", selectedId: null };
}

/** True when the worker MUST choose before the entry can be submitted. */
export function requiresExplicitChoice(r: ContextResolution): boolean {
  return r.rule === "C";
}
