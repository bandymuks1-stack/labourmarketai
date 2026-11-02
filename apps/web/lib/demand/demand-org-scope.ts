/**
 * WHICH NEEDS BELONG TO THIS WORKSPACE — one rule for every employer read.
 *
 * A need (customer_requests) belongs to its ORGANIZATION. The reads used to
 * take `profile_id = me OR organization_id = active`, so a person who runs two
 * organizations saw — and could act on — organization A's needs while working
 * in organization B (system audit 2026-10-20). The rule is the one
 * `lib/projects/project-workspace.ts` already applies to projects: the active
 * organization's rows, plus only the caller's OWN rows that carry no
 * organization yet (a draft not yet stamped, a pre-organization legacy row).
 *
 * PostgREST `.or()` filter text. Both values are server-resolved ids (the
 * caller's user id and the workspace resolver's organization id), never input.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function demandsOfWorkspaceFilter(userId: string, organizationId: string): string {
  if (!UUID.test(userId) || !UUID.test(organizationId)) {
    // Never widen on a malformed id: match nothing rather than everything.
    return "id.is.null";
  }
  return `organization_id.eq.${organizationId},and(organization_id.is.null,profile_id.eq.${userId})`;
}
