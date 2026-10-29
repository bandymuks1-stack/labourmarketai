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
 *
 * ── RULE W — THE ACTIVE WORKSPACE (owner P0 2026-10-29) ────────────────────
 * "Automatic context determination when enough data exists." The organization
 * the person is ACTING FOR right now (the server-resolved active workspace —
 * the same one the header chip shows) is a signal the rules above never used.
 * A person who owns two organizations and works for a third was therefore
 * always pushed into rule C, and an unexplained choice is how work got filed
 * under the wrong organization.
 *
 *   W. Checked after A, before B/C/D: when EXACTLY ONE applicable context
 *      belongs to the active workspace's organization → preselect it.
 *
 * Same contract as B: preselect-and-show, always changeable, never silent.
 * W never creates or infers a relationship — it only picks among the person's
 * own engagement contexts. Two applicable contexts at the active organization
 * (e.g. employee AND owner of it) is still ambiguity → the normal rules.
 *
 * When the active workspace is an organization where the person holds NO
 * applicable context (a membership — access — without a recorded work
 * relationship), the resolution says so (`activeWorkspaceWithoutContext`) so
 * the surface can state it plainly instead of silently omitting that
 * organization. The rules then proceed exactly as without the signal.
 *
 * Without `activeOrganizationId` the behaviour is unchanged.
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

/** Facts about the active-workspace signal that hold whatever rule decided. */
export type ActiveWorkspaceFact = {
  /** Set (true) only when an active ORGANIZATION workspace was given and the
   *  person holds no applicable context there — membership without a recorded
   *  work relationship. Absent otherwise. */
  readonly activeWorkspaceWithoutContext?: true;
};

export type ContextResolution = (
  /** A — the work already names its context; nothing to infer. */
  | { readonly rule: "A"; readonly selectedId: string }
  /** W — exactly one applicable context at the ACTIVE workspace's
   *  organization. Preselected, shown, changeable (owner P0 2026-10-29). */
  | { readonly rule: "W"; readonly selectedId: string }
  /** B — exactly one applicable organization context. Preselected, changeable. */
  | { readonly rule: "B"; readonly selectedId: string }
  /** C — several are possible. NOTHING is preselected; the worker must pick. */
  | { readonly rule: "C"; readonly selectedId: null; readonly candidateIds: readonly string[] }
  /** D — no organization context applies; the personal one is correct. */
  | { readonly rule: "D"; readonly selectedId: string }
  /** The worker has no usable context at all. */
  | { readonly rule: "NONE"; readonly selectedId: null }
) &
  ActiveWorkspaceFact;

/** A context is usable on a given day when it is active and the day falls
 *  inside its bounds. An unbounded end means "still running". */
export function isApplicableOn(
  c: EngagementCandidate,
  workDay: string | null,
): boolean {
  if (c.status !== "active") return false;
  if (!workDay) return true;
  // Day granularity: a timestamp bound ("2026-10-01T00:00:00+00:00") is cut
  // to its day, so a context applies ON its first and last day.
  const day = workDay.slice(0, 10);
  const start = c.startedAt ? c.startedAt.slice(0, 10) : null;
  const end = c.endedAt ? c.endedAt.slice(0, 10) : null;
  if (start && day < start) return false;
  if (end && day > end) return false;
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
  /** The organization of the server-resolved ACTIVE workspace, or null when
   *  the person acts in their personal space. Never a caller-chosen value —
   *  pass the same resolution the header chip shows (`activeOrganizationOf`). */
  readonly activeOrganizationId?: string | null;
}): ContextResolution {
  const {
    candidates,
    sourceContextId = null,
    workDay = null,
    activeOrganizationId = null,
  } = args;

  const applicable = candidates.filter((c) => isApplicableOn(c, workDay));
  const atActive = activeOrganizationId
    ? applicable.filter((c) => c.organizationId === activeOrganizationId)
    : [];
  const fact: ActiveWorkspaceFact =
    activeOrganizationId && atActive.length === 0
      ? { activeWorkspaceWithoutContext: true }
      : {};

  if (applicable.length === 0) return { rule: "NONE", selectedId: null, ...fact };

  // A — the work itself names its context. Nothing to infer, nothing to guess.
  if (sourceContextId) {
    const hit = applicable.find((c) => c.id === sourceContextId);
    if (hit) return { rule: "A", selectedId: hit.id };
    // A source context that is not applicable is NOT silently ignored in
    // favour of a guess — fall through to the normal rules, which will ask.
  }

  // W — the person is acting for an organization and holds exactly one
  // applicable context there. Enough data exists: preselect it (shown,
  // changeable). Two there is still ambiguity and falls through.
  if (atActive.length === 1) return { rule: "W", selectedId: atActive[0].id };

  const orgLinked = applicable.filter(isOrganizationLinked);

  // B — exactly one organization context applies.
  if (orgLinked.length === 1) return { rule: "B", selectedId: orgLinked[0].id, ...fact };

  // C — several apply. The personal context is a legitimate answer too, so it
  // joins the choice rather than being excluded from it. The ids come in the
  // order a person should read them (`orderContextsForChoice`).
  if (orgLinked.length > 1) {
    return {
      rule: "C",
      selectedId: null,
      candidateIds: orderContextsForChoice(applicable, activeOrganizationId, (c) => c.organizationId).map(
        (c) => c.id,
      ),
      ...fact,
    };
  }

  // D — no organization context applies; the personal one is correct.
  const personal =
    applicable.find((c) => !isOrganizationLinked(c) && c.isPrimary) ??
    applicable.find((c) => !isOrganizationLinked(c));
  if (personal) return { rule: "D", selectedId: personal.id, ...fact };

  return { rule: "NONE", selectedId: null, ...fact };
}

/**
 * THE ONE ORDER IN WHICH A CONTEXT CHOICE IS READ (owner P0 2026-10-29):
 * the active workspace's organization first, then the person's other
 * organizations, the personal context last. Stable — within a group the
 * caller's own order (e.g. `is_primary` first) is kept. Ordering only decides
 * how the list reads; which context is preselected is the resolution's job.
 */
export function orderContextsForChoice<T>(
  items: readonly T[],
  activeOrganizationId: string | null | undefined,
  organizationOf: (item: T) => string | null | undefined,
): T[] {
  const rank = (c: T): number => {
    const org = organizationOf(c) ?? null;
    if (org === null) return 2;
    return activeOrganizationId && org === activeOrganizationId ? 0 : 1;
  };
  return items
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/** The organization id of a resolved active workspace, or null for the
 *  personal space. Callers hand `getWorkspaceContext()` /
 *  `resolveActiveWorkspaceForCaller()` output through this, so the personal
 *  sentinel can never be mistaken for an organization id. */
export function activeOrganizationOf(workspace: {
  readonly activeWorkspaceId: string;
  readonly workspaces: readonly { readonly id: string; readonly kind: string }[];
}): string | null {
  const hit = workspace.workspaces.find((w) => w.id === workspace.activeWorkspaceId);
  return hit && hit.kind === "organization" ? hit.id : null;
}

/** True when the worker MUST choose before the entry can be submitted. */
export function requiresExplicitChoice(r: ContextResolution): boolean {
  return r.rule === "C";
}
