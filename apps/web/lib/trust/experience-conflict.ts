/**
 * CONFLICT OF INTEREST on an experience record (owner rule 2026-11-13).
 *
 * A platform administrator who is a PARTY to a record does not review its
 * dispute or moderate its reply; an independent administrator takes it.
 * Pure: no session, no database. The callers resolve the row and the
 * organizations the viewer manages on the server.
 */
export type PartyRow = {
  author_profile_id?: string | null;
  subject_profile_id?: string | null;
  subject_organization_id?: string | null;
  author_organization_id?: string | null;
};

/** True when `viewerId` wrote the record, is the person it is about, or
 *  manages the organization on either side of it. */
export function partyConflict(
  row: PartyRow,
  viewerId: string,
  managedOrganizations: ReadonlySet<string>,
): boolean {
  return (
    row.author_profile_id === viewerId ||
    row.subject_profile_id === viewerId ||
    (!!row.subject_organization_id && managedOrganizations.has(row.subject_organization_id)) ||
    (!!row.author_organization_id && managedOrganizations.has(row.author_organization_id))
  );
}
