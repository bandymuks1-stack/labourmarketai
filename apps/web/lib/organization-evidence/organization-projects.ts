/**
 * THE ORGANIZATION'S PROJECTS — one part of its CV (#3354, organization side).
 *
 * Pure: it orders and counts project rows the caller could already read
 * (projects.organization_id, RLS-scoped). It carries no person, no hours and
 * no skill: an organization's track record is what it ran; who did the work
 * stays on each person's own history, and nothing here ever reaches a
 * personal CV (lib/guards/organization-cv-one-way.test.ts).
 *
 * A project the platform marked a DUPLICATE of another is left out by the
 * reader (record_state), never counted twice.
 */
export type OrganizationProjectRow = {
  readonly id: string;
  readonly title: string | null;
  readonly city: string | null;
  readonly status: string | null;
  readonly createdAt: string;
};

export type OrganizationProjectItem = {
  readonly id: string;
  readonly title: string | null;
  readonly city: string | null;
  readonly completed: boolean;
};

export type OrganizationProjects = {
  readonly total: number;
  readonly running: number;
  readonly completed: number;
  /** Running first, then completed, newest first within each; at most `limit`. */
  readonly items: readonly OrganizationProjectItem[];
};

/** A project is COMPLETED only when its status says so; every other state —
 *  including an unknown one — is still running work, never a finished one. */
export function isCompletedProject(status: string | null): boolean {
  return status === "completed";
}

export function summarizeOrganizationProjects(
  rows: readonly OrganizationProjectRow[],
  limit = 12,
): OrganizationProjects {
  const unique = [...new Map(rows.map((r) => [r.id, r] as const)).values()];
  const byNewest = (a: OrganizationProjectRow, b: OrganizationProjectRow) =>
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  const running = unique.filter((r) => !isCompletedProject(r.status)).sort(byNewest);
  const completed = unique.filter((r) => isCompletedProject(r.status)).sort(byNewest);
  return {
    total: unique.length,
    running: running.length,
    completed: completed.length,
    items: [...running, ...completed].slice(0, Math.max(0, limit)).map((r) => ({
      id: r.id,
      title: r.title?.trim() || null,
      city: r.city?.trim() || null,
      completed: isCompletedProject(r.status),
    })),
  };
}
